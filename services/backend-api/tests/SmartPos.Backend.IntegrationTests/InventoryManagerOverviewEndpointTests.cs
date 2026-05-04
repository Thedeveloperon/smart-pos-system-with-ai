using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class InventoryManagerOverviewEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task InventoryOverviewEndpoints_ShouldLoadOnSqlite()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var expiringBatches = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/batches/expiring?days=30"));
        Assert.NotNull(expiringBatches["items"]);

        var stocktakeSessions = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/stocktake/sessions"));
        Assert.NotNull(stocktakeSessions["items"]);

        var warrantyClaims = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/warranty-claims"));
        Assert.NotNull(warrantyClaims["items"]);

        var dashboard = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/inventory/dashboard"));
        Assert.NotNull(dashboard["expiry_alerts"]);
    }

    [Fact]
    public async Task CreateStocktakeSession_ShouldAcceptEmptyJsonBody()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/stocktake/sessions", new { });
        var session = await TestJson.ReadObjectAsync(response);

        Assert.NotEqual(Guid.Empty, Guid.Parse(TestJson.GetString(session, "id")));
        Assert.Equal("Draft", TestJson.GetString(session, "status"));
        Assert.NotNull(session["items"]);
    }

    [Fact]
    public async Task CreateStocktakeSession_ShouldAcceptMissingBody()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsync("/api/stocktake/sessions", null);
        var session = await TestJson.ReadObjectAsync(response);

        Assert.NotEqual(Guid.Empty, Guid.Parse(TestJson.GetString(session, "id")));
        Assert.Equal("Draft", TestJson.GetString(session, "status"));
    }

    [Fact]
    public async Task StocktakeSessionItems_ShouldIncludeSessionId_WhenLoadingSessionDetails()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = TestJson.GetString(createdSession, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionId}"));
        var firstItem = sessionDetails["items"]?.AsArray().OfType<JsonObject>().FirstOrDefault()
            ?? throw new InvalidOperationException("Expected at least one stocktake item.");

        Assert.Equal(sessionId, TestJson.GetString(firstItem, "session_id"));
    }

    [Fact]
    public async Task DeleteStocktakeSession_ShouldAllowInProgressSessions()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = TestJson.GetString(createdSession, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var deleteResponse = await client.DeleteAsync($"/api/stocktake/sessions/{sessionId}");
        Assert.Equal(System.Net.HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getResponse = await client.GetAsync($"/api/stocktake/sessions/{sessionId}");
        Assert.Equal(System.Net.HttpStatusCode.NotFound, getResponse.StatusCode);
    }

    [Fact]
    public async Task RevertStocktakeSession_ShouldRestoreInventoryAndRecordReversalMovement()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = TestJson.GetString(createdSession, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionId}"));
        var firstItem = sessionDetails["items"]?.AsArray().OfType<JsonObject>().FirstOrDefault()
            ?? throw new InvalidOperationException("Expected at least one stocktake item.");

        var itemId = TestJson.GetString(firstItem, "id");
        var productId = Guid.Parse(TestJson.GetString(firstItem, "product_id"));
        var systemQuantity = TestJson.GetDecimal(firstItem, "system_quantity");
        var countedQuantity = systemQuantity + 2m;
        var expectedReversalQuantity = decimal.Round(systemQuantity - countedQuantity, 3, MidpointRounding.AwayFromZero);

        await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync(
                $"/api/stocktake/sessions/{sessionId}/items/{itemId}",
                new { counted_quantity = countedQuantity }));

        await TestJson.ReadObjectAsync(
            await client.PostAsync($"/api/stocktake/sessions/{sessionId}/complete", null));

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var inventoryQuantity = await dbContext.Inventory
                .Where(x => x.ProductId == productId)
                .Select(x => x.QuantityOnHand)
                .SingleAsync();
            Assert.Equal(countedQuantity, inventoryQuantity);
        }

        var revertedSession = await TestJson.ReadObjectAsync(
            await client.PostAsync($"/api/stocktake/sessions/{sessionId}/revert", null));
        Assert.Equal("Reverted", TestJson.GetString(revertedSession, "status"));

        using var verificationScope = factory.Services.CreateScope();
        var verificationDbContext = verificationScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var revertedQuantity = await verificationDbContext.Inventory
            .Where(x => x.ProductId == productId)
            .Select(x => x.QuantityOnHand)
            .SingleAsync();
        Assert.Equal(systemQuantity, revertedQuantity);

        var movements = await verificationDbContext.StockMovements
            .Where(x => x.ReferenceId == Guid.Parse(sessionId) && x.ProductId == productId)
            .ToListAsync();

        Assert.Contains(movements, x => x.Reason == "stocktake_reconciliation" && x.QuantityChange == countedQuantity - systemQuantity);
        Assert.Contains(movements, x => x.Reason == "stocktake_reversal" && x.QuantityChange == expectedReversalQuantity);
    }

    [Fact]
    public async Task CompleteStocktakeSession_ShouldRequireSerialReconciliationForSerialTrackedVariance()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialOne = $"STK-REQ-{runId}-001";
        var serialTwo = $"STK-REQ-{runId}-002";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Stocktake Serial Required {runId}",
                sku = $"STK-REQ-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));
        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialOne, serialTwo }
            }));

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = TestJson.GetString(createdSession, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionId}"));
        var trackedItem = sessionDetails["items"]?.AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => string.Equals(
                TestJson.GetString(item, "product_id"),
                productId.ToString(),
                StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Expected the serial-tracked stocktake item to be present.");
        var itemId = TestJson.GetString(trackedItem, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync(
                $"/api/stocktake/sessions/{sessionId}/items/{itemId}",
                new { counted_quantity = 1m }));

        var completeResponse = await client.PostAsync($"/api/stocktake/sessions/{sessionId}/complete", null);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, completeResponse.StatusCode);

        var error = JsonNode.Parse(await completeResponse.Content.ReadAsStringAsync())?.AsObject()
                    ?? throw new InvalidOperationException("Expected stocktake validation error.");
        Assert.Contains("requires serial reconciliation", TestJson.GetString(error, "message"), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CompleteStocktakeSession_ShouldReconcileSerialTrackedItemsByRemovingAndAddingSerials()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var removedSerial = $"STK-REC-{runId}-001";
        var keptSerial = $"STK-REC-{runId}-002";
        var newSerialOne = $"STK-REC-{runId}-003";
        var newSerialTwo = $"STK-REC-{runId}-004";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Stocktake Serial Reconcile {runId}",
                sku = $"STK-REC-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));
        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { removedSerial, keptSerial }
            }));

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = TestJson.GetString(createdSession, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionId}"));
        var trackedItem = sessionDetails["items"]?.AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => string.Equals(
                TestJson.GetString(item, "product_id"),
                productId.ToString(),
                StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Expected the serial-tracked stocktake item to be present.");
        var itemId = TestJson.GetString(trackedItem, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync(
                $"/api/stocktake/sessions/{sessionId}/items/{itemId}",
                new { counted_quantity = 3m }));

        var completedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/stocktake/sessions/{sessionId}/complete",
                new
                {
                    serial_reconciliations = new[]
                    {
                        new
                        {
                            item_id = itemId,
                            serials = new[] { keptSerial, newSerialOne, newSerialTwo }
                        }
                    }
                }));
        Assert.Equal("Completed", TestJson.GetString(completedSession, "status"));

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var quantityOnHand = await dbContext.Inventory
                .Where(x => x.ProductId == productId)
                .Select(x => x.QuantityOnHand)
                .SingleAsync();
            Assert.Equal(3m, quantityOnHand);
        }

        var serialReload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/serials"));
        var serialItems = serialReload["items"]?.AsArray()
                          ?? throw new InvalidOperationException("Expected serial items after stocktake reconciliation.");
        var serialValues = serialItems
            .OfType<JsonObject>()
            .Select(item => TestJson.GetString(item, "serial_value"))
            .ToArray();

        Assert.Equal(3, serialValues.Length);
        Assert.Contains(keptSerial, serialValues);
        Assert.Contains(newSerialOne, serialValues);
        Assert.Contains(newSerialTwo, serialValues);
        Assert.DoesNotContain(removedSerial, serialValues);
    }

    [Fact]
    public async Task StocktakeSessions_ShouldLoadOnSqlite_WhenLegacyRowsContainMalformedVarianceQuantity()
    {
        var sessionId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var owner = await dbContext.Users
                .AsNoTracking()
                .SingleAsync(x => x.Username == "owner");
            var storeId = owner.StoreId ?? throw new InvalidOperationException("Owner store is required.");
            var productId = await dbContext.Products
                .AsNoTracking()
                .Where(x => x.IsActive)
                .Select(x => x.Id)
                .FirstAsync();

            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO stocktake_sessions (
                    Id,
                    StoreId,
                    Status,
                    StartedAtUtc,
                    CompletedAtUtc,
                    CreatedByUserId,
                    CreatedAtUtc,
                    UpdatedAtUtc
                ) VALUES (
                    {0},
                    {1},
                    {2},
                    {3},
                    NULL,
                    {4},
                    {5},
                    {6}
                );
                """,
                sessionId,
                storeId,
                "Draft",
                now,
                owner.Id,
                now,
                now);

            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO stocktake_items (
                    Id,
                    SessionId,
                    ProductId,
                    SystemQuantity,
                    CountedQuantity,
                    VarianceQuantity,
                    Notes,
                    CreatedAtUtc,
                    UpdatedAtUtc
                ) VALUES (
                    {0},
                    {1},
                    {2},
                    {3},
                    {4},
                    {5},
                    {6},
                    {7},
                    {8}
                );
                """,
                itemId,
                sessionId,
                productId,
                10m,
                12m,
                "oops",
                "legacy malformed variance",
                now,
                now);
        }

        try
        {
            await TestAuth.SignInAsOwnerAsync(client);

            var sessions = await TestJson.ReadObjectAsync(
                await client.GetAsync("/api/stocktake/sessions"));
            var matchingSession = sessions["items"]?.AsArray()
                .OfType<JsonObject>()
                .FirstOrDefault(item => string.Equals(
                    TestJson.GetString(item, "id"),
                    sessionId.ToString(),
                    StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidOperationException("Expected the malformed legacy stocktake session to be returned.");

            Assert.Equal("Draft", TestJson.GetString(matchingSession, "status"));
            Assert.Equal(1, TestJson.GetInt32(matchingSession, "item_count"));
            Assert.Equal(1, TestJson.GetInt32(matchingSession, "variance_count"));
        }
        finally
        {
            using var cleanupScope = factory.Services.CreateScope();
            var dbContext = cleanupScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM stocktake_items WHERE Id = {0};", itemId);
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM stocktake_sessions WHERE Id = {0};", sessionId);
        }
    }

    [Fact]
    public async Task InventoryBatchAndMovementLists_ShouldLoadOnSqlite()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var firstProduct = productSearch["items"]?.AsArray().OfType<JsonObject>().FirstOrDefault()
            ?? throw new InvalidOperationException("Expected at least one seeded product.");
        var productId = TestJson.GetString(firstProduct, "id");

        var productBatches = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/batches"));
        Assert.NotNull(productBatches["items"]);

        var movements = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/inventory/movements"));
        Assert.NotNull(movements["items"]);
    }

    [Fact]
    public async Task CreateProductBatch_ShouldAcceptDateOnlyValuesFromInventoryManager()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Batch Product {runId}",
                sku = $"BATCH-{runId}",
                unit_price = 125m,
                cost_price = 80m,
                initial_stock_quantity = 0m,
                reorder_level = 0m,
                allow_negative_stock = false,
                is_batch_tracked = true,
                expiry_alert_days = 30,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));
        var batchNumber = $"LOT-{runId}";

        var createBatch = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                batch_number = batchNumber,
                manufacture_date = "2026-05-01",
                expiry_date = "2026-11-01",
                initial_quantity = 12m,
                remaining_quantity = 12m,
                cost_price = 42.5m
            }));

        Assert.Equal(batchNumber, TestJson.GetString(createBatch, "batch_number"));
        Assert.StartsWith("2026-05-01", TestJson.GetString(createBatch, "manufacture_date"));
        Assert.StartsWith("2026-11-01", TestJson.GetString(createBatch, "expiry_date"));
        Assert.Equal(12m, TestJson.GetDecimal(createBatch, "remaining_quantity"));

        var productBatches = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/batches"));
        var createdBatch = productBatches["items"]?.AsArray().OfType<JsonObject>()
            .FirstOrDefault(item => string.Equals(TestJson.GetString(item, "batch_number"), batchNumber, StringComparison.Ordinal));

        Assert.NotNull(createdBatch);
    }

    [Fact]
    public async Task InventoryMovements_ShouldLoadForOwnerWithAllFilter_WhenLegacyRowsReferenceMissingProducts()
    {
        await SeedLegacyMovementWithMissingProductAsync();
        await TestAuth.SignInAsOwnerAsync(client);

        var response = await client.GetAsync("/api/inventory/movements?movement_type=all&page=1&take=20");
        var movements = await TestJson.ReadObjectAsync(response);
        var items = movements["items"]?.AsArray() ?? throw new InvalidOperationException("Missing items.");
        var orphanedMovement = items
            .OfType<JsonObject>()
            .FirstOrDefault(item => item["reason"]?.GetValue<string>() == "legacy-orphaned-movement")
            ?? throw new InvalidOperationException("Expected orphaned legacy movement to be returned.");

        Assert.Equal(string.Empty, TestJson.GetString(orphanedMovement, "product_name"));
    }

    private async Task SeedLegacyMovementWithMissingProductAsync()
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var owner = await dbContext.Users
            .AsNoTracking()
            .SingleAsync(x => x.Username == "owner");
        var ownerStoreId = owner.StoreId ?? throw new InvalidOperationException("Owner store is required.");
        var missingProductId = Guid.NewGuid();
        var movementId = Guid.NewGuid();
        var createdAtUtc = DateTimeOffset.UtcNow;

        await dbContext.Database.OpenConnectionAsync();
        try
        {
            await dbContext.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = OFF;");
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO stock_movements (
                    Id,
                    StoreId,
                    ProductId,
                    MovementType,
                    QuantityBefore,
                    QuantityChange,
                    QuantityAfter,
                    ReferenceType,
                    ReferenceId,
                    BatchId,
                    SerialNumber,
                    Reason,
                    CreatedByUserId,
                    CreatedAtUtc
                ) VALUES (
                    {0},
                    {1},
                    {2},
                    {3},
                    {4},
                    {5},
                    {6},
                    {7},
                    NULL,
                    NULL,
                    NULL,
                    {8},
                    {9},
                    {10}
                );
                """,
                movementId,
                ownerStoreId,
                missingProductId,
                "Adjustment",
                10m,
                -1m,
                9m,
                "Adjustment",
                "legacy-orphaned-movement",
                owner.Id,
                createdAtUtc);
        }
        finally
        {
            await dbContext.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON;");
            await dbContext.Database.CloseConnectionAsync();
        }
    }
}
