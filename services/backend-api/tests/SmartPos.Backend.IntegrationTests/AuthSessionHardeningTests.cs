using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AuthSessionHardeningTests : IDisposable
{
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public AuthSessionHardeningTests()
    {
        appFactory = new CustomWebApplicationFactory();
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task Login_WithRepeatedFailures_ShouldLockoutAccount()
    {
        var deviceCode = $"auth-lockout-it-{Guid.NewGuid():N}";

        for (var attempt = 1; attempt <= 5; attempt++)
        {
            var failureResponse = await client.PostAsJsonAsync("/api/auth/login", new
            {
                username = "manager",
                password = "wrong-password",
                device_code = deviceCode,
                device_name = "Auth Lockout Test Device"
            });
            Assert.Equal(HttpStatusCode.BadRequest, failureResponse.StatusCode);
        }

        var blockedResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = deviceCode,
            device_name = "Auth Lockout Test Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, blockedResponse.StatusCode);
        var blockedPayload = await ReadJsonAsync(blockedResponse);
        Assert.Contains(
            "temporarily locked",
            blockedPayload["message"]?.GetValue<string>() ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var manager = await dbContext.Users
            .AsNoTracking()
            .SingleAsync(x => x.Username == "manager");
        Assert.True(manager.LockoutEndAtUtc.HasValue);
        Assert.True(manager.LockoutEndAtUtc.Value > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task RevokeSession_ShouldInvalidateTargetDeviceToken()
    {
        var clientA = appFactory.CreateClient();
        var clientB = appFactory.CreateClient();

        var deviceA = $"auth-session-a-{Guid.NewGuid():N}";
        var deviceB = $"auth-session-b-{Guid.NewGuid():N}";

        await LoginAsync(clientA, deviceA);
        await LoginAsync(clientB, deviceB);

        var revokeResponse = await clientA.PostAsJsonAsync(
            $"/api/auth/sessions/{Uri.EscapeDataString(deviceB)}/revoke",
            new
            {
                reason = "suspicious login from unknown location"
            });
        revokeResponse.EnsureSuccessStatusCode();

        var meA = await clientA.GetAsync("/api/auth/me");
        meA.EnsureSuccessStatusCode();

        var meB = await clientB.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, meB.StatusCode);
    }

    [Fact]
    public async Task RevokeOtherSessions_ShouldKeepCurrentSessionActive()
    {
        var clientA = appFactory.CreateClient();
        var clientB = appFactory.CreateClient();

        var deviceA = $"auth-session-others-a-{Guid.NewGuid():N}";
        var deviceB = $"auth-session-others-b-{Guid.NewGuid():N}";

        await LoginAsync(clientA, deviceA);
        await LoginAsync(clientB, deviceB);

        var revokeOthersResponse = await clientB.PostAsJsonAsync(
            "/api/auth/sessions/revoke-others",
            new
            {
                reason = "credential reset"
            });
        revokeOthersResponse.EnsureSuccessStatusCode();
        var payload = await TestJson.ReadObjectAsync(revokeOthersResponse);
        Assert.True(payload["revoked_count"]?.GetValue<int>() >= 1);
        Assert.False(payload["current_session_revoked"]?.GetValue<bool>());

        var meB = await clientB.GetAsync("/api/auth/me");
        meB.EnsureSuccessStatusCode();

        var meA = await clientA.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, meA.StatusCode);
    }

    [Fact]
    public async Task PosLogin_ShouldUpgradeSessionVersion_AndAllowLicenseAccountPortal()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var sessionPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/auth/me"));
        Assert.Equal(2, sessionPayload["auth_session_version"]?.GetValue<int>());

        var portalResponse = await client.GetAsync("/api/license/account/licenses");
        portalResponse.EnsureSuccessStatusCode();

        var portalPayload = await TestJson.ReadObjectAsync(portalResponse);
        Assert.Equal("default", portalPayload["shop_code"]?.GetValue<string>());
    }

    private static async Task LoginAsync(HttpClient httpClient, string deviceCode)
    {
        var loginResponse = await httpClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = deviceCode,
            device_name = "Auth Session Hardening Test Device"
        });
        loginResponse.EnsureSuccessStatusCode();
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
