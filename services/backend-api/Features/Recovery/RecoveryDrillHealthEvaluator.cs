namespace SmartPos.Backend.Features.Recovery;

internal static class RecoveryDrillHealthEvaluator
{
    public static RecoveryDrillHealthSnapshot Evaluate(
        RecoveryOpsOptions options,
        string metricsFilePath,
        DateTimeOffset now)
    {
        var snapshot = new RecoveryDrillHealthSnapshot
        {
            EvaluatedAt = now,
            MonitoringEnabled = options.MetricsAlertingEnabled,
            MetricsFilePath = metricsFilePath,
            MetricsFileExists = File.Exists(metricsFilePath),
            MaxRestoreDrillAgeHours = Math.Clamp(options.MaxRestoreDrillAgeHours, 1, 24 * 90),
            TargetRtoSeconds = Math.Max(1, options.RestoreDrillTargetRtoSeconds),
            TargetRpoSeconds = Math.Max(1, options.RestoreDrillTargetRpoSeconds)
        };

        if (!snapshot.MetricsFileExists)
        {
            snapshot.Status = "degraded";
            snapshot.Issues.Add("restore_drill_metrics_missing");
            return snapshot;
        }

        var lastMetric = RecoveryMetricsReader.ReadLastMetric(metricsFilePath);
        snapshot.LastRestoreMetric = lastMetric;
        if (lastMetric is null)
        {
            snapshot.Status = "degraded";
            snapshot.Issues.Add("restore_drill_metrics_unreadable");
            return snapshot;
        }

        if (!string.Equals(lastMetric.Status, "success", StringComparison.OrdinalIgnoreCase))
        {
            snapshot.Issues.Add("restore_drill_failed");
        }

        if (lastMetric.TimestampUtc is null)
        {
            snapshot.Issues.Add("restore_drill_timestamp_missing");
        }
        else
        {
            var maxAge = TimeSpan.FromHours(snapshot.MaxRestoreDrillAgeHours);
            if (now - lastMetric.TimestampUtc.Value > maxAge)
            {
                snapshot.Issues.Add("restore_drill_stale");
            }
        }

        if (lastMetric.RtoSeconds.HasValue && lastMetric.RtoSeconds.Value > snapshot.TargetRtoSeconds)
        {
            snapshot.Issues.Add("restore_drill_rto_breach");
        }

        if (lastMetric.RpoSeconds.HasValue && lastMetric.RpoSeconds.Value > snapshot.TargetRpoSeconds)
        {
            snapshot.Issues.Add("restore_drill_rpo_breach");
        }

        snapshot.Status = snapshot.Issues.Count == 0 ? "healthy" : "degraded";
        return snapshot;
    }
}
