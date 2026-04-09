using System.Net;
using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AuthSuperAdminPasswordOnlyLoginTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory factory;

    public AuthSuperAdminPasswordOnlyLoginTests(CustomWebApplicationFactory factory)
    {
        this.factory = factory;
    }

    [Theory]
    [InlineData("support_admin", "support123", "ADMIN-WEB-SUPPORT_ADMIN")]
    [InlineData("billing_admin", "billing123", "ADMIN-WEB-BILLING_ADMIN")]
    [InlineData("security_admin", "security123", "ADMIN-WEB-SECURITY_ADMIN")]
    public async Task SuperAdminScopes_ShouldLogin_WithUsernamePasswordOnly(
        string username,
        string password,
        string expectedDeviceCode)
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal(username, TestJson.GetString(payload, "username"));
        Assert.Equal("super_admin", TestJson.GetString(payload, "role"));
        Assert.Equal(expectedDeviceCode, TestJson.GetString(payload, "device_code"));
    }
}
