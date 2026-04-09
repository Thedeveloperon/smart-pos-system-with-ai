using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingStripeWebhookEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private const string WebhookSecret = "smartpos-integration-webhook-secret-2026";
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task StripeWebhookEndpoint_ShouldMapInvoicePaidAndProcessBillingWebhook()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var client = appFactory.CreateClient();

        var shopCode = $"stripe-hook-shop-{Guid.NewGuid():N}";
        var customerId = $"cus_stripe_{Guid.NewGuid():N}";
        var subscriptionId = $"sub_stripe_{Guid.NewGuid():N}";
        var webhookEventId = $"evt_stripe_invoice_paid_{Guid.NewGuid():N}";
        var sync = await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = customerId,
            SubscriptionId = subscriptionId,
            PriceId = "price_starter_001",
            Actor = "integration-tests",
            Reason = "prepare stripe webhook mapping test"
        }, CancellationToken.None);

        var now = DateTimeOffset.UtcNow;
        var payload = JsonSerializer.Serialize(new
        {
            id = webhookEventId,
            type = "invoice.paid",
            created = now.ToUnixTimeSeconds(),
            data = new
            {
                @object = new
                {
                    customer = customerId,
                    subscription = subscriptionId,
                    customer_email = "owner@example.com",
                    metadata = new
                    {
                        shop_code = shopCode,
                        internal_plan_code = "growth"
                    },
                    lines = new
                    {
                        data = new object[]
                        {
                            new
                            {
                                price = new { id = "price_growth_001" },
                                period = new
                                {
                                    start = now.AddDays(-1).ToUnixTimeSeconds(),
                                    end = now.AddDays(30).ToUnixTimeSeconds()
                                }
                            }
                        }
                    }
                }
            }
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/license/webhooks/stripe")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation(
            "Stripe-Signature",
            BuildStripeSignatureHeader(payload, WebhookSecret, DateTimeOffset.UtcNow));

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var json = await TestJson.ReadObjectAsync(response);
        Assert.True(json["handled"]?.GetValue<bool>() ?? false);
        Assert.Equal("invoice.paid", TestJson.GetString(json, "event_type"));
        Assert.Equal("active", TestJson.GetString(json, "subscription_status"));
        Assert.Equal(subscriptionId, TestJson.GetString(json, "subscription_id"));
        Assert.NotNull(json["activation_entitlement"]);

        dbContext.ChangeTracker.Clear();
        var subscription = await dbContext.Subscriptions.SingleAsync(x => x.ShopId == sync.ShopId);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
    }

    private static string BuildStripeSignatureHeader(
        string payload,
        string signingSecret,
        DateTimeOffset timestamp)
    {
        var unixSeconds = timestamp.ToUnixTimeSeconds();
        var signedPayload = $"{unixSeconds}.{payload}";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingSecret));
        var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
        var signatureHex = Convert.ToHexString(signatureBytes).ToLowerInvariant();

        return $"t={unixSeconds},v1={signatureHex}";
    }
}
