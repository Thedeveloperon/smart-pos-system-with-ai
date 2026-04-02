using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingHeartbeatRotationLoadTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Heartbeat_RapidRotationWithLatestToken_ShouldRemainStable()
    {
        var deviceCode = $"heartbeat-load-it-{Guid.NewGuid():N}";
        var activation = await ActivateAsync(deviceCode);

        var currentToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(currentToken));

        var seenJtis = new HashSet<string>(StringComparer.Ordinal);
        seenJtis.Add(ParseJti(currentToken));

        const int iterations = 40;
        for (var i = 0; i < iterations; i++)
        {
            var heartbeatResponse = await client.PostAsJsonAsync("/api/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = currentToken
            });

            Assert.Equal(HttpStatusCode.OK, heartbeatResponse.StatusCode);

            var heartbeatPayload = await TestJson.ReadObjectAsync(heartbeatResponse);
            var rotatedToken = TestJson.GetString(heartbeatPayload, "license_token");
            Assert.False(string.IsNullOrWhiteSpace(rotatedToken));
            Assert.NotEqual(currentToken, rotatedToken);

            var rotatedJti = ParseJti(rotatedToken);
            Assert.True(seenJtis.Add(rotatedJti), $"Duplicate jti encountered at iteration {i}: {rotatedJti}");

            currentToken = rotatedToken;
        }

        using var statusRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        statusRequest.Headers.Add("X-License-Token", currentToken);
        var statusResponse = await client.SendAsync(statusRequest);
        Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);

        var statusPayload = await TestJson.ReadObjectAsync(statusResponse);
        Assert.Equal("active", TestJson.GetString(statusPayload, "state"));
        Assert.Equal(iterations + 1, seenJtis.Count);
    }

    private async Task<JsonObject> ActivateAsync(string deviceCode)
    {
        return await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Heartbeat Rotation Load Device",
                actor = "integration-tests",
                reason = "heartbeat rotation load test"
            }));
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
}
