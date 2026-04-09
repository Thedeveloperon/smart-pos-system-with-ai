using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicenseTokenSessionCleanupService(
    IServiceScopeFactory scopeFactory,
    IOptions<LicenseOptions> optionsAccessor,
    ILogger<LicenseTokenSessionCleanupService> logger)
    : BackgroundService
{
    private readonly LicenseOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Clamp(options.TokenJtiCleanupIntervalSeconds, 30, 3600));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupOnceAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "License token session cleanup failed.");
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

    internal async Task CleanupOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var now = DateTimeOffset.UtcNow;
        var retentionWindow = TimeSpan.FromHours(Math.Clamp(options.TokenJtiRetentionHours, 1, 168));
        var purgeBefore = now.Subtract(retentionWindow);

        List<LicenseRecord> scheduledRevocations;
        if (dbContext.Database.IsSqlite())
        {
            scheduledRevocations = (await dbContext.Licenses
                    .Where(x => x.Status == LicenseRecordStatus.Active &&
                                x.RevokedAtUtc.HasValue)
                    .ToListAsync(cancellationToken))
                .Where(x => x.RevokedAtUtc <= now)
                .ToList();
        }
        else
        {
            scheduledRevocations = await dbContext.Licenses
                .Where(x => x.Status == LicenseRecordStatus.Active &&
                            x.RevokedAtUtc.HasValue &&
                            x.RevokedAtUtc <= now)
                .ToListAsync(cancellationToken);
        }
        foreach (var license in scheduledRevocations)
        {
            license.Status = LicenseRecordStatus.Revoked;
        }

        List<LicenseTokenSession> expiredSessions;
        if (dbContext.Database.IsSqlite())
        {
            expiredSessions = (await dbContext.LicenseTokenSessions
                    .ToListAsync(cancellationToken))
                .Where(x => x.RejectAfterUtc <= purgeBefore)
                .ToList();
        }
        else
        {
            expiredSessions = await dbContext.LicenseTokenSessions
                .Where(x => x.RejectAfterUtc <= purgeBefore)
                .ToListAsync(cancellationToken);
        }
        if (expiredSessions.Count > 0)
        {
            dbContext.LicenseTokenSessions.RemoveRange(expiredSessions);
        }

        if (scheduledRevocations.Count > 0 || expiredSessions.Count > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
