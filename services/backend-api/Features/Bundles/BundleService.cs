using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Bundles;

public sealed class BundleService(
    SmartPosDbContext dbContext,
    StockMovementHelper stockMovementHelper,
    IHttpContextAccessor httpContextAccessor)
{
    public async Task<BundleSearchResponse> SearchBundlesAsync(
        string? query,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);

        var bundleQuery = dbContext.Bundles
            .AsNoTracking()
            .Include(x => x.Inventory)
            .Where(x => x.IsActive);

        if (currentStoreId.HasValue)
        {
            bundleQuery = bundleQuery.Where(x => x.StoreId == currentStoreId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            bundleQuery = bundleQuery.Where(x =>
                x.Name.ToLower().Contains(term) ||
                (x.Barcode != null && x.Barcode.ToLower().Contains(term)));
        }

        var items = await bundleQuery
            .OrderBy(x => x.Name)
            .Take(normalizedTake)
            .Select(x => new BundleSearchItem
            {
                Id = x.Id,
                Name = x.Name,
                Barcode = x.Barcode,
                Price = RoundMoney(x.Price),
                StockQuantity = RoundQuantity(x.Inventory != null ? x.Inventory.QuantityOnHand : 0m)
            })
            .ToListAsync(cancellationToken);

        return new BundleSearchResponse
        {
            Items = items
        };
    }

    public async Task<BundleCatalogResponse> GetBundleCatalogAsync(
        string? query,
        int take,
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);

        var bundleQuery = dbContext.Bundles
            .AsNoTracking()
            .Include(x => x.Items)
            .Include(x => x.Inventory)
            .AsQueryable();

        if (currentStoreId.HasValue)
        {
            bundleQuery = bundleQuery.Where(x => x.StoreId == currentStoreId.Value);
        }

        if (!includeInactive)
        {
            bundleQuery = bundleQuery.Where(x => x.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            bundleQuery = bundleQuery.Where(x =>
                x.Name.ToLower().Contains(term) ||
                (x.Barcode != null && x.Barcode.ToLower().Contains(term)));
        }

        var items = await bundleQuery
            .OrderBy(x => x.Name)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        return new BundleCatalogResponse
        {
            Items = items.Select(ToResponse).ToList()
        };
    }

    public async Task<BundleResponse> CreateBundleAsync(
        CreateBundleRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var name = NormalizeRequired(request.Name, "Bundle name is required.");
        var barcode = NormalizeOptional(request.Barcode);
        var description = NormalizeOptional(request.Description);
        ValidateMoney(request.Price, "Bundle price must be greater than zero.", allowZero: false);
        ValidateQuantity(request.InitialStock, "Initial stock cannot be negative.", allowZero: true);
        var items = await NormalizeItemsAsync(request.Items, currentStoreId, cancellationToken);

        await EnsureUniqueBundleBarcodeAsync(currentStoreId, barcode, null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var bundle = new Bundle
        {
            StoreId = currentStoreId,
            Name = name,
            Barcode = barcode,
            Description = description,
            Price = RoundMoney(request.Price),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            Items = items.Select(x => new BundleItem
            {
                ProductId = x.ProductId,
                ItemName = x.ItemName,
                Quantity = x.Quantity,
                Notes = x.Notes,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                Bundle = null!
            }).ToList(),
            Inventory = new BundleInventoryRecord
            {
                QuantityOnHand = RoundQuantity(request.InitialStock),
                ReorderLevel = 0m,
                AllowNegativeStock = true,
                UpdatedAtUtc = now,
                Bundle = null!
            }
        };

        dbContext.Bundles.Add(bundle);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (bundle.Inventory is not null && bundle.Inventory.QuantityOnHand > 0m)
        {
            await stockMovementHelper.RecordBundleMovementAsync(
                storeId: bundle.StoreId,
                bundleId: bundle.Id,
                type: StockMovementType.Purchase,
                quantityChange: bundle.Inventory.QuantityOnHand,
                refType: StockMovementRef.Purchase,
                refId: bundle.Id,
                reason: "bundle_initial_stock",
                userId: null,
                cancellationToken: cancellationToken,
                quantityBeforeOverride: 0m,
                updateInventory: false);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return ToResponse(bundle);
    }

    public async Task<BundleResponse> UpdateBundleAsync(
        Guid bundleId,
        UpdateBundleRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var bundle = await dbContext.Bundles
            .Include(x => x.Items)
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == bundleId, cancellationToken)
            ?? throw new KeyNotFoundException("Bundle not found.");

        if (currentStoreId.HasValue && bundle.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Bundle not found.");
        }

        if (request.Name is not null)
        {
            bundle.Name = NormalizeRequired(request.Name, "Bundle name is required.");
        }

        if (request.Barcode is not null)
        {
            var barcode = NormalizeOptional(request.Barcode);
            await EnsureUniqueBundleBarcodeAsync(currentStoreId, barcode, bundle.Id, cancellationToken);
            bundle.Barcode = barcode;
        }

        if (request.Description is not null)
        {
            bundle.Description = NormalizeOptional(request.Description);
        }

        if (request.Price.HasValue)
        {
            ValidateMoney(request.Price.Value, "Bundle price must be greater than zero.", allowZero: false);
            bundle.Price = RoundMoney(request.Price.Value);
        }

        if (request.IsActive.HasValue)
        {
            bundle.IsActive = request.IsActive.Value;
        }

        if (request.Items is not null)
        {
            var items = await NormalizeItemsAsync(request.Items, currentStoreId, cancellationToken);
            dbContext.BundleItems.RemoveRange(bundle.Items);
            bundle.Items = items.Select(x => new BundleItem
            {
                BundleId = bundle.Id,
                ProductId = x.ProductId,
                ItemName = x.ItemName,
                Quantity = x.Quantity,
                Notes = x.Notes,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                Bundle = bundle
            }).ToList();
        }

        bundle.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(bundle);
    }

    public async Task<BundleResponse> ReceiveBundlesAsync(
        Guid bundleId,
        BundleStockQuantityRequest request,
        CancellationToken cancellationToken)
    {
        ValidateQuantity(request.Quantity, "Quantity must be greater than zero.", allowZero: false);

        var bundle = await LoadBundleWithItemsAsync(bundleId, cancellationToken);
        await stockMovementHelper.RecordBundleMovementAsync(
            storeId: bundle.StoreId,
            bundleId: bundle.Id,
            type: StockMovementType.Purchase,
            quantityChange: RoundQuantity(request.Quantity),
            refType: StockMovementRef.Purchase,
            refId: bundle.Id,
            reason: "bundle_receive",
            userId: null,
            cancellationToken: cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(bundle);
    }

    public async Task<BundleResponse> AssembleBundlesAsync(
        Guid bundleId,
        BundleStockQuantityRequest request,
        CancellationToken cancellationToken)
    {
        ValidateQuantity(request.Quantity, "Quantity must be greater than zero.", allowZero: false);
        var bundle = await LoadBundleWithItemsAsync(bundleId, cancellationToken);
        var quantity = RoundQuantity(request.Quantity);

        foreach (var item in bundle.Items.Where(x => x.ProductId.HasValue))
        {
            var deduction = RoundQuantity(item.Quantity * quantity);
            await stockMovementHelper.RecordMovementAsync(
                storeId: bundle.StoreId,
                productId: item.ProductId!.Value,
                type: StockMovementType.Adjustment,
                quantityChange: -deduction,
                refType: StockMovementRef.Adjustment,
                refId: bundle.Id,
                batchId: null,
                serialNumber: null,
                reason: $"bundle_assemble:{bundle.Name}",
                userId: null,
                cancellationToken: cancellationToken);
        }

        await stockMovementHelper.RecordBundleMovementAsync(
            storeId: bundle.StoreId,
            bundleId: bundle.Id,
            type: StockMovementType.Adjustment,
            quantityChange: quantity,
            refType: StockMovementRef.Adjustment,
            refId: bundle.Id,
            reason: "bundle_assemble",
            userId: null,
            cancellationToken: cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(bundle);
    }

    public async Task<BundleResponse> BreakBundlesAsync(
        Guid bundleId,
        BundleStockQuantityRequest request,
        CancellationToken cancellationToken)
    {
        ValidateQuantity(request.Quantity, "Quantity must be greater than zero.", allowZero: false);
        var bundle = await LoadBundleWithItemsAsync(bundleId, cancellationToken);
        var quantity = RoundQuantity(request.Quantity);

        await stockMovementHelper.RecordBundleMovementAsync(
            storeId: bundle.StoreId,
            bundleId: bundle.Id,
            type: StockMovementType.Adjustment,
            quantityChange: -quantity,
            refType: StockMovementRef.Adjustment,
            refId: bundle.Id,
            reason: "bundle_break",
            userId: null,
            cancellationToken: cancellationToken);

        foreach (var item in bundle.Items.Where(x => x.ProductId.HasValue))
        {
            var add = RoundQuantity(item.Quantity * quantity);
            await stockMovementHelper.RecordMovementAsync(
                storeId: bundle.StoreId,
                productId: item.ProductId!.Value,
                type: StockMovementType.Adjustment,
                quantityChange: add,
                refType: StockMovementRef.Adjustment,
                refId: bundle.Id,
                batchId: null,
                serialNumber: null,
                reason: $"bundle_break:{bundle.Name}",
                userId: null,
                cancellationToken: cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(bundle);
    }

    private async Task<Bundle> LoadBundleWithItemsAsync(Guid bundleId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var bundle = await dbContext.Bundles
            .Include(x => x.Items)
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == bundleId, cancellationToken)
            ?? throw new KeyNotFoundException("Bundle not found.");

        if (currentStoreId.HasValue && bundle.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Bundle not found.");
        }

        return bundle;
    }

    private async Task<List<NormalizedBundleItem>> NormalizeItemsAsync(
        IReadOnlyCollection<BundleItemRequest> requests,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (requests.Count == 0)
        {
            throw new InvalidOperationException("At least one bundle item is required.");
        }

        if (requests.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All bundle item quantities must be greater than zero.");
        }

        var productIds = requests
            .Where(x => x.ProductId.HasValue)
            .Select(x => x.ProductId!.Value)
            .Distinct()
            .ToArray();

        var products = productIds.Length == 0
            ? new Dictionary<Guid, Product>()
            : await dbContext.Products
                .AsNoTracking()
                .Where(x => productIds.Contains(x.Id) && (!storeId.HasValue || x.StoreId == storeId.Value))
                .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("One or more bundle products were not found.");
        }

        var normalized = new List<NormalizedBundleItem>(requests.Count);
        foreach (var request in requests)
        {
            var itemName = NormalizeOptional(request.ItemName);
            if (request.ProductId.HasValue)
            {
                var product = products[request.ProductId.Value];
                normalized.Add(new NormalizedBundleItem(
                    request.ProductId.Value,
                    itemName ?? product.Name,
                    RoundQuantity(request.Quantity),
                    NormalizeOptional(request.Notes)));
                continue;
            }

            if (string.IsNullOrWhiteSpace(itemName))
            {
                throw new InvalidOperationException("Free-text bundle item name is required when product_id is not provided.");
            }

            normalized.Add(new NormalizedBundleItem(
                null,
                itemName,
                RoundQuantity(request.Quantity),
                NormalizeOptional(request.Notes)));
        }

        return normalized;
    }

    private static BundleResponse ToResponse(Bundle bundle)
    {
        return new BundleResponse
        {
            Id = bundle.Id,
            Name = bundle.Name,
            Barcode = bundle.Barcode,
            Description = bundle.Description,
            Price = RoundMoney(bundle.Price),
            StockQuantity = RoundQuantity(bundle.Inventory?.QuantityOnHand ?? 0m),
            IsActive = bundle.IsActive,
            Items = bundle.Items
                .OrderBy(x => x.CreatedAtUtc)
                .Select(x => new BundleItemResponse
                {
                    Id = x.Id,
                    ProductId = x.ProductId,
                    ItemName = x.ItemName,
                    Quantity = RoundQuantity(x.Quantity),
                    Notes = x.Notes
                })
                .ToList()
        };
    }

    private async Task EnsureUniqueBundleBarcodeAsync(
        Guid? storeId,
        string? barcode,
        Guid? excludeBundleId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(barcode))
        {
            return;
        }

        var normalized = barcode.Trim().ToLowerInvariant();
        var exists = await dbContext.Bundles
            .AsNoTracking()
            .AnyAsync(x =>
                (excludeBundleId == null || x.Id != excludeBundleId.Value) &&
                (!storeId.HasValue || x.StoreId == storeId.Value) &&
                x.Barcode != null &&
                x.Barcode.ToLower() == normalized,
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Bundle barcode already exists.");
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

    private static string NormalizeRequired(string? value, string errorMessage)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException(errorMessage);
        }

        return normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static void ValidateQuantity(decimal value, string message, bool allowZero)
    {
        if (allowZero)
        {
            if (value < 0m)
            {
                throw new InvalidOperationException(message);
            }

            return;
        }

        if (value <= 0m)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static void ValidateMoney(decimal value, string message, bool allowZero)
    {
        if (allowZero)
        {
            if (value < 0m)
            {
                throw new InvalidOperationException(message);
            }
            return;
        }

        if (value <= 0m)
        {
            throw new InvalidOperationException(message);
        }
    }

    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal RoundQuantity(decimal value) =>
        decimal.Round(value, 3, MidpointRounding.AwayFromZero);

    private sealed record NormalizedBundleItem(
        Guid? ProductId,
        string ItemName,
        decimal Quantity,
        string? Notes);
}
