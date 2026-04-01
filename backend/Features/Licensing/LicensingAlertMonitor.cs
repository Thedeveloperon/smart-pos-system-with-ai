using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Licensing;

public interface ILicensingAlertMonitor
{
    void RecordLicenseValidationFailure(string? code);
    void RecordWebhookFailure(string? eventType, string? reason = null);
    LicensingAlertSnapshot GetSnapshot(int windowMinutes);
}

public sealed class LicensingAlertSnapshot
{
    public int WindowMinutes { get; set; }
    public int ValidationFailureCount { get; set; }
    public int WebhookFailureCount { get; set; }
    public List<LicensingAlertBreakdownItem> TopValidationFailures { get; set; } = [];
    public List<LicensingAlertBreakdownItem> TopWebhookFailures { get; set; } = [];
    public DateTimeOffset? LastValidationAlertAtUtc { get; set; }
    public DateTimeOffset? LastWebhookAlertAtUtc { get; set; }
}

public sealed class LicensingAlertBreakdownItem
{
    public string Reason { get; set; } = string.Empty;
    public int Count { get; set; }
}

public sealed class LicensingAlertMonitor(
    IOptions<LicenseOptions> optionsAccessor,
    ILogger<LicensingAlertMonitor> logger)
    : BackgroundService, ILicensingAlertMonitor
{
    private static readonly HashSet<string> TrackedValidationCodes =
    [
        LicenseErrorCodes.InvalidToken,
        LicenseErrorCodes.DeviceMismatch,
        LicenseErrorCodes.LicenseExpired,
        LicenseErrorCodes.Revoked,
        LicenseErrorCodes.Unprovisioned
    ];

    private readonly object gate = new();
    private readonly List<AlertEvent> validationFailures = [];
    private readonly List<AlertEvent> webhookFailures = [];
    private readonly LicenseAlertOptions alertOptions = optionsAccessor.Value.Alerts;
    private readonly TimeSpan maxRetention = TimeSpan.FromHours(3);

    private DateTimeOffset lastValidationAlertAtUtc = DateTimeOffset.MinValue;
    private DateTimeOffset lastWebhookAlertAtUtc = DateTimeOffset.MinValue;

    public void RecordLicenseValidationFailure(string? code)
    {
        var normalized = string.IsNullOrWhiteSpace(code) ? "UNKNOWN" : code.Trim().ToUpperInvariant();
        if (!TrackedValidationCodes.Contains(normalized))
        {
            return;
        }

        lock (gate)
        {
            PruneExpiredEvents(DateTimeOffset.UtcNow);
            validationFailures.Add(new AlertEvent(DateTimeOffset.UtcNow, normalized));
        }
    }

    public void RecordWebhookFailure(string? eventType, string? reason = null)
    {
        var normalizedType = string.IsNullOrWhiteSpace(eventType) ? "unknown_event" : eventType.Trim().ToLowerInvariant();
        var normalizedReason = string.IsNullOrWhiteSpace(reason) ? string.Empty : reason.Trim();

        lock (gate)
        {
            PruneExpiredEvents(DateTimeOffset.UtcNow);
            webhookFailures.Add(new AlertEvent(DateTimeOffset.UtcNow, $"{normalizedType}:{normalizedReason}"));
        }
    }

    public LicensingAlertSnapshot GetSnapshot(int windowMinutes)
    {
        var now = DateTimeOffset.UtcNow;
        var window = TimeSpan.FromMinutes(Math.Clamp(windowMinutes, 1, 180));

        lock (gate)
        {
            PruneExpiredEvents(now);
            return BuildSnapshotUnsafe(now, window);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(10, alertOptions.EvaluationIntervalSeconds));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                EmitAlertsIfNeeded(DateTimeOffset.UtcNow);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Licensing alert evaluation failed.");
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

    public void EvaluateAndEmitAlerts()
    {
        EmitAlertsIfNeeded(DateTimeOffset.UtcNow);
    }

    private void EmitAlertsIfNeeded(DateTimeOffset now)
    {
        if (!alertOptions.Enabled)
        {
            return;
        }

        var window = TimeSpan.FromMinutes(Math.Max(1, alertOptions.WindowMinutes));
        var cooldown = TimeSpan.FromMinutes(Math.Max(1, alertOptions.CooldownMinutes));
        LicensingAlertSnapshot snapshot;
        bool shouldAlertValidation;
        bool shouldAlertWebhook;

        lock (gate)
        {
            PruneExpiredEvents(now);
            snapshot = BuildSnapshotUnsafe(now, window);

            shouldAlertValidation = snapshot.ValidationFailureCount >= Math.Max(1, alertOptions.LicenseValidationSpikeThreshold)
                && now - lastValidationAlertAtUtc >= cooldown;

            shouldAlertWebhook = snapshot.WebhookFailureCount >= Math.Max(1, alertOptions.WebhookFailureThreshold)
                && now - lastWebhookAlertAtUtc >= cooldown;

            if (shouldAlertValidation)
            {
                lastValidationAlertAtUtc = now;
            }

            if (shouldAlertWebhook)
            {
                lastWebhookAlertAtUtc = now;
            }
        }

        if (shouldAlertValidation)
        {
            logger.LogWarning(
                "License validation failure spike detected: {FailureCount} failures in last {WindowMinutes} minutes. Top codes: {TopCodes}",
                snapshot.ValidationFailureCount,
                alertOptions.WindowMinutes,
                FormatTopEntries(snapshot.TopValidationFailures));
        }

        if (shouldAlertWebhook)
        {
            logger.LogWarning(
                "Billing webhook failure spike detected: {FailureCount} failures in last {WindowMinutes} minutes. Top causes: {TopCauses}",
                snapshot.WebhookFailureCount,
                alertOptions.WindowMinutes,
                FormatTopEntries(snapshot.TopWebhookFailures));
        }
    }

    private void PruneExpiredEvents(DateTimeOffset now)
    {
        var oldestAllowed = now - maxRetention;
        validationFailures.RemoveAll(x => x.TimestampUtc < oldestAllowed);
        webhookFailures.RemoveAll(x => x.TimestampUtc < oldestAllowed);
    }

    private LicensingAlertSnapshot BuildSnapshotUnsafe(DateTimeOffset now, TimeSpan window)
    {
        var windowStart = now - window;
        var validationInWindow = validationFailures
            .Where(x => x.TimestampUtc >= windowStart)
            .ToList();
        var webhookInWindow = webhookFailures
            .Where(x => x.TimestampUtc >= windowStart)
            .ToList();

        return new LicensingAlertSnapshot
        {
            WindowMinutes = (int)Math.Round(window.TotalMinutes),
            ValidationFailureCount = validationInWindow.Count,
            WebhookFailureCount = webhookInWindow.Count,
            TopValidationFailures = BuildTopBreakdown(validationInWindow),
            TopWebhookFailures = BuildTopBreakdown(webhookInWindow),
            LastValidationAlertAtUtc = lastValidationAlertAtUtc == DateTimeOffset.MinValue ? null : lastValidationAlertAtUtc,
            LastWebhookAlertAtUtc = lastWebhookAlertAtUtc == DateTimeOffset.MinValue ? null : lastWebhookAlertAtUtc
        };
    }

    private static List<LicensingAlertBreakdownItem> BuildTopBreakdown(List<AlertEvent> events)
    {
        return events
            .GroupBy(x => x.Reason)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Take(5)
            .Select(group => new LicensingAlertBreakdownItem
            {
                Reason = group.Key,
                Count = group.Count()
            })
            .ToList();
    }

    private static string FormatTopEntries(IReadOnlyCollection<LicensingAlertBreakdownItem> breakdown)
    {
        if (breakdown.Count == 0)
        {
            return "n/a";
        }

        return string.Join(
            ", ",
            breakdown
                .OrderByDescending(x => x.Count)
                .ThenBy(x => x.Reason, StringComparer.OrdinalIgnoreCase)
                .Take(3)
                .Select(x => $"{x.Reason} ({x.Count})"));
    }

    private sealed record AlertEvent(DateTimeOffset TimestampUtc, string Reason);
}
