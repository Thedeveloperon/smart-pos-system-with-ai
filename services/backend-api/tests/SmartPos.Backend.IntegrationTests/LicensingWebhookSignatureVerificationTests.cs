using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingWebhookSignatureVerificationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private const string WebhookSecret = "smartpos-integration-webhook-secret-2026";
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task VerifyBillingWebhookSignature_WithValidSignature_ShouldSucceed()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();

        var payload = BuildWebhookPayload("invoice.paid");
        var headers = new HeaderDictionary
        {
            ["Stripe-Signature"] = BuildStripeSignatureHeader(payload, WebhookSecret, DateTimeOffset.UtcNow)
        };

        licenseService.VerifyBillingWebhookSignature(payload, headers);
    }

    [Fact]
    public async Task VerifyBillingWebhookSignature_WithMissingSignature_ShouldThrowMachineCode()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();

        var payload = BuildWebhookPayload("invoice.paid");
        var headers = new HeaderDictionary();

        var ex = Assert.ThrowsAny<Exception>(() =>
            licenseService.VerifyBillingWebhookSignature(payload, headers));

        Assert.Equal("LicenseException", ex.GetType().Name);
        Assert.Equal(
            "INVALID_BILLING_WEBHOOK_SIGNATURE",
            ex.GetType().GetProperty("Code")?.GetValue(ex)?.ToString());
    }

    [Fact]
    public async Task VerifyBillingWebhookSignature_WithInvalidSignature_ShouldThrowMachineCode()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();

        var payload = BuildWebhookPayload("invoice.paid");
        var headers = new HeaderDictionary
        {
            ["Stripe-Signature"] = BuildStripeSignatureHeader(payload, "wrong-secret", DateTimeOffset.UtcNow)
        };

        var ex = Assert.ThrowsAny<Exception>(() =>
            licenseService.VerifyBillingWebhookSignature(payload, headers));

        Assert.Equal("LicenseException", ex.GetType().Name);
        Assert.Equal(
            "INVALID_BILLING_WEBHOOK_SIGNATURE",
            ex.GetType().GetProperty("Code")?.GetValue(ex)?.ToString());
    }

    private static string BuildWebhookPayload(string eventType)
    {
        return JsonSerializer.Serialize(new
        {
            event_id = $"evt-sig-it-{Guid.NewGuid():N}",
            event_type = eventType,
            shop_code = $"sig-shop-it-{Guid.NewGuid():N}",
            occurred_at = DateTimeOffset.UtcNow
        });
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
