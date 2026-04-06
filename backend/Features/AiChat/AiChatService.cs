using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.AiChat.IntentPipeline;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.AiChat;

public sealed class AiChatService(
    SmartPosDbContext dbContext,
    AiInsightService aiInsightService,
    AiCreditBillingService creditBillingService,
    IOptions<AiInsightOptions> aiInsightOptions,
    AiChatGroundingOrchestrator groundingOrchestrator,
    ReportService reportService,
    ILogger<AiChatService> logger)
{
    private const string UsageTypeQuickInsights = "quick_insights";
    private const string UsageTypeAdvancedAnalysis = "advanced_analysis";
    private const string UsageTypeSmartReports = "smart_reports";

    public async Task<AiChatSessionSummaryResponse> CreateSessionAsync(
        Guid userId,
        AiChatCreateSessionRequest request,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var title = NormalizeSessionTitle(request.Title, now);
        var usageType = ResolveUsageType(request.UsageType, fallback: AiUsageType.QuickInsights);

        var conversation = new AiConversation
        {
            UserId = userId,
            Title = title,
            DefaultUsageType = usageType,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            LastMessageAtUtc = null,
            User = await ResolveUserAsync(userId, cancellationToken)
        };

        dbContext.AiConversations.Add(conversation);
        await dbContext.SaveChangesAsync(cancellationToken);

        return MapSessionSummary(conversation, 0);
    }

    public async Task<AiChatHistoryResponse> GetHistoryAsync(
        Guid userId,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 100);
        List<AiConversation> conversations;

        if (dbContext.Database.IsSqlite())
        {
            conversations = (await dbContext.AiConversations
                    .AsNoTracking()
                    .Where(x => x.UserId == userId)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.UpdatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            conversations = await dbContext.AiConversations
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.UpdatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var conversationIds = conversations.Select(x => x.Id).ToList();
        var messageCounts = conversationIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await dbContext.AiConversationMessages
                .AsNoTracking()
                .Where(x => conversationIds.Contains(x.ConversationId))
                .GroupBy(x => x.ConversationId)
                .Select(x => new { x.Key, Count = x.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        return new AiChatHistoryResponse
        {
            Items = conversations
                .Select(x => MapSessionSummary(
                    x,
                    messageCounts.TryGetValue(x.Id, out var count) ? count : 0))
                .ToList()
        };
    }

    public async Task<AiChatSessionDetailResponse> GetSessionAsync(
        Guid userId,
        Guid sessionId,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);

        var conversation = await dbContext.AiConversations
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == sessionId && x.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Chat session was not found.");

        List<AiConversationMessage> messages;
        if (dbContext.Database.IsSqlite())
        {
            messages = (await dbContext.AiConversationMessages
                    .AsNoTracking()
                    .Where(x => x.ConversationId == sessionId)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .OrderBy(x => x.CreatedAtUtc)
                .ToList();
        }
        else
        {
            messages = await dbContext.AiConversationMessages
                .AsNoTracking()
                .Where(x => x.ConversationId == sessionId)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
            messages = messages
                .OrderBy(x => x.CreatedAtUtc)
                .ToList();
        }

        var messageCount = await dbContext.AiConversationMessages
            .AsNoTracking()
            .CountAsync(x => x.ConversationId == sessionId, cancellationToken);

        return new AiChatSessionDetailResponse
        {
            Session = MapSessionSummary(conversation, messageCount),
            Messages = messages.Select(MapMessageResponse).ToList()
        };
    }

    public async Task<AiChatPostMessageResponse> PostMessageAsync(
        Guid userId,
        Guid sessionId,
        AiChatMessageCreateRequest request,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        var conversation = await dbContext.AiConversations
            .FirstOrDefaultAsync(x => x.Id == sessionId && x.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Chat session was not found.");

        var normalizedMessage = NormalizeMessage(request.Message);
        var normalizedIdempotencyKey = NormalizeOptionalIdempotencyKey(request.IdempotencyKey)
                                     ?? NormalizeOptionalIdempotencyKey(idempotencyKey)
                                     ?? $"chat-{Guid.NewGuid():N}";

        AiConversationMessage? existingAssistantMessage;
        var existingAssistantQuery = dbContext.AiConversationMessages
            .AsNoTracking()
            .Where(x => x.ConversationId == sessionId &&
                        x.Role == AiConversationMessageRole.Assistant &&
                        x.IdempotencyKey == normalizedIdempotencyKey);
        if (dbContext.Database.IsSqlite())
        {
            existingAssistantMessage = (await existingAssistantQuery.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();
        }
        else
        {
            existingAssistantMessage = await existingAssistantQuery
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }
        if (existingAssistantMessage is not null)
        {
            AiConversationMessage? existingUserMessage;
            var existingUserQuery = dbContext.AiConversationMessages
                .AsNoTracking()
                .Where(x => x.ConversationId == sessionId &&
                            x.Role == AiConversationMessageRole.User &&
                            x.IdempotencyKey == normalizedIdempotencyKey);
            if (dbContext.Database.IsSqlite())
            {
                existingUserMessage = (await existingUserQuery.ToListAsync(cancellationToken))
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .FirstOrDefault();
            }
            else
            {
                existingUserMessage = await existingUserQuery
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .FirstOrDefaultAsync(cancellationToken);
            }
            var wallet = await creditBillingService.GetWalletAsync(userId, cancellationToken);
            var messageCount = await dbContext.AiConversationMessages
                .AsNoTracking()
                .CountAsync(x => x.ConversationId == sessionId, cancellationToken);

            return new AiChatPostMessageResponse
            {
                Session = MapSessionSummary(conversation, messageCount),
                UserMessage = existingUserMessage is null
                    ? BuildSyntheticUserReplayMessage(normalizedMessage)
                    : MapMessageResponse(existingUserMessage),
                AssistantMessage = MapMessageResponse(existingAssistantMessage),
                RemainingCredits = wallet.AvailableCredits
            };
        }

        var usageType = ResolveUsageType(request.UsageType, fallback: conversation.DefaultUsageType);
        var now = DateTimeOffset.UtcNow;

        var userMessage = new AiConversationMessage
        {
            ConversationId = conversation.Id,
            UserId = userId,
            Role = AiConversationMessageRole.User,
            Status = AiConversationMessageStatus.Succeeded,
            UsageType = usageType,
            Content = normalizedMessage,
            IdempotencyKey = normalizedIdempotencyKey,
            Confidence = null,
            CitationsJson = null,
            ReservedCredits = 0m,
            ChargedCredits = 0m,
            RefundedCredits = 0m,
            InputTokens = 0,
            OutputTokens = 0,
            CreatedAtUtc = now,
            CompletedAtUtc = now,
            ErrorCode = null,
            ErrorMessage = null,
            Conversation = conversation,
            User = await ResolveUserAsync(userId, cancellationToken)
        };

        dbContext.AiConversationMessages.Add(userMessage);

        try
        {
            var grounding = await BuildGroundingSnapshotAsync(normalizedMessage, cancellationToken);
            var aiPrompt = BuildAiPrompt(normalizedMessage, grounding);
            var aiIdempotencyKey = BuildAiInsightIdempotencyKey(conversation.Id, normalizedIdempotencyKey);
            var insight = await aiInsightService.GenerateInsightAsync(
                userId,
                aiPrompt,
                aiIdempotencyKey,
                MapUsageType(usageType),
                cancellationToken);

            var assistantMessage = new AiConversationMessage
            {
                ConversationId = conversation.Id,
                UserId = userId,
                Role = AiConversationMessageRole.Assistant,
                Status = AiConversationMessageStatus.Succeeded,
                UsageType = usageType,
                Content = ResolveAssistantContent(grounding, insight.Insight),
                IdempotencyKey = normalizedIdempotencyKey,
                Confidence = grounding.Confidence,
                CitationsJson = SerializeCitations(grounding.Citations),
                ReservedCredits = insight.ReservedCredits,
                ChargedCredits = insight.ChargedCredits,
                RefundedCredits = insight.RefundedCredits,
                InputTokens = insight.InputTokens,
                OutputTokens = insight.OutputTokens,
                CreatedAtUtc = insight.CreatedAt,
                CompletedAtUtc = insight.CompletedAt,
                ErrorCode = null,
                ErrorMessage = null,
                Conversation = conversation,
                User = userMessage.User
            };

            conversation.UpdatedAtUtc = DateTimeOffset.UtcNow;
            conversation.LastMessageAtUtc = assistantMessage.CompletedAtUtc ?? conversation.UpdatedAtUtc;
            dbContext.AiConversationMessages.Add(assistantMessage);
            await dbContext.SaveChangesAsync(cancellationToken);

            var messageCount = await dbContext.AiConversationMessages
                .AsNoTracking()
                .CountAsync(x => x.ConversationId == sessionId, cancellationToken);

            return new AiChatPostMessageResponse
            {
                Session = MapSessionSummary(conversation, messageCount),
                UserMessage = MapMessageResponse(userMessage),
                AssistantMessage = MapMessageResponse(assistantMessage),
                RemainingCredits = insight.RemainingCredits
            };
        }
        catch (Exception exception) when (exception is InvalidOperationException)
        {
            logger.LogWarning(exception, "AI chat request failed for session {SessionId}", sessionId);

            var failedAssistantMessage = new AiConversationMessage
            {
                ConversationId = conversation.Id,
                UserId = userId,
                Role = AiConversationMessageRole.Assistant,
                Status = AiConversationMessageStatus.Failed,
                UsageType = usageType,
                Content = string.Empty,
                IdempotencyKey = normalizedIdempotencyKey,
                Confidence = null,
                CitationsJson = null,
                ReservedCredits = 0m,
                ChargedCredits = 0m,
                RefundedCredits = 0m,
                InputTokens = 0,
                OutputTokens = 0,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                CompletedAtUtc = DateTimeOffset.UtcNow,
                ErrorCode = "invalid_operation",
                ErrorMessage = exception.Message,
                Conversation = conversation,
                User = userMessage.User
            };

            conversation.UpdatedAtUtc = DateTimeOffset.UtcNow;
            conversation.LastMessageAtUtc = failedAssistantMessage.CompletedAtUtc;
            dbContext.AiConversationMessages.Add(failedAssistantMessage);
            await dbContext.SaveChangesAsync(cancellationToken);
            throw;
        }
    }

    private async Task<AiChatGroundingResult> BuildGroundingSnapshotAsync(
        string message,
        CancellationToken cancellationToken)
    {
        if (aiInsightOptions.Value.UseIntentPipelineForChatbot)
        {
            return await groundingOrchestrator.BuildGroundingAsync(message, cancellationToken);
        }

        return await BuildLegacyGroundingSnapshotAsync(message, cancellationToken);
    }

    private async Task<AiChatGroundingResult> BuildLegacyGroundingSnapshotAsync(
        string message,
        CancellationToken cancellationToken)
    {
        var normalized = message.ToLowerInvariant();
        var shouldIncludeLowStock = normalized.Contains("low stock") ||
                                    normalized.Contains("stock below") ||
                                    normalized.Contains("restock") ||
                                    normalized.Contains("stock");
        var shouldIncludeTop = normalized.Contains("best") ||
                               normalized.Contains("top") ||
                               normalized.Contains("best-selling") ||
                               normalized.Contains("best selling");
        var shouldIncludeWorst = normalized.Contains("worst") ||
                                 normalized.Contains("bottom") ||
                                 normalized.Contains("slow") ||
                                 normalized.Contains("least");
        var shouldIncludeForecast = normalized.Contains("forecast") ||
                                    normalized.Contains("next month") ||
                                    normalized.Contains("monthly") ||
                                    normalized.Contains("trend");

        if (!shouldIncludeLowStock && !shouldIncludeTop && !shouldIncludeWorst && !shouldIncludeForecast)
        {
            shouldIncludeLowStock = true;
            shouldIncludeTop = true;
            shouldIncludeForecast = true;
        }

        var context = new StringBuilder();
        var citations = new List<AiChatCitationResponse>();

        if (shouldIncludeLowStock)
        {
            var lowStock = await reportService.GetLowStockReportAsync(5, 10m, cancellationToken);
            var firstItem = lowStock.Items.FirstOrDefault();
            var summary = lowStock.Items.Count == 0
                ? "No low-stock items found at threshold 10."
                : $"{lowStock.Items.Count} items at or below threshold 10. Lowest: {firstItem?.ProductName} ({firstItem?.QuantityOnHand:0.###}).";
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = "reports.low_stock.threshold_10",
                Title = "Low stock items",
                Summary = summary
            });

            context.AppendLine("Low-stock bucket (threshold=10):");
            foreach (var item in lowStock.Items.Take(5))
            {
                context.AppendLine($"- {item.ProductName}: qty={item.QuantityOnHand:0.###}, reorder={item.ReorderLevel:0.###}, deficit={item.Deficit:0.###}");
            }
        }

        if (shouldIncludeTop)
        {
            var topItems = await reportService.GetTopItemsReportAsync(null, null, 5, cancellationToken);
            var firstItem = topItems.Items.FirstOrDefault();
            var summary = topItems.Items.Count == 0
                ? "No top-selling items found in last 7 days."
                : $"Top item: {firstItem?.ProductName} ({firstItem?.NetQuantity:0.###} net qty).";
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = "reports.top_items.last_7_days",
                Title = "Top-selling items",
                Summary = summary
            });

            context.AppendLine("Top-items bucket (last 7 days):");
            foreach (var item in topItems.Items.Take(5))
            {
                context.AppendLine($"- {item.ProductName}: net_qty={item.NetQuantity:0.###}, net_sales={item.NetSales:0.##}");
            }
        }

        if (shouldIncludeWorst)
        {
            var worstItems = await reportService.GetWorstItemsReportAsync(null, null, 5, cancellationToken);
            var firstItem = worstItems.Items.FirstOrDefault();
            var summary = worstItems.Items.Count == 0
                ? "No worst-selling items found in last 7 days."
                : $"Lowest item: {firstItem?.ProductName} ({firstItem?.NetQuantity:0.###} net qty).";
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = "reports.worst_items.last_7_days",
                Title = "Worst-selling items",
                Summary = summary
            });

            context.AppendLine("Worst-items bucket (last 7 days):");
            foreach (var item in worstItems.Items.Take(5))
            {
                context.AppendLine($"- {item.ProductName}: net_qty={item.NetQuantity:0.###}, net_sales={item.NetSales:0.##}");
            }
        }

        if (shouldIncludeForecast)
        {
            var forecast = await reportService.GetMonthlySalesForecastReportAsync(6, cancellationToken);
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = "reports.monthly_forecast.6_months",
                Title = "Monthly forecast",
                Summary = $"Forecast next month net sales: {forecast.ForecastNextMonthNetSales:0.##}, confidence={forecast.Confidence}."
            });

            context.AppendLine("Monthly forecast bucket (6 months):");
            context.AppendLine($"- avg={forecast.AverageMonthlyNetSales:0.##}, trend_percent={forecast.TrendPercent:0.##}, forecast_next={forecast.ForecastNextMonthNetSales:0.##}, confidence={forecast.Confidence}");
            foreach (var item in forecast.Items.TakeLast(3))
            {
                context.AppendLine($"- {item.Month}: net_sales={item.NetSales:0.##}, sales_count={item.SalesCount}, refund_count={item.RefundCount}");
            }
        }

        var confidence = citations.Count >= 3
            ? "high"
            : citations.Count >= 1
                ? "medium"
                : "low";

        return new AiChatGroundingResult(
            ContextText: context.ToString().Trim(),
            Citations: citations,
            MissingData: [],
            Confidence: confidence,
            IsUnsupported: false,
            UnsupportedReason: null);
    }

    private static string BuildAiPrompt(string message, AiChatGroundingResult grounding)
    {
        var missingDataSection = grounding.MissingData.Count == 0
            ? "None."
            : string.Join(Environment.NewLine, grounding.MissingData.Select(x => $"- {x}"));

        return $"""
               User question:
               {message}

               Grounded data buckets:
               {grounding.ContextText}

               Missing data:
               {missingDataSection}

               Instructions:
               - Use only grounded bucket values for factual claims.
               - If data is insufficient, explicitly say what is missing.
               - Do not fabricate values, counts, percentages, dates, or entities.
               - Keep answer practical and concise for POS operations.
               """;
    }

    private static string ResolveAssistantContent(AiChatGroundingResult grounding, string modelContent)
    {
        if (grounding.IsUnsupported)
        {
            return BuildUnsupportedAssistantMessage(grounding);
        }

        if (grounding.MissingData.Count == 0)
        {
            return modelContent;
        }

        var builder = new StringBuilder(modelContent.Trim());
        if (builder.Length > 0)
        {
            builder.AppendLine();
            builder.AppendLine();
        }

        builder.AppendLine("Missing data:");
        foreach (var missing in grounding.MissingData)
        {
            builder.AppendLine($"- {missing}");
        }

        return builder.ToString().Trim();
    }

    private static string BuildUnsupportedAssistantMessage(AiChatGroundingResult grounding)
    {
        var headline = grounding.UnsupportedReason switch
        {
            AiChatUnsupportedReason.CustomersCategoryNotInV1 =>
                "Customer-related questions are not supported in POS chatbot V1.",
            AiChatUnsupportedReason.AlertsAndExceptionsCategoryNotInV1 =>
                "Alerts and exception questions are not supported in POS chatbot V1.",
            _ =>
                "This request is outside POS chatbot V1 scope."
        };

        var builder = new StringBuilder();
        builder.AppendLine(headline);
        builder.AppendLine("Supported V1 categories: Stock, Sales, Purchasing, Pricing, Cashier Operations, Reports.");
        if (grounding.MissingData.Count > 0)
        {
            builder.AppendLine("Missing data:");
            foreach (var item in grounding.MissingData)
            {
                builder.AppendLine($"- {item}");
            }
        }

        return builder.ToString().Trim();
    }

    private static string BuildAiInsightIdempotencyKey(Guid sessionId, string idempotencyKey)
    {
        var normalized = $"chat-{sessionId:N}-{idempotencyKey}";
        if (normalized.Length <= 120)
        {
            return normalized;
        }

        return normalized[..120];
    }

    private static string NormalizeSessionTitle(string? title, DateTimeOffset now)
    {
        var normalized = (title ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return $"AI Chat {now:yyyy-MM-dd HH:mm}";
        }

        if (normalized.Length > 120)
        {
            return normalized[..120].TrimEnd();
        }

        return normalized;
    }

    private static string NormalizeMessage(string message)
    {
        var normalized = (message ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Message is required.");
        }

        if (normalized.Length > 8000)
        {
            throw new InvalidOperationException("Message is too long. Keep it under 8000 characters.");
        }

        return normalized;
    }

    private static string? NormalizeOptionalIdempotencyKey(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length > 120)
        {
            throw new InvalidOperationException("Idempotency key is too long.");
        }

        return normalized;
    }

    private static AiUsageType ResolveUsageType(string? usageType, AiUsageType fallback)
    {
        var normalized = (usageType ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "" => fallback,
            UsageTypeQuickInsights => AiUsageType.QuickInsights,
            UsageTypeAdvancedAnalysis => AiUsageType.AdvancedAnalysis,
            UsageTypeSmartReports => AiUsageType.SmartReports,
            _ => throw new InvalidOperationException(
                "Invalid usage_type. Use quick_insights, advanced_analysis, or smart_reports.")
        };
    }

    private static string MapUsageType(AiUsageType usageType)
    {
        return usageType switch
        {
            AiUsageType.QuickInsights => UsageTypeQuickInsights,
            AiUsageType.AdvancedAnalysis => UsageTypeAdvancedAnalysis,
            AiUsageType.SmartReports => UsageTypeSmartReports,
            _ => UsageTypeQuickInsights
        };
    }

    private static string MapRole(AiConversationMessageRole role)
    {
        return role switch
        {
            AiConversationMessageRole.User => "user",
            AiConversationMessageRole.Assistant => "assistant",
            AiConversationMessageRole.System => "system",
            _ => "assistant"
        };
    }

    private static string MapStatus(AiConversationMessageStatus status)
    {
        return status switch
        {
            AiConversationMessageStatus.Pending => "pending",
            AiConversationMessageStatus.Succeeded => "succeeded",
            AiConversationMessageStatus.Failed => "failed",
            _ => "failed"
        };
    }

    private static string SerializeCitations(List<AiChatCitationResponse> citations)
    {
        return JsonSerializer.Serialize(citations);
    }

    private static List<AiChatCitationResponse> DeserializeCitations(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<AiChatCitationResponse>>(json)
                   ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static AiChatSessionSummaryResponse MapSessionSummary(AiConversation conversation, int messageCount)
    {
        return new AiChatSessionSummaryResponse
        {
            SessionId = conversation.Id,
            Title = conversation.Title,
            DefaultUsageType = MapUsageType(conversation.DefaultUsageType),
            MessageCount = messageCount,
            CreatedAt = conversation.CreatedAtUtc,
            UpdatedAt = conversation.UpdatedAtUtc,
            LastMessageAt = conversation.LastMessageAtUtc
        };
    }

    private static AiChatMessageResponse MapMessageResponse(AiConversationMessage message)
    {
        return new AiChatMessageResponse
        {
            MessageId = message.Id,
            Role = MapRole(message.Role),
            Status = MapStatus(message.Status),
            UsageType = MapUsageType(message.UsageType),
            Content = message.Content,
            Confidence = message.Confidence,
            Citations = DeserializeCitations(message.CitationsJson),
            InputTokens = message.InputTokens,
            OutputTokens = message.OutputTokens,
            ReservedCredits = message.ReservedCredits,
            ChargedCredits = message.ChargedCredits,
            RefundedCredits = message.RefundedCredits,
            CreatedAt = message.CreatedAtUtc,
            CompletedAt = message.CompletedAtUtc,
            ErrorMessage = message.ErrorMessage
        };
    }

    private static AiChatMessageResponse BuildSyntheticUserReplayMessage(string content)
    {
        return new AiChatMessageResponse
        {
            MessageId = Guid.Empty,
            Role = "user",
            Status = "succeeded",
            UsageType = UsageTypeQuickInsights,
            Content = content,
            Confidence = null,
            Citations = [],
            InputTokens = 0,
            OutputTokens = 0,
            ReservedCredits = 0m,
            ChargedCredits = 0m,
            RefundedCredits = 0m,
            CreatedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow,
            ErrorMessage = null
        };
    }

    private async Task<AppUser> ResolveUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");
    }
}
