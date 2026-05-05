using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Inventory;

public static class InventoryEndpoints
{
    private sealed record StockMovementListRow(
        Guid Id,
        Guid? ProductId,
        StockMovementType MovementType,
        decimal QuantityBefore,
        decimal QuantityChange,
        decimal QuantityAfter,
        StockMovementRef ReferenceType,
        Guid? ReferenceId,
        Guid? BatchId,
        string? SerialNumber,
        string? Reason,
        Guid? CreatedByUserId,
        DateTimeOffset CreatedAtUtc);

    public static IEndpointRouteBuilder MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inventory")
            .WithTags("Inventory")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("/dashboard", async (
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var defaultThreshold = await dbContext.ShopStockSettings
                .AsNoTracking()
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .Select(x => x.DefaultLowStockThreshold)
                .FirstOrDefaultAsync(cancellationToken);
            if (defaultThreshold <= 0m)
            {
                defaultThreshold = 5m;
            }

            var products = await dbContext.Products
                .AsNoTracking()
                .Include(x => x.Inventory)
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .ToListAsync(cancellationToken);

            var lowStockCount = products.Count(product =>
            {
                var stockQuantity = product.Inventory?.QuantityOnHand ?? 0m;
                var reorderLevel = product.Inventory?.ReorderLevel ?? 0m;
                var alertLevel = Math.Max(reorderLevel, defaultThreshold);
                return stockQuantity <= alertLevel;
            });

            var openStocktakeSessions = await dbContext.StocktakeSessions
                .AsNoTracking()
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .Where(x => x.Status == StocktakeStatus.Draft || x.Status == StocktakeStatus.InProgress)
                .CountAsync(cancellationToken);

            var openWarrantyClaims = await dbContext.WarrantyClaims
                .AsNoTracking()
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .Where(x => x.Status == WarrantyClaimStatus.Open ||
                            x.Status == WarrantyClaimStatus.InRepair)
                .CountAsync(cancellationToken);

            var expiringBatches = await dbContext.ProductBatches
                .AsNoTracking()
                .Include(x => x.Product)
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .Where(x => x.ExpiryDate.HasValue)
                .ToListAsync(cancellationToken);

            var expiryAlerts = expiringBatches
                .Select(x =>
                {
                    var daysUntilExpiry = (int)Math.Floor(
                        (x.ExpiryDate!.Value.UtcDateTime.Date - DateTime.UtcNow.Date).TotalDays);
                    return new
                    {
                        batch_id = x.Id,
                        product_id = x.ProductId,
                        product_name = x.Product.Name,
                        batch_number = x.BatchNumber,
                        expiry_date = x.ExpiryDate!.Value,
                        remaining_quantity = x.RemainingQuantity,
                        days_until_expiry = daysUntilExpiry
                    };
                })
                .Where(x => x.days_until_expiry <= 30)
                .OrderBy(x => x.days_until_expiry)
                .ToList();

            return Results.Ok(new
            {
                low_stock_count = lowStockCount,
                expiry_alert_count = expiryAlerts.Count,
                open_stocktake_sessions = openStocktakeSessions,
                open_warranty_claims = openWarrantyClaims,
                expiry_alerts = expiryAlerts
            });
        })
        .WithName("GetInventoryDashboard")
        .WithOpenApi();

