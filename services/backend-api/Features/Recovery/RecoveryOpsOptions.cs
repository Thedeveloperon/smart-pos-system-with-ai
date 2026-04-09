namespace SmartPos.Backend.Features.Recovery;

public sealed class RecoveryOpsOptions
{
    public const string SectionName = "RecoveryOps";

    public bool Enabled { get; set; } = true;
    public bool DryRun { get; set; } = false;
    public bool AllowCommandExecution { get; set; } = true;
    public int CommandTimeoutSeconds { get; set; } = 900;
    public string ShellCommand { get; set; } = "bash";
    public string? ScriptRootPath { get; set; }
    public string BackupScriptName { get; set; } = "backup-db.sh";
    public string RestoreSmokeScriptName { get; set; } = "restore-smoke-test.sh";
    public string PreflightScriptName { get; set; } = "preflight-report.sh";
    public string? BackupRootPath { get; set; }
    public string? MetricsFilePath { get; set; }
    public bool SchedulerEnabled { get; set; } = false;
    public int SchedulerIntervalSeconds { get; set; } = 21_600;
    public bool SchedulerRunOnStartup { get; set; } = false;
    public bool SchedulerRunPreflightFirst { get; set; } = true;
    public string? SchedulerBackupMode { get; set; } = "full";
    public string? SchedulerBackupTier { get; set; } = "daily";
    public string? SchedulerSqliteDbPath { get; set; }
    public string? SchedulerBackupRootPath { get; set; }
    public bool MetricsAlertingEnabled { get; set; } = false;
    public int MetricsAlertingIntervalSeconds { get; set; } = 300;
    public int MetricsAlertCooldownMinutes { get; set; } = 60;
    public int MaxRestoreDrillAgeHours { get; set; } = 168;
    public int RestoreDrillTargetRtoSeconds { get; set; } = 3_600;
    public int RestoreDrillTargetRpoSeconds { get; set; } = 21_600;
}
