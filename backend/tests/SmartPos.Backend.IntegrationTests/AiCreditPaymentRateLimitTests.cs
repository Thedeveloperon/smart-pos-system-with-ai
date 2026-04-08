using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiCreditPaymentRateLimitTests(AiCreditPaymentRateLimitWebApplicationFactory factory)
    : IClassFixture<AiCreditPaymentRateLimitWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task CheckoutEndpoint_WhenRateLimitExceeded_ShouldReturnTooManyRequests()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var firstResponse = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "card",
            idempotency_key = $"it-ai-rate-limit-checkout-first-{Guid.NewGuid():N}"
        });
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        var secondResponse = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "card",
            idempotency_key = $"it-ai-rate-limit-checkout-second-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.TooManyRequests, secondResponse.StatusCode);
        var payload = await secondResponse.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("RATE_LIMIT_EXCEEDED", payload?["error"]?["code"]?.GetValue<string>());
        Assert.Contains(
            "AI top-up checkout",
            payload?["error"]?["message"]?.GetValue<string>() ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PaymentStatusEndpoint_WhenRateLimitExceeded_ShouldReturnTooManyRequests()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var firstResponse = await client.GetAsync("/api/ai/payments?take=5");
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        var secondResponse = await client.GetAsync("/api/ai/payments?take=5");
        Assert.Equal(HttpStatusCode.TooManyRequests, secondResponse.StatusCode);

        var payload = await secondResponse.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("RATE_LIMIT_EXCEEDED", payload?["error"]?["code"]?.GetValue<string>());
        Assert.Contains(
            "AI payment status",
            payload?["error"]?["message"]?.GetValue<string>() ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class AiCreditPaymentRateLimitWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:PaymentCheckoutRateLimitPerMinute"] = "1",
            ["AiInsights:PaymentStatusRateLimitPerMinute"] = "1"
        };
    }
}
