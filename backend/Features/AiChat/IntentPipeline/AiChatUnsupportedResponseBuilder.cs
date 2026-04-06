using System.Text;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class AiChatUnsupportedResponseBuilder
{
    public AiChatGroundingResult Build(
        AiChatIntentClassification classification,
        AiChatResolvedEntities entities)
    {
        var hasCustomers = classification.Intents.Contains(AiChatIntentType.UnsupportedCustomers);
        var hasAlerts = classification.Intents.Contains(AiChatIntentType.UnsupportedAlerts);

        var reason = hasCustomers && !hasAlerts
            ? AiChatUnsupportedReason.CustomersCategoryNotInV1
            : AiChatUnsupportedReason.AlertsAndExceptionsCategoryNotInV1;

        var summary = reason switch
        {
            AiChatUnsupportedReason.CustomersCategoryNotInV1 =>
                "Customer-related questions are not supported in POS chatbot V1.",
            AiChatUnsupportedReason.AlertsAndExceptionsCategoryNotInV1 =>
                "Alerts and exception questions are not supported in POS chatbot V1.",
            _ =>
                "This question is not supported in POS chatbot V1."
        };

        var contextBuilder = new StringBuilder();
        contextBuilder.AppendLine("Unsupported intent detected.");
        contextBuilder.AppendLine(summary);
        contextBuilder.AppendLine("Supported V1 categories: Stock, Sales, Purchasing, Pricing, Cashier Operations, Reports.");
        if (entities.MentionsCustomer)
        {
            contextBuilder.AppendLine("Detected customer entity references in the request.");
        }

        var missingData = new List<string>
        {
            "Use a V1-supported category question for grounded answers.",
            reason == AiChatUnsupportedReason.CustomersCategoryNotInV1
                ? "Customer history and customer-level spend data are out of V1 scope."
                : "Alert/exception anomaly datasets are out of V1 scope."
        };

        var citations = new List<AiChatCitationResponse>
        {
            new()
            {
                BucketKey = "chatbot.v1.unsupported",
                Title = "Unsupported in V1",
                Summary = summary
            }
        };

        return new AiChatGroundingResult(
            ContextText: contextBuilder.ToString().Trim(),
            Citations: citations,
            MissingData: missingData,
            Confidence: "low",
            IsUnsupported: true,
            UnsupportedReason: reason);
    }
}
