using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CloudWriteReliabilityMiddlewareTests : IDisposable
{
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public CloudWriteReliabilityMiddlewareTests()
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
    public async Task ProtectedWrite_WithoutDeviceIdHeader_ShouldReturnBadRequest()
    {
        client.DefaultRequestHeaders.Remove("X-Device-Id");

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/provision/challenge")
        {
            Content = JsonContent.Create(new
            {
                device_code = $"missing-device-id-{Guid.NewGuid():N}"
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        request.Headers.TryAddWithoutValidation("X-POS-Version", "it-pos-1.0.0");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("DEVICE_ID_REQUIRED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ProtectedWrite_ReplayWithSameIdempotency_ShouldReturnOriginalResponse()
    {
        var idempotencyKey = $"it-replay-{Guid.NewGuid():N}";
        var deviceCode = $"replay-device-{Guid.NewGuid():N}";

        var firstResponse = await SendChallengeAsync(deviceCode, idempotencyKey);
        firstResponse.EnsureSuccessStatusCode();
        var firstPayload = await TestJson.ReadObjectAsync(firstResponse);
        var firstChallengeId = TestJson.GetString(firstPayload, "challenge_id");
        Assert.False(string.IsNullOrWhiteSpace(firstChallengeId));

        var replayResponse = await SendChallengeAsync(deviceCode, idempotencyKey);
        replayResponse.EnsureSuccessStatusCode();
        Assert.True(replayResponse.Headers.TryGetValues("X-Idempotency-Replayed", out var replayHeaderValues));
        Assert.Contains("true", replayHeaderValues ?? [], StringComparer.OrdinalIgnoreCase);

        var replayPayload = await TestJson.ReadObjectAsync(replayResponse);
        Assert.Equal(firstChallengeId, TestJson.GetString(replayPayload, "challenge_id"));
        Assert.Equal(deviceCode, TestJson.GetString(replayPayload, "device_code"));
    }

    [Fact]
    public async Task ProtectedWrite_ReusedIdempotencyWithDifferentPayload_ShouldNotReplayPreviousResponse()
    {
        var idempotencyKey = $"it-conflict-{Guid.NewGuid():N}";
        var firstDeviceCode = $"conflict-a-{Guid.NewGuid():N}";
        var secondDeviceCode = $"conflict-b-{Guid.NewGuid():N}";

        var firstResponse = await SendChallengeAsync(firstDeviceCode, idempotencyKey);
        firstResponse.EnsureSuccessStatusCode();
        var firstPayload = await TestJson.ReadObjectAsync(firstResponse);
        var firstChallengeId = TestJson.GetString(firstPayload, "challenge_id");

        var secondResponse = await SendChallengeAsync(secondDeviceCode, idempotencyKey);
        secondResponse.EnsureSuccessStatusCode();
        Assert.False(secondResponse.Headers.TryGetValues("X-Idempotency-Replayed", out _));
        var secondPayload = await TestJson.ReadObjectAsync(secondResponse);
        Assert.NotEqual(firstChallengeId, TestJson.GetString(secondPayload, "challenge_id"));
        Assert.Equal(secondDeviceCode, TestJson.GetString(secondPayload, "device_code"));
    }

    [Fact]
    public async Task ProtectedWrite_CloudV1Alias_ShouldReplaySameIdempotencyResponse()
    {
        var idempotencyKey = $"it-cloud-v1-replay-{Guid.NewGuid():N}";
        var deviceCode = $"cloud-v1-replay-device-{Guid.NewGuid():N}";

        var firstResponse = await SendChallengeAsync(deviceCode, idempotencyKey, "/cloud/v1/device/challenge");
        firstResponse.EnsureSuccessStatusCode();
        var firstPayload = await TestJson.ReadObjectAsync(firstResponse);
        var firstChallengeId = TestJson.GetString(firstPayload, "challenge_id");

        var replayResponse = await SendChallengeAsync(deviceCode, idempotencyKey, "/cloud/v1/device/challenge");
        replayResponse.EnsureSuccessStatusCode();
        Assert.True(replayResponse.Headers.TryGetValues("X-Idempotency-Replayed", out var replayHeaderValues));
        Assert.Contains("true", replayHeaderValues ?? [], StringComparer.OrdinalIgnoreCase);

        var replayPayload = await TestJson.ReadObjectAsync(replayResponse);
        Assert.Equal(firstChallengeId, TestJson.GetString(replayPayload, "challenge_id"));
    }

    private async Task<HttpResponseMessage> SendChallengeAsync(
        string deviceCode,
        string idempotencyKey,
        string path = "/api/provision/challenge")
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(new
            {
                device_code = deviceCode
            })
        };

        request.Headers.Remove("Idempotency-Key");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        request.Headers.Remove("X-Device-Id");
        request.Headers.TryAddWithoutValidation("X-Device-Id", deviceCode);
        request.Headers.Remove("X-POS-Version");
        request.Headers.TryAddWithoutValidation("X-POS-Version", "it-pos-1.0.0");
        return await client.SendAsync(request);
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
