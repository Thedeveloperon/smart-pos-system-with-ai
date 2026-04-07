using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingStripeCheckoutStatusEndpointTests
{
    [Fact]
    public async Task StripeCheckoutStatusEndpoint_ShouldReturnAwaitingWebhookProcessingForPaidCheckout()
    {
        await using var appFactory = new StripeCheckoutStatusWebApplicationFactory();
        using var client = appFactory.CreateClient();

        var createResponse = await PostJsonAsync(client, "/api/license/public/payment-request", new
        {
            shop_name = "Stripe Status Shop",
            contact_name = "Owner",
            contact_email = "owner@example.com",
            plan_code = "pro",
            payment_method = "bank_deposit",
            source = "website_pricing",
            owner_username = "stripe_owner_001",
            owner_password = "OwnerPass123!"
        });

        var invoice = createResponse["invoice"]?.AsObject()
            ?? throw new InvalidOperationException("Missing invoice payload.");
        var invoiceId = invoice["invoice_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing invoice_id.");
        var invoiceNumber = invoice["invoice_number"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing invoice_number.");

        var sessionId = $"cs_test_status_{Guid.NewGuid():N}";
        appFactory.SetCheckoutSessionResponse(
            sessionId,
            new
            {
                id = sessionId,
                status = "complete",
                payment_status = "paid",
                customer = $"cus_{Guid.NewGuid():N}",
                subscription = $"sub_{Guid.NewGuid():N}",
                expires_at = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds(),
                metadata = new
                {
                    invoice_id = invoiceId.ToString("D"),
                    invoice_number = invoiceNumber,
                    shop_code = TestJson.GetString(createResponse, "shop_code"),
                    shop_name = TestJson.GetString(createResponse, "shop_name")
                }
            });

        using var response = await client.GetAsync($"/api/license/public/stripe/checkout-session-status?session_id={Uri.EscapeDataString(sessionId)}");
        var payload = await TestJson.ReadObjectAsync(response);

        Assert.Equal(sessionId, TestJson.GetString(payload, "checkout_session_id"));
        Assert.Equal("complete", TestJson.GetString(payload, "checkout_status"));
        Assert.Equal("paid", TestJson.GetString(payload, "checkout_payment_status"));
        Assert.False(payload["access_ready"]?.GetValue<bool>() ?? true);
        Assert.Equal("awaiting_webhook_processing", payload["stripe_event_hint"]?.GetValue<string>());

        var returnedInvoice = payload["invoice"]?.AsObject()
            ?? throw new InvalidOperationException("Missing invoice from checkout status response.");
        Assert.Equal(invoiceId, returnedInvoice["invoice_id"]?.GetValue<Guid>());
        Assert.Equal(invoiceNumber, returnedInvoice["invoice_number"]?.GetValue<string>());
        Assert.Equal("open", returnedInvoice["status"]?.GetValue<string>());
    }

    [Fact]
    public async Task StripeCheckoutStatusEndpoint_ShouldRejectInvalidSessionId()
    {
        await using var appFactory = new StripeCheckoutStatusWebApplicationFactory();
        using var client = appFactory.CreateClient();

        using var response = await client.GetAsync("/api/license/public/stripe/checkout-session-status?session_id=invalid");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Missing error payload.");
        Assert.Equal("INVALID_ADMIN_REQUEST", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("session_id format is invalid.", payload["error"]?["message"]?.GetValue<string>());
    }

    private static async Task<JsonObject> PostJsonAsync(HttpClient client, string path, object payload)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));

        using var response = await client.SendAsync(request);
        return await TestJson.ReadObjectAsync(response);
    }

    private sealed class StripeCheckoutStatusWebApplicationFactory : CustomWebApplicationFactory
    {
        private readonly ConcurrentDictionary<string, string> checkoutSessions = new(StringComparer.Ordinal);

        public void SetCheckoutSessionResponse(string sessionId, object payload)
        {
            checkoutSessions[sessionId] = JsonSerializer.Serialize(payload);
        }

        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["Licensing:Stripe:Enabled"] = "true",
                ["Licensing:Stripe:ApiBaseUrl"] = "https://stripe.mock.smartpos.test",
                ["Licensing:Stripe:SecretKey"] = "sk_test_smartpos_2026",
                ["Licensing:Stripe:CheckoutSuccessUrl"] = "https://marketing.smartpos.test/en/start?checkout=success&session_id={CHECKOUT_SESSION_ID}",
                ["Licensing:Stripe:CheckoutCancelUrl"] = "https://marketing.smartpos.test/en/start?checkout=cancel"
            };
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);

            builder.ConfigureServices(services =>
            {
                services.AddHttpClient("stripe-billing")
                    .ConfigurePrimaryHttpMessageHandler(() => new StubStripeMessageHandler(checkoutSessions));
            });
        }

        private sealed class StubStripeMessageHandler(
            ConcurrentDictionary<string, string> checkoutSessions)
            : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken)
            {
                const string checkoutPrefix = "/v1/checkout/sessions/";
                var absolutePath = request.RequestUri?.AbsolutePath ?? string.Empty;
                if (request.Method == HttpMethod.Get &&
                    absolutePath.StartsWith(checkoutPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    var sessionId = Uri.UnescapeDataString(absolutePath[checkoutPrefix.Length..]);
                    if (checkoutSessions.TryGetValue(sessionId, out var payload))
                    {
                        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                        {
                            Content = new StringContent(payload, Encoding.UTF8, "application/json")
                        });
                    }
                }

                var errorPayload = JsonSerializer.Serialize(new
                {
                    error = new
                    {
                        message = "No mocked Stripe response configured for this request."
                    }
                });

                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
                {
                    Content = new StringContent(errorPayload, Encoding.UTF8, "application/json")
                });
            }
        }
    }
}
