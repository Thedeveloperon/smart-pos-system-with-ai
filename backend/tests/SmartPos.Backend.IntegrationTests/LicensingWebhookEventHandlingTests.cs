using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingWebhookEventHandlingTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task HandleBillingWebhookAsync_ShouldProcessSupportedEventTypes()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"webhook-shop-it-{Guid.NewGuid():N}";
        var billingSync = await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_hook_001",
            SubscriptionId = "sub_hook_001",
            PriceId = "price_trial_001",
            Actor = "integration-tests",
            Reason = "prepare webhook identifiers"
        }, CancellationToken.None);

        var paidResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = "evt_paid_001",
            EventType = "invoice.paid",
            SubscriptionId = "sub_hook_001",
            PriceId = "price_growth_001",
            PeriodEnd = DateTimeOffset.UtcNow.AddDays(30),
            OccurredAt = DateTimeOffset.UtcNow,
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.True(paidResult.Handled);
        Assert.Equal("active", paidResult.SubscriptionStatus);
        Assert.Equal(billingSync.ShopId, paidResult.ShopId);
        Assert.NotNull(paidResult.ActivationEntitlement);
        Assert.False(string.IsNullOrWhiteSpace(paidResult.ActivationEntitlement?.ActivationEntitlementKey));

        var paymentFailedResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = "evt_failed_001",
            EventType = "invoice.payment_failed",
            CustomerId = "cus_hook_001",
            OccurredAt = DateTimeOffset.UtcNow,
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.True(paymentFailedResult.Handled);
        Assert.Equal("pastdue", paymentFailedResult.SubscriptionStatus);

        var updatedResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = "evt_updated_001",
            EventType = "customer.subscription.updated",
            SubscriptionId = "sub_hook_001",
            SubscriptionStatus = "active",
            Plan = "starter",
            PeriodStart = DateTimeOffset.UtcNow.AddDays(-1),
            PeriodEnd = DateTimeOffset.UtcNow.AddDays(29),
            OccurredAt = DateTimeOffset.UtcNow,
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.True(updatedResult.Handled);
        Assert.Equal("active", updatedResult.SubscriptionStatus);
        Assert.Equal("starter", updatedResult.Plan);

        var deletedResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = "evt_deleted_001",
            EventType = "customer.subscription.deleted",
            SubscriptionId = "sub_hook_001",
            OccurredAt = DateTimeOffset.UtcNow,
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.True(deletedResult.Handled);
        Assert.Equal("canceled", deletedResult.SubscriptionStatus);

        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.ShopId == billingSync.ShopId);

        Assert.Equal(SubscriptionStatus.Canceled, subscription.Status);
        Assert.Equal("starter", subscription.Plan);
        Assert.Equal(2, subscription.SeatLimit);
        Assert.Equal("price_growth_001", subscription.BillingPriceId);

        var entitlements = (await dbContext.CustomerActivationEntitlements
                .Where(x => x.ShopId == billingSync.ShopId)
                .ToListAsync())
            .OrderByDescending(x => x.IssuedAtUtc)
            .ToList();
        Assert.NotEmpty(entitlements);
        Assert.Equal("billing_webhook_invoice_paid", entitlements[0].Source);

        var featureFlags = DeserializeFeatureFlags(subscription.FeatureFlagsJson);
        Assert.Contains("reports-basic", featureFlags);
        Assert.DoesNotContain("offline-grace", featureFlags);

        var webhookAuditLogs = (await dbContext.LicenseAuditLogs
                .Where(x => x.ShopId == billingSync.ShopId && x.Action == "billing_webhook_processed")
                .ToListAsync())
            .OrderBy(x => x.CreatedAtUtc)
            .ToList();

        Assert.Equal(4, webhookAuditLogs.Count);
        Assert.Contains("invoice.paid", webhookAuditLogs[0].MetadataJson ?? string.Empty, StringComparison.Ordinal);
        Assert.Contains("invoice.payment_failed", webhookAuditLogs[1].MetadataJson ?? string.Empty, StringComparison.Ordinal);
        Assert.Contains("customer.subscription.updated", webhookAuditLogs[2].MetadataJson ?? string.Empty, StringComparison.Ordinal);
        Assert.Contains("customer.subscription.deleted", webhookAuditLogs[3].MetadataJson ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task HandleBillingWebhookAsync_WithUnsupportedEvent_ShouldReturnUnhandled()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();

        var result = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventType = "payment_intent.created",
            EventId = "evt_unsupported_001"
        }, CancellationToken.None);

        Assert.False(result.Handled);
        Assert.Equal("unsupported_event", result.Reason);
        Assert.Equal("payment_intent.created", result.EventType);
    }

    private static IReadOnlyList<string> DeserializeFeatureFlags(string? featureFlagsJson)
    {
        if (string.IsNullOrWhiteSpace(featureFlagsJson))
        {
            return [];
        }

        var values = JsonSerializer.Deserialize<List<string>>(featureFlagsJson);
        return values ?? [];
    }
}
