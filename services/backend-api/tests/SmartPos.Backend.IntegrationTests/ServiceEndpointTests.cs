using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ServiceEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ServiceEndpoints_ShouldKeepDeactivatedServicesVisibleWhenRequested()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var created = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/services", new
            {
                name = $"Integration Service {runId}",
                sku = $"SRV-{runId}",
                price = 1500m,
                description = "Inventory manager deactivation coverage",
                duration_minutes = 30
            }));

        var serviceId = Guid.Parse(TestJson.GetString(created, "id"));

        var activeListBeforeDeactivate = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/services"));
        var activeItem = FindObjectInArray(activeListBeforeDeactivate, "items", "id", serviceId.ToString());
        Assert.True(activeItem["is_active"]?.GetValue<bool>() ?? false);

        var deactivateResponse = await client.DeleteAsync($"/api/services/{serviceId}");
        Assert.Equal(HttpStatusCode.NoContent, deactivateResponse.StatusCode);

        var activeListAfterDeactivate = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/services"));
        Assert.False(ContainsObjectInArray(activeListAfterDeactivate, "items", "id", serviceId.ToString()));

        var fullList = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/services?include_inactive=true"));
        var inactiveItem = FindObjectInArray(fullList, "items", "id", serviceId.ToString());
        Assert.False(inactiveItem["is_active"]?.GetValue<bool>() ?? true);

        var reactivated = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/services/{serviceId}", new
            {
                is_active = true
            }));
        Assert.True(reactivated["is_active"]?.GetValue<bool>() ?? false);

        var activeListAfterReactivate = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/services"));
        var restoredItem = FindObjectInArray(activeListAfterReactivate, "items", "id", serviceId.ToString());
        Assert.True(restoredItem["is_active"]?.GetValue<bool>() ?? false);
    }

    private static bool ContainsObjectInArray(
        JsonNode root,
        string arrayPropertyName,
        string keyPropertyName,
        string expectedValue)
    {
        var array = root[arrayPropertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{arrayPropertyName}'.");

        return array
            .OfType<JsonObject>()
            .Any(item =>
                string.Equals(
                    item[keyPropertyName]?.GetValue<string>(),
                    expectedValue,
                    StringComparison.OrdinalIgnoreCase));
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
