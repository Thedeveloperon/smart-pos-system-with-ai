using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingWebhookIdempotencyTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task HandleBillingWebhookAsync_WithDuplicateEventId_ShouldProcessOnlyOnce()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"idempotency-shop-it-{Guid.NewGuid():N}";
        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_idempotent_001",
            SubscriptionId = "sub_idempotent_001",
            PriceId = "price_idempotent_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var eventId = $"evt-idempotent-{Guid.NewGuid():N}";
        var firstResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = eventId,
            EventType = "invoice.payment_failed",
            SubscriptionId = "sub_idempotent_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.True(firstResult.Handled);
        Assert.Equal("pastdue", firstResult.SubscriptionStatus);

        var secondResult = await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
        {
            EventId = eventId,
            EventType = "invoice.payment_failed",
            SubscriptionId = "sub_idempotent_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        Assert.False(secondResult.Handled);
        Assert.Equal("duplicate_event", secondResult.Reason);

        var subscription = await dbContext.Subscriptions
            .FirstAsync(x => x.BillingSubscriptionId == "sub_idempotent_001");
        Assert.Equal(SubscriptionStatus.PastDue, subscription.Status);

        var webhookAuditCount = await dbContext.LicenseAuditLogs
            .CountAsync(x => x.ShopId == subscription.ShopId && x.Action == "billing_webhook_processed");
        Assert.Equal(1, webhookAuditCount);

        var eventLog = await dbContext.BillingWebhookEvents
            .SingleAsync(x => x.ProviderEventId == eventId);
        Assert.Equal("processed", eventLog.Status);
        Assert.Equal(subscription.ShopId, eventLog.ShopId);
        Assert.Equal("sub_idempotent_001", eventLog.BillingSubscriptionId);
    }

    [Fact]
    public async Task HandleBillingWebhookAsync_WithoutEventId_ShouldFailValidation()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();

        var exception = await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await licenseService.HandleBillingWebhookAsync(new BillingWebhookEventRequest
            {
                EventType = "invoice.paid",
                ShopCode = $"idempotency-missing-event-it-{Guid.NewGuid():N}"
            }, CancellationToken.None);
        });

        Assert.Contains("event_id is required", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task HandleBillingWebhookAsync_ShouldDeadLetterEventAfterMaxFailures()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var eventId = $"evt-dead-letter-{Guid.NewGuid():N}";
        var request = new BillingWebhookEventRequest
        {
            EventId = eventId,
            EventType = "invoice.payment_failed",
            Actor = "integration-tests"
        };

        await Assert.ThrowsAnyAsync<Exception>(
            async () => await licenseService.HandleBillingWebhookAsync(request, CancellationToken.None));
        await Assert.ThrowsAnyAsync<Exception>(
            async () => await licenseService.HandleBillingWebhookAsync(request, CancellationToken.None));

        var deadLetterResult = await licenseService.HandleBillingWebhookAsync(request, CancellationToken.None);
        Assert.False(deadLetterResult.Handled);
        Assert.Equal("dead_letter_event", deadLetterResult.Reason);

        var persisted = await dbContext.BillingWebhookEvents
            .AsNoTracking()
            .SingleAsync(x => x.ProviderEventId == eventId);
        Assert.Equal("dead_letter", persisted.Status);
        Assert.Equal(3, persisted.FailureCount);
        Assert.NotNull(persisted.DeadLetteredAtUtc);
        Assert.Equal(LicenseErrorCodes.InvalidWebhook, persisted.LastErrorCode);

        var retryAfterDeadLetter = await licenseService.HandleBillingWebhookAsync(request, CancellationToken.None);
        Assert.False(retryAfterDeadLetter.Handled);
        Assert.Equal("dead_letter_event", retryAfterDeadLetter.Reason);
    }
}
