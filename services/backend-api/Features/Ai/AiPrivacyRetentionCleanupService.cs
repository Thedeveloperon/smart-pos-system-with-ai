using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiPrivacyRetentionCleanupService(
    IServiceScopeFactory scopeFactory,
    IOptions<AiInsightOptions> optionsAccessor,
    ILogger<AiPrivacyRetentionCleanupService> logger)
    : BackgroundService
{
    private readonly AiInsightOptions options = optionsAccessor.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var retention = options.Privacy.Retention;
        if (!retention.Enabled)
        {
            logger.LogInformation("AI privacy retention cleanup is disabled.");
            return;
        }

        if (retention.RunOnStartup)
        {
            await RunOnceSafeAsync(stoppingToken);
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(retention.CleanupIntervalSeconds, 60, 86_400));
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

    public async Task<AiPrivacyRetentionCleanupSummary> RunOnceAsync(CancellationToken cancellationToken)
    {
        var retention = options.Privacy.Retention;
        if (!retention.Enabled)
        {
            return new AiPrivacyRetentionCleanupSummary
            {
                Executed = false
            };
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var now = DateTimeOffset.UtcNow;

        var chatRetentionCutoff = now.AddDays(-Math.Clamp(retention.ChatMessageRetentionDays, 1, 3650));
        var conversationRetentionCutoff = now.AddDays(-Math.Clamp(retention.ConversationRetentionDays, 1, 3650));
        var succeededRetentionCutoff = now.AddDays(-Math.Clamp(retention.InsightSucceededRetentionDays, 1, 3650));
        var failedRetentionCutoff = now.AddDays(-Math.Clamp(retention.InsightFailedRetentionDays, 1, 3650));

        var staleMessages = await LoadStaleMessagesAsync(dbContext, chatRetentionCutoff, cancellationToken);
        if (staleMessages.Count > 0)
        {
            dbContext.AiConversationMessages.RemoveRange(staleMessages);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var staleConversations = await LoadStaleConversationsAsync(dbContext, conversationRetentionCutoff, cancellationToken);
        if (staleConversations.Count > 0)
        {
            dbContext.AiConversations.RemoveRange(staleConversations);
        }

        var insightPayloadRowsRedacted = await RedactStaleInsightPayloadsAsync(
            dbContext,
            succeededRetentionCutoff,
            failedRetentionCutoff,
            cancellationToken);

        if (staleConversations.Count > 0 || insightPayloadRowsRedacted > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AiPrivacyRetentionCleanupSummary
        {
            Executed = true,
            StartedAt = now,
            CompletedAt = DateTimeOffset.UtcNow,
            DeletedMessages = staleMessages.Count,
            DeletedConversations = staleConversations.Count,
            RedactedInsightRows = insightPayloadRowsRedacted
        };
    }

    private async Task RunOnceSafeAsync(CancellationToken cancellationToken)
    {
        try
        {
            var summary = await RunOnceAsync(cancellationToken);
            if (!summary.Executed)
            {
                return;
            }

            logger.LogInformation(
                "AI privacy retention cleanup completed. deleted_messages={DeletedMessages}, deleted_conversations={DeletedConversations}, redacted_insight_rows={RedactedInsightRows}",
                summary.DeletedMessages,
                summary.DeletedConversations,
                summary.RedactedInsightRows);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "AI privacy retention cleanup failed.");
        }
    }

    private static async Task<List<AiConversationMessage>> LoadStaleMessagesAsync(
        SmartPosDbContext dbContext,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsSqlite())
        {
            return (await dbContext.AiConversationMessages
                    .ToListAsync(cancellationToken))
                .Where(x => x.CreatedAtUtc <= cutoff)
                .ToList();
        }

        return await dbContext.AiConversationMessages
            .Where(x => x.CreatedAtUtc <= cutoff)
            .ToListAsync(cancellationToken);
    }

    private static async Task<List<AiConversation>> LoadStaleConversationsAsync(
        SmartPosDbContext dbContext,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        List<Guid> conversationIdsWithMessages;
        if (dbContext.Database.IsSqlite())
        {
            conversationIdsWithMessages = (await dbContext.AiConversationMessages
                    .Select(x => x.ConversationId)
                    .ToListAsync(cancellationToken))
                .Distinct()
                .ToList();

            return (await dbContext.AiConversations
                    .ToListAsync(cancellationToken))
                .Where(x =>
                    x.UpdatedAtUtc <= cutoff &&
                    !conversationIdsWithMessages.Contains(x.Id))
                .ToList();
        }

        conversationIdsWithMessages = await dbContext.AiConversationMessages
            .Select(x => x.ConversationId)
            .Distinct()
            .ToListAsync(cancellationToken);

        return await dbContext.AiConversations
            .Where(x => x.UpdatedAtUtc <= cutoff && !conversationIdsWithMessages.Contains(x.Id))
            .ToListAsync(cancellationToken);
    }

    private static async Task<int> RedactStaleInsightPayloadsAsync(
        SmartPosDbContext dbContext,
        DateTimeOffset succeededCutoff,
        DateTimeOffset failedCutoff,
        CancellationToken cancellationToken)
    {
        List<AiInsightRequest> candidates;
        if (dbContext.Database.IsSqlite())
        {
            candidates = (await dbContext.AiInsightRequests
                    .ToListAsync(cancellationToken))
                .Where(x => !string.IsNullOrWhiteSpace(x.ResponseText) || !string.IsNullOrWhiteSpace(x.ErrorMessage))
                .ToList();
        }
        else
        {
            candidates = await dbContext.AiInsightRequests
                .Where(x => x.ResponseText != null || x.ErrorMessage != null)
                .ToListAsync(cancellationToken);
        }

        var changed = 0;
        foreach (var candidate in candidates)
        {
            var shouldRedact = candidate.Status switch
            {
                AiInsightRequestStatus.Succeeded => candidate.CreatedAtUtc <= succeededCutoff,
                AiInsightRequestStatus.Failed => candidate.CreatedAtUtc <= failedCutoff,
                _ => false
            };

            if (!shouldRedact)
            {
                continue;
            }

            var hasSensitivePayload =
                !string.IsNullOrWhiteSpace(candidate.ResponseText) ||
                !string.IsNullOrWhiteSpace(candidate.ErrorMessage);
            if (!hasSensitivePayload)
            {
                continue;
            }

            candidate.ResponseText = null;
            candidate.ErrorMessage = null;
            candidate.UpdatedAtUtc = DateTimeOffset.UtcNow;
            changed++;
        }

        return changed;
    }
}

public sealed class AiPrivacyRetentionCleanupSummary
{
    public bool Executed { get; init; }
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CompletedAt { get; init; } = DateTimeOffset.UtcNow;
    public int DeletedMessages { get; init; }
    public int DeletedConversations { get; init; }
    public int RedactedInsightRows { get; init; }
}
