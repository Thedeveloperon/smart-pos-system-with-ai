namespace SmartPos.Backend.Features.Reminders;

public sealed class ReminderOptions
{
    public const string SectionName = "Reminders";

    public bool Enabled { get; set; } = true;
    public bool SchedulerEnabled { get; set; } = true;
    public int SchedulerIntervalSeconds { get; set; } = 300;
    public bool AutoSeedDefaultRules { get; set; } = true;
    public decimal DefaultLowStockThreshold { get; set; } = 10m;
    public int LowStockTake { get; set; } = 20;
    public string CurrentAppVersion { get; set; } = "1.0.0";
    public string LatestAppVersion { get; set; } = string.Empty;
    public string WeeklyReportDay { get; set; } = "Monday";
    public int MonthlyReportDay { get; set; } = 1;
}
