using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingTokenReplayProtectionTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Status_WithRotatedToken_ShouldAllowWithinOverlap_ThenRejectAfterWindow()
    {
        var deviceCode = $"rotate-overlap-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var firstToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(firstToken));
        var firstJti = ParseJti(firstToken);

        var heartbeat = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = firstToken
            }));
        var secondToken = TestJson.GetString(heartbeat, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(secondToken));
        Assert.NotEqual(firstToken, secondToken);

        using (var overlapRequest = new HttpRequestMessage(
                   HttpMethod.Get,
                   $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}"))
        {
            overlapRequest.Headers.Add("X-License-Token", firstToken);
            var overlapResponse = await client.SendAsync(overlapRequest);
            Assert.Equal(HttpStatusCode.OK, overlapResponse.StatusCode);
        }

        await ForceTokenPastOverlapAsync(firstJti);

        using var replayRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        replayRequest.Headers.Add("X-License-Token", firstToken);
        var replayResponse = await client.SendAsync(replayRequest);
        Assert.Equal(HttpStatusCode.Forbidden, replayResponse.StatusCode);

        var replayPayload = await ReadJsonAsync(replayResponse);
        Assert.Equal("TOKEN_REPLAY_DETECTED", replayPayload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task Status_WithoutToken_WhenStoredSessionIsExpired_ShouldReissueFreshToken()
    {
        var deviceCode = $"status-reissue-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);
        var staleToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(staleToken));
        var staleJti = ParseJti(staleToken);

        await ForceTokenSessionExpiredAsync(staleJti);

        var status = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}"));
        Assert.Equal("active", TestJson.GetString(status, "state"));
        var refreshedToken = TestJson.GetString(status, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(refreshedToken));
        Assert.NotEqual(staleToken, refreshedToken);

        using var freshTokenRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        freshTokenRequest.Headers.Add("X-License-Token", refreshedToken);
        var freshTokenResponse = await client.SendAsync(freshTokenRequest);
        Assert.Equal(HttpStatusCode.OK, freshTokenResponse.StatusCode);

        using var staleTokenRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        staleTokenRequest.Headers.Add("X-License-Token", staleToken);
        var staleTokenResponse = await client.SendAsync(staleTokenRequest);
        Assert.Equal(HttpStatusCode.Forbidden, staleTokenResponse.StatusCode);

        var stalePayload = await ReadJsonAsync(staleTokenResponse);
        Assert.Equal("TOKEN_REPLAY_DETECTED", stalePayload["error"]?["code"]?.GetValue<string>());
    }

    private async Task<JsonObject> ActivateAsync(string deviceCode)
    {
        return await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Licensing Replay Protection Device",
                actor = "integration-tests",
                reason = "token replay protection test activation"
            }));
    }

    private async Task ForceTokenPastOverlapAsync(string jti)
    {
        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var session = await dbContext.LicenseTokenSessions
            .FirstAsync(x => x.Jti == jti);
        var license = await dbContext.Licenses
            .FirstAsync(x => x.Id == session.LicenseId);

        var forcedRejectAt = DateTimeOffset.UtcNow.AddSeconds(-5);
        session.RejectAfterUtc = forcedRejectAt;
        session.RevokedAtUtc = forcedRejectAt;
        license.RevokedAtUtc = forcedRejectAt;

        await dbContext.SaveChangesAsync();
    }

    private async Task ForceTokenSessionExpiredAsync(string jti)
    {
        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var session = await dbContext.LicenseTokenSessions
            .FirstAsync(x => x.Jti == jti);

        var forcedRejectAt = DateTimeOffset.UtcNow.AddSeconds(-5);
        session.RejectAfterUtc = forcedRejectAt;
        session.RevokedAtUtc = forcedRejectAt;

        await dbContext.SaveChangesAsync();
    }

    private static string ParseJti(string token)
    {
        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new InvalidOperationException("license_token format is invalid.");
        }

        var payloadBytes = Base64UrlDecode(parts[0]);
        using var payload = JsonDocument.Parse(payloadBytes);
        return payload.RootElement.GetProperty("jti").GetString()
               ?? throw new InvalidOperationException("license_token jti is missing.");
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        var padding = 4 - (normalized.Length % 4);
        if (padding is > 0 and < 4)
        {
            normalized += new string('=', padding);
        }

        return Convert.FromBase64String(normalized);
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
