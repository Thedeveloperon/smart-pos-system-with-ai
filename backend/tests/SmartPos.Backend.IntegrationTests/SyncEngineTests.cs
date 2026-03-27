using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class SyncEngineTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
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
}
