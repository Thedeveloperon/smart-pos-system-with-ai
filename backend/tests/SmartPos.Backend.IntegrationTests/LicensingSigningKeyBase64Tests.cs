using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingSigningKeyBase64Tests(LicensingSigningKeyBase64WebApplicationFactory factory)
    : IClassFixture<LicensingSigningKeyBase64WebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Activate_WhenSigningKeyEnvironmentVariableContainsBase64KeyBody_ShouldSucceed()
    {
        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = $"base64-key-it-{Guid.NewGuid():N}",
                device_name = "Base64 Key Device",
                actor = "integration-tests",
                reason = "base64 key body"
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        var token = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(token));
    }
}
