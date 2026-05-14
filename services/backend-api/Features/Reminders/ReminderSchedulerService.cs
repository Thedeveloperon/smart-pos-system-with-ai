using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Reminders;

public sealed class ReminderSchedulerService(
    IServiceScopeFactory scopeFactory,
    IOptions<ReminderOptions> optionsAccessor,
    ILogger<ReminderSchedulerService> logger)
    : BackgroundService
{
    private readonly ReminderOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Clamp(options.SchedulerIntervalSeconds, 60, 86_400));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (options.Enabled && options.SchedulerEnabled)
                {
                    await RunOnceAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Reminder scheduler run failed.");
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

    internal async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var reminderService = scope.ServiceProvider.GetRequiredService<ReminderService>();
        await reminderService.RunScheduledAsync(cancellationToken);
    }
}
