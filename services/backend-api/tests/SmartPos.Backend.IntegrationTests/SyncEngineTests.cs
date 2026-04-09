using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class SyncEngineTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task SyncStockUpdate_ShouldBeIdempotentByEventId()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var stockBefore = TestJson.GetDecimal(firstProduct, "stockQuantity");

        var eventId = Guid.NewGuid();
        var syncRequest = new
        {
            device_id = Guid.NewGuid(),
            events = new[]
            {
                new
                {
                    event_id = eventId,
                    store_id = (Guid?)null,
                    device_id = (Guid?)null,
                    device_timestamp = DateTimeOffset.UtcNow,
                    type = "stock_update",
                    payload = new
                    {
                        product_id = productId,
                        delta_quantity = 3m
                    }
                }
            }
        };

        var firstSync = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/sync/events", syncRequest));
        var firstResult = FirstObjectFromArray(firstSync, "results");
        Assert.Equal(
            eventId.ToString(),
            TestJson.GetString(firstResult, "event_id"),
            ignoreCase: true,
            ignoreLineEndingDifferences: false,
            ignoreWhiteSpaceDifferences: false);
        Assert.Equal("synced", TestJson.GetString(firstResult, "status"));

        var secondSync = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/sync/events", syncRequest));
        var secondResult = FirstObjectFromArray(secondSync, "results");
        Assert.Equal("synced", TestJson.GetString(secondResult, "status"));
        Assert.Equal("duplicate_event_ignored", TestJson.GetString(secondResult, "message"));

        var afterSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var updatedProduct = FindObjectInArray(afterSearch, "items", "id", productId.ToString());
        var stockAfter = TestJson.GetDecimal(updatedProduct, "stockQuantity");

        Assert.Equal(stockBefore + 3m, stockAfter);
    }

    [Fact]
    public async Task SyncSaleEvent_WithoutOfflineGrant_ShouldBeRejected()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var eventId = Guid.NewGuid();
        var syncResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/sync/events", new
            {
                device_id = Guid.NewGuid(),
                events = new[]
                {
                    new
                    {
                        event_id = eventId,
                        store_id = (Guid?)null,
                        device_id = (Guid?)null,
                        device_timestamp = DateTimeOffset.UtcNow,
                        type = "sale",
                        payload = new { }
                    }
                }
            }));

        var result = FirstObjectFromArray(syncResponse, "results");
        Assert.Equal("rejected", TestJson.GetString(result, "status"));
        Assert.Equal("offline_grant_required", TestJson.GetString(result, "message"));
    }

    [Fact]
    public async Task SyncSaleEvent_WithOfflineGrant_ShouldEnforceCheckoutLimit()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var licenseStatus = await TestJson.ReadObjectAsync(await client.GetAsync("/api/license/status"));
        var offlineGrantToken = TestJson.GetString(licenseStatus, "offline_grant_token");
        Assert.False(string.IsNullOrWhiteSpace(offlineGrantToken));

        var firstEventId = Guid.NewGuid();
        var firstSync = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/sync/events", new
            {
                device_id = Guid.NewGuid(),
                offline_grant_token = offlineGrantToken,
                events = new[]
                {
                    new
                    {
                        event_id = firstEventId,
                        store_id = (Guid?)null,
                        device_id = (Guid?)null,
                        device_timestamp = DateTimeOffset.UtcNow,
                        type = "sale",
                        payload = new { }
                    }
                }
            }));
        var firstResult = FirstObjectFromArray(firstSync, "results");
        Assert.Equal("synced", TestJson.GetString(firstResult, "status"));

        var payload = ParseOfflineGrantPayload(offlineGrantToken);
        var grantId = Guid.Parse(TestJson.GetString(payload, "grantId"));
        var maxCheckoutOperations = payload["maxCheckoutOperations"]?.GetValue<int>() ?? 0;
        Assert.True(maxCheckoutOperations > 0);

        using (var scope = appFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var now = DateTimeOffset.UtcNow;
            for (var index = 0; index < maxCheckoutOperations; index += 1)
            {
                dbContext.OfflineEvents.Add(new OfflineEvent
                {
                    EventId = $"it-offline-grant-limit-{Guid.NewGuid():N}".ToUpperInvariant(),
                    DeviceTimestampUtc = now,
                    ServerTimestampUtc = now,
                    Type = OfflineEventType.Sale,
                    PayloadJson = "{}",
                    Status = OfflineEventStatus.Synced,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now,
                    OfflineGrantId = grantId,
                    OfflineGrantIssuedAtUtc = now.AddHours(-1),
                    OfflineGrantExpiresAtUtc = now.AddHours(1)
                });
            }

            await dbContext.SaveChangesAsync();
        }

        var limitEventId = Guid.NewGuid();
        var limitSync = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/sync/events", new
            {
                device_id = Guid.NewGuid(),
                offline_grant_token = offlineGrantToken,
                events = new[]
                {
                    new
                    {
                        event_id = limitEventId,
                        store_id = (Guid?)null,
                        device_id = (Guid?)null,
                        device_timestamp = DateTimeOffset.UtcNow,
                        type = "sale",
                        payload = new { }
                    }
                }
            }));
        var limitResult = FirstObjectFromArray(limitSync, "results");
        Assert.Equal("rejected", TestJson.GetString(limitResult, "status"));
        Assert.Equal("offline_grant_checkout_limit_exceeded", TestJson.GetString(limitResult, "message"));
    }

    private static JsonObject FirstObjectFromArray(JsonNode root, string propertyName)
    {
        var array = root[propertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{propertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault()
               ?? throw new InvalidOperationException($"Array '{propertyName}' was empty.");
    }

    private static JsonObject FindObjectInArray(
        JsonNode root,
        string arrayPropertyName,
        string keyPropertyName,
        string expectedValue)
    {
        var array = root[arrayPropertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{arrayPropertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault(item =>
                       string.Equals(
                           item[keyPropertyName]?.GetValue<string>(),
                           expectedValue,
                           StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException(
                   $"Value '{expectedValue}' was not found in '{arrayPropertyName}'.");
    }

    private static JsonObject ParseOfflineGrantPayload(string token)
    {
        var payloadSegment = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)[0];
        var payloadBytes = Base64UrlDecode(payloadSegment);
        var json = Encoding.UTF8.GetString(payloadBytes);
        var node = JsonNode.Parse(json) as JsonObject;
        return node ?? throw new InvalidOperationException("offline grant payload is invalid.");
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        var padding = 4 - (normalized.Length % 4);
        if (padding is > 0 and < 4)
        {
            normalized = normalized + new string('=', padding);
        }

        return Convert.FromBase64String(normalized);
    }
}
