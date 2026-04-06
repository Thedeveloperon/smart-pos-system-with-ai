using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public enum AiChatIntentType
{
    Stock = 1,
    Sales = 2,
    Purchasing = 3,
    Pricing = 4,
    CashierOperations = 5,
    Reports = 6,
    UnsupportedCustomers = 7,
    UnsupportedAlerts = 8
}

public sealed record AiChatIntentClassification(
    List<AiChatIntentType> Intents,
    string Reason);

public sealed record AiChatEntityMatch(
    Guid Id,
    string Name);

public sealed record AiChatDateRange(
    DateOnly FromDate,
    DateOnly ToDate,
    string Label);

public sealed record AiChatResolvedEntities(
    string NormalizedMessage,
    AiChatEntityMatch? Product,
    AiChatEntityMatch? Brand,
    AiChatEntityMatch? Supplier,
    AiChatEntityMatch? Category,
    AiChatEntityMatch? Cashier,
    AiChatDateRange? DateRange,
    bool MentionsProduct,
    bool MentionsBrand,
    bool MentionsSupplier,
    bool MentionsCategory,
    bool MentionsCashier,
    bool MentionsCustomer);

public sealed record AiChatGroundingHandlerContext(
    string Message,
    AiChatResolvedEntities Entities);

public sealed record AiChatGroundingResult(
    string ContextText,
    List<AiChatCitationResponse> Citations,
    List<string> MissingData,
    string Confidence,
    bool IsUnsupported,
    AiChatUnsupportedReason? UnsupportedReason = null);

public enum AiChatUnsupportedReason
{
    CustomersCategoryNotInV1 = 1,
    AlertsAndExceptionsCategoryNotInV1 = 2
}
