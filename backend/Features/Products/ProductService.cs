using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Products;

public sealed class ProductService(SmartPosDbContext dbContext, AuditLogService auditLogService)
{
    private const decimal DefaultLowStockThreshold = 5m;

    public async Task<ProductSearchResponse> SearchProductsAsync(
        string? query,
        CancellationToken cancellationToken)
    {
        var productQuery = dbContext.Products
            .AsNoTracking()
            .Where(x => x.IsActive);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            productQuery = productQuery.Where(x =>
                x.Name.ToLower().Contains(term) ||
                (x.Sku != null && x.Sku.ToLower().Contains(term)) ||
                (x.Barcode != null && x.Barcode.ToLower().Contains(term)));
        }

        var items = await productQuery
            .OrderBy(x => x.Name)
            .Take(30)
            .Select(x => new ProductSearchItem
            {
                Id = x.Id,
                Name = x.Name,
                Sku = x.Sku,
                Barcode = x.Barcode,
                ImageUrl = x.ImageUrl,
                UnitPrice = x.UnitPrice,
                StockQuantity = x.Inventory != null ? x.Inventory.QuantityOnHand : 0m
            })
            .ToListAsync(cancellationToken);

        return new ProductSearchResponse { Items = items };
    }

    public async Task<ProductCatalogResponse> GetCatalogAsync(
        string? query,
        int take,
        bool includeInactive,
        decimal? lowStockThreshold,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var threshold = Math.Max(0m, lowStockThreshold ?? DefaultLowStockThreshold);

        var productQuery = dbContext.Products
            .AsNoTracking()
            .Include(x => x.Category)
            .Include(x => x.Inventory)
            .AsQueryable();

        if (!includeInactive)
        {
            productQuery = productQuery.Where(x => x.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            productQuery = productQuery.Where(x =>
                x.Name.ToLower().Contains(term) ||
                (x.Sku != null && x.Sku.ToLower().Contains(term)) ||
                (x.Barcode != null && x.Barcode.ToLower().Contains(term)));
        }

        var products = await productQuery
            .OrderBy(x => x.Name)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        return new ProductCatalogResponse
        {
            Items = products
                .Select(x => ToCatalogItemResponse(x, threshold))
                .ToList()
        };
    }

    public async Task<ProductCatalogItemResponse> CreateProductAsync(
        CreateProductRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = NormalizeRequired(request.Name, "Product name is required.");
        var normalizedSku = NormalizeOptional(request.Sku);
        var normalizedBarcode = NormalizeOptional(request.Barcode);
        var normalizedImageUrl = NormalizeOptional(request.ImageUrl);

        ValidateMoneyValue(request.UnitPrice, "Unit price cannot be negative.");
        ValidateMoneyValue(request.CostPrice, "Cost price cannot be negative.");
        ValidateQuantityValue(request.InitialStockQuantity, "Initial stock cannot be negative.");
        ValidateQuantityValue(request.ReorderLevel, "Reorder level cannot be negative.");

        await EnsureUniqueBarcodeAsync(normalizedBarcode, null, cancellationToken);
        await EnsureUniqueSkuAsync(normalizedSku, null, cancellationToken);
        await EnsureCategoryExistsIfProvidedAsync(request.CategoryId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Name = normalizedName,
            Sku = normalizedSku,
            Barcode = normalizedBarcode,
            ImageUrl = normalizedImageUrl,
            CategoryId = request.CategoryId,
            UnitPrice = RoundMoney(request.UnitPrice),
            CostPrice = RoundMoney(request.CostPrice),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var inventory = new InventoryRecord
        {
            Product = product,
            QuantityOnHand = RoundQuantity(request.InitialStockQuantity),
            ReorderLevel = RoundQuantity(request.ReorderLevel),
            AllowNegativeStock = request.AllowNegativeStock,
            UpdatedAtUtc = now
        };

        dbContext.Products.Add(product);
        dbContext.Inventory.Add(inventory);
        auditLogService.Queue(
            action: "product_created",
            entityName: "product",
            entityId: product.Id.ToString(),
            after: new
            {
                product.Name,
                product.Sku,
                product.Barcode,
                product.ImageUrl,
                product.UnitPrice,
                product.CostPrice,
                inventory.QuantityOnHand,
                inventory.ReorderLevel,
                inventory.AllowNegativeStock,
                product.IsActive
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetSingleCatalogItemAsync(product.Id, DefaultLowStockThreshold, cancellationToken);
    }

    public async Task<ProductCatalogItemResponse> UpdateProductAsync(
        Guid productId,
        UpdateProductRequest request,
        CancellationToken cancellationToken)
    {
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        var normalizedName = NormalizeRequired(request.Name, "Product name is required.");
        var normalizedSku = NormalizeOptional(request.Sku);
        var normalizedBarcode = NormalizeOptional(request.Barcode);
        var normalizedImageUrl = NormalizeOptional(request.ImageUrl);

        ValidateMoneyValue(request.UnitPrice, "Unit price cannot be negative.");
        ValidateMoneyValue(request.CostPrice, "Cost price cannot be negative.");
        ValidateQuantityValue(request.ReorderLevel, "Reorder level cannot be negative.");

        await EnsureUniqueBarcodeAsync(normalizedBarcode, productId, cancellationToken);
        await EnsureUniqueSkuAsync(normalizedSku, productId, cancellationToken);
        await EnsureCategoryExistsIfProvidedAsync(request.CategoryId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var before = new
        {
            product.Name,
            product.Sku,
            product.Barcode,
            product.ImageUrl,
            product.UnitPrice,
            product.CostPrice,
            ReorderLevel = product.Inventory?.ReorderLevel ?? 0m,
            AllowNegativeStock = product.Inventory?.AllowNegativeStock ?? true,
            product.IsActive
        };
        product.Name = normalizedName;
        product.Sku = normalizedSku;
        product.Barcode = normalizedBarcode;
        product.ImageUrl = normalizedImageUrl;
        product.CategoryId = request.CategoryId;
        product.UnitPrice = RoundMoney(request.UnitPrice);
        product.CostPrice = RoundMoney(request.CostPrice);
        product.IsActive = request.IsActive;
        product.UpdatedAtUtc = now;

        if (product.Inventory is null)
        {
            product.Inventory = new InventoryRecord
            {
                ProductId = product.Id,
                QuantityOnHand = 0m,
                ReorderLevel = 0m,
                AllowNegativeStock = request.AllowNegativeStock,
                UpdatedAtUtc = now,
                Product = product
            };
        }

        product.Inventory.ReorderLevel = RoundQuantity(request.ReorderLevel);
        product.Inventory.AllowNegativeStock = request.AllowNegativeStock;
        product.Inventory.UpdatedAtUtc = now;

        auditLogService.Queue(
            action: "product_updated",
            entityName: "product",
            entityId: product.Id.ToString(),
            before: before,
            after: new
            {
                product.Name,
                product.Sku,
                product.Barcode,
                product.ImageUrl,
                product.UnitPrice,
                product.CostPrice,
                ReorderLevel = product.Inventory.ReorderLevel,
                product.Inventory.AllowNegativeStock,
                product.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await GetSingleCatalogItemAsync(product.Id, DefaultLowStockThreshold, cancellationToken);
    }

    public async Task DeleteProductAsync(Guid productId, CancellationToken cancellationToken)
    {
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (!product.IsActive)
        {
            return;
        }

        var before = new
        {
            product.Name,
            product.Sku,
            product.Barcode,
            product.IsActive
        };

        product.IsActive = false;
        product.UpdatedAtUtc = DateTimeOffset.UtcNow;
        if (product.Inventory is not null)
        {
            product.Inventory.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }

        auditLogService.Queue(
            action: "product_deleted",
            entityName: "product",
            entityId: product.Id.ToString(),
            before: before,
            after: new
            {
                product.Name,
                product.Sku,
                product.Barcode,
                product.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<StockAdjustmentResponse> AdjustStockAsync(
        Guid productId,
        StockAdjustmentRequest request,
        CancellationToken cancellationToken)
    {
        if (request.DeltaQuantity == 0m)
        {
            throw new InvalidOperationException("Delta quantity cannot be zero.");
        }

        var reason = NormalizeRequired(request.Reason, "Stock adjustment reason is required.");
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        var now = DateTimeOffset.UtcNow;
        var inventory = product.Inventory;
        if (inventory is null)
        {
            inventory = new InventoryRecord
            {
                Product = product,
                ProductId = product.Id,
                QuantityOnHand = 0m,
                ReorderLevel = 0m,
                AllowNegativeStock = true,
                UpdatedAtUtc = now
            };
            dbContext.Inventory.Add(inventory);
        }

        var roundedDelta = RoundQuantity(request.DeltaQuantity);
        var previous = RoundQuantity(inventory.QuantityOnHand);
        var next = RoundQuantity(previous + roundedDelta);

        if (!inventory.AllowNegativeStock && next < 0m)
        {
            throw new InvalidOperationException("Negative stock is not allowed for this product.");
        }

        inventory.QuantityOnHand = next;
        inventory.UpdatedAtUtc = now;
        product.UpdatedAtUtc = now;

        auditLogService.Queue(
            action: "stock_adjusted",
            entityName: "product",
            entityId: product.Id.ToString(),
            before: new
            {
                previous_quantity = previous
            },
            after: new
            {
                delta_quantity = roundedDelta,
                new_quantity = next,
                reason
            });

        dbContext.Ledger.Add(new LedgerEntry
        {
            EntryType = LedgerEntryType.StockAdjustment,
            Description = $"Stock adjustment for {product.Name}: {roundedDelta:+0.###;-0.###;0} ({reason})",
            Debit = 0m,
            Credit = 0m,
            OccurredAtUtc = now,
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        var reorderLevel = RoundQuantity(inventory.ReorderLevel);
        var alertLevel = RoundQuantity(Math.Max(reorderLevel, DefaultLowStockThreshold));
        return new StockAdjustmentResponse
        {
            ProductId = product.Id,
            DeltaQuantity = roundedDelta,
            PreviousQuantity = previous,
            NewQuantity = next,
            Reason = reason,
            IsLowStock = next <= alertLevel,
            AlertLevel = alertLevel,
            UpdatedAt = now
        };
    }

    public async Task<CategoryListResponse> GetCategoriesAsync(
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(x => includeInactive || x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new CategoryItemResponse
            {
                CategoryId = x.Id,
                Name = x.Name,
                Description = x.Description,
                IsActive = x.IsActive,
                ProductCount = x.Products.Count(y => y.IsActive),
                CreatedAt = x.CreatedAtUtc,
                UpdatedAt = x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new CategoryListResponse { Items = categories };
    }

    public async Task<CategoryItemResponse> CreateCategoryAsync(
        UpsertCategoryRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = NormalizeRequired(request.Name, "Category name is required.");
        await EnsureUniqueCategoryNameAsync(normalizedName, null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var category = new Category
        {
            Name = normalizedName,
            Description = NormalizeOptional(request.Description),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Categories.Add(category);
        auditLogService.Queue(
            action: "category_created",
            entityName: "category",
            entityId: category.Id.ToString(),
            after: new
            {
                category.Name,
                category.Description,
                category.IsActive
            });
        await dbContext.SaveChangesAsync(cancellationToken);
        return ToCategoryItemResponse(category, productCount: 0);
    }

    public async Task<CategoryItemResponse> UpdateCategoryAsync(
        Guid categoryId,
        UpsertCategoryRequest request,
        CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories
            .FirstOrDefaultAsync(x => x.Id == categoryId, cancellationToken)
            ?? throw new KeyNotFoundException("Category not found.");

        var normalizedName = NormalizeRequired(request.Name, "Category name is required.");
        await EnsureUniqueCategoryNameAsync(normalizedName, categoryId, cancellationToken);

        var before = new
        {
            category.Name,
            category.Description,
            category.IsActive
        };
        category.Name = normalizedName;
        category.Description = NormalizeOptional(request.Description);
        category.IsActive = request.IsActive;
        category.UpdatedAtUtc = DateTimeOffset.UtcNow;

        auditLogService.Queue(
            action: "category_updated",
            entityName: "category",
            entityId: category.Id.ToString(),
            before: before,
            after: new
            {
                category.Name,
                category.Description,
                category.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);

        var productCount = await dbContext.Products
            .AsNoTracking()
            .CountAsync(x => x.CategoryId == categoryId && x.IsActive, cancellationToken);

        return ToCategoryItemResponse(category, productCount);
    }

    private async Task<ProductCatalogItemResponse> GetSingleCatalogItemAsync(
        Guid productId,
        decimal threshold,
        CancellationToken cancellationToken)
    {
        var product = await dbContext.Products
            .AsNoTracking()
            .Include(x => x.Category)
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        return ToCatalogItemResponse(product, threshold);
    }

    private async Task EnsureCategoryExistsIfProvidedAsync(
        Guid? categoryId,
        CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
        {
            return;
        }

        var exists = await dbContext.Categories
            .AsNoTracking()
            .AnyAsync(x => x.Id == categoryId.Value && x.IsActive, cancellationToken);

        if (!exists)
        {
            throw new InvalidOperationException("Selected category does not exist or is inactive.");
        }
    }

    private async Task EnsureUniqueBarcodeAsync(
        string? barcode,
        Guid? productId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(barcode))
        {
            return;
        }

        var normalized = barcode.Trim().ToLowerInvariant();
        var exists = await dbContext.Products
            .AsNoTracking()
            .AnyAsync(
                x => x.Barcode != null &&
                     x.Barcode.ToLower() == normalized &&
                     (!productId.HasValue || x.Id != productId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Barcode already exists.");
        }
    }

    private async Task EnsureUniqueSkuAsync(
        string? sku,
        Guid? productId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sku))
        {
            return;
        }

        var normalized = sku.Trim().ToLowerInvariant();
        var exists = await dbContext.Products
            .AsNoTracking()
            .AnyAsync(
                x => x.Sku != null &&
                     x.Sku.ToLower() == normalized &&
                     (!productId.HasValue || x.Id != productId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("SKU already exists.");
        }
    }

    private async Task EnsureUniqueCategoryNameAsync(
        string name,
        Guid? categoryId,
        CancellationToken cancellationToken)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var exists = await dbContext.Categories
            .AsNoTracking()
            .AnyAsync(
                x => x.Name.ToLower() == normalized &&
                     (!categoryId.HasValue || x.Id != categoryId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Category name already exists.");
        }
    }

    private static ProductCatalogItemResponse ToCatalogItemResponse(Product product, decimal threshold)
    {
        var stockQuantity = RoundQuantity(product.Inventory?.QuantityOnHand ?? 0m);
        var reorderLevel = RoundQuantity(product.Inventory?.ReorderLevel ?? 0m);
        var alertLevel = RoundQuantity(Math.Max(reorderLevel, threshold));

        return new ProductCatalogItemResponse
        {
            ProductId = product.Id,
            Name = product.Name,
            Sku = product.Sku,
            Barcode = product.Barcode,
            ImageUrl = product.ImageUrl,
            CategoryId = product.CategoryId,
            CategoryName = product.Category?.Name,
            UnitPrice = RoundMoney(product.UnitPrice),
            CostPrice = RoundMoney(product.CostPrice),
            StockQuantity = stockQuantity,
            ReorderLevel = reorderLevel,
            AlertLevel = alertLevel,
            AllowNegativeStock = product.Inventory?.AllowNegativeStock ?? true,
            IsActive = product.IsActive,
            IsLowStock = stockQuantity <= alertLevel,
            CreatedAt = product.CreatedAtUtc,
            UpdatedAt = product.UpdatedAtUtc
        };
    }

    private static CategoryItemResponse ToCategoryItemResponse(Category category, int productCount)
    {
        return new CategoryItemResponse
        {
            CategoryId = category.Id,
            Name = category.Name,
            Description = category.Description,
            IsActive = category.IsActive,
            ProductCount = productCount,
            CreatedAt = category.CreatedAtUtc,
            UpdatedAt = category.UpdatedAtUtc
        };
    }

    private static string NormalizeRequired(string value, string errorMessage)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException(errorMessage);
        }

        return normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static void ValidateMoneyValue(decimal value, string errorMessage)
    {
        if (value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static void ValidateQuantityValue(decimal value, string errorMessage)
    {
        if (value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundQuantity(decimal value)
    {
        return decimal.Round(value, 3, MidpointRounding.AwayFromZero);
    }
}
