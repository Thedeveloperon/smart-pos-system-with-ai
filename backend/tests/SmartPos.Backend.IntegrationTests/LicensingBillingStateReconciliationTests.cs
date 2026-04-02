using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingBillingStateReconciliationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task BillingStateReconciliation_Run_ShouldReconcileExpiredBillingSubscriptions()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"billing-reconcile-shop-{Guid.NewGuid():N}";
        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = $"cus_{Guid.NewGuid():N}",
            SubscriptionId = $"sub_{Guid.NewGuid():N}",
            PriceId = "price_growth_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Shop.Code == shopCode, CancellationToken.None);
        subscription.Status = SubscriptionStatus.Active;
        subscription.PeriodEndUtc = DateTimeOffset.UtcNow.AddHours(-36);
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2);

        dbContext.BillingWebhookEvents.Add(new BillingWebhookEvent
        {
            ProviderEventId = $"evt_failed_{Guid.NewGuid():N}",
            EventType = "invoice.paid",
            Status = "failed",
            ShopId = subscription.ShopId,
            BillingSubscriptionId = subscription.BillingSubscriptionId,
            LastErrorCode = "NETWORK_TIMEOUT",
            ReceivedAtUtc = DateTimeOffset.UtcNow.AddHours(-3),
            UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-2)
        });
        await dbContext.SaveChangesAsync(CancellationToken.None);

        var run = await licenseService.RunBillingStateReconciliationAsAdminAsync(
            new AdminBillingStateReconciliationRunRequest
            {
                DryRun = false,
                Take = 50,
                WebhookFailureTake = 20,
                Actor = "integration-tests",
                Reason = "reconcile drift"
            },
            CancellationToken.None);

        Assert.True(run.BillingSubscriptionsScanned >= 1);
        Assert.True(run.DriftCandidates >= 1);
        Assert.True(
            run.SubscriptionsReconciled >= 1,
            string.Join(
                "; ",
                run.SubscriptionUpdates.Select(x =>
                    $"{x.ShopCode}:{x.PreviousStatus}->{x.ReconciledStatus}:applied={x.Applied}:error={x.Error ?? "none"}")));
        Assert.True(run.WebhookFailuresDetected >= 1);
        Assert.Contains(
            run.SubscriptionUpdates,
            x => x.ShopCode == shopCode && x.Applied && x.ReconciledStatus == "past_due");
        Assert.Contains(
            run.FailedWebhookEvents,
            x => x.ShopCode == shopCode &&
                 string.Equals(x.Status, "failed", StringComparison.OrdinalIgnoreCase));

        var reloadedSubscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Id == subscription.Id, CancellationToken.None);
        Assert.Equal(SubscriptionStatus.PastDue, reloadedSubscription.Status);

        var reconciliationAudit = (await dbContext.LicenseAuditLogs
                .Where(x => x.Action == "billing_webhook_reconciliation_run")
                .ToListAsync(CancellationToken.None))
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefault();
        Assert.NotNull(reconciliationAudit);
    }

    [Fact]
    public async Task BillingStateReconciliation_DryRun_ShouldNotMutateSubscription()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"billing-dryrun-shop-{Guid.NewGuid():N}";
        await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = $"cus_{Guid.NewGuid():N}",
            SubscriptionId = $"sub_{Guid.NewGuid():N}",
            PriceId = "price_starter_001",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Shop.Code == shopCode, CancellationToken.None);
        subscription.Status = SubscriptionStatus.Active;
        subscription.PeriodEndUtc = DateTimeOffset.UtcNow.AddHours(-30);
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
        await dbContext.SaveChangesAsync(CancellationToken.None);

        var run = await licenseService.RunBillingStateReconciliationAsAdminAsync(
            new AdminBillingStateReconciliationRunRequest
            {
                DryRun = true,
                Actor = "integration-tests",
                Reason = "dry-run check"
            },
            CancellationToken.None);

        Assert.True(run.DriftCandidates >= 1);
        Assert.Equal(0, run.SubscriptionsReconciled);
        Assert.Contains(
            run.SubscriptionUpdates,
            x => x.ShopCode == shopCode && !x.Applied);

        var reloadedSubscription = await dbContext.Subscriptions
            .SingleAsync(x => x.Id == subscription.Id, CancellationToken.None);
        Assert.Equal(SubscriptionStatus.Active, reloadedSubscription.Status);
    }

    [Fact]
    public async Task AdminBillingStateReconciliationEndpoint_ShouldEnforceSupportOrBillingPolicy()
    {
        await TestAuth.SignInAsManagerAsync(client);
        var asManager = await client.PostAsJsonAsync("/api/admin/licensing/billing/reconciliation/run", new
        {
            dry_run = true,
            reason = "manager attempt",
            actor = "manager"
        });
        Assert.Equal(HttpStatusCode.Forbidden, asManager.StatusCode);

        await TestAuth.SignInAsBillingAdminAsync(client);
        var asBillingAdmin = await client.PostAsJsonAsync("/api/admin/licensing/billing/reconciliation/run", new
        {
            dry_run = true,
            reason = "billing admin preview",
            actor = "billing_admin"
        });
        asBillingAdmin.EnsureSuccessStatusCode();
        var payload = await TestJson.ReadObjectAsync(asBillingAdmin);
        Assert.True(payload["dry_run"]?.GetValue<bool>() ?? false);
        Assert.False(string.IsNullOrWhiteSpace(payload["generated_at"]?.GetValue<string>()));
    }
}