        group.MapGet("/movements", async (
            Guid? product_id,
            string? movement_type,
            DateTimeOffset? from_date,
            DateTimeOffset? to_date,
            int? page,
            int? take,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var normalizedPage = Math.Max(1, page ?? 1);
            var normalizedTake = Math.Clamp(take ?? 20, 1, 100);
            var isSqlite = dbContext.Database.IsSqlite();

            var query = dbContext.StockMovements
                .AsNoTracking()
                .AsQueryable();

            if (currentStoreId.HasValue)
            {
                query = query.Where(x => x.StoreId == currentStoreId.Value);
            }

            if (product_id.HasValue)
            {
                query = query.Where(x => x.ProductId == product_id.Value);
            }

            if (!string.IsNullOrWhiteSpace(movement_type) &&
                !string.Equals(movement_type, "all", StringComparison.OrdinalIgnoreCase))
            {
                if (Enum.TryParse<StockMovementType>(movement_type, true, out var parsedMovementType))
                {
                    query = query.Where(x => x.MovementType == parsedMovementType);
                }
            }

            if (from_date.HasValue)
            {
                if (!isSqlite)
                {
                    query = query.Where(x => x.CreatedAtUtc >= from_date.Value);
                }
            }

            if (to_date.HasValue)
            {
                if (!isSqlite)
                {
                    query = query.Where(x => x.CreatedAtUtc <= to_date.Value.AddDays(1));
                }
            }

            int total;
            List<StockMovementListRow> pageRows;
            if (isSqlite)
            {
                var movements = await query
                    .Select(x => new StockMovementListRow(
                        x.Id,
                        x.ProductId,
                        x.MovementType,
                        x.QuantityBefore,
                        x.QuantityChange,
                        x.QuantityAfter,
                        x.ReferenceType,
                        x.ReferenceId,
                        x.BatchId,
                        x.SerialNumber,
                        x.Reason,
                        x.CreatedByUserId,
                        x.CreatedAtUtc))
                    .ToListAsync(cancellationToken);

                if (from_date.HasValue)
                {
                    movements = movements.Where(x => x.CreatedAtUtc >= from_date.Value).ToList();
                }

                if (to_date.HasValue)
                {
                    movements = movements.Where(x => x.CreatedAtUtc <= to_date.Value.AddDays(1)).ToList();
                }

                total = movements.Count;
                pageRows = movements
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .Skip((normalizedPage - 1) * normalizedTake)
                    .Take(normalizedTake)
                    .ToList();
            }
            else
            {
                total = await query.CountAsync(cancellationToken);
                pageRows = await query
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .Skip((normalizedPage - 1) * normalizedTake)
                    .Take(normalizedTake)
                    .Select(x => new StockMovementListRow(
                        x.Id,
                        x.ProductId,
                        x.MovementType,
                        x.QuantityBefore,
                        x.QuantityChange,
                        x.QuantityAfter,
                        x.ReferenceType,
                        x.ReferenceId,
                        x.BatchId,
                        x.SerialNumber,
                        x.Reason,
                        x.CreatedByUserId,
                        x.CreatedAtUtc))
                    .ToListAsync(cancellationToken);
            }

            var productIds = pageRows
                .Select(x => x.ProductId)
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .Distinct()
                .ToList();
            var productNamesById = productIds.Count == 0
                ? new Dictionary<Guid, string>()
                : await dbContext.Products
                    .AsNoTracking()
                    .Where(x => productIds.Contains(x.Id))
                    .Select(x => new { x.Id, x.Name })
                    .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);

            var items = pageRows
                .Select(x => new
                {
                    id = x.Id,
                    product_id = x.ProductId,
                    product_name = x.ProductId.HasValue && productNamesById.TryGetValue(x.ProductId.Value, out var productName)
                        ? productName
                        : null,
                    movement_type = x.MovementType,
                    quantity_before = x.QuantityBefore,
                    quantity_change = x.QuantityChange,
                    quantity_after = x.QuantityAfter,
                    reference_type = x.ReferenceType,
                    reference_id = x.ReferenceId,
                    batch_id = x.BatchId,
                    serial_number = x.SerialNumber,
                    reason = x.Reason,
                    created_by_user_id = x.CreatedByUserId,
                    created_at = x.CreatedAtUtc
                })
                .ToList();

            return Results.Ok(new
            {
                items,
                total,
                page = normalizedPage,
                take = normalizedTake
            });
        })
        .WithName("ListInventoryMovements")
        .WithOpenApi();

        return app;
    }
}
