using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Recovery;

public sealed class RecoveryRunPreflightRequest
{
    [JsonPropertyName("backup_mode")]
    public string? BackupMode { get; set; }

    [JsonPropertyName("restore_mode")]
    public string? RestoreMode { get; set; }

    [JsonPropertyName("sqlite_db_path")]
    public string? SqliteDbPath { get; set; }

    [JsonPropertyName("backup_root")]
    public string? BackupRoot { get; set; }
}

public sealed class RecoveryRunBackupRequest
{
    [JsonPropertyName("backup_mode")]
    public string? BackupMode { get; set; }

    [JsonPropertyName("sqlite_db_path")]
    public string? SqliteDbPath { get; set; }

    [JsonPropertyName("backup_root")]
    public string? BackupRoot { get; set; }

    [JsonPropertyName("backup_tier")]
    public string? BackupTier { get; set; }
}

public sealed class RecoveryRunRestoreSmokeRequest
{
    [JsonPropertyName("backup_file_path")]
    public string? BackupFilePath { get; set; }

    [JsonPropertyName("restore_mode")]
    public string? RestoreMode { get; set; }

    [JsonPropertyName("backup_root")]
    public string? BackupRoot { get; set; }

    [JsonPropertyName("metrics_file")]
    public string? MetricsFile { get; set; }
}

public sealed class RecoveryOperationResponse
{
    [JsonPropertyName("operation")]
    public string Operation { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "completed";

    [JsonPropertyName("started_at")]
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("completed_at")]
    public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("duration_ms")]
    public long DurationMs { get; set; }

    [JsonPropertyName("command")]
    public string? Command { get; set; }

    [JsonPropertyName("exit_code")]
    public int? ExitCode { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("output_tail")]
    public string? OutputTail { get; set; }

    [JsonPropertyName("resolved_backup_file")]
    public string? ResolvedBackupFile { get; set; }
}

public sealed class RecoveryStatusResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }

    [JsonPropertyName("dry_run")]
    public bool DryRun { get; set; }

    [JsonPropertyName("allow_command_execution")]
    public bool AllowCommandExecution { get; set; }

    [JsonPropertyName("script_root_path")]
    public string ScriptRootPath { get; set; } = string.Empty;

    [JsonPropertyName("backup_root_path")]
    public string BackupRootPath { get; set; } = string.Empty;

    [JsonPropertyName("metrics_file_path")]
    public string MetricsFilePath { get; set; } = string.Empty;

    [JsonPropertyName("latest_backup_file")]
    public string? LatestBackupFile { get; set; }

    [JsonPropertyName("last_restore_metric")]
    public RecoveryRestoreMetricRecord? LastRestoreMetric { get; set; }

    [JsonPropertyName("drill_health")]
    public RecoveryDrillHealthSnapshot DrillHealth { get; set; } = new();
}

public sealed class RecoveryRestoreMetricRecord
{
    [JsonPropertyName("timestamp_utc")]
    public DateTimeOffset? TimestampUtc { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("mode")]
    public string? Mode { get; set; }

    [JsonPropertyName("backup_file")]
    public string? BackupFile { get; set; }

    [JsonPropertyName("rto_seconds")]
    public long? RtoSeconds { get; set; }

    [JsonPropertyName("rpo_seconds")]
    public long? RpoSeconds { get; set; }

    [JsonPropertyName("users_count")]
    public long? UsersCount { get; set; }

    [JsonPropertyName("products_count")]
    public long? ProductsCount { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("created_at_utc")]
    public DateTimeOffset? CreatedAtUtc { get; set; }
}

public sealed class RecoveryDrillHealthSnapshot
{
    [JsonPropertyName("evaluated_at")]
    public DateTimeOffset EvaluatedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "unknown";

    [JsonPropertyName("monitoring_enabled")]
    public bool MonitoringEnabled { get; set; }

    [JsonPropertyName("metrics_file_path")]
    public string MetricsFilePath { get; set; } = string.Empty;

    [JsonPropertyName("metrics_file_exists")]
    public bool MetricsFileExists { get; set; }

    [JsonPropertyName("last_restore_metric")]
    public RecoveryRestoreMetricRecord? LastRestoreMetric { get; set; }

    [JsonPropertyName("issues")]
    public List<string> Issues { get; set; } = [];

    [JsonPropertyName("max_restore_drill_age_hours")]
    public int MaxRestoreDrillAgeHours { get; set; }

    [JsonPropertyName("target_rto_seconds")]
    public int TargetRtoSeconds { get; set; }

    [JsonPropertyName("target_rpo_seconds")]
    public int TargetRpoSeconds { get; set; }
}

public sealed class RecoveryErrorPayload
{
    [JsonPropertyName("error")]
    public required RecoveryErrorItem Error { get; set; }
}

public sealed class RecoveryErrorItem
{
    [JsonPropertyName("code")]
    public required string Code { get; set; }

    [JsonPropertyName("message")]
    public required string Message { get; set; }
}

internal sealed class RecoveryException(string code, string message, int statusCode = StatusCodes.Status400BadRequest)
    : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

internal static class RecoveryErrorCodes
{
    public const string RecoveryDisabled = "RECOVERY_DISABLED";
    public const string RecoveryExecutionDisabled = "RECOVERY_EXECUTION_DISABLED";
    public const string InvalidRequest = "RECOVERY_INVALID_REQUEST";
    public const string ScriptNotFound = "RECOVERY_SCRIPT_NOT_FOUND";
    public const string BackupFileNotFound = "RECOVERY_BACKUP_FILE_NOT_FOUND";
    public const string ShellUnavailable = "RECOVERY_SHELL_UNAVAILABLE";
    public const string ProcessFailed = "RECOVERY_PROCESS_FAILED";
    public const string ProcessTimeout = "RECOVERY_PROCESS_TIMEOUT";
}
