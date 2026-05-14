using System.Text;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class AiChatGroundingOrchestrator(
    AiChatIntentClassifier intentClassifier,
    AiChatEntityResolver entityResolver,
    AiChatUnsupportedResponseBuilder unsupportedResponseBuilder,
    IEnumerable<IAiChatGroundingHandler> groundingHandlers)
{
    public async Task<AiChatGroundingResult> BuildGroundingAsync(
        string message,
        CancellationToken cancellationToken)
    {
        var classification = intentClassifier.Classify(message);
        var entities = await entityResolver.ResolveAsync(message, cancellationToken);

        if (classification.Intents.Any(IsUnsupportedIntent))
        {
            return unsupportedResponseBuilder.Build(classification, entities);
        }

        var handlerContext = new AiChatGroundingHandlerContext(message, entities);
        var orderedIntents = classification.Intents
            .Where(intent => !IsUnsupportedIntent(intent))
            .Distinct()
            .ToList();

        var handlerResults = new List<AiChatGroundingResult>();
        foreach (var intent in orderedIntents)
        {
            var handler = groundingHandlers.FirstOrDefault(x => x.SupportedIntents.Contains(intent));
            if (handler is null)
            {
                continue;
            }

            var result = await handler.BuildAsync(handlerContext, cancellationToken);
            handlerResults.Add(result);
        }

        if (handlerResults.Count == 0)
        {
            return new AiChatGroundingResult(
                ContextText: "No deterministic grounding data could be prepared for this request.",
                Citations: [],
                MissingData: ["Try asking about stock, sales, purchasing, pricing, cashier operations, or reports."],
                Confidence: "low",
                IsUnsupported: false,
                UnsupportedReason: null);
        }

        var contextBuilder = new StringBuilder();
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();

        foreach (var result in handlerResults)
        {
            if (!string.IsNullOrWhiteSpace(result.ContextText))
            {
                if (contextBuilder.Length > 0)
                {
                    contextBuilder.AppendLine();
                    contextBuilder.AppendLine();
                }

                contextBuilder.Append(result.ContextText.Trim());
            }

            foreach (var citation in result.Citations)
            {
                if (citations.Any(x => x.BucketKey.Equals(citation.BucketKey, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                citations.Add(citation);
            }

            foreach (var missing in result.MissingData)
            {
                if (missingData.Contains(missing, StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                missingData.Add(missing);
            }
        }

        var confidence = ResolveConfidence(citations.Count, missingData.Count);

        return new AiChatGroundingResult(
            ContextText: contextBuilder.ToString().Trim(),
            Citations: citations,
            MissingData: missingData,
            Confidence: confidence,
            IsUnsupported: false,
            UnsupportedReason: null);
    }

    private static bool IsUnsupportedIntent(AiChatIntentType intent)
    {
        return intent is AiChatIntentType.UnsupportedCustomers or AiChatIntentType.UnsupportedAlerts;
    }

    private static string ResolveConfidence(int citationCount, int missingDataCount)
    {
        if (citationCount >= 4 && missingDataCount == 0)
        {
            return "high";
        }

        if (citationCount >= 1)
        {
            return "medium";
        }

        return "low";
    }
}
