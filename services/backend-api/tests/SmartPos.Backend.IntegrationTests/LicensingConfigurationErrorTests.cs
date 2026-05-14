using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingConfigurationErrorTests(LicensingMissingSigningKeyWebApplicationFactory factory)
    : IClassFixture<LicensingMissingSigningKeyWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Activate_WhenSigningKeyIsMissing_ShouldReturnConfigurationError()
    {
        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = $"missing-key-it-{Guid.NewGuid():N}",
            device_name = "Missing Signing Key Device",
            actor = "integration-tests",
            reason = "missing signing key"
        });

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Response body was empty.");

        Assert.Equal("LICENSING_CONFIGURATION_ERROR", payload["error"]?["code"]?.GetValue<string>());
        Assert.Contains("Licensing configuration error", payload["error"]?["message"]?.GetValue<string>());
    }
}
