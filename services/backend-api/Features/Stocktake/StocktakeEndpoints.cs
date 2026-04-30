using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Stocktake;

public static class StocktakeEndpoints
{
    public static IEndpointRouteBuilder MapStocktakeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/stocktake")
            .WithTags("Stocktake")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("/sessions", async (
            string? status,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var query = dbContext.StocktakeSessions.AsNoTracking().AsQueryable();
            if (currentStoreId.HasValue)
            {
                query = query.Where(x => x.StoreId == currentStoreId.Value);
            }
            if (!string.IsNullOrWhiteSpace(status) &&
                Enum.TryParse<StocktakeStatus>(status, true, out var parsedStatus))
            {
                query = query.Where(x => x.Status == parsedStatus);
            }

            var items = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .Select(x => new
                {
                    id = x.Id,
                    store_id = x.StoreId,
                    status = x.Status,
                    started_at = x.StartedAtUtc,
                    completed_at = x.CompletedAtUtc,
                    created_by_user_id = x.CreatedByUserId,
                    item_count = x.Items.Count(),
                    variance_count = x.Items.Count(item => item.VarianceQuantity.HasValue && item.VarianceQuantity.Value != 0m),
                    created_at = x.CreatedAtUtc,
                    updated_at = x.UpdatedAtUtc
                })
                .ToListAsync(cancellationToken);

            return Results.Ok(new { items });
        })
        .WithName("ListStocktakeSessions")
        .WithOpenApi();

