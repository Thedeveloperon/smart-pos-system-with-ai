namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class AiChatIntentClassifier
{
    public AiChatIntentClassification Classify(string message)
    {
        var normalized = (message ?? string.Empty).Trim().ToLowerInvariant();
        var intents = new List<AiChatIntentType>();

        var hasCustomerSignals = ContainsAny(normalized,
            "customer",
            "customers",
            "client",
            "buyer",
            "pending payment",
            "පාරිභෝගික",
            "ගනුදෙනුකරු");

        var hasAlertSignals = ContainsAny(normalized,
            "alert",
            "exception",
            "mismatch",
            "negative stock",
            "unusual",
            "suspicious",
            "අවවාද",
            "විශේෂත්ව",
            "නොගැළප",
            "අසාමාන්‍ය",
            "සැකසහිත");

        if (hasCustomerSignals)
        {
            intents.Add(AiChatIntentType.UnsupportedCustomers);
        }

        if (hasAlertSignals)
        {
            intents.Add(AiChatIntentType.UnsupportedAlerts);
        }

        if (ContainsAny(normalized,
                "stock",
                "inventory",
                "restock",
                "reorder",
                "out of stock",
                "overstock",
                "stock value",
                "expir",
                "තොග",
                "ඉන්වෙන්ටරි",
                "නැවත තොග",
                "නැවත ඇණවුම්",
                "තොග අවසන්",
                "අධික තොග",
                "තොග වටිනාකම",
                "කල් ඉකුත්"))
        {
            intents.Add(AiChatIntentType.Stock);
        }

        if (ContainsAny(normalized,
                "sales",
                "sold",
                "best-selling",
                "best selling",
                "worst-selling",
                "worst selling",
                "revenue",
                "transaction",
                "compare",
                "busiest",
                "විකුණුම්",
                "විකුණ",
                "ආදායම",
                "ගනුදෙනු",
                "සසඳ",
                "වැඩිපුරම",
                "අඩුවෙන්ම"))
        {
            intents.Add(AiChatIntentType.Sales);
        }

        if (ContainsAny(normalized,
                "supplier",
                "purchase",
                "purchas",
                "reorder",
                "vendor",
                "invoice",
                "සැපයුම්කරු",
                "මිලදී",
                "ඇණවුම්",
                "ඉන්වොයිස්"))
        {
            intents.Add(AiChatIntentType.Purchasing);
        }

        if (ContainsAny(normalized,
                "price",
                "cost",
                "margin",
                "profit",
                "discount",
                "මිල",
                "පිරිවැය",
                "ලාභ",
                "වට්ටම්",
                "අනුපාත"))
        {
            intents.Add(AiChatIntentType.Pricing);
        }

        if (ContainsAny(normalized,
                "cashier",
                "drawer",
                "session",
                "refund",
                "void",
                "cash sales",
                "card sales",
                "කැෂියර්",
                "ඩ්‍රෝවර්",
                "සැසිය",
                "ආපසු",
                "අවලංගු",
                "මුදල් විකුණුම්",
                "කාඩ් විකුණුම්"))
        {
            intents.Add(AiChatIntentType.CashierOperations);
        }

        if (ContainsAny(normalized,
                "summary",
                "report",
                "insight",
                "performance",
                "forecast",
                "trend",
                "key insight",
                "සාරාංශ",
                "වාර්තාව",
                "අවබෝධ",
                "කාර්යසාධනය",
                "අනාවැකි",
                "ප්‍රවණතාව"))
        {
            intents.Add(AiChatIntentType.Reports);
        }

        if (intents.Count == 0)
        {
            intents.Add(AiChatIntentType.Reports);
        }

        var distinctIntents = intents
            .Distinct()
            .ToList();

        return new AiChatIntentClassification(
            distinctIntents,
            $"Matched intents: {string.Join(", ", distinctIntents)}");
    }

    private static bool ContainsAny(string normalized, params string[] patterns)
    {
        return patterns.Any(pattern => normalized.Contains(pattern, StringComparison.Ordinal));
    }
}
