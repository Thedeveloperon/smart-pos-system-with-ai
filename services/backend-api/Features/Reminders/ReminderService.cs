using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Reminders;

public sealed class ReminderService(
    SmartPosDbContext dbContext,
    ReportService reportService,
    IOptions<ReminderOptions> optionsAccessor,
    ILogger<ReminderService> logger)
{
    private static readonly ReminderRuleType[] DefaultRuleTypes =
    [
        ReminderRuleType.LowStock,
        ReminderRuleType.UpdateAvailable,
        ReminderRuleType.SubscriptionFollowUp,
        ReminderRuleType.WeeklySmartReport,
        ReminderRuleType.MonthlySmartReport
    ];

    private readonly ReminderOptions options = optionsAccessor.Value;

    public async Task<ReminderListResponse> GetRemindersAsync(
        Guid userId,
        bool includeAcknowledged,
        int take,
        CancellationToken cancellationToken)
    {
        await EnsureDefaultRulesAsync(userId, cancellationToken);

        var normalizedTake = Math.Clamp(take, 1, 100);

        var openCount = await dbContext.ReminderEvents
            .AsNoTracking()
            .CountAsync(x => x.UserId == userId && x.Status == ReminderEventStatus.Open, cancellationToken);

        var query = dbContext.ReminderEvents
            .AsNoTracking()
            .Where(x => x.UserId == userId);

        if (!includeAcknowledged)
        {
            query = query.Where(x => x.Status == ReminderEventStatus.Open);
        }

        List<ReminderEvent> items;
        if (dbContext.Database.IsSqlite())
        {
            items = (await query.ToListAsync(cancellationToken))
                .OrderBy(x => x.Status)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            items = await query
                .OrderBy(x => x.Status)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        return new ReminderListResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            OpenCount = openCount,
            Items = items.Select(MapEvent).ToList()
        };
    }

    public async Task<ReminderRuleResponse> UpsertRuleAsync(
        Guid userId,
        ReminderRuleUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryParseRuleType(request.ReminderType, out var ruleType))
        {
            throw new InvalidOperationException(
                "Invalid reminder_type. Use low_stock, update_available, subscription_follow_up, weekly_report, or monthly_report.");
        }

        var normalizedThreshold = request.LowStockThreshold.HasValue
            ? decimal.Round(Math.Max(0m, request.LowStockThreshold.Value), 3, MidpointRounding.AwayFromZero)
            : (decimal?)null;

        var existingRule = await dbContext.ReminderRules
            .SingleOrDefaultAsync(x => x.UserId == userId && x.RuleType == ruleType, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        if (existingRule is null)
        {
            existingRule = new ReminderRule
            {
                UserId = userId,
                User = await ResolveRequiredUserAsync(userId, cancellationToken),
                RuleType = ruleType,
                IsEnabled = request.Enabled ?? true,
                LowStockThreshold = ResolveRuleThreshold(ruleType, normalizedThreshold),
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.ReminderRules.Add(existingRule);
        }
        else
        {
            if (request.Enabled.HasValue)
            {
                existingRule.IsEnabled = request.Enabled.Value;
            }

            existingRule.LowStockThreshold = ResolveRuleThreshold(ruleType, normalizedThreshold, existingRule.LowStockThreshold);
            existingRule.UpdatedAtUtc = now;
        }

        if (request.ClearSnooze)
        {
            existingRule.SnoozedUntilUtc = null;
        }
        else if (request.SnoozeMinutes.HasValue && request.SnoozeMinutes.Value > 0)
        {
            var minutes = Math.Clamp(request.SnoozeMinutes.Value, 1, 7 * 24 * 60);
            existingRule.SnoozedUntilUtc = now.AddMinutes(minutes);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapRule(existingRule);
    }

    public async Task<ReminderEventResponse> AcknowledgeAsync(
        Guid userId,
        Guid reminderId,
        CancellationToken cancellationToken)
    {
        var reminder = await dbContext.ReminderEvents
            .SingleOrDefaultAsync(x => x.Id == reminderId && x.UserId == userId, cancellationToken);
        if (reminder is null)
        {
            throw new InvalidOperationException("Reminder not found.");
        }

        if (reminder.Status != ReminderEventStatus.Acknowledged)
        {
            reminder.Status = ReminderEventStatus.Acknowledged;
            reminder.AcknowledgedAtUtc = DateTimeOffset.UtcNow;
            reminder.UpdatedAtUtc = reminder.AcknowledgedAtUtc;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return MapEvent(reminder);
    }

    public Task<ReminderRunNowResponse> RunNowAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        return EvaluateRulesForUserAsync(userId, force: true, cancellationToken);
    }

    internal async Task RunScheduledAsync(CancellationToken cancellationToken)
    {
        if (!options.Enabled)
        {
            return;
        }

        var userIds = await dbContext.Users
            .AsNoTracking()
            .Where(x => x.IsActive && x.StoreId.HasValue)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        foreach (var userId in userIds)
        {
            dbContext.ChangeTracker.Clear();

            try
            {
                await EvaluateRulesForUserAsync(userId, force: false, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Reminder scheduler failed for user {UserId}", userId);
            }
        }
    }

    private async Task<ReminderRunNowResponse> EvaluateRulesForUserAsync(
        Guid userId,
        bool force,
        CancellationToken cancellationToken)
    {
        await EnsureDefaultRulesAsync(userId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var rules = await dbContext.ReminderRules
            .Where(x => x.UserId == userId && x.IsEnabled)
            .OrderBy(x => x.RuleType)
            .ToListAsync(cancellationToken);

        var summary = new ReminderRunNowResponse
        {
            ExecutedAt = now
        };

        if (rules.Count == 0)
        {
            return summary;
        }

        foreach (var rule in rules)
        {
            summary.ProcessedRules += 1;

            if (!force && rule.SnoozedUntilUtc.HasValue && rule.SnoozedUntilUtc.Value > now)
            {
                summary.SkippedRules += 1;
                rule.LastEvaluatedAtUtc = now;
                continue;
            }

            var evaluation = await EvaluateRuleAsync(rule, force, now, cancellationToken);
            summary.CreatedEvents += evaluation.CreatedEvents;
            summary.GeneratedReports += evaluation.GeneratedReports;
            summary.Jobs.AddRange(evaluation.Jobs);

            rule.LastEvaluatedAtUtc = now;
            if (evaluation.CreatedEvents > 0 || evaluation.GeneratedReports > 0)
            {
                rule.LastTriggeredAtUtc = now;
            }

            rule.UpdatedAtUtc = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return summary;
    }

    private async Task<RuleEvaluationResult> EvaluateRuleAsync(
        ReminderRule rule,
        bool force,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return rule.RuleType switch
        {
            ReminderRuleType.LowStock => await EvaluateLowStockRuleAsync(rule, now, cancellationToken),
            ReminderRuleType.UpdateAvailable => await EvaluateUpdateRuleAsync(rule, now, cancellationToken),
            ReminderRuleType.SubscriptionFollowUp => await EvaluateSubscriptionFollowUpRuleAsync(rule, now, cancellationToken),
            ReminderRuleType.WeeklySmartReport => await EvaluateSmartReportRuleAsync(rule, AiSmartReportCadence.Weekly, force, now, cancellationToken),
            ReminderRuleType.MonthlySmartReport => await EvaluateSmartReportRuleAsync(rule, AiSmartReportCadence.Monthly, force, now, cancellationToken),
            _ => RuleEvaluationResult.Empty
        };
    }

    private async Task<RuleEvaluationResult> EvaluateLowStockRuleAsync(
        ReminderRule rule,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var threshold = decimal.Round(
            Math.Max(0m, rule.LowStockThreshold ?? options.DefaultLowStockThreshold),
            3,
            MidpointRounding.AwayFromZero);

        var report = await reportService.GetLowStockReportAsync(options.LowStockTake, threshold, cancellationToken);
        if (report.Items.Count == 0)
        {
            return RuleEvaluationResult.Empty;
        }

        var first = report.Items[0];
        var fingerprint = $"low_stock:{DateOnly.FromDateTime(now.UtcDateTime):yyyyMMdd}:{threshold.ToString(CultureInfo.InvariantCulture)}";
        var message =
            $"{report.Items.Count} item(s) are at or below {threshold:0.###}. Lowest stock: {first.ProductName} ({first.QuantityOnHand:0.###}).";

        var created = await TryCreateReminderEventAsync(
            userId: rule.UserId,
            ruleId: rule.Id,
            eventType: ReminderEventType.LowStockThresholdCrossed,
            severity: ReminderSeverity.Warning,
            title: "Low stock alert",
            message: message,
            actionPath: "/",
            fingerprint: fingerprint,
            metadataJson: JsonSerializer.Serialize(new
            {
                threshold,
                count = report.Items.Count,
                top_item = first.ProductName
            }),
            now: now,
            cancellationToken: cancellationToken);

        return created ? RuleEvaluationResult.WithEvents(1) : RuleEvaluationResult.Empty;
    }

    private async Task<RuleEvaluationResult> EvaluateUpdateRuleAsync(
        ReminderRule rule,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var current = (options.CurrentAppVersion ?? string.Empty).Trim();
        var latest = (options.LatestAppVersion ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(latest) ||
            string.Equals(current, latest, StringComparison.OrdinalIgnoreCase))
        {
            return RuleEvaluationResult.Empty;
        }

        var fingerprint = $"update_available:{latest.ToLowerInvariant()}";
        var message = string.IsNullOrWhiteSpace(current)
            ? $"Version {latest} is available."
            : $"Version {latest} is available (current: {current}).";

        var created = await TryCreateReminderEventAsync(
            userId: rule.UserId,
            ruleId: rule.Id,
            eventType: ReminderEventType.UpdateAvailable,
            severity: ReminderSeverity.Info,
            title: "Update available",
            message: message,
            actionPath: "/",
            fingerprint: fingerprint,
            metadataJson: JsonSerializer.Serialize(new
            {
                current_version = current,
                latest_version = latest
            }),
            now: now,
            cancellationToken: cancellationToken);

        return created ? RuleEvaluationResult.WithEvents(1) : RuleEvaluationResult.Empty;
    }

    private async Task<RuleEvaluationResult> EvaluateSubscriptionFollowUpRuleAsync(
        ReminderRule rule,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        List<ManualBillingInvoice> invoices;
        if (dbContext.Database.IsSqlite())
        {
            invoices = (await dbContext.ManualBillingInvoices
                    .AsNoTracking()
                    .Where(x => x.Status == ManualBillingInvoiceStatus.PendingVerification || x.Status == ManualBillingInvoiceStatus.Overdue)
                    .ToListAsync(cancellationToken))
                .OrderBy(x => x.DueAtUtc)
                .Take(25)
                .ToList();
        }
        else
        {
            invoices = await dbContext.ManualBillingInvoices
                .AsNoTracking()
                .Where(x => x.Status == ManualBillingInvoiceStatus.PendingVerification || x.Status == ManualBillingInvoiceStatus.Overdue)
                .OrderBy(x => x.DueAtUtc)
                .Take(25)
                .ToListAsync(cancellationToken);
        }

        if (invoices.Count == 0)
        {
            return RuleEvaluationResult.Empty;
        }

        var overdueCount = invoices.Count(x => x.DueAtUtc < now);
        var pendingCount = invoices.Count - overdueCount;
        var fingerprint = $"subscription_follow_up:{DateOnly.FromDateTime(now.UtcDateTime):yyyyMMdd}:{overdueCount}:{pendingCount}";
        var message = overdueCount > 0
            ? $"{overdueCount} overdue and {pendingCount} pending invoice(s) need billing follow-up."
            : $"{pendingCount} pending invoice(s) are waiting for verification.";

        var created = await TryCreateReminderEventAsync(
            userId: rule.UserId,
            ruleId: rule.Id,
            eventType: ReminderEventType.SubscriptionFollowUp,
            severity: overdueCount > 0 ? ReminderSeverity.Warning : ReminderSeverity.Info,
            title: "Billing follow-up",
            message: message,
            actionPath: "/",
            fingerprint: fingerprint,
            metadataJson: JsonSerializer.Serialize(new
            {
                overdue = overdueCount,
                pending = pendingCount,
                sample_invoice = invoices[0].InvoiceNumber
            }),
            now: now,
            cancellationToken: cancellationToken);

        return created ? RuleEvaluationResult.WithEvents(1) : RuleEvaluationResult.Empty;
    }

    private async Task<RuleEvaluationResult> EvaluateSmartReportRuleAsync(
        ReminderRule rule,
        AiSmartReportCadence cadence,
        bool force,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var period = ResolveReportPeriod(cadence, now);
        if (!force && !IsCadenceDue(cadence, now))
        {
            return RuleEvaluationResult.Empty;
        }

        var existingJob = await dbContext.AiSmartReportJobs
            .AsNoTracking()
            .AnyAsync(
                x => x.UserId == rule.UserId && x.Cadence == cadence && x.PeriodStartUtc == period.StartUtc,
                cancellationToken);
        if (existingJob)
        {
            return RuleEvaluationResult.Empty;
        }

        var job = new AiSmartReportJob
        {
            UserId = rule.UserId,
            User = await ResolveRequiredUserAsync(rule.UserId, cancellationToken),
            Cadence = cadence,
            Status = AiSmartReportJobStatus.Running,
            PeriodStartUtc = period.StartUtc,
            PeriodEndUtc = period.EndUtc,
            Title = cadence == AiSmartReportCadence.Weekly ? "Weekly Smart Report" : "Monthly Smart Report",
            CreatedAtUtc = now,
            StartedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.AiSmartReportJobs.Add(job);
        await dbContext.SaveChangesAsync(cancellationToken);

        var createdEvents = 0;

        try
        {
            var fromDate = DateOnly.FromDateTime(period.StartUtc.UtcDateTime);
            var toDate = DateOnly.FromDateTime(period.EndUtc.UtcDateTime);
            var lowStockThreshold = decimal.Round(
                Math.Max(0m, rule.LowStockThreshold ?? options.DefaultLowStockThreshold),
                3,
                MidpointRounding.AwayFromZero);

            var dailyReport = await reportService.GetDailySalesReportAsync(fromDate, toDate, cancellationToken);
            var topItemsReport = await reportService.GetTopItemsReportAsync(fromDate, toDate, 5, cancellationToken);
            var worstItemsReport = await reportService.GetWorstItemsReportAsync(fromDate, toDate, 5, cancellationToken);
            var lowStockReport = await reportService.GetLowStockReportAsync(10, lowStockThreshold, cancellationToken);
            var forecastReport = await reportService.GetMonthlySalesForecastReportAsync(6, cancellationToken);

            var topItemName = topItemsReport.Items.FirstOrDefault()?.ProductName ?? "n/a";
            var worstItemName = worstItemsReport.Items.FirstOrDefault()?.ProductName ?? "n/a";
            var summary =
                $"Net sales {dailyReport.NetSalesTotal:0.00} from {dailyReport.SalesCount} sales. Top item: {topItemName}. Lowest performer: {worstItemName}. Low-stock alerts: {lowStockReport.Items.Count}.";

            job.Status = AiSmartReportJobStatus.Succeeded;
            job.Summary = summary;
            job.PayloadJson = JsonSerializer.Serialize(new
            {
                cadence = ToApiCadence(cadence),
                generated_at = now,
                period_start_utc = period.StartUtc,
                period_end_utc = period.EndUtc,
                reports = new
                {
                    daily = dailyReport,
                    top_items = topItemsReport,
                    worst_items = worstItemsReport,
                    low_stock = lowStockReport,
                    monthly_forecast = forecastReport
                }
            });
            job.CompletedAtUtc = DateTimeOffset.UtcNow;
            job.UpdatedAtUtc = job.CompletedAtUtc;

            var fingerprint = $"smart_report_ready:{ToApiCadence(cadence)}:{period.StartUtc:yyyyMMdd}";
            var reminderCreated = await TryCreateReminderEventAsync(
                userId: rule.UserId,
                ruleId: rule.Id,
                eventType: cadence == AiSmartReportCadence.Weekly
                    ? ReminderEventType.WeeklyReportReady
                    : ReminderEventType.MonthlyReportReady,
                severity: ReminderSeverity.Info,
                title: cadence == AiSmartReportCadence.Weekly
                    ? "Weekly smart report is ready"
                    : "Monthly smart report is ready",
                message: summary,
                actionPath: "/",
                fingerprint: fingerprint,
                metadataJson: JsonSerializer.Serialize(new
                {
                    job_id = job.Id,
                    cadence = ToApiCadence(cadence),
                    period_start_utc = period.StartUtc,
                    period_end_utc = period.EndUtc
                }),
                now: now,
                cancellationToken: cancellationToken);

            if (reminderCreated)
            {
                createdEvents = 1;
            }
        }
        catch (Exception ex)
        {
            job.Status = AiSmartReportJobStatus.Failed;
            job.ErrorMessage = TruncateError(ex.Message, 500);
            job.CompletedAtUtc = DateTimeOffset.UtcNow;
            job.UpdatedAtUtc = job.CompletedAtUtc;
            logger.LogError(ex, "Smart report generation failed for user {UserId} cadence {Cadence}", rule.UserId, cadence);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new RuleEvaluationResult
        {
            CreatedEvents = createdEvents,
            GeneratedReports = job.Status == AiSmartReportJobStatus.Succeeded ? 1 : 0,
            Jobs = [MapJob(job)]
        };
    }

    private async Task EnsureDefaultRulesAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (!options.Enabled || !options.AutoSeedDefaultRules)
        {
            return;
        }

        var existingTypes = await dbContext.ReminderRules
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .Select(x => x.RuleType)
            .ToListAsync(cancellationToken);

        var missingTypes = DefaultRuleTypes
            .Where(x => !existingTypes.Contains(x))
            .ToList();

        if (missingTypes.Count == 0)
        {
            return;
        }

        var user = await ResolveRequiredUserAsync(userId, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        foreach (var type in missingTypes)
        {
            dbContext.ReminderRules.Add(new ReminderRule
            {
                UserId = userId,
                User = user,
                RuleType = type,
                IsEnabled = true,
                LowStockThreshold = type == ReminderRuleType.LowStock ? options.DefaultLowStockThreshold : null,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<bool> TryCreateReminderEventAsync(
        Guid userId,
        Guid? ruleId,
        ReminderEventType eventType,
        ReminderSeverity severity,
        string title,
        string message,
        string? actionPath,
        string? fingerprint,
        string? metadataJson,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedFingerprint = string.IsNullOrWhiteSpace(fingerprint)
            ? null
            : fingerprint.Trim().ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(normalizedFingerprint))
        {
            var existingInMemory = dbContext.ReminderEvents.Local.Any(
                x => x.UserId == userId &&
                     string.Equals(x.Fingerprint, normalizedFingerprint, StringComparison.OrdinalIgnoreCase));
            if (existingInMemory)
            {
                return false;
            }

            var exists = await dbContext.ReminderEvents
                .AsNoTracking()
                .AnyAsync(
                    x => x.UserId == userId &&
                         x.Fingerprint != null &&
                         x.Fingerprint.ToLower() == normalizedFingerprint,
                    cancellationToken);
            if (exists)
            {
                return false;
            }
        }

        dbContext.ReminderEvents.Add(new ReminderEvent
        {
            UserId = userId,
            User = await ResolveRequiredUserAsync(userId, cancellationToken),
            RuleId = ruleId,
            EventType = eventType,
            Severity = severity,
            Status = ReminderEventStatus.Open,
            Title = title,
            Message = TruncateMessage(message, 600),
            ActionPath = NormalizeOptional(actionPath),
            Fingerprint = normalizedFingerprint,
            MetadataJson = metadataJson,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        return true;
    }

    private async Task<AppUser> ResolveRequiredUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            throw new InvalidOperationException("User not found.");
        }

        return user;
    }

    private (DateTimeOffset StartUtc, DateTimeOffset EndUtc) ResolveReportPeriod(
        AiSmartReportCadence cadence,
        DateTimeOffset now)
    {
        if (cadence == AiSmartReportCadence.Monthly)
        {
            var monthStart = new DateOnly(now.Year, now.Month, 1);
            var monthEnd = monthStart.AddMonths(1).AddDays(-1);
            return (
                new DateTimeOffset(monthStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
                new DateTimeOffset(monthEnd.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
        }

        var startDay = ResolveWeekStartDay();
        var date = DateOnly.FromDateTime(now.UtcDateTime);
        var delta = ((int)date.DayOfWeek - (int)startDay + 7) % 7;
        var weekStart = date.AddDays(-delta);
        var weekEnd = weekStart.AddDays(6);

        return (
            new DateTimeOffset(weekStart.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            new DateTimeOffset(weekEnd.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
    }

    private bool IsCadenceDue(AiSmartReportCadence cadence, DateTimeOffset now)
    {
        if (cadence == AiSmartReportCadence.Monthly)
        {
            var targetDay = Math.Clamp(options.MonthlyReportDay, 1, 28);
            return now.Day >= targetDay;
        }

        return now.DayOfWeek == ResolveWeekStartDay();
    }

    private DayOfWeek ResolveWeekStartDay()
    {
        if (Enum.TryParse<DayOfWeek>(options.WeeklyReportDay, ignoreCase: true, out var parsed))
        {
            return parsed;
        }

        return DayOfWeek.Monday;
    }

    private static decimal? ResolveRuleThreshold(
        ReminderRuleType ruleType,
        decimal? requestThreshold,
        decimal? currentThreshold = null)
    {
        if (ruleType != ReminderRuleType.LowStock)
        {
            return null;
        }

        if (requestThreshold.HasValue)
        {
            return requestThreshold.Value;
        }

        return currentThreshold;
    }

    private static bool TryParseRuleType(string rawValue, out ReminderRuleType ruleType)
    {
        var normalized = (rawValue ?? string.Empty).Trim().ToLowerInvariant();
        switch (normalized)
        {
            case "low_stock":
                ruleType = ReminderRuleType.LowStock;
                return true;
            case "update_available":
                ruleType = ReminderRuleType.UpdateAvailable;
                return true;
            case "subscription_follow_up":
                ruleType = ReminderRuleType.SubscriptionFollowUp;
                return true;
            case "weekly_report":
            case "weekly_smart_report":
                ruleType = ReminderRuleType.WeeklySmartReport;
                return true;
            case "monthly_report":
            case "monthly_smart_report":
                ruleType = ReminderRuleType.MonthlySmartReport;
                return true;
            default:
                ruleType = ReminderRuleType.LowStock;
                return false;
        }
    }

    private static ReminderRuleResponse MapRule(ReminderRule rule)
    {
        return new ReminderRuleResponse
        {
            RuleId = rule.Id,
            ReminderType = ToApiRuleType(rule.RuleType),
            Enabled = rule.IsEnabled,
            LowStockThreshold = rule.LowStockThreshold,
            SnoozedUntil = rule.SnoozedUntilUtc,
            LastEvaluatedAt = rule.LastEvaluatedAtUtc,
            LastTriggeredAt = rule.LastTriggeredAtUtc,
            CreatedAt = rule.CreatedAtUtc,
            UpdatedAt = rule.UpdatedAtUtc
        };
    }

    private static ReminderEventResponse MapEvent(ReminderEvent reminder)
    {
        return new ReminderEventResponse
        {
            ReminderId = reminder.Id,
            RuleId = reminder.RuleId,
            EventType = ToApiEventType(reminder.EventType),
            Severity = reminder.Severity.ToString().ToLowerInvariant(),
            Status = reminder.Status.ToString().ToLowerInvariant(),
            Title = reminder.Title,
            Message = reminder.Message,
            ActionPath = reminder.ActionPath,
            CreatedAt = reminder.CreatedAtUtc,
            AcknowledgedAt = reminder.AcknowledgedAtUtc,
            MetadataJson = reminder.MetadataJson
        };
    }

    private static SmartReportJobSummaryResponse MapJob(AiSmartReportJob job)
    {
        return new SmartReportJobSummaryResponse
        {
            JobId = job.Id,
            Cadence = ToApiCadence(job.Cadence),
            Status = job.Status.ToString().ToLowerInvariant(),
            PeriodStartUtc = job.PeriodStartUtc,
            PeriodEndUtc = job.PeriodEndUtc,
            Title = job.Title,
            Summary = job.Summary,
            CreatedAt = job.CreatedAtUtc,
            CompletedAt = job.CompletedAtUtc,
            ErrorMessage = job.ErrorMessage
        };
    }

    private static string ToApiRuleType(ReminderRuleType ruleType)
    {
        return ruleType switch
        {
            ReminderRuleType.LowStock => "low_stock",
            ReminderRuleType.UpdateAvailable => "update_available",
            ReminderRuleType.SubscriptionFollowUp => "subscription_follow_up",
            ReminderRuleType.WeeklySmartReport => "weekly_report",
            ReminderRuleType.MonthlySmartReport => "monthly_report",
            _ => "low_stock"
        };
    }

    private static string ToApiEventType(ReminderEventType eventType)
    {
        return eventType switch
        {
            ReminderEventType.LowStockThresholdCrossed => "low_stock",
            ReminderEventType.UpdateAvailable => "update_available",
            ReminderEventType.SubscriptionFollowUp => "subscription_follow_up",
            ReminderEventType.WeeklyReportReady => "weekly_report_ready",
            ReminderEventType.MonthlyReportReady => "monthly_report_ready",
            _ => "low_stock"
        };
    }

    private static string ToApiCadence(AiSmartReportCadence cadence)
    {
        return cadence == AiSmartReportCadence.Monthly ? "monthly" : "weekly";
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string TruncateMessage(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength];
    }

    private static string? TruncateError(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private sealed record RuleEvaluationResult
    {
        public int CreatedEvents { get; init; }
        public int GeneratedReports { get; init; }
        public List<SmartReportJobSummaryResponse> Jobs { get; init; } = [];

        public static RuleEvaluationResult Empty { get; } = new();

        public static RuleEvaluationResult WithEvents(int createdEvents)
        {
            return new RuleEvaluationResult { CreatedEvents = createdEvents };
        }
    }
}
