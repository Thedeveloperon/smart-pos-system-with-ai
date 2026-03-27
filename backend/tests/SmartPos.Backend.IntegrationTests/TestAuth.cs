using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

internal static class TestAuth
{
    public static async Task SignInAsManagerAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = "integration-tests-device",
            device_name = "Integration Tests"
        });

        response.EnsureSuccessStatusCode();
    }
}
