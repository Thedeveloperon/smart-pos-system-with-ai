using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Products;

public sealed class ProductService(
    SmartPosDbContext dbContext,
    AuditLogService auditLogService,
    StockMovementHelper stockMovementHelper,
    IHttpContextAccessor httpContextAccessor)
{
    private const decimal DefaultLowStockThreshold = 5m;
    private const int MaxBarcodeGenerationAttempts = 40;
    private const int MaxBarcodePersistenceRetries = 6;
    private const string BrandDeleteRequiresDeactivateMessage = "Deactivate the brand before deleting.";
    private const string BrandDeleteOnlyInactiveMessage = "Only inactive brands can be permanently deleted.";
    private const string BrandDeleteProductLinksMessage = "This brand is linked to products and cannot be permanently deleted.";
    private const string SupplierDeleteRequiresDeactivateMessage = "Deactivate the supplier before deleting.";
    private const string SupplierDeleteOnlyInactiveMessage = "Only inactive suppliers can be permanently deleted.";
    private const string SupplierDeleteProductLinksMessage = "This supplier has product links and cannot be permanently deleted.";
    private const string SupplierDeletePurchaseHistoryMessage = "This supplier has purchase history and cannot be permanently deleted.";
    private const string SupplierDeleteBatchHistoryMessage = "This supplier has batch history and cannot be permanently deleted.";

    public async Task<ProductSearchResponse> SearchProductsAsync(
        string? query,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var productQuery = dbContext.Products
            .AsNoTracking()
            .Include(x => x.Category)
            .Include(x => x.Brand)
            .Include(x => x.Inventory)
            .Where(x => x.IsActive);

        if (storeId.HasValue)
        {
            productQuery = productQuery.Where(x => x.StoreId == storeId.Value);
        }

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
            .Take(normalizedTake)
            .Select(x => new
            {
                Id = x.Id,
                Name = x.Name,
                Sku = x.Sku,
                Barcode = x.Barcode,
                ImageUrl = x.ImageUrl,
                CategoryId = x.CategoryId,
                CategoryName = x.Category != null ? x.Category.Name : null,
                BrandId = x.BrandId,
                BrandName = x.Brand != null ? x.Brand.Name : null,
                UnitPrice = x.UnitPrice,
                StockQuantity = x.Inventory != null ? x.Inventory.QuantityOnHand : 0m,
                ReorderLevel = x.Inventory != null ? x.Inventory.ReorderLevel : 0m
            })
            .ToListAsync(cancellationToken);

        return new ProductSearchResponse
        {
            Items = items.Select(item =>
            {
                var stockQuantity = RoundQuantity(item.StockQuantity);
                var alertLevel = RoundQuantity(Math.Max(RoundQuantity(item.ReorderLevel), DefaultLowStockThreshold));
                return new ProductSearchItem
                {
                    Id = item.Id,
                    Name = item.Name,
                    Sku = item.Sku,
                    Barcode = item.Barcode,
                    ImageUrl = item.ImageUrl,
                    CategoryId = item.CategoryId,
                    CategoryName = item.CategoryName,
                    BrandId = item.BrandId,
                    BrandName = item.BrandName,
                    UnitPrice = RoundMoney(item.UnitPrice),
                    StockQuantity = stockQuantity,
                    IsLowStock = stockQuantity <= alertLevel
                };
            }).ToList()
        };
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
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);

        var productQuery = dbContext.Products
            .AsNoTracking()
            .Include(x => x.Category)
            .Include(x => x.Brand)
            .Include(x => x.Inventory)
            .Include(x => x.ProductSuppliers)
                .ThenInclude(x => x.Supplier)
            .AsQueryable();

        if (storeId.HasValue)
        {
            productQuery = productQuery.Where(x => x.StoreId == storeId.Value);
        }

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

    public async Task<GenerateBarcodeResponse> GenerateBarcodeAsync(
        GenerateBarcodeRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var seed = BuildBarcodeSeed(request.Name, request.Sku, request.Seed);
        var barcode = await GenerateUniqueBarcodeValueAsync(
            seed,
            null,
            null,
            null,
            normalizedIdempotencyKey,
            cancellationToken);

        return new GenerateBarcodeResponse
        {
            Barcode = barcode,
            Format = "ean-13",
            GeneratedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<ValidateBarcodeResponse> ValidateBarcodeAsync(
        ValidateBarcodeRequest request,
        CancellationToken cancellationToken)
    {
        var validation = ProductBarcodeRules.Validate(request.Barcode);
        var exists = false;

        if (validation.IsValid && request.CheckExisting)
        {
            exists = await BarcodeExistsAsync(
                validation.Normalized,
                request.ExcludeProductId,
                await GetCurrentStoreIdAsync(cancellationToken),
                cancellationToken);
        }

        return new ValidateBarcodeResponse
        {
            Barcode = (request.Barcode ?? string.Empty).Trim(),
            NormalizedBarcode = validation.Normalized,
            IsValid = validation.IsValid,
            Format = validation.Format,
            Message = validation.Message,
            Exists = exists
        };
    }

    public async Task<ProductCatalogItemResponse> GenerateAndAssignBarcodeAsync(
        Guid productId,
        GenerateProductBarcodeRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        if (!request.ForceReplace && !string.IsNullOrWhiteSpace(product.Barcode))
        {
            throw new InvalidOperationException(
                "Product already has a barcode. Set force_replace=true to replace it.");
        }

        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var seed = BuildBarcodeSeed(product.Name, product.Sku, request.Seed);
        for (var retry = 0; retry < MaxBarcodePersistenceRetries; retry++)
        {
            var barcode = await GenerateUniqueBarcodeValueAsync(
                seed,
                product.StoreId,
                product.Id,
                null,
                normalizedIdempotencyKey,
                cancellationToken);

            var before = new
            {
                product.Barcode
            };

            product.Barcode = barcode;
            product.UpdatedAtUtc = DateTimeOffset.UtcNow;

            auditLogService.Queue(
                action: request.ForceReplace ? "product_barcode_regenerated" : "product_barcode_generated",
                entityName: "product",
                entityId: product.Id.ToString(),
                before: before,
                after: new
                {
                    product.Barcode,
                    force_replace = request.ForceReplace
                });

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return await GetSingleCatalogItemAsync(product.Id, DefaultLowStockThreshold, cancellationToken);
            }
            catch (DbUpdateException exception) when (IsBarcodeUniquenessViolation(exception))
            {
                DiscardPendingAuditLogs();
                await dbContext.Entry(product).ReloadAsync(cancellationToken);

                if (!request.ForceReplace && !string.IsNullOrWhiteSpace(product.Barcode))
                {
                    throw new InvalidOperationException(
                        "Product already has a barcode. Set force_replace=true to replace it.");
                }
            }
        }

        throw new InvalidOperationException("Unable to save generated barcode right now. Please retry.");
    }

    public async Task<BulkGenerateMissingProductBarcodesResponse> BulkGenerateMissingBarcodesAsync(
        BulkGenerateMissingProductBarcodesRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(request.Take, 1, 1000);
        var now = DateTimeOffset.UtcNow;
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);

        var productQuery = dbContext.Products
            .Include(x => x.Inventory)
            .AsQueryable();

        if (storeId.HasValue)
        {
            productQuery = productQuery.Where(x => x.StoreId == storeId.Value);
        }

        if (!request.IncludeInactive)
        {
            productQuery = productQuery.Where(x => x.IsActive);
        }

        List<Product> products;
        if (dbContext.Database.IsSqlite())
        {
            products = (await productQuery
                    .ToListAsync(cancellationToken))
                .OrderBy(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            products = await productQuery
                .OrderBy(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var generatedInBatch = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var response = new BulkGenerateMissingProductBarcodesResponse
        {
            DryRun = request.DryRun,
            Scanned = products.Count,
            ProcessedAt = now
        };

        foreach (var product in products)
        {
            if (!string.IsNullOrWhiteSpace(product.Barcode))
            {
                response.SkippedExisting++;
                response.Items.Add(new BulkGenerateMissingProductBarcodeItemResponse
                {
                    ProductId = product.Id,
                    Name = product.Name,
                    Barcode = product.Barcode,
                    Status = "skipped_existing",
                    Message = "Product already has a barcode."
                });
                continue;
            }

            try
            {
                var seed = BuildBarcodeSeed(product.Name, product.Sku, null);

                if (request.DryRun)
                {
                    var barcode = await GenerateUniqueBarcodeValueAsync(
                        seed,
                        product.StoreId,
                        product.Id,
                        generatedInBatch,
                        normalizedIdempotencyKey,
                        cancellationToken);

                    generatedInBatch.Add(barcode);
                    response.WouldGenerate++;
                    response.Items.Add(new BulkGenerateMissingProductBarcodeItemResponse
                    {
                        ProductId = product.Id,
                        Name = product.Name,
                        Barcode = barcode,
                        Status = "would_generate",
                        Message = "Dry run only."
                    });
                    continue;
                }

                var assignedBarcode = await TryAssignGeneratedBarcodeWithRetryAsync(
                    product,
                    seed,
                    generatedInBatch,
                    now,
                    normalizedIdempotencyKey,
                    cancellationToken);

                if (string.IsNullOrWhiteSpace(assignedBarcode))
                {
                    response.SkippedExisting++;
                    response.Items.Add(new BulkGenerateMissingProductBarcodeItemResponse
                    {
                        ProductId = product.Id,
                        Name = product.Name,
                        Barcode = product.Barcode,
                        Status = "skipped_existing",
                        Message = "Product already has a barcode."
                    });
                    continue;
                }

                generatedInBatch.Add(assignedBarcode);
                response.Generated++;
                response.Items.Add(new BulkGenerateMissingProductBarcodeItemResponse
                {
                    ProductId = product.Id,
                    Name = product.Name,
                    Barcode = assignedBarcode,
                    Status = "generated"
                });
            }
            catch (InvalidOperationException exception)
            {
                response.Failed++;
                response.Items.Add(new BulkGenerateMissingProductBarcodeItemResponse
                {
                    ProductId = product.Id,
                    Name = product.Name,
                    Status = "failed",
                    Message = exception.Message
                });
            }
        }

        if (!request.DryRun && response.Generated > 0)
        {
            auditLogService.Queue(
                action: "product_barcodes_bulk_generated",
                entityName: "product",
                entityId: "bulk",
                after: new
                {
                    response.Generated,
                    response.Scanned,
                    response.SkippedExisting,
                    response.Failed,
                    request.IncludeInactive,
                    Take = normalizedTake
                });

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return response;
    }

    public async Task<ProductCatalogItemResponse> CreateProductAsync(
        CreateProductRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Product name is required.");
        var normalizedSku = NormalizeOptional(request.Sku);
        var normalizedBarcode = NormalizeOptionalBarcode(request.Barcode);
        var normalizedImageUrl = NormalizeOptional(request.ImageUrl);

        ValidateMoneyValue(request.UnitPrice, "Unit price cannot be negative.");
        ValidateMoneyValue(request.CostPrice, "Cost price cannot be negative.");
        ValidateQuantityValue(request.InitialStockQuantity, "Initial stock cannot be negative.");
        ValidateQuantityValue(request.ReorderLevel, "Reorder level cannot be negative.");
        ValidateQuantityValue(request.SafetyStock, "Safety stock cannot be negative.");
        ValidateQuantityValue(request.TargetStockLevel, "Target stock level cannot be negative.");

        var normalizedTargetStockLevel = request.TargetStockLevel > 0m
            ? request.TargetStockLevel
            : request.ReorderLevel;
        if (normalizedTargetStockLevel < request.ReorderLevel)
        {
            throw new InvalidOperationException("Target stock level must be greater than or equal to reorder level.");
        }

        await EnsureUniqueBarcodeAsync(normalizedBarcode, null, currentStoreId, cancellationToken);
        await EnsureUniqueSkuAsync(normalizedSku, null, currentStoreId, cancellationToken);
        await EnsureCategoryExistsIfProvidedAsync(request.CategoryId, null, currentStoreId, cancellationToken);
        await EnsureBrandExistsIfProvidedAsync(request.BrandId, null, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            StoreId = currentStoreId,
            Name = normalizedName,
            Sku = normalizedSku,
            Barcode = normalizedBarcode,
            ImageUrl = normalizedImageUrl,
            CategoryId = request.CategoryId,
            BrandId = request.BrandId,
            UnitPrice = RoundMoney(request.UnitPrice),
            CostPrice = RoundMoney(request.CostPrice),
            IsSerialTracked = request.IsSerialTracked,
            WarrantyMonths = Math.Max(0, request.WarrantyMonths),
            IsBatchTracked = request.IsBatchTracked,
            ExpiryAlertDays = Math.Max(0, request.ExpiryAlertDays),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var inventory = new InventoryRecord
        {
            Product = product,
            StoreId = product.StoreId,
            InitialStockQuantity = RoundQuantity(request.InitialStockQuantity),
            QuantityOnHand = RoundQuantity(request.InitialStockQuantity),
            ReorderLevel = RoundQuantity(request.ReorderLevel),
            SafetyStock = RoundQuantity(request.SafetyStock),
            TargetStockLevel = RoundQuantity(normalizedTargetStockLevel),
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
                product.BrandId,
                product.UnitPrice,
                product.CostPrice,
                inventory.InitialStockQuantity,
                inventory.QuantityOnHand,
                inventory.ReorderLevel,
                inventory.SafetyStock,
                inventory.TargetStockLevel,
                inventory.AllowNegativeStock,
                product.IsSerialTracked,
                product.WarrantyMonths,
                product.IsBatchTracked,
                product.ExpiryAlertDays,
                product.IsActive
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        if (inventory.InitialStockQuantity > 0m)
        {
            await stockMovementHelper.RecordMovementAsync(
                storeId: product.StoreId,
                productId: product.Id,
                type: StockMovementType.Adjustment,
                quantityChange: inventory.InitialStockQuantity,
                refType: StockMovementRef.Adjustment,
                refId: product.Id,
                batchId: null,
                serialNumber: null,
                reason: "initial_stock",
                userId: null,
                cancellationToken: cancellationToken,
                quantityBeforeOverride: 0m,
                updateInventory: false);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetSingleCatalogItemAsync(product.Id, DefaultLowStockThreshold, cancellationToken);
    }

    public async Task<ProductCatalogItemResponse> UpdateProductAsync(
        Guid productId,
        UpdateProductRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        var normalizedName = NormalizeRequired(request.Name, "Product name is required.");
        var normalizedSku = NormalizeOptional(request.Sku);
        var normalizedBarcode = NormalizeOptionalBarcode(request.Barcode);
        var normalizedImageUrl = NormalizeOptional(request.ImageUrl);

        ValidateMoneyValue(request.UnitPrice, "Unit price cannot be negative.");
        ValidateMoneyValue(request.CostPrice, "Cost price cannot be negative.");
        ValidateQuantityValue(request.InitialStockQuantity, "Initial stock cannot be negative.");
        ValidateQuantityValue(request.ReorderLevel, "Reorder level cannot be negative.");
        ValidateQuantityValue(request.SafetyStock, "Safety stock cannot be negative.");
        ValidateQuantityValue(request.TargetStockLevel, "Target stock level cannot be negative.");

        var normalizedTargetStockLevel = request.TargetStockLevel > 0m
            ? request.TargetStockLevel
            : request.ReorderLevel;
        if (normalizedTargetStockLevel < request.ReorderLevel)
        {
            throw new InvalidOperationException("Target stock level must be greater than or equal to reorder level.");
        }

        await EnsureUniqueBarcodeAsync(normalizedBarcode, productId, currentStoreId, cancellationToken);
        await EnsureUniqueSkuAsync(normalizedSku, productId, currentStoreId, cancellationToken);
        await EnsureCategoryExistsIfProvidedAsync(request.CategoryId, product.CategoryId, currentStoreId, cancellationToken);
        await EnsureBrandExistsIfProvidedAsync(request.BrandId, product.BrandId, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var before = new
        {
            product.Name,
            product.Sku,
            product.Barcode,
            product.ImageUrl,
            product.BrandId,
            product.UnitPrice,
            product.CostPrice,
            product.IsSerialTracked,
            product.WarrantyMonths,
            product.IsBatchTracked,
            product.ExpiryAlertDays,
            InitialStockQuantity = product.Inventory?.InitialStockQuantity ?? 0m,
            CurrentStockQuantity = product.Inventory?.QuantityOnHand ?? 0m,
            ReorderLevel = product.Inventory?.ReorderLevel ?? 0m,
            SafetyStock = product.Inventory?.SafetyStock ?? 0m,
            TargetStockLevel = product.Inventory?.TargetStockLevel ?? 0m,
            AllowNegativeStock = product.Inventory?.AllowNegativeStock ?? true,
            product.IsActive
        };
        product.Name = normalizedName;
        product.Sku = normalizedSku;
        product.Barcode = normalizedBarcode;
        product.ImageUrl = normalizedImageUrl;
        product.CategoryId = request.CategoryId;
        product.BrandId = request.BrandId;
        product.UnitPrice = RoundMoney(request.UnitPrice);
        product.CostPrice = RoundMoney(request.CostPrice);
        product.IsSerialTracked = request.IsSerialTracked;
        product.WarrantyMonths = Math.Max(0, request.WarrantyMonths);
        product.IsBatchTracked = request.IsBatchTracked;
        product.ExpiryAlertDays = Math.Max(0, request.ExpiryAlertDays);
        product.IsActive = request.IsActive;
        product.UpdatedAtUtc = now;

        if (product.Inventory is null)
        {
            product.Inventory = new InventoryRecord
            {
                ProductId = product.Id,
                StoreId = product.StoreId,
                InitialStockQuantity = 0m,
                QuantityOnHand = 0m,
                ReorderLevel = 0m,
                SafetyStock = 0m,
                TargetStockLevel = 0m,
                AllowNegativeStock = request.AllowNegativeStock,
                UpdatedAtUtc = now,
                Product = product
            };
        }
        else
        {
            product.Inventory.StoreId = product.StoreId;
        }

        var previousInitialStock = RoundQuantity(product.Inventory.InitialStockQuantity);
        var previousCurrentStock = RoundQuantity(product.Inventory.QuantityOnHand);
        var requestedInitialStock = request.InitialStockQuantity ?? previousInitialStock;
        var nextInitialStock = RoundQuantity(requestedInitialStock);
        var initialStockDelta = RoundQuantity(nextInitialStock - previousInitialStock);
        var nextCurrentStock = RoundQuantity(previousCurrentStock + initialStockDelta);

        if (!request.AllowNegativeStock && nextCurrentStock < 0m)
        {
            throw new InvalidOperationException("Initial stock correction would make current stock negative.");
        }

        product.Inventory.InitialStockQuantity = nextInitialStock;
        product.Inventory.ReorderLevel = RoundQuantity(request.ReorderLevel);
        product.Inventory.SafetyStock = RoundQuantity(request.SafetyStock);
        product.Inventory.TargetStockLevel = RoundQuantity(normalizedTargetStockLevel);
        product.Inventory.AllowNegativeStock = request.AllowNegativeStock;
        product.Inventory.UpdatedAtUtc = now;

        if (initialStockDelta != 0m)
        {
            await stockMovementHelper.RecordMovementAsync(
                storeId: product.StoreId,
                productId: product.Id,
                type: StockMovementType.Adjustment,
                quantityChange: initialStockDelta,
                refType: StockMovementRef.Adjustment,
                refId: product.Id,
                batchId: null,
                serialNumber: null,
                reason: "stock_recount",
                userId: null,
                cancellationToken);
        }

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
                product.BrandId,
                product.UnitPrice,
                product.CostPrice,
                InitialStockQuantity = product.Inventory.InitialStockQuantity,
                CurrentStockQuantity = product.Inventory.QuantityOnHand,
                ReorderLevel = product.Inventory.ReorderLevel,
                product.Inventory.SafetyStock,
                product.Inventory.TargetStockLevel,
                product.Inventory.AllowNegativeStock,
                product.IsSerialTracked,
                product.WarrantyMonths,
                product.IsBatchTracked,
                product.ExpiryAlertDays,
                product.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await GetSingleCatalogItemAsync(product.Id, DefaultLowStockThreshold, cancellationToken);
    }

    public async Task DeleteProductAsync(Guid productId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

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

    public async Task HardDeleteInactiveProductAsync(Guid productId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        if (product.IsActive)
        {
            throw new InvalidOperationException("Only inactive products can be permanently deleted.");
        }

        var hasSalesHistory = await dbContext.SaleItems
            .AsNoTracking()
            .AnyAsync(x => x.ProductId == productId, cancellationToken);
        var hasPurchaseHistory = await dbContext.PurchaseBillItems
            .AsNoTracking()
            .AnyAsync(x => x.ProductId == productId, cancellationToken);

        if (hasSalesHistory || hasPurchaseHistory)
        {
            throw new InvalidOperationException(
                "This product has transaction history and cannot be permanently deleted.");
        }

        var before = new
        {
            product.Name,
            product.Sku,
            product.Barcode,
            product.IsActive
        };

        dbContext.Products.Remove(product);
        auditLogService.Queue(
            action: "product_hard_deleted",
            entityName: "product",
            entityId: productId.ToString(),
            before: before);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<StockAdjustmentResponse> AdjustStockAsync(
        Guid productId,
        StockAdjustmentRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        if (request.DeltaQuantity == 0m)
        {
            throw new InvalidOperationException("Delta quantity cannot be zero.");
        }

        var reason = NormalizeRequired(request.Reason, "Stock adjustment reason is required.");
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .Include(x => x.ProductBatches)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        var now = DateTimeOffset.UtcNow;
        var inventory = product.Inventory;
        if (inventory is null)
        {
            inventory = new InventoryRecord
            {
                Product = product,
                ProductId = product.Id,
                StoreId = product.StoreId,
                InitialStockQuantity = 0m,
                QuantityOnHand = 0m,
                ReorderLevel = 0m,
                SafetyStock = 0m,
                TargetStockLevel = 0m,
                AllowNegativeStock = true,
                UpdatedAtUtc = now
            };
            dbContext.Inventory.Add(inventory);
        }
        else
        {
            inventory.StoreId = product.StoreId;
        }

        var roundedDelta = RoundQuantity(request.DeltaQuantity);
        var previous = RoundQuantity(inventory.QuantityOnHand);
        var next = RoundQuantity(previous + roundedDelta);

        if (!inventory.AllowNegativeStock && next < 0m)
        {
            throw new InvalidOperationException("Negative stock is not allowed for this product.");
        }

        if (product.IsBatchTracked && !request.BatchId.HasValue)
        {
            throw new InvalidOperationException("batch_id is required for batch-tracked products.");
        }

        if (!product.IsBatchTracked && request.BatchId.HasValue)
        {
            throw new InvalidOperationException("This product is not batch-tracked. Remove batch_id from the request.");
        }

        if (request.BatchId.HasValue && product.IsBatchTracked)
        {
            var batchExists = product.ProductBatches.Any(x => x.Id == request.BatchId.Value);
            if (!batchExists)
            {
                throw new InvalidOperationException("Selected batch does not exist for this product.");
            }
        }

        await stockMovementHelper.RecordMovementAsync(
            storeId: product.StoreId,
            productId: product.Id,
            type: StockMovementType.Adjustment,
            quantityChange: roundedDelta,
            refType: StockMovementRef.Adjustment,
            refId: product.Id,
            batchId: request.BatchId,
            serialNumber: null,
            reason,
            userId: null,
            cancellationToken);

        if (request.BatchId.HasValue && product.IsBatchTracked)
        {
            var batch = product.ProductBatches.FirstOrDefault(x => x.Id == request.BatchId.Value);
            if (batch is null)
            {
                throw new InvalidOperationException("Selected batch does not exist for this product.");
            }

            var nextBatchQty = RoundQuantity(batch.RemainingQuantity + roundedDelta);
            if (!inventory.AllowNegativeStock && nextBatchQty < 0m)
            {
                throw new InvalidOperationException("Negative batch stock is not allowed for this product.");
            }

            batch.RemainingQuantity = nextBatchQty;
            batch.UpdatedAtUtc = now;
        }

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
        var safetyStock = RoundQuantity(inventory.SafetyStock);
        var targetStockLevel = RoundQuantity(inventory.TargetStockLevel);
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
            SafetyStock = safetyStock,
            TargetStockLevel = targetStockLevel,
            UpdatedAt = now
        };
    }

    public async Task<CategoryListResponse> GetCategoriesAsync(
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(x => (includeInactive || x.IsActive) && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value))
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
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Category name is required.");
        await EnsureUniqueCategoryNameAsync(normalizedName, null, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var category = new Category
        {
            StoreId = currentStoreId,
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
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var category = await dbContext.Categories
            .FirstOrDefaultAsync(x => x.Id == categoryId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Category not found.");

        var normalizedName = NormalizeRequired(request.Name, "Category name is required.");
        await EnsureUniqueCategoryNameAsync(normalizedName, categoryId, currentStoreId, cancellationToken);

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
            .CountAsync(x => x.CategoryId == categoryId && x.IsActive && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);

        return ToCategoryItemResponse(category, productCount);
    }

    public async Task<BrandListResponse> GetBrandsAsync(
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var brands = await dbContext.Brands
            .AsNoTracking()
            .Where(x => (includeInactive || x.IsActive) && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value))
            .OrderBy(x => x.Name)
            .Select(x => new BrandItemResponse
            {
                BrandId = x.Id,
                Name = x.Name,
                Code = x.Code,
                Description = x.Description,
                IsActive = x.IsActive,
                ProductCount = x.Products.Count(y => y.IsActive && (!currentStoreId.HasValue || y.StoreId == currentStoreId.Value)),
                CanDelete = !x.IsActive &&
                            !x.Products.Any(y => !currentStoreId.HasValue || y.StoreId == currentStoreId.Value),
                DeleteBlockReason = x.IsActive
                    ? BrandDeleteRequiresDeactivateMessage
                    : x.Products.Any(y => !currentStoreId.HasValue || y.StoreId == currentStoreId.Value)
                        ? BrandDeleteProductLinksMessage
                        : null,
                CreatedAt = x.CreatedAtUtc,
                UpdatedAt = x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new BrandListResponse { Items = brands };
    }

    public async Task<BrandItemResponse> CreateBrandAsync(
        UpsertBrandRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Brand name is required.");
        var normalizedCode = NormalizeOptional(request.Code);
        await EnsureUniqueBrandNameAsync(normalizedName, null, currentStoreId, cancellationToken);
        await EnsureUniqueBrandCodeAsync(normalizedCode, null, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var brand = new Brand
        {
            StoreId = currentStoreId,
            Name = normalizedName,
            Code = normalizedCode,
            Description = NormalizeOptional(request.Description),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Brands.Add(brand);
        await dbContext.SaveChangesAsync(cancellationToken);
        var deleteAvailability = await GetBrandDeleteAvailabilityAsync(
            brand.Id,
            brand.IsActive,
            cancellationToken);
        return ToBrandItemResponse(
            brand,
            productCount: 0,
            canDelete: deleteAvailability.CanDelete,
            deleteBlockReason: deleteAvailability.BlockReason);
    }

    public async Task<BrandItemResponse> UpdateBrandAsync(
        Guid brandId,
        UpsertBrandRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var brand = await dbContext.Brands.FirstOrDefaultAsync(x => x.Id == brandId, cancellationToken)
            ?? throw new KeyNotFoundException("Brand not found.");
        if (currentStoreId.HasValue && brand.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Brand not found.");
        }

        var normalizedName = NormalizeRequired(request.Name, "Brand name is required.");
        var normalizedCode = NormalizeOptional(request.Code);
        await EnsureUniqueBrandNameAsync(normalizedName, brandId, currentStoreId, cancellationToken);
        await EnsureUniqueBrandCodeAsync(normalizedCode, brandId, currentStoreId, cancellationToken);

        brand.Name = normalizedName;
        brand.Code = normalizedCode;
        brand.Description = NormalizeOptional(request.Description);
        brand.IsActive = request.IsActive;
        brand.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        var productCount = await dbContext.Products
            .AsNoTracking()
            .CountAsync(x => x.BrandId == brandId && x.IsActive && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
        var deleteAvailability = await GetBrandDeleteAvailabilityAsync(
            brandId,
            brand.IsActive,
            cancellationToken);

        return ToBrandItemResponse(
            brand,
            productCount,
            canDelete: deleteAvailability.CanDelete,
            deleteBlockReason: deleteAvailability.BlockReason);
    }

    public async Task HardDeleteBrandAsync(Guid brandId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var brand = await dbContext.Brands
            .FirstOrDefaultAsync(
                x => x.Id == brandId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value),
                cancellationToken)
            ?? throw new KeyNotFoundException("Brand not found.");

        if (brand.IsActive)
        {
            throw new InvalidOperationException(BrandDeleteOnlyInactiveMessage);
        }

        var deleteAvailability = await GetBrandDeleteAvailabilityAsync(
            brandId,
            isActive: false,
            cancellationToken);

        if (!deleteAvailability.CanDelete)
        {
            throw new InvalidOperationException(
                deleteAvailability.BlockReason ?? "This brand cannot be permanently deleted.");
        }

        var before = new
        {
            brand.Name,
            brand.Code,
            brand.IsActive
        };

        dbContext.Brands.Remove(brand);
        auditLogService.Queue(
            action: "brand_hard_deleted",
            entityName: "brand",
            entityId: brandId.ToString(),
            before: before);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<SupplierListResponse> GetSuppliersAsync(
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var suppliers = await dbContext.Suppliers
            .AsNoTracking()
            .Where(x => (includeInactive || x.IsActive) && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value))
            .OrderBy(x => x.Name)
            .Select(x => new SupplierItemResponse
            {
                SupplierId = x.Id,
                Name = x.Name,
                Code = x.Code,
                ContactName = x.ContactName,
                Phone = x.Phone,
                Email = x.Email,
                Address = x.Address,
                IsActive = x.IsActive,
                LinkedProductCount = x.ProductSuppliers.Count(y => y.IsActive),
                CanDelete = !x.IsActive &&
                            !x.ProductSuppliers.Any() &&
                            !x.PurchaseBills.Any() &&
                            !x.ProductBatches.Any(),
                DeleteBlockReason = x.IsActive
                    ? SupplierDeleteRequiresDeactivateMessage
                    : x.ProductSuppliers.Any()
                        ? SupplierDeleteProductLinksMessage
                        : x.PurchaseBills.Any()
                            ? SupplierDeletePurchaseHistoryMessage
                            : x.ProductBatches.Any()
                                ? SupplierDeleteBatchHistoryMessage
                                : null,
                CreatedAt = x.CreatedAtUtc,
                UpdatedAt = x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new SupplierListResponse { Items = suppliers };
    }

    public async Task<SupplierItemResponse> CreateSupplierAsync(
        UpsertSupplierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Supplier name is required.");
        var normalizedCode = NormalizeOptional(request.Code);
        await EnsureUniqueSupplierNameAsync(normalizedName, null, currentStoreId, cancellationToken);
        await EnsureUniqueSupplierCodeAsync(normalizedCode, null, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var supplier = new Supplier
        {
            StoreId = currentStoreId,
            Name = normalizedName,
            Code = normalizedCode,
            ContactName = NormalizeOptional(request.ContactName),
            Phone = NormalizeOptional(request.Phone),
            Email = NormalizeOptional(request.Email),
            Address = NormalizeOptional(request.Address),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Suppliers.Add(supplier);
        await dbContext.SaveChangesAsync(cancellationToken);
        var deleteAvailability = await GetSupplierDeleteAvailabilityAsync(
            supplier.Id,
            supplier.IsActive,
            cancellationToken);
        return ToSupplierItemResponse(
            supplier,
            linkedProductCount: 0,
            canDelete: deleteAvailability.CanDelete,
            deleteBlockReason: deleteAvailability.BlockReason);
    }

    public async Task<SupplierItemResponse> UpdateSupplierAsync(
        Guid supplierId,
        UpsertSupplierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var supplier = await dbContext.Suppliers.FirstOrDefaultAsync(x => x.Id == supplierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Supplier not found.");

        var normalizedName = NormalizeRequired(request.Name, "Supplier name is required.");
        var normalizedCode = NormalizeOptional(request.Code);
        await EnsureUniqueSupplierNameAsync(normalizedName, supplierId, currentStoreId, cancellationToken);
        await EnsureUniqueSupplierCodeAsync(normalizedCode, supplierId, currentStoreId, cancellationToken);

        supplier.Name = normalizedName;
        supplier.Code = normalizedCode;
        supplier.ContactName = NormalizeOptional(request.ContactName);
        supplier.Phone = NormalizeOptional(request.Phone);
        supplier.Email = NormalizeOptional(request.Email);
        supplier.Address = NormalizeOptional(request.Address);
        supplier.IsActive = request.IsActive;
        supplier.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        var linkedProductCount = await dbContext.ProductSuppliers
            .AsNoTracking()
            .CountAsync(x => x.SupplierId == supplierId && x.IsActive && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
        var deleteAvailability = await GetSupplierDeleteAvailabilityAsync(
            supplierId,
            supplier.IsActive,
            cancellationToken);

        return ToSupplierItemResponse(
            supplier,
            linkedProductCount,
            canDelete: deleteAvailability.CanDelete,
            deleteBlockReason: deleteAvailability.BlockReason);
    }

    public async Task HardDeleteSupplierAsync(Guid supplierId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(
                x => x.Id == supplierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value),
                cancellationToken)
            ?? throw new KeyNotFoundException("Supplier not found.");

        if (supplier.IsActive)
        {
            throw new InvalidOperationException(SupplierDeleteOnlyInactiveMessage);
        }

        var deleteAvailability = await GetSupplierDeleteAvailabilityAsync(
            supplierId,
            isActive: false,
            cancellationToken);

        if (!deleteAvailability.CanDelete)
        {
            throw new InvalidOperationException(
                deleteAvailability.BlockReason ?? "This supplier cannot be permanently deleted.");
        }

        var before = new
        {
            supplier.Name,
            supplier.Code,
            supplier.IsActive
        };

        dbContext.Suppliers.Remove(supplier);
        auditLogService.Queue(
            action: "supplier_hard_deleted",
            entityName: "supplier",
            entityId: supplierId.ToString(),
            before: before);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<ProductSupplierListResponse> GetProductSuppliersAsync(
        Guid productId,
        CancellationToken cancellationToken)
    {
        await EnsureProductExistsAsync(productId, cancellationToken);

        var items = await dbContext.ProductSuppliers
            .AsNoTracking()
            .Include(x => x.Supplier)
            .Where(x => x.ProductId == productId)
            .OrderByDescending(x => x.IsPreferred)
            .ThenBy(x => x.Supplier.Name)
            .Select(x => new ProductSupplierItemResponse
            {
                ProductSupplierId = x.Id,
                SupplierId = x.SupplierId,
                SupplierName = x.Supplier.Name,
                SupplierSku = x.SupplierSku,
                SupplierItemName = x.SupplierItemName,
                IsPreferred = x.IsPreferred,
                LeadTimeDays = x.LeadTimeDays,
                MinOrderQty = x.MinOrderQty,
                PackSize = x.PackSize,
                LastPurchasePrice = x.LastPurchasePrice,
                IsActive = x.IsActive,
                CreatedAt = x.CreatedAtUtc,
                UpdatedAt = x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new ProductSupplierListResponse { Items = items };
    }

    public async Task<ProductSupplierItemResponse> UpsertProductSupplierAsync(
        Guid productId,
        UpsertProductSupplierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products.FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");
        var supplier = await dbContext.Suppliers.FirstOrDefaultAsync(x => x.Id == request.SupplierId, cancellationToken)
            ?? throw new KeyNotFoundException("Supplier not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        if (currentStoreId.HasValue && supplier.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Supplier not found.");
        }

        ValidateOptionalQuantityValue(request.MinOrderQty, "Minimum order quantity cannot be negative.");
        ValidateOptionalQuantityValue(request.PackSize, "Pack size cannot be negative.");
        ValidateOptionalMoneyValue(request.LastPurchasePrice, "Last purchase price cannot be negative.");
        ValidateOptionalLeadTimeValue(request.LeadTimeDays, "Lead time must be positive.");

        var now = DateTimeOffset.UtcNow;
        var mapping = await dbContext.ProductSuppliers
            .FirstOrDefaultAsync(x => x.ProductId == productId && x.SupplierId == request.SupplierId, cancellationToken);

        if (mapping is null)
        {
            mapping = new ProductSupplier
            {
                Product = product,
                Supplier = supplier,
                ProductId = productId,
                SupplierId = request.SupplierId,
                StoreId = product.StoreId,
                CreatedAtUtc = now
            };
            dbContext.ProductSuppliers.Add(mapping);
        }
        else
        {
            mapping.Product = product;
            mapping.Supplier = supplier;
        }

        mapping.SupplierSku = NormalizeOptional(request.SupplierSku);
        mapping.SupplierItemName = NormalizeOptional(request.SupplierItemName);
        mapping.IsPreferred = request.IsPreferred;
        mapping.LeadTimeDays = request.LeadTimeDays;
        mapping.MinOrderQty = request.MinOrderQty.HasValue ? RoundQuantity(request.MinOrderQty.Value) : null;
        mapping.PackSize = request.PackSize.HasValue ? RoundQuantity(request.PackSize.Value) : null;
        mapping.LastPurchasePrice = request.LastPurchasePrice.HasValue ? RoundMoney(request.LastPurchasePrice.Value) : null;
        mapping.IsActive = request.IsActive;
        mapping.UpdatedAtUtc = now;

        if (request.IsPreferred)
        {
            await ClearOtherPreferredSuppliersAsync(productId, mapping.Id, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToProductSupplierItemResponse(mapping);
    }

    public async Task<ProductSupplierItemResponse> SetPreferredSupplierAsync(
        Guid productId,
        SetPreferredProductSupplierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var mapping = await dbContext.ProductSuppliers
            .Include(x => x.Supplier)
            .FirstOrDefaultAsync(x => x.ProductId == productId && x.SupplierId == request.SupplierId, cancellationToken)
            ?? throw new KeyNotFoundException("Product supplier mapping not found.");

        if (currentStoreId.HasValue && mapping.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product supplier mapping not found.");
        }

        mapping.IsPreferred = true;
        mapping.IsActive = true;
        mapping.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await ClearOtherPreferredSuppliersAsync(productId, mapping.Id, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToProductSupplierItemResponse(mapping);
    }

    private async Task<ProductCatalogItemResponse> GetSingleCatalogItemAsync(
        Guid productId,
        decimal threshold,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var product = await dbContext.Products
            .AsNoTracking()
            .Include(x => x.Category)
            .Include(x => x.Brand)
            .Include(x => x.Inventory)
            .Include(x => x.ProductSuppliers)
                .ThenInclude(x => x.Supplier)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (currentStoreId.HasValue && product.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Product not found.");
        }

        return ToCatalogItemResponse(product, threshold);
    }

    private async Task EnsureCategoryExistsIfProvidedAsync(
        Guid? categoryId,
        Guid? currentCategoryId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
        {
            return;
        }

        if (currentCategoryId.HasValue && currentCategoryId.Value == categoryId.Value)
        {
            var currentExists = await dbContext.Categories
                .AsNoTracking()
                .AnyAsync(x => x.Id == categoryId.Value && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

            if (!currentExists)
            {
                throw new InvalidOperationException("Selected category does not exist.");
            }

            return;
        }

        var exists = await dbContext.Categories
            .AsNoTracking()
            .AnyAsync(x => x.Id == categoryId.Value && x.IsActive && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (!exists)
        {
            throw new InvalidOperationException("Selected category does not exist or is inactive.");
        }
    }

    private async Task EnsureBrandExistsIfProvidedAsync(
        Guid? brandId,
        Guid? currentBrandId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (!brandId.HasValue)
        {
            return;
        }

        if (currentBrandId.HasValue && currentBrandId.Value == brandId.Value)
        {
            var currentExists = await dbContext.Brands
                .AsNoTracking()
                .AnyAsync(x => x.Id == brandId.Value && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

            if (!currentExists)
            {
                throw new InvalidOperationException("Selected brand does not exist.");
            }

            return;
        }

        var exists = await dbContext.Brands
            .AsNoTracking()
            .AnyAsync(x => x.Id == brandId.Value && x.IsActive && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (!exists)
        {
            throw new InvalidOperationException("Selected brand does not exist or is inactive.");
        }
    }

    private async Task EnsureProductExistsAsync(
        Guid productId,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var exists = await dbContext.Products
            .AsNoTracking()
            .AnyAsync(x => x.Id == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);

        if (!exists)
        {
            throw new KeyNotFoundException("Product not found.");
        }
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await dbContext.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.StoreId)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private async Task ClearOtherPreferredSuppliersAsync(
        Guid productId,
        Guid preferredMappingId,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var others = await dbContext.ProductSuppliers
            .Where(x => x.ProductId == productId && x.Id != preferredMappingId && x.IsPreferred && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value))
            .ToListAsync(cancellationToken);

        foreach (var other in others)
        {
            other.IsPreferred = false;
            other.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }
    }

    private async Task<string> GenerateUniqueBarcodeValueAsync(
        string seed,
        Guid? storeId,
        Guid? productId,
        HashSet<string>? reservedBarcodes,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < MaxBarcodeGenerationAttempts; attempt++)
        {
            var candidate = ProductBarcodeRules.GenerateCandidateEan13(seed, storeId, attempt, idempotencyKey);
            if (reservedBarcodes is not null && reservedBarcodes.Contains(candidate))
            {
                continue;
            }

            if (await BarcodeExistsAsync(candidate, productId, storeId, cancellationToken))
            {
                continue;
            }

            return candidate;
        }

        throw new InvalidOperationException("Unable to generate a unique barcode right now. Please retry.");
    }

    private async Task<string?> TryAssignGeneratedBarcodeWithRetryAsync(
        Product product,
        string seed,
        HashSet<string> reservedBarcodes,
        DateTimeOffset updatedAtUtc,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        for (var retry = 0; retry < MaxBarcodePersistenceRetries; retry++)
        {
            if (!string.IsNullOrWhiteSpace(product.Barcode))
            {
                return null;
            }

            var barcode = await GenerateUniqueBarcodeValueAsync(
                seed,
                product.StoreId,
                product.Id,
                reservedBarcodes,
                idempotencyKey,
                cancellationToken);

            product.Barcode = barcode;
            product.UpdatedAtUtc = updatedAtUtc;

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return barcode;
            }
            catch (DbUpdateException exception) when (IsBarcodeUniquenessViolation(exception))
            {
                await dbContext.Entry(product).ReloadAsync(cancellationToken);
            }
        }

        throw new InvalidOperationException("Unable to save generated barcode right now. Please retry.");
    }

    private async Task<bool> BarcodeExistsAsync(
        string barcode,
        Guid? productId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(barcode))
        {
            return false;
        }

        var normalized = barcode.Trim().ToLowerInvariant();
        return await dbContext.Products
            .AsNoTracking()
            .AnyAsync(
                x => x.Barcode != null &&
                     x.Barcode.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!productId.HasValue || x.Id != productId.Value),
                cancellationToken);
    }

    private async Task EnsureUniqueBarcodeAsync(
        string? barcode,
        Guid? productId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(barcode))
        {
            return;
        }

        var exists = await BarcodeExistsAsync(barcode, productId, storeId, cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Barcode already exists.");
        }
    }

    private void DiscardPendingAuditLogs()
    {
        foreach (var auditEntry in dbContext.ChangeTracker.Entries<AuditLog>()
                     .Where(x => x.State == EntityState.Added))
        {
            auditEntry.State = EntityState.Detached;
        }
    }

    private static bool IsBarcodeUniquenessViolation(DbUpdateException exception)
    {
        var message = exception.InnerException?.Message ?? exception.Message;
        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        return message.Contains("IX_products_Barcode_Normalized", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("IX_products_StoreId_Barcode_Normalized", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("products.Barcode", StringComparison.OrdinalIgnoreCase) ||
               message.Contains("products.\"Barcode\"", StringComparison.OrdinalIgnoreCase) ||
               (message.Contains("duplicate key value", StringComparison.OrdinalIgnoreCase) &&
                message.Contains("barcode", StringComparison.OrdinalIgnoreCase));
    }

    private static string? NormalizeIdempotencyKey(string? idempotencyKey)
    {
        var normalized = (idempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized.Length <= 128 ? normalized : normalized[..128];
    }

    private async Task EnsureUniqueSkuAsync(
        string? sku,
        Guid? productId,
        Guid? storeId,
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
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
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
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var exists = await dbContext.Categories
            .AsNoTracking()
            .AnyAsync(
                x => x.Name.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!categoryId.HasValue || x.Id != categoryId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Category name already exists.");
        }
    }

    private async Task EnsureUniqueBrandNameAsync(
        string name,
        Guid? brandId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var exists = await dbContext.Brands
            .AsNoTracking()
            .AnyAsync(
                x => x.Name.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!brandId.HasValue || x.Id != brandId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Brand name already exists.");
        }
    }

    private async Task EnsureUniqueBrandCodeAsync(
        string? code,
        Guid? brandId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return;
        }

        var normalized = code.Trim().ToLowerInvariant();
        var exists = await dbContext.Brands
            .AsNoTracking()
            .AnyAsync(
                x => x.Code != null &&
                     x.Code.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!brandId.HasValue || x.Id != brandId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Brand code already exists.");
        }
    }

    private async Task EnsureUniqueSupplierNameAsync(
        string name,
        Guid? supplierId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var exists = await dbContext.Suppliers
            .AsNoTracking()
            .AnyAsync(
                x => x.Name.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!supplierId.HasValue || x.Id != supplierId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Supplier name already exists.");
        }
    }

    private async Task EnsureUniqueSupplierCodeAsync(
        string? code,
        Guid? supplierId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return;
        }

        var normalized = code.Trim().ToLowerInvariant();
        var exists = await dbContext.Suppliers
            .AsNoTracking()
            .AnyAsync(
                x => x.Code != null &&
                     x.Code.ToLower() == normalized &&
                     (!storeId.HasValue || x.StoreId == storeId.Value) &&
                     (!supplierId.HasValue || x.Id != supplierId.Value),
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Supplier code already exists.");
        }
    }

    private static void ValidateOptionalQuantityValue(decimal? value, string errorMessage)
    {
        if (value.HasValue && value.Value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static void ValidateOptionalMoneyValue(decimal? value, string errorMessage)
    {
        if (value.HasValue && value.Value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static void ValidateOptionalLeadTimeValue(int? value, string errorMessage)
    {
        if (value.HasValue && value.Value <= 0)
        {
            throw new InvalidOperationException(errorMessage);
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
            BrandId = product.BrandId,
            BrandName = product.Brand?.Name,
            UnitPrice = RoundMoney(product.UnitPrice),
            CostPrice = RoundMoney(product.CostPrice),
            StockQuantity = stockQuantity,
            InitialStockQuantity = RoundQuantity(product.Inventory?.InitialStockQuantity ?? stockQuantity),
            ReorderLevel = reorderLevel,
            AlertLevel = alertLevel,
            SafetyStock = RoundQuantity(product.Inventory?.SafetyStock ?? 0m),
            TargetStockLevel = RoundQuantity(product.Inventory?.TargetStockLevel ?? 0m),
            AllowNegativeStock = product.Inventory?.AllowNegativeStock ?? true,
            IsActive = product.IsActive,
            IsLowStock = stockQuantity <= alertLevel,
            IsSerialTracked = product.IsSerialTracked,
            WarrantyMonths = product.WarrantyMonths,
            IsBatchTracked = product.IsBatchTracked,
            ExpiryAlertDays = product.ExpiryAlertDays,
            ProductSuppliers = product.ProductSuppliers
                .Select(ToProductSupplierItemResponse)
                .OrderByDescending(x => x.IsPreferred)
                .ThenBy(x => x.SupplierName)
                .ToList(),
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

    private async Task<BrandDeleteAvailability> GetBrandDeleteAvailabilityAsync(
        Guid brandId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (isActive)
        {
            return new BrandDeleteAvailability(false, BrandDeleteRequiresDeactivateMessage);
        }

        var hasProductLinks = await dbContext.Products
            .AsNoTracking()
            .AnyAsync(x => x.BrandId == brandId, cancellationToken);
        if (hasProductLinks)
        {
            return new BrandDeleteAvailability(false, BrandDeleteProductLinksMessage);
        }

        return new BrandDeleteAvailability(true, null);
    }

    private static BrandItemResponse ToBrandItemResponse(
        Brand brand,
        int productCount,
        bool canDelete,
        string? deleteBlockReason)
    {
        return new BrandItemResponse
        {
            BrandId = brand.Id,
            Name = brand.Name,
            Code = brand.Code,
            Description = brand.Description,
            IsActive = brand.IsActive,
            ProductCount = productCount,
            CanDelete = canDelete,
            DeleteBlockReason = deleteBlockReason,
            CreatedAt = brand.CreatedAtUtc,
            UpdatedAt = brand.UpdatedAtUtc
        };
    }

    private sealed record BrandDeleteAvailability(bool CanDelete, string? BlockReason);

    private async Task<SupplierDeleteAvailability> GetSupplierDeleteAvailabilityAsync(
        Guid supplierId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (isActive)
        {
            return new SupplierDeleteAvailability(false, SupplierDeleteRequiresDeactivateMessage);
        }

        var hasProductLinks = await dbContext.ProductSuppliers
            .AsNoTracking()
            .AnyAsync(x => x.SupplierId == supplierId, cancellationToken);
        if (hasProductLinks)
        {
            return new SupplierDeleteAvailability(false, SupplierDeleteProductLinksMessage);
        }

        var hasPurchaseHistory = await dbContext.PurchaseBills
            .AsNoTracking()
            .AnyAsync(x => x.SupplierId == supplierId, cancellationToken);
        if (hasPurchaseHistory)
        {
            return new SupplierDeleteAvailability(false, SupplierDeletePurchaseHistoryMessage);
        }

        var hasBatchHistory = await dbContext.ProductBatches
            .AsNoTracking()
            .AnyAsync(x => x.SupplierId == supplierId, cancellationToken);
        if (hasBatchHistory)
        {
            return new SupplierDeleteAvailability(false, SupplierDeleteBatchHistoryMessage);
        }

        return new SupplierDeleteAvailability(true, null);
    }

    private static SupplierItemResponse ToSupplierItemResponse(
        Supplier supplier,
        int linkedProductCount,
        bool canDelete,
        string? deleteBlockReason)
    {
        return new SupplierItemResponse
        {
            SupplierId = supplier.Id,
            Name = supplier.Name,
            Code = supplier.Code,
            ContactName = supplier.ContactName,
            Phone = supplier.Phone,
            Email = supplier.Email,
            Address = supplier.Address,
            IsActive = supplier.IsActive,
            LinkedProductCount = linkedProductCount,
            CanDelete = canDelete,
            DeleteBlockReason = deleteBlockReason,
            CreatedAt = supplier.CreatedAtUtc,
            UpdatedAt = supplier.UpdatedAtUtc
        };
    }

    private sealed record SupplierDeleteAvailability(bool CanDelete, string? BlockReason);

    private static ProductSupplierItemResponse ToProductSupplierItemResponse(ProductSupplier mapping)
    {
        return new ProductSupplierItemResponse
        {
            ProductSupplierId = mapping.Id,
            SupplierId = mapping.SupplierId,
            SupplierName = mapping.Supplier?.Name ?? string.Empty,
            SupplierSku = mapping.SupplierSku,
            SupplierItemName = mapping.SupplierItemName,
            IsPreferred = mapping.IsPreferred,
            LeadTimeDays = mapping.LeadTimeDays,
            MinOrderQty = mapping.MinOrderQty,
            PackSize = mapping.PackSize,
            LastPurchasePrice = mapping.LastPurchasePrice,
            IsActive = mapping.IsActive,
            CreatedAt = mapping.CreatedAtUtc,
            UpdatedAt = mapping.UpdatedAtUtc
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

    private static string? NormalizeOptionalBarcode(string? value)
    {
        var normalized = ProductBarcodeRules.NormalizeOptionalForStorage(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var validation = ProductBarcodeRules.Validate(normalized);
        if (!validation.IsValid)
        {
            throw new InvalidOperationException(validation.Message ?? "Barcode is invalid.");
        }

        return validation.Normalized;
    }

    private static string BuildBarcodeSeed(
        string? name,
        string? sku,
        string? explicitSeed)
    {
        var values = new[] { explicitSeed, name, sku }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim());

        var seed = string.Join(' ', values).Trim();
        return string.IsNullOrWhiteSpace(seed) ? "NEW ITEM" : seed;
    }

    private static void ValidateMoneyValue(decimal value, string errorMessage)
    {
        if (value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static void ValidateQuantityValue(decimal? value, string errorMessage)
    {
        if (value.HasValue && value.Value < 0m)
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
