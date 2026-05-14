using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiPrivacyGovernanceTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ChatMessage_ShouldPersistRedactedSensitiveInput()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 20m,
                purchase_reference = $"it-privacy-topup-{Guid.NewGuid():N}",
                description = "integration_test_privacy_redaction"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Privacy Redaction Session",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        var response = await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
        {
            message = "Check low stock. Contact me at owner@example.com or +94 77 123 4567.",
            usage_type = "quick_insights",
            idempotency_key = $"it-privacy-chat-{Guid.NewGuid():N}"
        });
        response.EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var userMessage = (await dbContext.AiConversationMessages
            .AsNoTracking()
            .Where(x => x.ConversationId == sessionId && x.Role == AiConversationMessageRole.User)
            .ToListAsync())
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefault();

        Assert.NotNull(userMessage);
        Assert.Contains("[redacted_email]", userMessage!.Content, StringComparison.Ordinal);
        Assert.Contains("[redacted_phone]", userMessage.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RetentionCleanup_ShouldDeleteExpiredChatPayload_AndRedactExpiredInsightPayload()
    {
        Guid conversationId;
        Guid messageId;
        Guid insightRequestId;

        await using (var seedScope = factory.Services.CreateAsyncScope())
        {
            var dbContext = seedScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var manager = await dbContext.Users.FirstAsync(x => x.Username == "manager");
            var staleAt = DateTimeOffset.UtcNow.AddDays(-40);

            var conversation = new AiConversation
            {
                UserId = manager.Id,
                Title = "Stale Privacy Conversation",
                DefaultUsageType = AiUsageType.QuickInsights,
                CreatedAtUtc = staleAt,
                UpdatedAtUtc = staleAt,
                LastMessageAtUtc = staleAt,
                User = manager
            };

            var message = new AiConversationMessage
            {
                ConversationId = conversation.Id,
                UserId = manager.Id,
                Role = AiConversationMessageRole.User,
                Status = AiConversationMessageStatus.Succeeded,
                UsageType = AiUsageType.QuickInsights,
                Content = "old content to purge",
                IdempotencyKey = $"privacy-stale-{Guid.NewGuid():N}",
                ReservedCredits = 0m,
                ChargedCredits = 0m,
                RefundedCredits = 0m,
                InputTokens = 0,
                OutputTokens = 0,
                CreatedAtUtc = staleAt,
                CompletedAtUtc = staleAt,
                Conversation = conversation,
                User = manager
            };

            var insight = new AiInsightRequest
            {
                UserId = manager.Id,
                IdempotencyKey = $"privacy-insight-{Guid.NewGuid():N}",
                Status = AiInsightRequestStatus.Succeeded,
                Provider = "local",
                Model = "local-pos-insights-v1",
                UsageType = AiUsageType.QuickInsights,
                PromptHash = Guid.NewGuid().ToString("N"),
                PromptCharCount = 12,
                ReservedCredits = 1m,
                ChargedCredits = 1m,
                InputTokens = 10,
                OutputTokens = 10,
                ResponseText = "sensitive insight payload",
                ErrorCode = null,
                ErrorMessage = null,
                CreatedAtUtc = staleAt,
                UpdatedAtUtc = staleAt,
                CompletedAtUtc = staleAt,
                User = manager
            };

            dbContext.AiConversations.Add(conversation);
            dbContext.AiConversationMessages.Add(message);
            dbContext.AiInsightRequests.Add(insight);
            await dbContext.SaveChangesAsync();

            conversationId = conversation.Id;
            messageId = message.Id;
            insightRequestId = insight.Id;
        }

        await using (var runScope = factory.Services.CreateAsyncScope())
        {
            var cleanupService = runScope.ServiceProvider.GetRequiredService<AiPrivacyRetentionCleanupService>();
            var summary = await cleanupService.RunOnceAsync(CancellationToken.None);

            Assert.True(summary.Executed);
            Assert.True(summary.DeletedMessages >= 1);
            Assert.True(summary.RedactedInsightRows >= 1);
        }

        await using (var verifyScope = factory.Services.CreateAsyncScope())
        {
            var dbContext = verifyScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

            var staleMessage = await dbContext.AiConversationMessages
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == messageId);
            Assert.Null(staleMessage);

            var staleConversation = await dbContext.AiConversations
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == conversationId);
            Assert.Null(staleConversation);

            var insight = await dbContext.AiInsightRequests
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == insightRequestId);
            Assert.NotNull(insight);
            Assert.True(string.IsNullOrWhiteSpace(insight!.ResponseText));
        }
    }
}
