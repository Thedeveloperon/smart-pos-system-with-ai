using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingOfflinePolicySnapshotTests
{
    [Fact]
    public async Task ProtectedRoute_WithoutPolicySnapshot_ShouldReturnRequiredError()
    {
        using var factory = new PolicySnapshotEnforcedWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/checkout/complete", new { });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        Assert.Equal("POLICY_SNAPSHOT_REQUIRED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ProtectedRoute_WithTamperedPolicySnapshot_ShouldReturnInvalidError()
    {
        using var factory = new PolicySnapshotEnforcedWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var snapshotToken = await GetPolicySnapshotTokenAsync(client);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/complete")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.TryAddWithoutValidation("X-License-Policy-Snapshot", TamperToken(snapshotToken));

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        Assert.Equal("POLICY_SNAPSHOT_INVALID", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ProtectedRoute_WithClockSkewedClientTime_ShouldReturnClockSkewError()
    {
        using var factory = new PolicySnapshotEnforcedWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var snapshotToken = await GetPolicySnapshotTokenAsync(client);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/complete")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.TryAddWithoutValidation("X-License-Policy-Snapshot", snapshotToken);
        request.Headers.TryAddWithoutValidation("X-License-Policy-Client-Time", DateTimeOffset.UtcNow.AddHours(2).ToString("O"));

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        Assert.Equal("POLICY_SNAPSHOT_CLOCK_SKEW", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ProtectedRoute_WithValidPolicySnapshot_ShouldPassLicenseGate()
    {
        using var factory = new PolicySnapshotEnforcedWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var snapshotToken = await GetPolicySnapshotTokenAsync(client);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/complete")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.TryAddWithoutValidation("X-License-Policy-Snapshot", snapshotToken);
        request.Headers.TryAddWithoutValidation("X-License-Policy-Client-Time", DateTimeOffset.UtcNow.ToString("O"));

        var response = await client.SendAsync(request);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedRoute_WithExpiredPolicySnapshot_ShouldReturnExpiredError()
    {
        using var factory = new PolicySnapshotImmediateExpiryWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var snapshotToken = await GetPolicySnapshotTokenAsync(client);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/complete")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.TryAddWithoutValidation("X-License-Policy-Snapshot", snapshotToken);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await ReadJsonAsync(response);
        Assert.Equal("POLICY_SNAPSHOT_EXPIRED", payload["error"]?["code"]?.GetValue<string>());
    }

    private static async Task<string> GetPolicySnapshotTokenAsync(HttpClient client)
    {
        var statusResponse = await client.GetAsync("/api/license/status?device_code=integration-tests-device");
        statusResponse.EnsureSuccessStatusCode();

        var statusPayload = await statusResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("license/status response was empty.");
        return TestJson.GetString(statusPayload, "policy_snapshot_token");
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response payload was empty.");
    }

    private static string TamperToken(string token)
    {
        return $"{token}x";
    }
}

public sealed class PolicySnapshotEnforcedWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:OfflinePolicySnapshotEnforcementEnabled"] = "true",
            ["Licensing:OfflinePolicySnapshotTtlMinutes"] = "240",
            ["Licensing:OfflinePolicySnapshotClockSkewToleranceSeconds"] = "300",
            ["Licensing:OfflinePolicySnapshotProtectedPathPrefixes:0"] = "/api/checkout"
        };
    }
}

public sealed class PolicySnapshotImmediateExpiryWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:OfflinePolicySnapshotEnforcementEnabled"] = "true",
            ["Licensing:OfflinePolicySnapshotTtlMinutes"] = "0",
            ["Licensing:OfflinePolicySnapshotClockSkewToleranceSeconds"] = "300",
            ["Licensing:OfflinePolicySnapshotProtectedPathPrefixes:0"] = "/api/checkout"
        };
    }
}
