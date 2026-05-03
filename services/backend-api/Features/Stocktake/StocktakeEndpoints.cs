using System.Data;
using System.Data.Common;
using System.Globalization;
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
            StocktakeStatus? statusFilter = null;
            if (!string.IsNullOrWhiteSpace(status) &&
                Enum.TryParse<StocktakeStatus>(status, true, out var parsedStatus))
            {
                statusFilter = parsedStatus;
            }

            List<object> items;
            if (dbContext.Database.IsSqlite())
            {
                // Keep the SQLite summary query raw so malformed legacy numeric text
                // in stocktake_items cannot crash the page while loading the session list.
                items = await ListSqliteSessionSummariesAsync(
                    dbContext,
                    currentStoreId,
                    statusFilter,
                    cancellationToken);
            }
            else
            {
                var query = dbContext.StocktakeSessions.AsNoTracking().AsQueryable();
                if (currentStoreId.HasValue)
                {
                    query = query.Where(x => x.StoreId == currentStoreId.Value);
                }
                if (statusFilter.HasValue)
                {
                    query = query.Where(x => x.Status == statusFilter.Value);
                }

                items = await query
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .Select(x => (object)new
                    {
                        id = x.Id,
                        store_id = x.StoreId,
                        status = x.Status.ToString(),
                        started_at = x.StartedAtUtc,
                        completed_at = x.CompletedAtUtc,
                        created_by_user_id = x.CreatedByUserId,
                        item_count = x.Items.Count(),
                        variance_count = x.Items.Count(item => item.VarianceQuantity.HasValue && item.VarianceQuantity.Value != 0m),
                        created_at = x.CreatedAtUtc,
                        updated_at = x.UpdatedAtUtc
                    })
                    .ToListAsync(cancellationToken);
            }

            return Results.Ok(new { items });
        })
        .WithName("ListStocktakeSessions")
        .WithOpenApi();

        group.MapPost("/sessions", async (
            CreateStocktakeSessionRequest? request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            request ??= new CreateStocktakeSessionRequest();
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

        group.MapPost("/sessions/{sessionId:guid}/revert", async (
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

            if (session.Status != StocktakeStatus.Completed)
            {
                return Results.BadRequest(new { message = "Only completed sessions can be reverted." });
            }

            if (!session.CompletedAtUtc.HasValue)
            {
                return Results.Conflict(new { message = "This stocktake cannot be reverted because it has no completion timestamp." });
            }

            var productIds = session.Items.Select(x => x.ProductId).Distinct().ToHashSet();
            var stockMovements = await dbContext.StockMovements
                .AsNoTracking()
                .Select(movement => new
                {
                    movement.ProductId,
                    movement.StoreId,
                    movement.CreatedAtUtc
                })
                .ToListAsync(cancellationToken);
            var inventoryChangedSinceCompletion = stockMovements.Any(movement =>
                productIds.Contains(movement.ProductId) &&
                movement.CreatedAtUtc > session.CompletedAtUtc.Value &&
                (!session.StoreId.HasValue || movement.StoreId == session.StoreId.Value));
            if (inventoryChangedSinceCompletion)
            {
                return Results.Conflict(new { message = "This stocktake can no longer be reverted because stock changed after it was completed." });
            }

            foreach (var item in session.Items)
            {
                var completedQuantity = item.CountedQuantity ?? item.SystemQuantity;
                var currentQuantity = item.Product.Inventory?.QuantityOnHand;
                if (currentQuantity != completedQuantity)
                {
                    return Results.Conflict(new { message = "This stocktake can no longer be reverted because inventory no longer matches the completed counts." });
                }
            }

            var now = DateTimeOffset.UtcNow;
            foreach (var item in session.Items)
            {
                var completedQuantity = item.CountedQuantity ?? item.SystemQuantity;
                var revertedQuantity = item.SystemQuantity;
                var reversal = decimal.Round(revertedQuantity - completedQuantity, 3, MidpointRounding.AwayFromZero);

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

                inventory.QuantityOnHand = revertedQuantity;
                inventory.UpdatedAtUtc = now;

                if (reversal != 0m)
                {
                    dbContext.StockMovements.Add(new StockMovement
                    {
                        StoreId = session.StoreId,
                        ProductId = item.ProductId,
                        MovementType = StockMovementType.StocktakeReconciliation,
                        QuantityBefore = completedQuantity,
                        QuantityChange = reversal,
                        QuantityAfter = revertedQuantity,
                        ReferenceType = StockMovementRef.Stocktake,
                        ReferenceId = session.Id,
                        Reason = "stocktake_reversal",
                        CreatedAtUtc = now,
                        Product = item.Product,
                        CreatedByUserId = session.CreatedByUserId
                    });
                }
            }

            session.Status = StocktakeStatus.Reverted;
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
        .WithName("RevertStocktakeSession")
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

            if (session.Status is not (StocktakeStatus.Draft or StocktakeStatus.InProgress))
            {
                return Results.BadRequest(new { message = "Only draft or in-progress sessions can be deleted." });
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
            status = session.Status.ToString(),
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
                session_id = item.SessionId,
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

    private static async Task<List<object>> ListSqliteSessionSummariesAsync(
        SmartPosDbContext dbContext,
        Guid? currentStoreId,
        StocktakeStatus? statusFilter,
        CancellationToken cancellationToken)
    {
        var connection = dbContext.Database.GetDbConnection();
        var shouldCloseConnection = connection.State != ConnectionState.Open;
        if (shouldCloseConnection)
        {
            await connection.OpenAsync(cancellationToken);
        }

        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                """
                SELECT
                  s."Id",
                  s."StoreId",
                  s."Status",
                  s."StartedAtUtc",
                  s."CompletedAtUtc",
                  s."CreatedByUserId",
                  s."CreatedAtUtc",
                  s."UpdatedAtUtc",
                  COUNT(i."Id") AS "ItemCount",
                  COALESCE(SUM(
                    CASE
                      WHEN i."VarianceQuantity" IS NULL THEN 0
                      WHEN trim(CAST(i."VarianceQuantity" AS TEXT)) IN ('', '0', '0.0', '0.00', '0.000', '-0', '-0.0', '-0.00', '-0.000') THEN 0
                      ELSE 1
                    END
                  ), 0) AS "VarianceCount"
                FROM "stocktake_sessions" AS s
                LEFT JOIN "stocktake_items" AS i ON i."SessionId" = s."Id"
                WHERE (@storeId IS NULL OR (s."StoreId" IS NOT NULL AND lower(s."StoreId") = lower(@storeId)))
                  AND (@status IS NULL OR lower(s."Status") = lower(@status))
                GROUP BY
                  s."Id",
                  s."StoreId",
                  s."Status",
                  s."StartedAtUtc",
                  s."CompletedAtUtc",
                  s."CreatedByUserId",
                  s."CreatedAtUtc",
                  s."UpdatedAtUtc"
                ORDER BY s."CreatedAtUtc" DESC;
                """;

            AddNullableTextParameter(command, "@storeId", currentStoreId?.ToString());
            AddNullableTextParameter(command, "@status", statusFilter?.ToString());

            var items = new List<object>();
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                items.Add(new
                {
                    id = ReadGuid(reader, 0),
                    store_id = ReadNullableGuid(reader, 1),
                    status = ReadStocktakeStatus(reader, 2).ToString(),
                    started_at = ReadDateTimeOffset(reader, 3),
                    completed_at = ReadNullableDateTimeOffset(reader, 4),
                    created_by_user_id = ReadNullableGuid(reader, 5),
                    item_count = ReadInt32(reader, 8),
                    variance_count = ReadInt32(reader, 9),
                    created_at = ReadDateTimeOffset(reader, 6),
                    updated_at = ReadNullableDateTimeOffset(reader, 7)
                });
            }

            return items;
        }
        finally
        {
            if (shouldCloseConnection)
            {
                await connection.CloseAsync();
            }
        }
    }

    private static void AddNullableTextParameter(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value is null ? DBNull.Value : value;
        command.Parameters.Add(parameter);
    }

    private static Guid ReadGuid(DbDataReader reader, int ordinal)
    {
        return Guid.Parse(ReadString(reader, ordinal));
    }

    private static Guid? ReadNullableGuid(DbDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var rawValue = ReadString(reader, ordinal);
        return Guid.TryParse(rawValue, out var parsedValue) ? parsedValue : null;
    }

    private static StocktakeStatus ReadStocktakeStatus(DbDataReader reader, int ordinal)
    {
        var rawValue = ReadString(reader, ordinal);
        return Enum.TryParse<StocktakeStatus>(rawValue, true, out var parsedStatus)
            ? parsedStatus
            : StocktakeStatus.Draft;
    }

    private static DateTimeOffset ReadDateTimeOffset(DbDataReader reader, int ordinal)
    {
        return ParseDateTimeOffset(reader.GetValue(ordinal));
    }

    private static DateTimeOffset? ReadNullableDateTimeOffset(DbDataReader reader, int ordinal)
    {
        return reader.IsDBNull(ordinal) ? null : ParseDateTimeOffset(reader.GetValue(ordinal));
    }

    private static DateTimeOffset ParseDateTimeOffset(object value)
    {
        return value switch
        {
            DateTimeOffset offset => offset,
            DateTime dateTime => new DateTimeOffset(
                dateTime.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
                    : dateTime.ToUniversalTime()),
            _ when DateTimeOffset.TryParse(
                Convert.ToString(value, CultureInfo.InvariantCulture),
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var parsedValue) => parsedValue,
            _ => throw new FormatException($"Failed to parse SQLite DateTimeOffset value '{value}'.")
        };
    }

    private static int ReadInt32(DbDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return 0;
        }

        var value = reader.GetValue(ordinal);
        return value switch
        {
            int intValue => intValue,
            long longValue => checked((int)longValue),
            short shortValue => shortValue,
            byte byteValue => byteValue,
            string stringValue when int.TryParse(
                stringValue,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var parsedValue) => parsedValue,
            _ => Convert.ToInt32(value, CultureInfo.InvariantCulture)
        };
    }

    private static string ReadString(DbDataReader reader, int ordinal)
    {
        return Convert.ToString(reader.GetValue(ordinal), CultureInfo.InvariantCulture) ?? string.Empty;
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
