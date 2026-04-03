using System.Net;
using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiInsightsCanaryAccessTests(AiCanaryWebApplicationFactory factory)
    : IClassFixture<AiCanaryWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Estimate_WithCanaryAllowedUser_ShouldSucceed()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/insights/estimate", new
        {
            prompt = "Summarize this week's trend and one stock action."
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Estimate_WithUserOutsideCanaryAllowList_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/insights/estimate", new
        {
            prompt = "Summarize this week's trend and one stock action."
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
