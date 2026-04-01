using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingSubscriptionReconciliationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task ReconcileSubscriptionStateAsync_ShouldUpdateSubscriptionState()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"reconcile-shop-it-{Guid.NewGuid():N}";
        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_reconcile_001",
            SubscriptionId = "sub_reconcile_001",
            PriceId = "price_trial_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var periodStart = DateTimeOffset.UtcNow.AddDays(-2);
        var periodEnd = DateTimeOffset.UtcNow.AddDays(28);
        var response = await licenseService.ReconcileSubscriptionStateAsync(new SubscriptionReconciliationRequest
        {
            ReconciliationId = $"recon-it-{Guid.NewGuid():N}",
            ShopCode = shopCode,
            CustomerId = "cus_reconcile_001",
            SubscriptionId = "sub_reconcile_001",
            PriceId = "price_growth_001",
            SubscriptionStatus = "active",
            Plan = "growth",
            PeriodStart = periodStart,
            PeriodEnd = periodEnd,
            Actor = "integration-tests",
            Reason = "server-side reconciliation"
        }, CancellationToken.None);

        Assert.Equal("active", response.SubscriptionStatus);
        Assert.Equal("growth", response.Plan);
        Assert.Equal(shopCode, response.ShopCode);
        Assert.Equal("price_growth_001", response.PriceId);

        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.BillingSubscriptionId == "sub_reconcile_001");

        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("growth", subscription.Plan);
        Assert.Equal(periodStart, subscription.PeriodStartUtc);
        Assert.Equal(periodEnd, subscription.PeriodEndUtc);
        Assert.Equal("price_growth_001", subscription.BillingPriceId);
        Assert.Equal(5, subscription.SeatLimit);

        var reconciliationAudit = await dbContext.LicenseAuditLogs
            .SingleAsync(x => x.ShopId == subscription.ShopId && x.Action == "subscription_reconciled");

        Assert.Contains("server_reconciliation", reconciliationAudit.MetadataJson ?? string.Empty, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GetStatusAsync_ShouldNotMutateSubscriptionStatusOutsideWebhookOrReconciliation()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"reconcile-state-it-{Guid.NewGuid():N}";
        var activation = await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Reconciliation State Device",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var token = activation.LicenseToken
                    ?? throw new InvalidOperationException("Activation did not return a license token.");

        var provisionedDevice = await dbContext.ProvisionedDevices
            .SingleAsync(x => x.DeviceCode == deviceCode);
        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.ShopId == provisionedDevice.ShopId);

        subscription.Status = SubscriptionStatus.Active;
        subscription.PeriodEndUtc = DateTimeOffset.UtcNow.AddDays(-1);
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await dbContext.SaveChangesAsync();

        await licenseService.GetStatusAsync(deviceCode, token, CancellationToken.None);

        var reloadedSubscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Id == subscription.Id);

        Assert.Equal(SubscriptionStatus.Active, reloadedSubscription.Status);
    }

    [Fact]
    public async Task UpsertBillingProviderIdsAsync_ShouldNotMutateSubscriptionStatusOutsideWebhookOrReconciliation()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"reconcile-upsert-it-{Guid.NewGuid():N}";
        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_upsert_001",
            SubscriptionId = "sub_upsert_001",
            PriceId = "price_trial_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.BillingSubscriptionId == "sub_upsert_001");

        subscription.Status = SubscriptionStatus.Active;
        subscription.PeriodEndUtc = DateTimeOffset.UtcNow.AddDays(-1);
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2);
        await dbContext.SaveChangesAsync();

        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_upsert_001",
            SubscriptionId = "sub_upsert_001",
            PriceId = "price_growth_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var reloadedSubscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Id == subscription.Id);

        Assert.Equal(SubscriptionStatus.Active, reloadedSubscription.Status);
        Assert.Equal("price_growth_001", reloadedSubscription.BillingPriceId);
    }
}
