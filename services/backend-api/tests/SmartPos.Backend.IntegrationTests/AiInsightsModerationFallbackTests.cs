using System.Net;
using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiInsightsModerationFallbackTests(AiModerationFallbackWebApplicationFactory factory)
    : IClassFixture<AiModerationFallbackWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task GenerateInsights_WhenModerationEndpointIsUnavailable_ShouldSucceedWhenFailClosedDisabled()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 20m,
                purchase_reference = $"it-moderation-fallback-topup-{Guid.NewGuid():N}",
                description = "integration_test_moderation_fallback"
            }));

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Summarize last week sales and suggest one restock action.",
            idempotency_key = $"it-moderation-fallback-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal("succeeded", TestJson.GetString(payload, "status"));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(payload, "insight")));
    }
}
