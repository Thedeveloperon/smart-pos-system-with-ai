using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CloudV1LicensingEndpointsTests : IDisposable
{
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public CloudV1LicensingEndpointsTests()
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
    public async Task CloudV1Lifecycle_AliasEndpoints_ShouldTransitionStates()
    {
        var deviceCode = $"cloud-v1-license-it-{Guid.NewGuid():N}";

        var initialStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/cloud/v1/license/status?device_code={Uri.EscapeDataString(deviceCode)}"));
        Assert.Equal("unprovisioned", TestJson.GetString(initialStatus, "state"));

        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/cloud/v1/device/activate", new
            {
                device_code = deviceCode,
                device_name = "Cloud v1 Device",
                actor = "integration-tests",
                reason = "cloud-v1 activation"
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        var issuedToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(issuedToken));

        var heartbeat = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/cloud/v1/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = issuedToken
            }));
        Assert.Equal("active", TestJson.GetString(heartbeat, "state"));

        var featureResponse = await client.GetAsync(
            $"/cloud/v1/license/feature-check?device_code={Uri.EscapeDataString(deviceCode)}&feature=ai_chat");
        featureResponse.EnsureSuccessStatusCode();
        var feature = await TestJson.ReadObjectAsync(featureResponse);
        Assert.Equal("ai_chat", TestJson.GetString(feature, "feature"));
        Assert.True(feature["allowed"]?.GetValue<bool>());

        await TestAuth.SignInAsManagerAsync(client);

        var deactivate = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/cloud/v1/device/deactivate", new
            {
                device_code = deviceCode,
                actor = "manager",
                reason = "device retired"
            }));
        Assert.Equal("revoked", TestJson.GetString(deactivate, "state"));

        var finalStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/cloud/v1/license/status?device_code={Uri.EscapeDataString(deviceCode)}"));
        Assert.Equal("revoked", TestJson.GetString(finalStatus, "state"));
    }

    [Fact]
    public async Task CloudV1FeatureCheck_WhenFeatureMissing_ShouldReturnValidationError()
    {
        var response = await client.GetAsync("/cloud/v1/license/feature-check?device_code=integration-tests-device&feature=");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");
        Assert.Equal("INVALID_FEATURE_CHECK_REQUEST", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task CloudV1AiPrivacyPolicy_ShouldExposeAllowlistAndRetentionDefaults()
    {
        var response = await client.GetAsync("/cloud/v1/meta/ai-privacy-policy");
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");

        Assert.Equal("v1", payload["api_version"]?.GetValue<string>());
        Assert.True(payload["payload_redaction_enabled"]?.GetValue<bool>());

        var allowlist = payload["provider_payload_allowlist"]?.AsArray()
            ?? throw new InvalidOperationException("provider_payload_allowlist missing.");
        Assert.Contains(allowlist, item => string.Equals(
            item?.GetValue<string>(),
            "customer_question",
            StringComparison.OrdinalIgnoreCase));

        var retention = payload["retention"]?.AsObject()
            ?? throw new InvalidOperationException("retention missing.");
        Assert.True(retention["enabled"]?.GetValue<bool>());
        Assert.True((retention["chat_messages_days"]?.GetValue<int>() ?? 0) > 0);
    }
}
