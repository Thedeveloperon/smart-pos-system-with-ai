using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Licensing;

public sealed class BillingStateReconciliationService(
    IServiceScopeFactory scopeFactory,
    IOptions<LicenseOptions> optionsAccessor,
    ILogger<BillingStateReconciliationService> logger)
    : BackgroundService
{
    private readonly LicenseOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Clamp(options.BillingReconciliationIntervalSeconds, 60, 86_400));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (options.BillingReconciliationEnabled)
                {
                    await RunOnceAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Billing state reconciliation job failed.");
            }

            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    internal async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var summary = await licenseService.RunScheduledBillingStateReconciliationAsync(cancellationToken);

        if (summary.DriftCandidates > 0 || summary.WebhookFailuresDetected > 0)
        {
            logger.LogWarning(
                "Billing reconciliation detected issues: drift_candidates={DriftCandidates}, reconciled={SubscriptionsReconciled}, webhook_failures={WebhookFailuresDetected}.",
                summary.DriftCandidates,
                summary.SubscriptionsReconciled,
                summary.WebhookFailuresDetected);
            return;
        }

        logger.LogDebug(
            "Billing reconciliation completed with no drift. scanned={BillingSubscriptionsScanned}.",
            summary.BillingSubscriptionsScanned);
    }
}
