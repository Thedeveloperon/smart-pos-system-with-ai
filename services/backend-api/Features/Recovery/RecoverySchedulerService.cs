using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Recovery;

public sealed class RecoverySchedulerService(
    IServiceScopeFactory scopeFactory,
    IOptions<RecoveryOpsOptions> optionsAccessor,
    ILogger<RecoverySchedulerService> logger)
    : BackgroundService
{
    private readonly RecoveryOpsOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled || !options.SchedulerEnabled)
        {
            logger.LogInformation("Recovery scheduler is disabled.");
            return;
        }

        if (options.SchedulerRunOnStartup)
        {
            await RunOnceSafeAsync(stoppingToken);
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(options.SchedulerIntervalSeconds, 60, 604_800));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            await RunOnceSafeAsync(stoppingToken);
        }
    }

    public async Task<RecoverySchedulerRunSummary> RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var recoveryOpsService = scope.ServiceProvider.GetRequiredService<RecoveryOpsService>();
        var startedAt = DateTimeOffset.UtcNow;

        RecoveryOperationResponse? preflightResponse = null;
        if (options.SchedulerRunPreflightFirst)
        {
            preflightResponse = await recoveryOpsService.RunPreflightAsync(
                new RecoveryRunPreflightRequest
                {
                    BackupMode = NormalizeOptional(options.SchedulerBackupMode),
                    SqliteDbPath = NormalizeOptional(options.SchedulerSqliteDbPath),
                    BackupRoot = NormalizeOptional(options.SchedulerBackupRootPath)
                },
                cancellationToken);
        }

        var backupResponse = await recoveryOpsService.RunBackupAsync(
            new RecoveryRunBackupRequest
            {
                BackupMode = NormalizeOptional(options.SchedulerBackupMode),
                SqliteDbPath = NormalizeOptional(options.SchedulerSqliteDbPath),
                BackupRoot = NormalizeOptional(options.SchedulerBackupRootPath),
                BackupTier = NormalizeOptional(options.SchedulerBackupTier)
            },
            cancellationToken);

        return new RecoverySchedulerRunSummary
        {
            StartedAt = startedAt,
            CompletedAt = DateTimeOffset.UtcNow,
            PreflightExecuted = preflightResponse is not null,
            PreflightResponse = preflightResponse,
            BackupResponse = backupResponse
        };
    }

    private async Task RunOnceSafeAsync(CancellationToken cancellationToken)
    {
        try
        {
            var summary = await RunOnceAsync(cancellationToken);
            logger.LogInformation(
                "Recovery scheduler run completed. preflight_executed={PreflightExecuted}, backup_status={BackupStatus}, backup_message={BackupMessage}",
                summary.PreflightExecuted,
                summary.BackupResponse.Status,
                summary.BackupResponse.Message);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (RecoveryException ex)
        {
            logger.LogWarning(
                "Recovery scheduler run failed with recovery error code {Code}: {Message}",
                ex.Code,
                ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Recovery scheduler run failed.");
        }
    }

    private static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}

public sealed class RecoverySchedulerRunSummary
{
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CompletedAt { get; init; } = DateTimeOffset.UtcNow;
    public bool PreflightExecuted { get; init; }
    public RecoveryOperationResponse? PreflightResponse { get; init; }
    public required RecoveryOperationResponse BackupResponse { get; init; }
}
