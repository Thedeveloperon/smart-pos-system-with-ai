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
        await EnsureNoInProgressStocktakeSessionsAsync();

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
        await EnsureNoInProgressStocktakeSessionsAsync();

        var response = await client.PostAsync("/api/stocktake/sessions", null);
        var session = await TestJson.ReadObjectAsync(response);

        Assert.NotEqual(Guid.Empty, Guid.Parse(TestJson.GetString(session, "id")));
        Assert.Equal("Draft", TestJson.GetString(session, "status"));
    }

    [Fact]
    public async Task StocktakeSessionItems_ShouldIncludeSessionId_WhenLoadingSessionDetails()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await EnsureNoInProgressStocktakeSessionsAsync();

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
        await EnsureNoInProgressStocktakeSessionsAsync();

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
        await EnsureNoInProgressStocktakeSessionsAsync();

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
        await EnsureNoInProgressStocktakeSessionsAsync();

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
        await EnsureNoInProgressStocktakeSessionsAsync();

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
    public async Task CreateProductBatch_ShouldRejectNonPositiveInitialQuantity()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Batch Quantity Guard {runId}",
                sku = $"BATCH-GRD-{runId}",
                unit_price = 100m,
                cost_price = 70m,
                initial_stock_quantity = 0m,
                reorder_level = 0m,
                allow_negative_stock = false,
                is_batch_tracked = true,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));
        var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
        {
            batch_number = $"LOT-GRD-{runId}",
            initial_quantity = 0m,
            remaining_quantity = 0m,
            cost_price = 42m
        });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected quantity guard payload.");
        Assert.Equal("initial_quantity must be greater than zero.", TestJson.GetString(payload, "message"));
    }

    [Fact]
    public async Task CreateAndUpdateBatch_ShouldAdjustInventoryAndRecordMovements()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Batch Movement Product {runId}",
                sku = $"BATCH-MOVE-{runId}",
                unit_price = 130m,
                cost_price = 80m,
                initial_stock_quantity = 0m,
                reorder_level = 0m,
                allow_negative_stock = false,
                is_batch_tracked = true,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var createdBatch = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                batch_number = $"LOT-MOVE-{runId}",
                initial_quantity = 10m,
                remaining_quantity = 10m,
                cost_price = 50m
            }));
        var batchId = Guid.Parse(TestJson.GetString(createdBatch, "id"));

        var updatedBatch = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}/batches/{batchId}", new
            {
                batch_number = $"LOT-MOVE-{runId}",
                remaining_quantity = 13m,
                cost_price = 50m
            }));
        Assert.Equal(13m, TestJson.GetDecimal(updatedBatch, "remaining_quantity"));

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var quantityOnHand = await dbContext.Inventory
            .Where(x => x.ProductId == productId)
            .Select(x => x.QuantityOnHand)
            .SingleAsync();
        Assert.Equal(13m, quantityOnHand);

        var createMovement = await dbContext.StockMovements
            .AsNoTracking()
            .Where(x => x.BatchId == batchId && x.Reason == "batch_manual_create")
            .ToListAsync();
        var latestCreateMovement = createMovement
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefault();
        Assert.NotNull(latestCreateMovement);
        Assert.Equal(10m, latestCreateMovement!.QuantityChange);

        var adjustMovement = await dbContext.StockMovements
            .AsNoTracking()
            .Where(x => x.BatchId == batchId && x.Reason == "batch_manual_adjustment")
            .ToListAsync();
        var latestAdjustMovement = adjustMovement
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefault();
        Assert.NotNull(latestAdjustMovement);
        Assert.Equal(3m, latestAdjustMovement!.QuantityChange);
    }

    [Fact]
    public async Task Stocktake_ShouldBlockSecondInProgressSessionAndRejectNegativeCounts()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await EnsureNoInProgressStocktakeSessionsAsync();

        var sessionOne = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionOneId = TestJson.GetString(sessionOne, "id");

        var sessionTwo = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionTwoId = TestJson.GetString(sessionTwo, "id");

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionOneId}/start", null));

        var blockedStart = await client.PutAsync($"/api/stocktake/sessions/{sessionTwoId}/start", null);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, blockedStart.StatusCode);

        var blockedCreate = await client.PostAsJsonAsync("/api/stocktake/sessions", new { });
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, blockedCreate.StatusCode);

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionOneId}"));
        var nonSerialItem = sessionDetails["items"]?.AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => !(item["is_serial_tracked"]?.GetValue<bool>() ?? false));
        Assert.NotNull(nonSerialItem);

        var itemId = TestJson.GetString(nonSerialItem!, "id");
        var negativeCount = await client.PutAsJsonAsync(
            $"/api/stocktake/sessions/{sessionOneId}/items/{itemId}",
            new { counted_quantity = -1m });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, negativeCount.StatusCode);
        var payload = await negativeCount.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected negative count validation payload.");
        Assert.Contains("cannot use a negative counted quantity", TestJson.GetString(payload, "message"), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CompleteStocktakeSession_ShouldRejectNegativeCountsForNonSerialItems()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await EnsureNoInProgressStocktakeSessionsAsync();

        var createdSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/stocktake/sessions", new { }));
        var sessionId = Guid.Parse(TestJson.GetString(createdSession, "id"));

        await TestJson.ReadObjectAsync(
            await client.PutAsync($"/api/stocktake/sessions/{sessionId}/start", null));

        var sessionDetails = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/stocktake/sessions/{sessionId}"));
        var nonSerialItemId = sessionDetails["items"]?.AsArray()
            .OfType<JsonObject>()
            .Where(item => !(item["is_serial_tracked"]?.GetValue<bool>() ?? false))
            .Select(item => Guid.Parse(TestJson.GetString(item, "id")))
            .FirstOrDefault()
            ?? Guid.Empty;
        Assert.NotEqual(Guid.Empty, nonSerialItemId);

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var stocktakeItem = await dbContext.StocktakeItems.FirstAsync(x => x.Id == nonSerialItemId);
            stocktakeItem.CountedQuantity = -2m;
            stocktakeItem.VarianceQuantity = -2m - stocktakeItem.SystemQuantity;
            await dbContext.SaveChangesAsync();
        }

        var completeResponse = await client.PostAsync($"/api/stocktake/sessions/{sessionId}/complete", null);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, completeResponse.StatusCode);
        var payload = await completeResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected complete validation payload.");
        Assert.Contains("cannot use a negative counted quantity", TestJson.GetString(payload, "message"), StringComparison.OrdinalIgnoreCase);
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

    private async Task EnsureNoInProgressStocktakeSessionsAsync()
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var inProgressSessions = await dbContext.StocktakeSessions
            .Where(x => x.Status == SmartPos.Backend.Domain.StocktakeStatus.InProgress)
            .ToListAsync();
        if (inProgressSessions.Count == 0)
        {
            return;
        }

        foreach (var session in inProgressSessions)
        {
            session.Status = SmartPos.Backend.Domain.StocktakeStatus.Reverted;
            session.UpdatedAtUtc = DateTimeOffset.UtcNow;
            session.CompletedAtUtc = DateTimeOffset.UtcNow;
        }

        await dbContext.SaveChangesAsync();
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
