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
        CancellationToken cancellationToken)
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
        var quantityBefore = RoundQuantity(inventory.QuantityOnHand);
        var quantityAfter = RoundQuantity(quantityBefore + quantityChange);

        if (!inventory.AllowNegativeStock && quantityAfter < 0m)
        {
            throw new InvalidOperationException("Negative stock is not allowed for this product.");
        }

        if (inventory is not null)
        {
            inventory.StoreId = storeId;
            inventory.QuantityOnHand = quantityAfter;
            inventory.UpdatedAtUtc = now;
        }

        dbContext.StockMovements.Add(new StockMovement
        {
            StoreId = storeId,
            ProductId = productId,
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
