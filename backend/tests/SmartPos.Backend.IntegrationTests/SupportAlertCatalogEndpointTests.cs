using System.Net;

namespace SmartPos.Backend.IntegrationTests;

public sealed class SupportAlertCatalogEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task SupportAlertCatalog_WithManager_ShouldReturnCatalog()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/reports/support-alert-catalog");
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(payload, "catalog_version")));
        var items = payload["items"]?.AsArray() ?? throw new InvalidOperationException("Catalog items missing.");
        Assert.NotEmpty(items);

        Assert.Contains(
            items,
            item => string.Equals(
                item?["code"]?.GetValue<string>(),
                "recovery.drill_degraded",
                StringComparison.Ordinal));
        Assert.Contains(
            items,
            item => string.Equals(
                item?["code"]?.GetValue<string>(),
                "licensing.security_anomaly_spike",
                StringComparison.Ordinal));
        Assert.Contains(
            items,
            item => string.Equals(
                item?["code"]?.GetValue<string>(),
                "manual_override_ai_wallet_correction",
                StringComparison.Ordinal));
        Assert.Contains(
            items,
            item => string.Equals(
                item?["code"]?.GetValue<string>(),
                "device_fraud_lock_applied",
                StringComparison.Ordinal));
    }

    [Fact]
    public async Task SupportAlertCatalog_WithCashier_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsCashierAsync(client);

        var response = await client.GetAsync("/api/reports/support-alert-catalog");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
