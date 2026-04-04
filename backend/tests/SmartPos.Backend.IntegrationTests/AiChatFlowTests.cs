using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiChatFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ChatMessage_ShouldReturnGroundedCitations_AndChargeCredits()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 50m,
                purchase_reference = $"it-chat-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Operations Copilot",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        var messagePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "What are the low stock and worst-selling items this week?",
                usage_type = "advanced_analysis",
                idempotency_key = $"it-chat-message-{Guid.NewGuid():N}"
            }));

        var assistant = messagePayload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var citations = assistant["citations"]?.AsArray()
                        ?? throw new InvalidOperationException("citations not found.");

        Assert.Equal("succeeded", TestJson.GetString(assistant, "status"));
        Assert.Equal("advanced_analysis", TestJson.GetString(assistant, "usage_type"));
        Assert.True(TestJson.GetDecimal(assistant, "charged_credits") > 0m);
        Assert.True(citations.Count >= 2);

        var citationKeys = citations
            .Select(x => x?["bucket_key"]?.GetValue<string>() ?? string.Empty)
            .ToList();
        Assert.Contains("reports.low_stock.threshold_10", citationKeys);
        Assert.Contains("reports.worst_items.last_7_days", citationKeys);

        var sessionDetailResponse = await client.GetAsync($"/api/ai/chat/sessions/{sessionId}?take=20");
        sessionDetailResponse.EnsureSuccessStatusCode();
        var sessionDetailPayload = await sessionDetailResponse.Content.ReadFromJsonAsync<JsonObject>();
        var messages = sessionDetailPayload?["messages"]?.AsArray()
                       ?? throw new InvalidOperationException("messages not found.");
        Assert.True(messages.Count >= 2);
    }

    [Fact]
    public async Task ChatMessage_WithSameIdempotency_ShouldReplayWithoutExtraCharges()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = $"it-chat-replay-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_replay_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Replay Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));
        var idempotencyKey = $"it-chat-replay-{Guid.NewGuid():N}";

        var firstPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "Give a short forecast for next month.",
                usage_type = "smart_reports",
                idempotency_key = idempotencyKey
            }));

        var secondPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "Give a short forecast for next month.",
                usage_type = "smart_reports",
                idempotency_key = idempotencyKey
            }));

        var firstAssistant = firstPayload["assistant_message"]?.AsObject()
                             ?? throw new InvalidOperationException("assistant_message not found.");
        var secondAssistant = secondPayload["assistant_message"]?.AsObject()
                              ?? throw new InvalidOperationException("assistant_message not found.");

        var firstMessageId = TestJson.GetString(firstAssistant, "message_id");
        var secondMessageId = TestJson.GetString(secondAssistant, "message_id");
        Assert.Equal(firstMessageId, secondMessageId);

        var aiInsightIdempotency = $"chat-{sessionId:N}-{idempotencyKey}";

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var insightRequestCount = await dbContext.AiInsightRequests
            .CountAsync(x => x.IdempotencyKey == aiInsightIdempotency);
        Assert.Equal(1, insightRequestCount);

        var conversationMessageCount = await dbContext.AiConversationMessages
            .CountAsync(x => x.ConversationId == sessionId && x.IdempotencyKey == idempotencyKey);
        Assert.Equal(2, conversationMessageCount);
    }

    [Fact]
    public async Task ReportEndpoints_ShouldExposeWorstItems_AndMonthlyForecast()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var worstResponse = await client.GetAsync("/api/reports/worst-items?take=5");
        worstResponse.EnsureSuccessStatusCode();
        var worstPayload = await worstResponse.Content.ReadFromJsonAsync<JsonObject>();

        Assert.NotNull(worstPayload);
        Assert.NotNull(worstPayload!["items"]?.AsArray());

        var forecastResponse = await client.GetAsync("/api/reports/monthly-forecast?months=6");
        forecastResponse.EnsureSuccessStatusCode();
        var forecastPayload = await forecastResponse.Content.ReadFromJsonAsync<JsonObject>();

        Assert.NotNull(forecastPayload);
        Assert.NotNull(forecastPayload!["items"]?.AsArray());
        Assert.False(string.IsNullOrWhiteSpace(forecastPayload["confidence"]?.GetValue<string>()));
    }
}
