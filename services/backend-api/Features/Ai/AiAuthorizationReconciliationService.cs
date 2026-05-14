using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiAuthorizationReconciliationService(
    IServiceScopeFactory scopeFactory,
    IOptions<AiInsightOptions> optionsAccessor,
    ILogger<AiAuthorizationReconciliationService> logger)
    : BackgroundService
{
    private readonly AiInsightOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(
            Math.Clamp(options.AuthorizationReconciliationIntervalSeconds, 30, 86_400));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (options.Enabled && options.AuthorizationReconciliationEnabled)
                {
                    await RunOnceAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "AI authorization reconciliation run failed.");
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

    public async Task<AiAuthorizationReconciliationSummary> RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var creditBillingService = scope.ServiceProvider.GetRequiredService<AiCreditBillingService>();

        var staleBeforeUtc = DateTimeOffset.UtcNow.AddSeconds(
            -Math.Clamp(options.AuthorizationPendingTimeoutSeconds, 60, 86_400));
        var take = Math.Clamp(options.AuthorizationReconciliationBatchSize, 1, 500);

        List<AiInsightRequest> staleRequests;
        if (dbContext.Database.IsSqlite())
        {
            staleRequests = (await dbContext.AiInsightRequests
                    .Where(x => x.Status == AiInsightRequestStatus.Pending &&
                                x.ReservedCredits > 0m)
                    .ToListAsync(cancellationToken))
                .Where(x => x.CreatedAtUtc <= staleBeforeUtc)
                .OrderBy(x => x.CreatedAtUtc)
                .Take(take)
                .ToList();
        }
        else
        {
            staleRequests = await dbContext.AiInsightRequests
                .Where(x => x.Status == AiInsightRequestStatus.Pending &&
                            x.ReservedCredits > 0m &&
                            x.CreatedAtUtc <= staleBeforeUtc)
                .OrderBy(x => x.CreatedAtUtc)
                .Take(take)
                .ToListAsync(cancellationToken);
        }

        var reconciled = 0;
        var failed = 0;
        foreach (var request in staleRequests)
        {
            try
            {
                await creditBillingService.RefundReservationAsync(
                    request.UserId,
                    request.Id,
                    request.ReservedCredits,
                    "ai_orphan_reconciliation_refund",
                    cancellationToken);

                request.Status = AiInsightRequestStatus.Failed;
                request.ErrorCode = "orphan_reconciled";
                request.ErrorMessage = "Request timed out before settlement and was reconciled automatically.";
                request.UpdatedAtUtc = DateTimeOffset.UtcNow;
                request.CompletedAtUtc = request.UpdatedAtUtc;
                reconciled++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to reconcile orphan AI authorization for request {RequestId}.",
                    request.Id);
                failed++;
            }
        }

        if (reconciled > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AiAuthorizationReconciliationSummary(
            staleRequests.Count,
            reconciled,
            failed,
            staleBeforeUtc);
    }
}

public readonly record struct AiAuthorizationReconciliationSummary(
    int Scanned,
    int Reconciled,
    int Failed,
    DateTimeOffset StaleBeforeUtc);
