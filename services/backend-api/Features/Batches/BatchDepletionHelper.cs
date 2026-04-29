using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Batches;

public sealed class BatchDepletionHelper(
    SmartPosDbContext dbContext,
    StockMovementHelper stockMovementHelper)
{
    public async Task DepleteAsync(
        Guid? storeId,
        Guid productId,
        decimal quantity,
        Guid refId,
        Guid? userId,
        CancellationToken cancellationToken)
    {
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.Id == productId, cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        if (!product.IsBatchTracked)
        {
            return;
        }

        var remainingToConsume = decimal.Round(quantity, 3, MidpointRounding.AwayFromZero);
        if (remainingToConsume <= 0m)
        {
            return;
        }

        var batches = await dbContext.ProductBatches
            .Where(x => x.ProductId == productId && x.RemainingQuantity > 0m)
            .OrderBy(x => x.ExpiryDate == null)
            .ThenBy(x => x.ExpiryDate)
            .ThenBy(x => x.ReceivedAtUtc)
            .ToListAsync(cancellationToken);

        foreach (var batch in batches)
        {
            if (remainingToConsume <= 0m)
            {
                break;
            }

            var consumed = Math.Min(batch.RemainingQuantity, remainingToConsume);
            if (consumed <= 0m)
            {
                continue;
            }

            batch.RemainingQuantity = decimal.Round(
                batch.RemainingQuantity - consumed,
                3,
                MidpointRounding.AwayFromZero);
            batch.UpdatedAtUtc = DateTimeOffset.UtcNow;

            await stockMovementHelper.RecordMovementAsync(
                storeId: storeId,
                productId: productId,
                type: StockMovementType.Sale,
                quantityChange: -consumed,
                refType: StockMovementRef.Sale,
                refId: refId,
                batchId: batch.Id,
                serialNumber: null,
                reason: "batch_depletion",
                userId: userId,
                cancellationToken);

            remainingToConsume = decimal.Round(
                remainingToConsume - consumed,
                3,
                MidpointRounding.AwayFromZero);
        }

        if (remainingToConsume > 0m)
        {
            throw new InvalidOperationException("Insufficient batch quantity available.");
        }
    }
}