        group.MapPost("/sessions", async (
            CreateStocktakeSessionRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var now = DateTimeOffset.UtcNow;
            var products = await dbContext.Products
                .AsNoTracking()
                .Include(x => x.Inventory)
                .Where(x => x.IsActive)
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .ToListAsync(cancellationToken);

            var session = new StocktakeSession
            {
                StoreId = currentStoreId ?? request.StoreId,
                Status = StocktakeStatus.Draft,
                StartedAtUtc = now,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                CreatedByUserId = request.CreatedByUserId
            };

            session.Items = products.Select(product => new StocktakeItem
            {
                ProductId = product.Id,
                SystemQuantity = product.Inventory?.QuantityOnHand ?? 0m,
                CountedQuantity = null,
                VarianceQuantity = null,
                Notes = null,
                CreatedAtUtc = now,
                Session = session,
                Product = null!
            }).ToList();

            dbContext.StocktakeSessions.Add(session);
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save stocktake changes. Refresh and try again." });
            }

            return Results.Ok(ToSessionResponse(session));
        })
        .WithName("CreateStocktakeSession")
        .WithOpenApi();

        group.MapGet("/sessions/{sessionId:guid}", async (
            Guid sessionId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var session = await dbContext.StocktakeSessions
                .AsNoTracking()
                .Include(x => x.Items)
                .ThenInclude(x => x.Product)
                .FirstOrDefaultAsync(x => x.Id == sessionId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (session is null)
            {
                return Results.NotFound(new { message = "Stocktake session not found." });
            }

            return Results.Ok(ToSessionResponse(session));
        })
        .WithName("GetStocktakeSession")
        .WithOpenApi();

        group.MapPut("/sessions/{sessionId:guid}/start", async (
            Guid sessionId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var session = await dbContext.StocktakeSessions
                .FirstOrDefaultAsync(x => x.Id == sessionId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (session is null)
            {
                return Results.NotFound(new { message = "Stocktake session not found." });
            }

            if (session.Status != StocktakeStatus.Draft)
            {
                return Results.BadRequest(new { message = "Only draft sessions can be started." });
            }

            session.Status = StocktakeStatus.InProgress;
            session.UpdatedAtUtc = DateTimeOffset.UtcNow;
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save stocktake changes. Refresh and try again." });
            }

            return Results.Ok(ToSessionResponse(session));
        })
        .WithName("StartStocktakeSession")
        .WithOpenApi();

        group.MapPut("/sessions/{sessionId:guid}/items/{itemId:guid}", async (
            Guid sessionId,
            Guid itemId,
            UpdateStocktakeItemRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var item = await dbContext.StocktakeItems
                .Include(x => x.Session)
                .Include(x => x.Product)
                .FirstOrDefaultAsync(x => x.SessionId == sessionId && x.Id == itemId && (!currentStoreId.HasValue || x.Session.StoreId == currentStoreId.Value), cancellationToken);
            if (item is null)
            {
                return Results.NotFound(new { message = "Stocktake item not found." });
            }

            if (item.Session.Status != StocktakeStatus.InProgress)
            {
                return Results.BadRequest(new { message = "Only in-progress sessions can be updated." });
            }

            item.CountedQuantity = request.CountedQuantity;
            item.VarianceQuantity = decimal.Round(request.CountedQuantity - item.SystemQuantity, 3, MidpointRounding.AwayFromZero);
            item.Notes = request.Notes;
            item.UpdatedAtUtc = DateTimeOffset.UtcNow;
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save stocktake changes. Refresh and try again." });
            }

            return Results.Ok(new
            {
                id = item.Id,
                session_id = item.SessionId,
                product_id = item.ProductId,
                product_name = item.Product.Name,
                system_quantity = item.SystemQuantity,
                counted_quantity = item.CountedQuantity,
                variance_quantity = item.VarianceQuantity,
                notes = item.Notes
            });
        })
        .WithName("UpdateStocktakeItem")
        .WithOpenApi();

        group.MapPost("/sessions/{sessionId:guid}/complete", async (
            Guid sessionId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var session = await dbContext.StocktakeSessions
                .Include(x => x.Items)
                .ThenInclude(x => x.Product)
                .ThenInclude(x => x.Inventory)
                .FirstOrDefaultAsync(x => x.Id == sessionId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (session is null)
            {
                return Results.NotFound(new { message = "Stocktake session not found." });
            }

            if (session.Status != StocktakeStatus.InProgress)
            {
                return Results.BadRequest(new { message = "Only in-progress sessions can be completed." });
            }

            var now = DateTimeOffset.UtcNow;
            foreach (var item in session.Items)
            {
                var counted = item.CountedQuantity ?? item.SystemQuantity;
                var variance = decimal.Round(counted - item.SystemQuantity, 3, MidpointRounding.AwayFromZero);
                item.CountedQuantity = counted;
                item.VarianceQuantity = variance;
                item.UpdatedAtUtc = now;

                var inventory = item.Product.Inventory;
                if (inventory is null)
                {
                    inventory = new InventoryRecord
                    {
                        ProductId = item.ProductId,
                        StoreId = session.StoreId,
                        QuantityOnHand = 0m,
                        InitialStockQuantity = 0m,
                        ReorderLevel = 0m,
                        SafetyStock = 0m,
                        TargetStockLevel = 0m,
                        AllowNegativeStock = true,
                        Product = item.Product,
                        UpdatedAtUtc = now
                    };
                    dbContext.Inventory.Add(inventory);
                    item.Product.Inventory = inventory;
                }

                inventory.QuantityOnHand = counted;
                inventory.UpdatedAtUtc = now;

                if (variance != 0m)
                {
                    dbContext.StockMovements.Add(new StockMovement
                    {
                        StoreId = session.StoreId,
                        ProductId = item.ProductId,
                        MovementType = StockMovementType.StocktakeReconciliation,
                        QuantityBefore = item.SystemQuantity,
                        QuantityChange = variance,
                        QuantityAfter = counted,
                        ReferenceType = StockMovementRef.Stocktake,
                        ReferenceId = session.Id,
                        Reason = "stocktake_reconciliation",
                        CreatedAtUtc = now,
                        Product = item.Product,
                        CreatedByUserId = session.CreatedByUserId
                    });
                }
            }

            session.Status = StocktakeStatus.Completed;
            session.CompletedAtUtc = now;
            session.UpdatedAtUtc = now;
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save stocktake changes. Refresh and try again." });
            }

            return Results.Ok(ToSessionResponse(session));
        })
        .WithName("CompleteStocktakeSession")
        .WithOpenApi();

        group.MapDelete("/sessions/{sessionId:guid}", async (
            Guid sessionId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var session = await dbContext.StocktakeSessions
                .Include(x => x.Items)
                .FirstOrDefaultAsync(x => x.Id == sessionId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (session is null)
            {
                return Results.NotFound(new { message = "Stocktake session not found." });
            }

            if (session.Status != StocktakeStatus.Draft)
            {
                return Results.BadRequest(new { message = "Only draft sessions can be deleted." });
            }

            dbContext.StocktakeItems.RemoveRange(session.Items);
            dbContext.StocktakeSessions.Remove(session);
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save stocktake changes. Refresh and try again." });
            }
            return Results.NoContent();
        })
        .WithName("DeleteStocktakeSession")
        .WithOpenApi();

        return app;
    }

    private static object ToSessionResponse(StocktakeSession session)
    {
        return new
        {
            id = session.Id,
            store_id = session.StoreId,
            status = session.Status,
            started_at = session.StartedAtUtc,
            completed_at = session.CompletedAtUtc,
            created_at = session.CreatedAtUtc,
            updated_at = session.UpdatedAtUtc,
            created_by_user_id = session.CreatedByUserId,
            item_count = session.Items.Count,
            variance_count = session.Items.Count(item => item.VarianceQuantity.HasValue && item.VarianceQuantity.Value != 0m),
            items = session.Items.Select(item => new
            {
                id = item.Id,
                product_id = item.ProductId,
                product_name = item.Product?.Name,
                system_quantity = item.SystemQuantity,
                counted_quantity = item.CountedQuantity,
                variance_quantity = item.VarianceQuantity,
                notes = item.Notes,
                created_at = item.CreatedAtUtc,
                updated_at = item.UpdatedAtUtc
            }).ToList()
        };
    }
}

public sealed class CreateStocktakeSessionRequest
{
    [JsonPropertyName("store_id")]
    public Guid? StoreId { get; set; }

    [JsonPropertyName("created_by_user_id")]
    public Guid? CreatedByUserId { get; set; }
}

public sealed class UpdateStocktakeItemRequest
{
    [JsonPropertyName("counted_quantity")]
    public decimal CountedQuantity { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}
