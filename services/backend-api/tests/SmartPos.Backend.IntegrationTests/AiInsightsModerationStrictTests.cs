using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiInsightsModerationStrictTests(AiModerationStrictWebApplicationFactory factory)
    : IClassFixture<AiModerationStrictWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task GenerateInsights_WhenModerationEndpointIsUnavailable_ShouldFailWhenFailClosedEnabled()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 20m,
                purchase_reference = $"it-moderation-strict-topup-{Guid.NewGuid():N}",
                description = "integration_test_moderation_strict"
            }));

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Summarize last week sales and suggest one restock action.",
            idempotency_key = $"it-moderation-strict-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Equal("AI safety check failed.", message);
    }
}
