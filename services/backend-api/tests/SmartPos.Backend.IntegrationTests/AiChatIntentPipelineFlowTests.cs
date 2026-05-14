using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiChatIntentPipelineFlowTests(AiChatIntentPipelineWebApplicationFactory factory)
    : IClassFixture<AiChatIntentPipelineWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Theory]
    [InlineData("Which items are currently low in stock?", "reports.low_stock.threshold_10")]
    [InlineData("Compare this week's sales with last week.", "reports.sales.compare.")]
    [InlineData("What items did we buy from supplier this month?", "reports.low_stock.by_supplier.threshold_10")]
    [InlineData("What is the profit margin of Ballpoint Pen?", "reports.margin.")]
    [InlineData("Which cashier handled the most transactions today?", "reports.cashier.leaderboard.")]
    [InlineData("Show me today's business performance summary.", "reports.summary.sales.")]
    public async Task ChatMessage_WithIntentPipelineEnabled_ShouldReturnGroundedCitationsForCoreCategories(
        string question,
        string expectedCitationKeyPrefix)
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline core categories");
        var payload = await PostMessageAsync(
            sessionId,
            question,
            usageType: "advanced_analysis");
        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var citations = assistant["citations"]?.AsArray()
                        ?? throw new InvalidOperationException("citations not found.");

        Assert.Equal("succeeded", TestJson.GetString(assistant, "status"));
        Assert.True(TestJson.GetDecimal(assistant, "charged_credits") > 0m);
        Assert.Contains(citations, node =>
        {
            var bucketKey = node?["bucket_key"]?.GetValue<string>() ?? string.Empty;
            return bucketKey.StartsWith(expectedCitationKeyPrefix, StringComparison.OrdinalIgnoreCase);
        });
    }

    [Theory]
    [InlineData("Who are the top customers this month?", "Customer-related questions are not supported in POS chatbot V1.")]
    [InlineData("Show unusual sales activity today.", "Alerts and exception questions are not supported in POS chatbot V1.")]
    public async Task ChatMessage_WithUnsupportedCategories_ShouldReturnExplicitLimitation(
        string question,
        string expectedPrefix)
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline unsupported");
        var payload = await PostMessageAsync(
            sessionId,
            question,
            usageType: "quick_insights");
        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var content = TestJson.GetString(assistant, "content");
        var citations = assistant["citations"]?.AsArray()
                        ?? throw new InvalidOperationException("citations not found.");

        Assert.StartsWith(expectedPrefix, content, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(citations, node =>
            string.Equals(
                node?["bucket_key"]?.GetValue<string>(),
                "chatbot.v1.unsupported",
                StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ChatMessage_LowStockFaq_ShouldReturnStockTableBlock()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline structured stock");
        var payload = await PostMessageAsync(
            sessionId,
            "What are the low stock items?",
            usageType: "quick_insights");

        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var blocks = assistant["blocks"]?.AsArray()
                     ?? throw new InvalidOperationException("blocks not found.");
        Assert.True(blocks.Count > 0, $"assistant payload: {assistant.ToJsonString()}");

        var stockBlock = blocks
            .Select(node => node?.AsObject())
            .FirstOrDefault(node => string.Equals(
                node?["type"]?.GetValue<string>(),
                "stock_table",
                StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(stockBlock);

        var rows = stockBlock!["stock_table"]?["rows"]?.AsArray()
                   ?? throw new InvalidOperationException("stock_table rows not found.");
        Assert.NotEmpty(rows);
    }

    [Fact]
    public async Task ChatMessage_DailySalesSummaryFaq_ShouldReturnSalesKpiBlock()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline structured sales");
        var payload = await PostMessageAsync(
            sessionId,
            "Show daily sales summary",
            usageType: "quick_insights");

        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var blocks = assistant["blocks"]?.AsArray()
                     ?? throw new InvalidOperationException("blocks not found.");
        Assert.NotEmpty(blocks);

        var salesBlock = blocks
            .Select(node => node?.AsObject())
            .FirstOrDefault(node => string.Equals(
                node?["type"]?.GetValue<string>(),
                "sales_kpi",
                StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(salesBlock);

        var payloadNode = salesBlock!["sales_kpi"]?.AsObject()
                          ?? throw new InvalidOperationException("sales_kpi payload not found.");
        Assert.NotNull(payloadNode["revenue"]);
        Assert.NotNull(payloadNode["transactions"]);
        Assert.NotNull(payloadNode["average_basket"]);
        Assert.NotNull(payloadNode["trend_percent"]);
    }

    [Fact]
    public async Task ChatMessage_NonTemplatedQuestion_ShouldReturnEmptyBlocks()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline fallback blocks");
        var payload = await PostMessageAsync(
            sessionId,
            "Which cashier handled the most transactions today?",
            usageType: "quick_insights");

        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var blocks = assistant["blocks"]?.AsArray()
                     ?? throw new InvalidOperationException("blocks not found.");
        Assert.Empty(blocks);
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(assistant, "content")));
    }

    [Fact]
    public async Task ChatMessage_WhenEntityMatchMissing_ShouldIncludeDeterministicMissingDataSection()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline missing data");
        var payload = await PostMessageAsync(
            sessionId,
            "What is the stock count of item zz_missing_item_2026?",
            usageType: "quick_insights");
        var assistant = payload["assistant_message"]?.AsObject()
                        ?? throw new InvalidOperationException("assistant_message not found.");
        var content = TestJson.GetString(assistant, "content");

        Assert.Contains("Missing data:", content, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("could not be matched", content, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ChatMessage_WithIntentPipelineEnabled_AndSameIdempotency_ShouldReplayWithoutExtraAiRequest()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline replay");
        var idempotencyKey = $"it-chat-intent-replay-{Guid.NewGuid():N}";

        var firstPayload = await PostMessageAsync(
            sessionId,
            "Show daily sales summary",
            usageType: "smart_reports",
            idempotencyKey: idempotencyKey);
        var secondPayload = await PostMessageAsync(
            sessionId,
            "Show daily sales summary",
            usageType: "smart_reports",
            idempotencyKey: idempotencyKey);

        var firstAssistant = firstPayload["assistant_message"]?.AsObject()
                             ?? throw new InvalidOperationException("assistant_message not found.");
        var secondAssistant = secondPayload["assistant_message"]?.AsObject()
                              ?? throw new InvalidOperationException("assistant_message not found.");
        Assert.Equal(
            TestJson.GetString(firstAssistant, "message_id"),
            TestJson.GetString(secondAssistant, "message_id"));
        Assert.Equal(
            firstAssistant["blocks"]?.ToJsonString(),
            secondAssistant["blocks"]?.ToJsonString());

        var aiInsightIdempotency = $"chat-{sessionId:N}-{idempotencyKey}";

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var insightRequestCount = await dbContext.AiInsightRequests
            .CountAsync(x => x.IdempotencyKey == aiInsightIdempotency);
        Assert.Equal(1, insightRequestCount);
    }

    [Fact]
    public async Task ChatSessionHistory_ShouldIncludePersistedBlocks()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await TopUpCreditsAsync();

        var sessionId = await CreateSessionAsync("Intent pipeline history blocks");
        await PostMessageAsync(
            sessionId,
            "What are the low stock items?",
            usageType: "quick_insights");

        var sessionResponse = await client.GetAsync($"/api/ai/chat/sessions/{sessionId}?take=20");
        sessionResponse.EnsureSuccessStatusCode();
        var sessionPayload = await sessionResponse.Content.ReadFromJsonAsync<JsonObject>();
        var messages = sessionPayload?["messages"]?.AsArray()
                       ?? throw new InvalidOperationException("messages not found.");

        var assistantMessage = messages
            .Select(node => node?.AsObject())
            .FirstOrDefault(node => string.Equals(
                node?["role"]?.GetValue<string>(),
                "assistant",
                StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("assistant message not found.");

        var blocks = assistantMessage["blocks"]?.AsArray()
                     ?? throw new InvalidOperationException("blocks not found.");
        Assert.NotEmpty(blocks);
    }

    private async Task TopUpCreditsAsync()
    {
        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 80m,
                purchase_reference = $"it-chat-intent-topup-{Guid.NewGuid():N}",
                description = "integration_test_chat_intent_topup"
            }));
    }

    private async Task<Guid> CreateSessionAsync(string title)
    {
        var payload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/chat/sessions", new
            {
                title = title,
                usage_type = "quick_insights"
            }));
        return Guid.Parse(TestJson.GetString(payload, "session_id"));
    }

    private async Task<JsonObject> PostMessageAsync(
        Guid sessionId,
        string message,
        string usageType,
        string? idempotencyKey = null)
    {
        return await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/ai/chat/sessions/{sessionId}/messages", new
            {
                message = message,
                usage_type = usageType,
                idempotency_key = idempotencyKey ?? $"it-chat-intent-{Guid.NewGuid():N}"
            }));
    }
}
