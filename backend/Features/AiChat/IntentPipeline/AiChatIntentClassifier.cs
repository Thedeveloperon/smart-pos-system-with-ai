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
            "pending payment");

        var hasAlertSignals = ContainsAny(normalized,
            "alert",
            "exception",
            "mismatch",
            "negative stock",
            "unusual",
            "suspicious");

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
                "expir"))
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
                "busiest"))
        {
            intents.Add(AiChatIntentType.Sales);
        }

        if (ContainsAny(normalized,
                "supplier",
                "purchase",
                "purchas",
                "reorder",
                "vendor",
                "invoice"))
        {
            intents.Add(AiChatIntentType.Purchasing);
        }

        if (ContainsAny(normalized,
                "price",
                "cost",
                "margin",
                "profit",
                "discount"))
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
                "card sales"))
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
                "key insight"))
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
