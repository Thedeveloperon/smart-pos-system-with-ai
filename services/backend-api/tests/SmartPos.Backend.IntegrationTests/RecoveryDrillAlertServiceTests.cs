using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Features.Recovery;

namespace SmartPos.Backend.IntegrationTests;

public sealed class RecoveryDrillAlertServiceTests
{
    [Fact]
    public async Task RunCheckAndAlertAsync_WithBreachMetric_ShouldRecordSecurityAnomalies()
    {
        var metricsFilePath = CreateMetricsFile(new
        {
            timestamp_utc = DateTimeOffset.UtcNow.AddDays(-10),
            status = "success",
            mode = "sqlite",
            backup_file = "backups/daily/backup.tar.gz",
            rto_seconds = 7200,
            rpo_seconds = 43200
        });

        using var factory = new RecoveryDrillAlertFactory(metricsFilePath);
        await using var scope = factory.Services.CreateAsyncScope();
        var alertMonitor = (ILicensingAlertMonitor)scope.ServiceProvider.GetRequiredService<ILicensingAlertMonitor>();
        var service = scope.ServiceProvider.GetRequiredService<RecoveryDrillAlertService>();

        var before = alertMonitor.GetSnapshot(180).SecurityAnomalyCount;
        var snapshot = await service.RunCheckAndAlertAsync(CancellationToken.None, forceAlertEmit: true);
        var after = alertMonitor.GetSnapshot(180).SecurityAnomalyCount;

        Assert.Equal("degraded", snapshot.Status);
        Assert.Contains("restore_drill_stale", snapshot.Issues);
        Assert.Contains("restore_drill_rto_breach", snapshot.Issues);
        Assert.Contains("restore_drill_rpo_breach", snapshot.Issues);
        Assert.True(after >= before + 3);
    }

    [Fact]
    public async Task RunCheckAndAlertAsync_WithHealthyMetric_ShouldNotRecordSecurityAnomaly()
    {
        var metricsFilePath = CreateMetricsFile(new
        {
            timestamp_utc = DateTimeOffset.UtcNow.AddMinutes(-20),
            status = "success",
            mode = "sqlite",
            backup_file = "backups/daily/backup.tar.gz",
            rto_seconds = 2400,
            rpo_seconds = 7200
        });

        using var factory = new RecoveryDrillAlertFactory(metricsFilePath);
        await using var scope = factory.Services.CreateAsyncScope();
        var alertMonitor = (ILicensingAlertMonitor)scope.ServiceProvider.GetRequiredService<ILicensingAlertMonitor>();
        var service = scope.ServiceProvider.GetRequiredService<RecoveryDrillAlertService>();

        var before = alertMonitor.GetSnapshot(180).SecurityAnomalyCount;
        var snapshot = await service.RunCheckAndAlertAsync(CancellationToken.None, forceAlertEmit: true);
        var after = alertMonitor.GetSnapshot(180).SecurityAnomalyCount;

        Assert.Equal("healthy", snapshot.Status);
        Assert.Empty(snapshot.Issues);
        Assert.Equal(before, after);
    }

    private static string CreateMetricsFile(object record)
    {
        var root = Path.Combine(Path.GetTempPath(), $"smartpos-recovery-metrics-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var metricsFilePath = Path.Combine(root, "restore_metrics.jsonl");
        var line = JsonSerializer.Serialize(record);
        File.WriteAllText(metricsFilePath, line + Environment.NewLine);
        return metricsFilePath;
    }

    private sealed class RecoveryDrillAlertFactory(string metricsFilePath) : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["RecoveryOps:MetricsFilePath"] = metricsFilePath,
                ["RecoveryOps:MetricsAlertingEnabled"] = "false",
                ["RecoveryOps:MaxRestoreDrillAgeHours"] = "168",
                ["RecoveryOps:RestoreDrillTargetRtoSeconds"] = "3600",
                ["RecoveryOps:RestoreDrillTargetRpoSeconds"] = "21600",
                ["RecoveryOps:MetricsAlertCooldownMinutes"] = "1"
            };
        }
    }
}
