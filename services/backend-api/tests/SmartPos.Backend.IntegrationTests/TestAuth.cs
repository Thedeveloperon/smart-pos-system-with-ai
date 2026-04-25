using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Runtime.CompilerServices;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

internal static class TestAuth
{
    private const string DeviceCode = "integration-tests-device";
    private const string DeviceName = "Integration Tests";
    private const string SupportAdminMfaSecret = "support-admin-mfa-secret-2026";
    private const string BillingAdminMfaSecret = "billing-admin-mfa-secret-2026";
    private const string SecurityAdminMfaSecret = "security-admin-mfa-secret-2026";
    private static readonly ConditionalWeakTable<HttpClient, ClientContext> ClientContexts = new();

    public static async Task SignInAsManagerAsync(HttpClient client)
    {
        await EnsureProvisionedAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = DeviceCode,
            device_name = DeviceName
        });

        response.EnsureSuccessStatusCode();
    }

    public static async Task SignInAsManagerAccountAsync(HttpClient client)
    {
        await SignInAsAccountAsync(client, "manager", "manager123");
    }

    public static async Task SignInAsCashierAsync(HttpClient client)
    {
        await EnsureProvisionedAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "cashier",
            password = "cashier123",
            device_code = DeviceCode,
            device_name = DeviceName
        });

        response.EnsureSuccessStatusCode();
    }

    public static async Task SignInAsCashierAccountAsync(HttpClient client)
    {
        await SignInAsAccountAsync(client, "cashier", "cashier123");
    }

    public static async Task SignInAsSupportAdminAsync(HttpClient client)
    {
        await EnsureProvisionedAsync(client);
        var now = DateTimeOffset.UtcNow;
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "support_admin",
            password = "support123",
            device_code = DeviceCode,
            device_name = DeviceName,
            mfa_code = TotpMfa.GenerateCode(SupportAdminMfaSecret, now.ToUnixTimeSeconds() / 30)
        });

        response.EnsureSuccessStatusCode();
    }

    public static async Task SignInAsBillingAdminAsync(HttpClient client)
    {
        await EnsureProvisionedAsync(client);
        var now = DateTimeOffset.UtcNow;
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "billing_admin",
            password = "billing123",
            device_code = DeviceCode,
            device_name = DeviceName,
            mfa_code = TotpMfa.GenerateCode(BillingAdminMfaSecret, now.ToUnixTimeSeconds() / 30)
        });

        response.EnsureSuccessStatusCode();
    }

    public static async Task SignInAsSecurityAdminAsync(HttpClient client)
    {
        await EnsureProvisionedAsync(client);
        var now = DateTimeOffset.UtcNow;
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "security_admin",
            password = "security123",
            device_code = DeviceCode,
            device_name = DeviceName,
            mfa_code = TotpMfa.GenerateCode(SecurityAdminMfaSecret, now.ToUnixTimeSeconds() / 30)
        });

        response.EnsureSuccessStatusCode();
    }

    private static async Task SignInAsAccountAsync(
        HttpClient client,
        string username,
        string password,
        string? mfaCode = null)
    {
        await EnsureProvisionedAsync(client);

        var response = await client.PostAsJsonAsync("/api/account/login", new
        {
            username,
            password,
            mfa_code = mfaCode
        });

        response.EnsureSuccessStatusCode();
    }

    private static async Task EnsureProvisionedAsync(HttpClient client)
    {
        var statusResponse = await client.GetAsync(
            $"/api/license/status?device_code={Uri.EscapeDataString(DeviceCode)}");
        statusResponse.EnsureSuccessStatusCode();

        var statusPayload = await statusResponse.Content.ReadFromJsonAsync<JsonObject>();
        var state = statusPayload?["state"]?.GetValue<string>();
        if (string.Equals(state, "active", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "grace", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var clientContext = ResolveClientContext(client);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/provision/activate")
        {
            Content = JsonContent.Create(new
            {
                device_code = DeviceCode,
                device_name = DeviceName,
                actor = "integration-tests",
                reason = "bootstrap"
            })
        };
        request.Headers.TryAddWithoutValidation("X-Device-Code", clientContext.RateLimitKey);

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }

    private static ClientContext ResolveClientContext(HttpClient client)
    {
        return ClientContexts.GetValue(client, static _ => new ClientContext());
    }

    private sealed class ClientContext
    {
        public string RateLimitKey { get; } = $"integration-tests-{Guid.NewGuid():N}";
    }
}
