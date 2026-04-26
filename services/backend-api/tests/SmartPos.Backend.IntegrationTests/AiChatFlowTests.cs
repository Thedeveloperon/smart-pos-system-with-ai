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
        Assert.Contains(citationKeys, key => key.StartsWith("reports.low_stock", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(citationKeys, key => key.StartsWith("reports.worst_items", StringComparison.OrdinalIgnoreCase));

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
    public async Task ChatMessage_FollowUp_ShouldIncreasePromptContextForSecondTurn()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 50m,
                purchase_reference = $"it-chat-context-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_context_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Context Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "Which items should I reorder now?",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-context-1-{Guid.NewGuid():N}"
            }));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "Which of those needs reorder first?",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-context-2-{Guid.NewGuid():N}"
            }));

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var requests = (await dbContext.AiInsightRequests
            .AsNoTracking()
            .Where(x => x.IdempotencyKey.StartsWith($"chat-{sessionId:N}-"))
            .Select(x => new { x.CreatedAtUtc, x.PromptCharCount })
            .ToListAsync())
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => x.PromptCharCount)
            .ToList();

        Assert.True(requests.Count >= 2);
        Assert.True(requests[1] > requests[0], "Expected second-turn prompt to include prior conversation context.");
    }

    [Fact]
    public async Task ChatMessage_LongConversation_ShouldCapPromptHistoryGrowth()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 120m,
                purchase_reference = $"it-chat-context-cap-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_context_cap_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Context Cap Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        for (var index = 0; index < 12; index++)
        {
            await TestJson.ReadObjectAsync(
                await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
                {
                    message = "Which items should I reorder now?",
                    usage_type = "quick_insights",
                    idempotency_key = $"it-chat-context-cap-{index}-{Guid.NewGuid():N}"
                }));
        }

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var promptSizes = (await dbContext.AiInsightRequests
            .AsNoTracking()
            .Where(x => x.IdempotencyKey.StartsWith($"chat-{sessionId:N}-"))
            .Select(x => new { x.CreatedAtUtc, x.PromptCharCount })
            .ToListAsync())
            .OrderBy(x => x.CreatedAtUtc)
            .Select(x => x.PromptCharCount)
            .ToList();

        Assert.True(promptSizes.Count >= 12);

        var stabilizedWindow = promptSizes.TakeLast(3).ToList();
        var spread = stabilizedWindow.Max() - stabilizedWindow.Min();

        Assert.True(spread < 500, "Expected prompt growth to stabilize after the recent-history cap is reached.");
    }

    [Fact]
    public async Task ChatMessage_InSinhala_ShouldReturnSinhalaAssistantContent()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = $"it-chat-sinhala-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_sinhala_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Sinhala Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        var messagePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "අද විකුණුම් සාරාංශය දෙන්න.",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-sinhala-{Guid.NewGuid():N}"
            }));

        var assistant = messagePayload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var assistantContent = TestJson.GetString(assistant, "content");

        Assert.Contains("සාරාංශය:", assistantContent, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ChatMessage_InEnglish_ShouldReturnEnglishAssistantContent()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = $"it-chat-english-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_english_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "English Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        var messagePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "Give me a summary of today's sales.",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-english-{Guid.NewGuid():N}"
            }));

        var assistant = messagePayload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var assistantContent = TestJson.GetString(assistant, "content");

        Assert.Contains("Summary:", assistantContent, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ChatMessage_InTamil_ShouldReturnTamilAssistantContent()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = $"it-chat-tamil-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_tamil_topup"
            }));

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Tamil Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        var messagePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = "இன்றைய விற்பனை சுருக்கத்தை கூறு.",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-tamil-{Guid.NewGuid():N}"
            }));

        var assistant = messagePayload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var assistantContent = TestJson.GetString(assistant, "content");

        Assert.Contains("சுருக்கம்:", assistantContent, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ChatMessageStream_ShouldEmitStartDeltaAndCompleteEvents()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = $"it-chat-stream-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_stream_topup"
            }));
        var startingWalletPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        var startingCredits = TestJson.GetDecimal(startingWalletPayload, "available_credits");

        var sessionPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = "Stream Check",
                usage_type = "quick_insights"
            }));
        var sessionId = Guid.Parse(TestJson.GetString(sessionPayload, "session_id"));

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/ai/chat/sessions/{sessionId}/messages/stream")
        {
            Content = JsonContent.Create(new
            {
                message = "Give me a short summary of today's sales.",
                usage_type = "quick_insights",
                idempotency_key = $"it-chat-stream-{Guid.NewGuid():N}"
            })
        };

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        var streamBody = await response.Content.ReadAsStringAsync();

        Assert.Contains("\"type\":\"start\"", streamBody, StringComparison.Ordinal);
        Assert.Contains("\"type\":\"delta\"", streamBody, StringComparison.Ordinal);
        Assert.Contains("\"type\":\"complete\"", streamBody, StringComparison.Ordinal);

        var sessionDetailResponse = await client.GetAsync($"/api/ai/chat/sessions/{sessionId}?take=20");
        sessionDetailResponse.EnsureSuccessStatusCode();
        var sessionDetailPayload = await sessionDetailResponse.Content.ReadFromJsonAsync<JsonObject>();
        var messages = sessionDetailPayload?["messages"]?.AsArray()
                       ?? throw new InvalidOperationException("messages not found.");
        Assert.True(messages.Count >= 2);

        var endingWalletPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        var endingCredits = TestJson.GetDecimal(endingWalletPayload, "available_credits");
        Assert.True(endingCredits < startingCredits);
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

    [Fact]
    public async Task ChatSession_WithCashierRole_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsCashierAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/chat/sessions", new
        {
            title = "Cashier should not access AI",
            usage_type = "quick_insights"
        });

        Assert.Equal(System.Net.HttpStatusCode.Forbidden, response.StatusCode);
    }
}
