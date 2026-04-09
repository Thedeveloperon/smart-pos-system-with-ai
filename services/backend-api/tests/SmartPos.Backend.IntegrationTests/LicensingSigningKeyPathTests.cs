using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingSigningKeyPathTests(LicensingSigningKeyPathWebApplicationFactory factory)
    : IClassFixture<LicensingSigningKeyPathWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Activate_WhenSigningKeyEnvironmentVariableContainsPemFilePath_ShouldSucceed()
    {
        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = $"path-key-it-{Guid.NewGuid():N}",
                device_name = "Path Key Device",
                actor = "integration-tests",
                reason = "pem file path"
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        var token = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(token));
    }
}
