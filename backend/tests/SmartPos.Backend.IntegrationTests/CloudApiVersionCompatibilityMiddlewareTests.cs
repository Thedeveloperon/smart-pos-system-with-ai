using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CloudApiVersionCompatibilityMiddlewareTests
{
    [Fact]
    public async Task ProtectedWrite_BelowMinimumVersion_ShouldReturnUpgradeRequired()
    {
        using var factory = new MinVersionFactory("2.0.0");
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Post, "/cloud/v1/device/challenge")
        {
            Content = JsonContent.Create(new
            {
                device_code = $"min-version-test-{Guid.NewGuid():N}"
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        request.Headers.TryAddWithoutValidation("X-Device-Id", "min-version-test-device");
        request.Headers.TryAddWithoutValidation("X-POS-Version", "1.0.0");

        var response = await client.SendAsync(request);

        Assert.Equal((HttpStatusCode)426, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");
        Assert.Equal("POS_VERSION_UNSUPPORTED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ProtectedWrite_InvalidVersionHeader_ShouldReturnBadRequest()
    {
        using var factory = new MinVersionFactory("1.0.0");
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/provision/challenge")
        {
            Content = JsonContent.Create(new
            {
                device_code = $"invalid-version-test-{Guid.NewGuid():N}"
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        request.Headers.TryAddWithoutValidation("X-Device-Id", "invalid-version-test-device");
        request.Headers.TryAddWithoutValidation("X-POS-Version", "not-a-version");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");
        Assert.Equal("POS_VERSION_INVALID", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task CloudV1MetaEndpoints_ShouldReturnVersionPolicyAndContractSurface()
    {
        using var factory = new MinVersionFactory("1.2.3");
        using var client = factory.CreateClient();

        var versionPolicyResponse = await client.GetAsync("/cloud/v1/meta/version-policy");
        versionPolicyResponse.EnsureSuccessStatusCode();
        var versionPolicy = await TestJson.ReadObjectAsync(versionPolicyResponse);
        Assert.Equal("v1", TestJson.GetString(versionPolicy, "api_version"));
        Assert.Equal("1.2.3", TestJson.GetString(versionPolicy, "minimum_supported_pos_version"));
        Assert.True(versionPolicy["legacy_api_deprecation_enabled"]?.GetValue<bool>());
        Assert.Equal("/cloud/v1/meta/contracts", TestJson.GetString(versionPolicy, "legacy_api_migration_guide_url"));

        var contractResponse = await client.GetAsync("/cloud/v1/meta/contracts");
        contractResponse.EnsureSuccessStatusCode();
        var contract = await TestJson.ReadObjectAsync(contractResponse);
        Assert.Equal("v1", TestJson.GetString(contract, "api_version"));
        var surfaces = contract["surfaces"]?.AsArray()
            ?? throw new InvalidOperationException("surfaces were missing.");
        Assert.Contains(surfaces, entry => string.Equals(entry?.GetValue<string>(), "/cloud/v1/releases/latest", StringComparison.Ordinal));
        Assert.Contains(surfaces, entry => string.Equals(entry?.GetValue<string>(), "/cloud/v1/releases/min-supported", StringComparison.Ordinal));
        Assert.Contains(surfaces, entry => string.Equals(entry?.GetValue<string>(), "/cloud/v1/license/heartbeat", StringComparison.Ordinal));
        Assert.Contains(surfaces, entry => string.Equals(entry?.GetValue<string>(), "/api/license/heartbeat", StringComparison.Ordinal));
    }

    [Fact]
    public async Task CloudV1ReleaseEndpoints_ShouldReturnChannelMetadata()
    {
        using var factory = new MinVersionFactory("1.0.0");
        using var client = factory.CreateClient();

        var latestResponse = await client.GetAsync("/cloud/v1/releases/latest?channel=stable");
        latestResponse.EnsureSuccessStatusCode();
        var latest = await TestJson.ReadObjectAsync(latestResponse);
        Assert.Equal("stable", TestJson.GetString(latest, "channel"));
        Assert.Equal("1.0.0", TestJson.GetString(latest, "latest_pos_version"));
        Assert.Equal("1.0.0", TestJson.GetString(latest, "minimum_supported_pos_version"));
        Assert.True(latest["trust_chain"]?["metadata_complete"]?.GetValue<bool>() ?? false);
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(latest, "installer_checksum_sha256")));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(latest, "installer_signature_sha256")));

        var minSupportedResponse = await client.GetAsync("/cloud/v1/releases/min-supported?channel=stable");
        minSupportedResponse.EnsureSuccessStatusCode();
        var minSupported = await TestJson.ReadObjectAsync(minSupportedResponse);
        Assert.Equal("stable", TestJson.GetString(minSupported, "channel"));
        Assert.Equal("1.0.0", TestJson.GetString(minSupported, "minimum_supported_pos_version"));
        Assert.True(minSupported["rollback_policy_valid"]?.GetValue<bool>() ?? false);
    }

    [Fact]
    public async Task CloudV1ReleaseLatest_UnknownChannel_ShouldReturnNotFound()
    {
        using var factory = new MinVersionFactory("1.0.0");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/cloud/v1/releases/latest?channel=canary");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");
        Assert.Equal("RELEASE_CHANNEL_NOT_FOUND", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task CloudV1ReleaseLatest_MissingTrustMetadata_ShouldReturnServiceUnavailable()
    {
        using var factory = new MissingTrustMetadataFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/cloud/v1/releases/latest?channel=w10-missing-trust");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response payload missing.");
        Assert.Equal("RELEASE_TRUST_METADATA_INCOMPLETE", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task LegacyLicensingRoute_ShouldEmitDeprecationHeaders()
    {
        using var factory = new MinVersionFactory("1.0.0");
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/license/status?device_code=legacy-deprecation-{Guid.NewGuid():N}");
        response.EnsureSuccessStatusCode();

        Assert.True(response.Headers.Contains("Deprecation"));
        Assert.True(response.Headers.Contains("Sunset"));
        Assert.True(response.Headers.Contains("Link"));

        var link = string.Join(",", response.Headers.GetValues("Link"));
        Assert.Contains("/cloud/v1/license/status", link, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/cloud/v1/meta/contracts", link, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class MinVersionFactory(string minVersion) : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["CloudApi:EnforceMinimumSupportedPosVersion"] = "true",
                ["CloudApi:MinimumSupportedPosVersion"] = minVersion,
                ["CloudApi:LatestPosVersion"] = "2.5.0"
            };
        }
    }

    private sealed class MissingTrustMetadataFactory : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["CloudApi:RequireInstallerChecksumInReleaseMetadata"] = "true",
                ["CloudApi:RequireInstallerSignatureInReleaseMetadata"] = "true",
                ["CloudApi:ReleaseChannels:3:Channel"] = "w10-missing-trust",
                ["CloudApi:ReleaseChannels:3:LatestPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:3:MinimumSupportedPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:3:InstallerDownloadUrl"] = "https://downloads.smartpos.test/stable/SmartPOS-Setup.exe",
                ["CloudApi:ReleaseChannels:3:InstallerChecksumSha256"] = "",
                ["CloudApi:ReleaseChannels:3:InstallerSignatureSha256"] = "",
                ["CloudApi:ReleaseChannels:3:InstallerSignatureAlgorithm"] = "sha256-rsa"
            };
        }
    }
}
