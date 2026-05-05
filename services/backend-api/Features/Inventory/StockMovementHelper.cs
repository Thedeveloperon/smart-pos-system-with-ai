using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Inventory;

public sealed class StockMovementHelper(SmartPosDbContext dbContext)
{
    public async Task RecordMovementAsync(
        Guid? storeId,
        Guid productId,
        StockMovementType type,
        decimal quantityChange,
        StockMovementRef refType,
        Guid? refId,
        Guid? batchId,
        string? serialNumber,
        string? reason,
        Guid? userId,
        CancellationToken cancellationToken,
        decimal? quantityBeforeOverride = null,
        bool updateInventory = true)
    {
        var now = DateTimeOffset.UtcNow;
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        var inventory = product.Inventory;
        if (inventory is null)
        {
            inventory = new InventoryRecord
            {
                ProductId = productId,
                StoreId = storeId,
                QuantityOnHand = 0m,
                InitialStockQuantity = 0m,
                ReorderLevel = 0m,
                SafetyStock = 0m,
                TargetStockLevel = 0m,
                AllowNegativeStock = true,
                Product = product,
                UpdatedAtUtc = now
            };
            dbContext.Inventory.Add(inventory);
        }

        ArgumentNullException.ThrowIfNull(inventory);
        var quantityBefore = RoundQuantity(quantityBeforeOverride ?? inventory.QuantityOnHand);
        var quantityAfter = RoundQuantity(quantityBefore + quantityChange);

        if (!inventory.AllowNegativeStock && quantityAfter < 0m)
        {
            throw new InvalidOperationException("Negative stock is not allowed for this product.");
        }

        if (updateInventory)
        {
            inventory.StoreId = storeId;
            inventory.QuantityOnHand = quantityAfter;
            inventory.UpdatedAtUtc = now;
        }

        dbContext.StockMovements.Add(new StockMovement
        {
            StoreId = storeId,
            ProductId = productId,
            BundleId = null,
            MovementType = type,
            QuantityBefore = quantityBefore,
            QuantityChange = RoundQuantity(quantityChange),
            QuantityAfter = quantityAfter,
            ReferenceType = refType,
            ReferenceId = refId,
            BatchId = batchId,
            SerialNumber = NormalizeOptional(serialNumber),
            Reason = NormalizeOptional(reason),
            CreatedByUserId = userId,
            CreatedAtUtc = now,
            Product = product,
            Batch = null,
            CreatedByUser = null
        });
    }

    public async Task RecordBundleMovementAsync(
        Guid? storeId,
        Guid bundleId,
        StockMovementType type,
        decimal quantityChange,
        StockMovementRef refType,
        Guid? refId,
        string? reason,
        Guid? userId,
        CancellationToken cancellationToken,
        decimal? quantityBeforeOverride = null,
        bool updateInventory = true)
    {
        var now = DateTimeOffset.UtcNow;
        var bundle = await dbContext.Bundles
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == bundleId, cancellationToken)
            ?? throw new KeyNotFoundException("Bundle not found.");

        var inventory = bundle.Inventory;
        if (inventory is null)
        {
            inventory = new BundleInventoryRecord
            {
                BundleId = bundleId,
                QuantityOnHand = 0m,
                ReorderLevel = 0m,
                AllowNegativeStock = true,
                Bundle = bundle,
                UpdatedAtUtc = now
            };
            dbContext.BundleInventory.Add(inventory);
            bundle.Inventory = inventory;
        }

        var quantityBefore = RoundQuantity(quantityBeforeOverride ?? inventory.QuantityOnHand);
        var quantityAfter = RoundQuantity(quantityBefore + quantityChange);

        if (!inventory.AllowNegativeStock && quantityAfter < 0m)
        {
            throw new InvalidOperationException("Negative stock is not allowed for this bundle.");
        }

        if (updateInventory)
        {
            inventory.QuantityOnHand = quantityAfter;
            inventory.UpdatedAtUtc = now;
        }

        dbContext.StockMovements.Add(new StockMovement
        {
            StoreId = storeId,
            ProductId = null,
            BundleId = bundleId,
            MovementType = type,
            QuantityBefore = quantityBefore,
            QuantityChange = RoundQuantity(quantityChange),
            QuantityAfter = quantityAfter,
            ReferenceType = refType,
            ReferenceId = refId,
            BatchId = null,
            SerialNumber = null,
            Reason = NormalizeOptional(reason),
            CreatedByUserId = userId,
            CreatedAtUtc = now,
            Product = null,
            Bundle = bundle,
            Batch = null,
            CreatedByUser = null
        });
    }

    private static decimal RoundQuantity(decimal value)
    {
        return decimal.Round(value, 3, MidpointRounding.AwayFromZero);
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
