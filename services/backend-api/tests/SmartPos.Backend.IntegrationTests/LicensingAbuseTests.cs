using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingAbuseTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Status_WithTamperedToken_ShouldReturnInvalidToken()
    {
        var deviceCode = $"tamper-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var issuedToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(issuedToken));

        var tampered = TamperToken(issuedToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        request.Headers.Add("X-License-Token", tampered);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        Assert.Equal("INVALID_LICENSE_TOKEN", payload["error"]?["code"]?.GetValue<string>());

        await DeactivateAsync(deviceCode);
    }

    [Fact]
    public async Task Heartbeat_WithReplayedRotatedToken_ShouldReturnReplayDetected()
    {
        var deviceCode = $"replay-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var firstToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(firstToken));

        var heartbeat = await TestJson.ReadObjectAsync(
            await PostHeartbeatAsync(
                deviceCode,
                firstToken,
                $"heartbeat-first-{Guid.NewGuid():N}"));

        var refreshedToken = TestJson.GetString(heartbeat, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(refreshedToken));
        Assert.NotEqual(firstToken, refreshedToken);

        var replayResponse = await PostHeartbeatAsync(
            deviceCode,
            firstToken,
            $"heartbeat-replay-{Guid.NewGuid():N}");

        Assert.Equal(HttpStatusCode.Forbidden, replayResponse.StatusCode);
        var replayPayload = await ReadJsonAsync(replayResponse);
        Assert.Equal("TOKEN_REPLAY_DETECTED", replayPayload["error"]?["code"]?.GetValue<string>());

        await DeactivateAsync(deviceCode);
    }

    [Fact]
    public async Task Heartbeat_WithExpiredGraceWindow_ShouldReturnLicenseExpired()
    {
        var deviceCode = $"expired-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var token = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(token));

        await ForceLicenseToExpiredAsync(deviceCode);

        var expiredResponse = await client.PostAsJsonAsync("/api/license/heartbeat", new
        {
            device_code = deviceCode,
            license_token = token
        });

        Assert.Equal(HttpStatusCode.Forbidden, expiredResponse.StatusCode);
        var payload = await ReadJsonAsync(expiredResponse);
        Assert.Equal("LICENSE_EXPIRED", payload["error"]?["code"]?.GetValue<string>());

        await DeactivateAsync(deviceCode);
    }

    [Fact]
    public async Task CopiedInstaller_OnUnauthorizedDevice_ShouldBeBlockedUntilActivation()
    {
        var unauthorizedDeviceCode = $"copied-installer-it-{Guid.NewGuid():N}";

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = unauthorizedDeviceCode,
            device_name = "Unauthorized Copied Installer Device"
        });
        loginResponse.EnsureSuccessStatusCode();

        using var blockedRequest = new HttpRequestMessage(
            HttpMethod.Get,
            "/api/products/search?q=license");
        blockedRequest.Headers.Add("X-Device-Code", unauthorizedDeviceCode);
        var blockedResponse = await client.SendAsync(blockedRequest);

        Assert.Equal(HttpStatusCode.Forbidden, blockedResponse.StatusCode);
        var blockedPayload = await ReadJsonAsync(blockedResponse);
        Assert.Equal("UNPROVISIONED", blockedPayload["error"]?["code"]?.GetValue<string>());

        var activation = await ActivateAsync(unauthorizedDeviceCode);
        Assert.Equal("active", TestJson.GetString(activation, "state"));

        using var allowedRequest = new HttpRequestMessage(
            HttpMethod.Get,
            "/api/products/search?q=license");
        allowedRequest.Headers.Add("X-Device-Code", unauthorizedDeviceCode);
        var allowedResponse = await client.SendAsync(allowedRequest);

        Assert.Equal(HttpStatusCode.OK, allowedResponse.StatusCode);

        await DeactivateAsync(unauthorizedDeviceCode);
    }

    [Fact]
    public async Task Activate_WithUnknownActivationEntitlement_ShouldReturnNotFoundCode()
    {
        var deviceCode = $"unknown-entitlement-it-{Guid.NewGuid():N}";
        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Unknown Entitlement Device",
            actor = "integration-tests",
            reason = "unknown entitlement",
            activation_entitlement_key = "SPK-UNKNOWN-ENTL-KEY1-0000-0000"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("ACTIVATION_ENTITLEMENT_NOT_FOUND", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task Activate_WithExpiredActivationEntitlement_ShouldReturnExpiredCode()
    {
        var deviceCode = $"expired-entitlement-it-{Guid.NewGuid():N}";
        var entitlementKey = $"SPK-EXPD-{Guid.NewGuid():N}".ToUpperInvariant();
        await SeedExpiredActivationEntitlementAsync(entitlementKey);

        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Expired Entitlement Device",
            actor = "integration-tests",
            reason = "expired entitlement",
            activation_entitlement_key = entitlementKey
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("ACTIVATION_ENTITLEMENT_EXPIRED", payload["error"]?["code"]?.GetValue<string>());
    }

    private async Task<JsonObject> ActivateAsync(string deviceCode)
    {
        return await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Licensing Abuse Tests Device",
                actor = "integration-tests",
                reason = "test activation"
            }));
    }

    private async Task<HttpResponseMessage> PostHeartbeatAsync(
        string deviceCode,
        string licenseToken,
        string idempotencyKey)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/license/heartbeat")
        {
            Content = JsonContent.Create(new
            {
                device_code = deviceCode,
                license_token = licenseToken
            })
        };
        request.Headers.Remove("Idempotency-Key");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        return await client.SendAsync(request);
    }

    private async Task DeactivateAsync(string deviceCode)
    {
        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode);

        if (provisionedDevice is null)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        provisionedDevice.Status = Domain.ProvisionedDeviceStatus.Revoked;
        provisionedDevice.RevokedAtUtc = now;
        provisionedDevice.LastHeartbeatAtUtc = now;
        await dbContext.SaveChangesAsync();
    }

    private async Task ForceLicenseToExpiredAsync(string deviceCode)
    {
        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstAsync(x => x.DeviceCode == deviceCode);
        var activeLicenses = await dbContext.Licenses
            .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == Domain.LicenseRecordStatus.Active)
            .ToListAsync();
        var licenseRecord = activeLicenses
            .OrderByDescending(x => x.IssuedAtUtc.UtcTicks)
            .First();

        var now = DateTimeOffset.UtcNow;
        licenseRecord.ValidUntil = now.AddHours(-2);
        licenseRecord.GraceUntil = now.AddMinutes(-5);
        await dbContext.SaveChangesAsync();
    }

    private static string TamperToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return token;
        }

        var last = token[^1];
        var replacement = last == 'a' ? 'b' : 'a';
        return token[..^1] + replacement;
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }

    private async Task SeedExpiredActivationEntitlementAsync(string entitlementKey)
    {
        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var now = DateTimeOffset.UtcNow;
        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Code == "default");

        if (shop is null)
        {
            shop = new Shop
            {
                Code = "default",
                Name = "Default Shop",
                IsActive = true,
                CreatedAtUtc = now
            };
            dbContext.Shops.Add(shop);
            await dbContext.SaveChangesAsync();
        }

        dbContext.CustomerActivationEntitlements.Add(new CustomerActivationEntitlement
        {
            ShopId = shop.Id,
            Shop = shop,
            EntitlementKeyHash = ComputeActivationEntitlementHash(entitlementKey),
            EntitlementKey = entitlementKey,
            Source = "integration-tests",
            Status = ActivationEntitlementStatus.Active,
            MaxActivations = 1,
            ActivationsUsed = 0,
            IssuedBy = "integration-tests",
            IssuedAtUtc = now.AddDays(-2),
            ExpiresAtUtc = now.AddMinutes(-1)
        });

        await dbContext.SaveChangesAsync();
    }

    private static string ComputeActivationEntitlementHash(string key)
    {
        var normalized = NormalizeActivationEntitlementKey(key);
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private static string NormalizeActivationEntitlementKey(string value)
    {
        return new string(value
            .Where(char.IsLetterOrDigit)
            .Select(char.ToUpperInvariant)
            .ToArray());
    }
}
