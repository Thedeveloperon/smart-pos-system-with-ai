using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
    }

    [Fact]
    public async Task Heartbeat_WithReplayedRevokedToken_ShouldReturnRevoked()
    {
        var deviceCode = $"replay-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var firstToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(firstToken));

        var heartbeat = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = firstToken
            }));

        var refreshedToken = TestJson.GetString(heartbeat, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(refreshedToken));
        Assert.NotEqual(firstToken, refreshedToken);

        var replayResponse = await client.PostAsJsonAsync("/api/license/heartbeat", new
        {
            device_code = deviceCode,
            license_token = firstToken
        });

        Assert.Equal(HttpStatusCode.Forbidden, replayResponse.StatusCode);
        var replayPayload = await ReadJsonAsync(replayResponse);
        Assert.Equal("REVOKED", replayPayload["error"]?["code"]?.GetValue<string>());
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
}
