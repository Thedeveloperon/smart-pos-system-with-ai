using System.Text.Json;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Recovery;

public sealed class RecoveryDrillAlertService(
    IOptions<RecoveryOpsOptions> optionsAccessor,
    IWebHostEnvironment environment,
    IServiceScopeFactory scopeFactory,
    ILicensingAlertMonitor alertMonitor,
    IOpsAlertPublisher opsAlertPublisher,
    ILogger<RecoveryDrillAlertService> logger)
    : BackgroundService
{
    private readonly RecoveryOpsOptions options = optionsAccessor.Value;
    private readonly string repoRootPath = Path.GetFullPath(Path.Combine(environment.ContentRootPath, ".."));
    private readonly Dictionary<string, DateTimeOffset> lastAlertByIssue = new(StringComparer.OrdinalIgnoreCase);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled || !options.MetricsAlertingEnabled)
        {
            logger.LogInformation("Recovery drill metrics alerting is disabled.");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(options.MetricsAlertingIntervalSeconds, 30, 3_600));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCheckAndAlertAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Recovery drill metrics alert evaluation failed.");
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

    public Task<RecoveryDrillHealthSnapshot> EvaluateOnceAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var metricsFilePath = ResolveMetricsFilePath();
        var snapshot = RecoveryDrillHealthEvaluator.Evaluate(options, metricsFilePath, DateTimeOffset.UtcNow);
        return Task.FromResult(snapshot);
    }

    public async Task<RecoveryDrillHealthSnapshot> RunCheckAndAlertAsync(
        CancellationToken cancellationToken,
        bool forceAlertEmit = false)
    {
        var snapshot = await EvaluateOnceAsync(cancellationToken);
        if (!forceAlertEmit && !options.MetricsAlertingEnabled)
        {
            return snapshot;
        }

        await EmitAlertsAsync(snapshot, cancellationToken);
        return snapshot;
    }

    private async Task EmitAlertsAsync(
        RecoveryDrillHealthSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        if (snapshot.Issues.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var cooldown = TimeSpan.FromMinutes(Math.Clamp(options.MetricsAlertCooldownMinutes, 1, 24 * 60));
        var auditLogs = new List<LicenseAuditLog>();
        var raisedIssues = new List<string>();

        foreach (var issue in snapshot.Issues)
        {
            if (lastAlertByIssue.TryGetValue(issue, out var lastRaisedAt) &&
                now - lastRaisedAt < cooldown)
            {
                continue;
            }

            lastAlertByIssue[issue] = now;
            raisedIssues.Add(issue);
            alertMonitor.RecordSecurityAnomaly(issue);
            logger.LogWarning(
                "Recovery drill issue detected: {Issue}. metrics_file={MetricsFilePath}, status={Status}",
                issue,
                snapshot.MetricsFilePath,
                snapshot.Status);

            auditLogs.Add(new LicenseAuditLog
            {
                Action = "recovery_drill_alert_raised",
                Actor = "recovery-drill-monitor",
                Reason = issue,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    status = snapshot.Status,
                    metrics_file_path = snapshot.MetricsFilePath,
                    metrics_file_exists = snapshot.MetricsFileExists,
                    monitoring_enabled = snapshot.MonitoringEnabled,
                    max_restore_drill_age_hours = snapshot.MaxRestoreDrillAgeHours,
                    target_rto_seconds = snapshot.TargetRtoSeconds,
                    target_rpo_seconds = snapshot.TargetRpoSeconds,
                    last_restore_metric = snapshot.LastRestoreMetric
                }),
                CreatedAtUtc = now
            });
        }

        if (auditLogs.Count == 0)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        dbContext.LicenseAuditLogs.AddRange(auditLogs);
        await dbContext.SaveChangesAsync(cancellationToken);

        await opsAlertPublisher.PublishAsync(new OpsAlertMessage
        {
            Category = "recovery.drill_degraded",
            Severity = "critical",
            Summary = $"Recovery drill health degraded: {string.Join(", ", raisedIssues)}",
            Details = new Dictionary<string, object?>
            {
                ["issues"] = raisedIssues,
                ["status"] = snapshot.Status,
                ["metrics_file_path"] = snapshot.MetricsFilePath,
                ["metrics_file_exists"] = snapshot.MetricsFileExists,
                ["monitoring_enabled"] = snapshot.MonitoringEnabled,
                ["max_restore_drill_age_hours"] = snapshot.MaxRestoreDrillAgeHours,
                ["target_rto_seconds"] = snapshot.TargetRtoSeconds,
                ["target_rpo_seconds"] = snapshot.TargetRpoSeconds,
                ["last_restore_metric"] = snapshot.LastRestoreMetric
            }
        }, cancellationToken);
    }

    private string ResolveMetricsFilePath()
    {
        if (!string.IsNullOrWhiteSpace(options.MetricsFilePath))
        {
            return ToAbsolutePath(options.MetricsFilePath.Trim());
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, "backups", "metrics", "restore_metrics.jsonl"));
    }

    private string ToAbsolutePath(string path)
    {
        if (Path.IsPathRooted(path))
        {
            return Path.GetFullPath(path);
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, path));
    }
}
