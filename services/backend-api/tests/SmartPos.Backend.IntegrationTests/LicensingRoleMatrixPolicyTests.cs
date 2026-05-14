using System.Net;
using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingRoleMatrixPolicyTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task LicenseAccountPortal_WithManager_ShouldReturnOk()
    {
        await TestAuth.SignInAsManagerAccountAsync(client);

        var response = await client.GetAsync("/api/license/account/licenses");

        response.EnsureSuccessStatusCode();
        var payload = await TestJson.ReadObjectAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(payload, "shop_code")));
        Assert.NotNull(payload["devices"]?.AsArray());
    }

    [Fact]
    public async Task LicenseAccountPortal_WithCashier_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsCashierAccountAsync(client);

        var response = await client.GetAsync("/api/license/account/licenses");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminWalletCorrection_WithSecurityAdmin_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsSecurityAdminAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/admin/licensing/shops/default/ai-wallet/correct",
            new
            {
                delta_credits = 5m,
                reference = $"it-w5-security-denied-{Guid.NewGuid():N}",
                actor = "security_admin",
                reason_code = "manual_wallet_correction",
                actor_note = "security admin should not access billing correction endpoint"
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminWalletCorrection_WithBillingAdmin_ShouldReturnOk()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/admin/licensing/shops/default/ai-wallet/correct",
            new
            {
                delta_credits = 5m,
                reference = $"it-w5-billing-allowed-{Guid.NewGuid():N}",
                actor = "billing_admin",
                reason_code = "manual_wallet_correction",
                actor_note = "billing admin policy validation"
            });

        response.EnsureSuccessStatusCode();
        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal("applied", TestJson.GetString(payload, "status"));
    }

    [Fact]
    public async Task AdminFraudLock_WithBillingAdmin_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString($"w5-fraud-lock-{Guid.NewGuid():N}")}/fraud-lock",
            new
            {
                actor = "billing_admin",
                reason_code = "fraud_lock_device",
                actor_note = "billing admin should not access security fraud lock endpoint"
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
