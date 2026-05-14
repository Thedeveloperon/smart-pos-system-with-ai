using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiManualPaymentFallbackFeatureFlagTests(AiManualPaymentFallbackDisabledWebApplicationFactory factory)
    : IClassFixture<AiManualPaymentFallbackDisabledWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ManualPaymentCheckout_WhenFallbackDisabled_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "bank_deposit",
            bank_reference = "BD-001",
            deposit_slip_url = "https://example.test/proofs/slip-001.pdf",
            idempotency_key = $"it-ai-manual-disabled-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("disabled", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CardPaymentCheckout_WhenFallbackDisabled_ShouldStillSucceed()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "card",
            idempotency_key = $"it-ai-card-enabled-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

public sealed class AiManualPaymentFallbackDisabledWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:EnableManualPaymentFallback"] = "false"
        };
    }
}
