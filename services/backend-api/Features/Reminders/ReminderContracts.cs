using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Reminders;

public sealed class ReminderRuleUpsertRequest
{
    [JsonPropertyName("reminder_type")]
    public string ReminderType { get; set; } = string.Empty;

    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    [JsonPropertyName("low_stock_threshold")]
    public decimal? LowStockThreshold { get; set; }

    [JsonPropertyName("snooze_minutes")]
    public int? SnoozeMinutes { get; set; }

    [JsonPropertyName("clear_snooze")]
    public bool ClearSnooze { get; set; }
}

public sealed class ReminderRuleResponse
{
    [JsonPropertyName("rule_id")]
    public Guid RuleId { get; set; }

    [JsonPropertyName("reminder_type")]
    public string ReminderType { get; set; } = string.Empty;

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }

    [JsonPropertyName("low_stock_threshold")]
    public decimal? LowStockThreshold { get; set; }

    [JsonPropertyName("snoozed_until")]
    public DateTimeOffset? SnoozedUntil { get; set; }

    [JsonPropertyName("last_evaluated_at")]
    public DateTimeOffset? LastEvaluatedAt { get; set; }

    [JsonPropertyName("last_triggered_at")]
    public DateTimeOffset? LastTriggeredAt { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class ReminderEventResponse
{
    [JsonPropertyName("reminder_id")]
    public Guid ReminderId { get; set; }

    [JsonPropertyName("rule_id")]
    public Guid? RuleId { get; set; }

    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("severity")]
    public string Severity { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("action_path")]
    public string? ActionPath { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("acknowledged_at")]
    public DateTimeOffset? AcknowledgedAt { get; set; }

    [JsonPropertyName("metadata_json")]
    public string? MetadataJson { get; set; }
}

public sealed class ReminderListResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; }

    [JsonPropertyName("open_count")]
    public int OpenCount { get; set; }

    [JsonPropertyName("items")]
    public List<ReminderEventResponse> Items { get; set; } = [];
}

public sealed class SmartReportJobSummaryResponse
{
    [JsonPropertyName("job_id")]
    public Guid JobId { get; set; }

    [JsonPropertyName("cadence")]
    public string Cadence { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("period_start_utc")]
    public DateTimeOffset PeriodStartUtc { get; set; }

    [JsonPropertyName("period_end_utc")]
    public DateTimeOffset PeriodEndUtc { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("summary")]
    public string? Summary { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }
}

public sealed class ReminderRunNowResponse
{
    [JsonPropertyName("executed_at")]
    public DateTimeOffset ExecutedAt { get; set; }

    [JsonPropertyName("processed_rules")]
    public int ProcessedRules { get; set; }

    [JsonPropertyName("skipped_rules")]
    public int SkippedRules { get; set; }

    [JsonPropertyName("created_events")]
    public int CreatedEvents { get; set; }

    [JsonPropertyName("generated_reports")]
    public int GeneratedReports { get; set; }

    [JsonPropertyName("jobs")]
    public List<SmartReportJobSummaryResponse> Jobs { get; set; } = [];
}
