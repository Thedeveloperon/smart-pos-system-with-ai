namespace SmartPos.Backend.Features.Ai;

public sealed class AiInsightOptions
{
    public const string SectionName = "AiInsights";

    public bool Enabled { get; set; } = true;
    public bool AllowNonOpenAiInNonProduction { get; set; } = false;
    public string Provider { get; set; } = "Local";
    public string ApiBaseUrl { get; set; } = "https://api.openai.com/v1";
    public string OpenAiApiKey { get; set; } = string.Empty;
    public string OpenAiApiKeyEnvironmentVariable { get; set; } = "OPENAI_API_KEY";
    public string Model { get; set; } = "gpt-5.4-mini";
    public string PricingRulesVersion { get; set; } = "ai_pricing_v1_2026_04_03";
    public string[] AllowedModels { get; set; } = ["gpt-5.4-mini", "local-pos-insights-v1"];
    public int RequestTimeoutMs { get; set; } = 15000;
    public int MaxOutputTokens { get; set; } = 320;
    public int QuickInsightsMaxOutputTokens { get; set; } = 320;
    public int AdvancedAnalysisMaxOutputTokens { get; set; } = 640;
    public int SmartReportsMaxOutputTokens { get; set; } = 1000;
    public decimal QuickInsightsCreditMultiplier { get; set; } = 1.0m;
    public decimal AdvancedAnalysisCreditMultiplier { get; set; } = 1.8m;
    public decimal SmartReportsCreditMultiplier { get; set; } = 3.0m;
    public string QuickInsightsModel { get; set; } = "gpt-5.4-mini";
    public string AdvancedAnalysisModel { get; set; } = "gpt-5.4-mini";
    public string SmartReportsModel { get; set; } = "gpt-5.4";
    public decimal InputCreditsPer1KTokens { get; set; } = 1.0m;
    public decimal OutputCreditsPer1KTokens { get; set; } = 3.0m;
    public decimal ReserveSafetyMultiplier { get; set; } = 1.35m;
    public decimal MinimumChargeCredits { get; set; } = 1.0m;
    public decimal MinimumReserveCredits { get; set; } = 1.0m;
    public int EstimatedSystemPromptTokens { get; set; } = 80;
    public decimal DailyMaxChargeCredits { get; set; } = 250m;
    public int MaxRequestsPerMinute { get; set; } = 10;
    public bool EnableSafetyChecks { get; set; } = true;
    public bool EnableOpenAiModeration { get; set; } = false;
    public bool FailClosedOnModerationError { get; set; } = true;
    public string ModerationModel { get; set; } = "omni-moderation-latest";
    public string[] BlockedPromptTerms { get; set; } = [];
    public string[] BlockedOutputTerms { get; set; } = [];
    public bool EnableManualWalletTopUp { get; set; } = false;
    public bool EnableManualPaymentFallback { get; set; } = true;
    public int PaymentCheckoutRateLimitPerMinute { get; set; } = 24;
    public int PaymentStatusRateLimitPerMinute { get; set; } = 90;
    public bool CanaryOnlyEnabled { get; set; } = false;
    public string[] CanaryAllowedUsers { get; set; } = [];
    public bool UseIntentPipelineForChatbot { get; set; } = true;
    public bool CloudRelayEnabled { get; set; } = false;
    public string CloudRelayBaseUrl { get; set; } = string.Empty;
    public int CloudRelayTimeoutSeconds { get; set; } = 30;
    public int CloudRelayWalletCacheMaxAgeSeconds { get; set; } = 60;
    public bool CloudAiRelayEndpointsEnabled { get; set; } = false;
    public bool AuthorizationReconciliationEnabled { get; set; } = true;
    public int AuthorizationReconciliationIntervalSeconds { get; set; } = 300;
    public int AuthorizationPendingTimeoutSeconds { get; set; } = 900;
    public int AuthorizationReconciliationBatchSize { get; set; } = 100;
    public AiPrivacyOptions Privacy { get; set; } = new();
    public string PaymentProvider { get; set; } = "mockpay";
    public string CheckoutBaseUrl { get; set; } = string.Empty;
    public List<AiCreditPackOption> CreditPacks { get; set; } = [];
    public AiCreditPaymentWebhookOptions PaymentWebhook { get; set; } = new();
}

public sealed class AiPrivacyOptions
{
    public bool EnablePayloadRedaction { get; set; } = true;
    public string RedactionPlaceholder { get; set; } = "[redacted]";
    public int LogPreviewMaxChars { get; set; } = 160;
    public string[] ProviderPayloadAllowlist { get; set; } =
    [
        "customer_question",
        "verified_pos_facts_json",
        "rules",
        "output_language"
    ];
    public List<AiPrivacyRedactionRuleOptions> RedactionRules { get; set; } =
    [
        new()
        {
            Name = "email",
            Pattern = @"(?i)\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b",
            Replacement = "[redacted_email]",
            Enabled = true
        },
        new()
        {
            Name = "phone",
            Pattern = @"(?<!\d)(?:\+?\d[\d\-\s().]{7,}\d)(?!\d)",
            Replacement = "[redacted_phone]",
            Enabled = true
        },
        new()
        {
            Name = "card_with_separator",
            Pattern = @"(?<!\d)(?:\d[ -]){12,18}\d(?!\d)",
            Replacement = "[redacted_card]",
            Enabled = true
        },
        new()
        {
            Name = "api_key_assignment",
            Pattern = @"(?i)\b(api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_\-]{8,}",
            Replacement = "[redacted_secret]",
            Enabled = true
        }
    ];
    public AiPrivacyRetentionOptions Retention { get; set; } = new();
}

public sealed class AiPrivacyRetentionOptions
{
    public bool Enabled { get; set; } = true;
    public bool RunOnStartup { get; set; } = false;
    public int CleanupIntervalSeconds { get; set; } = 3600;
    public int ChatMessageRetentionDays { get; set; } = 30;
    public int ConversationRetentionDays { get; set; } = 30;
    public int InsightSucceededRetentionDays { get; set; } = 30;
    public int InsightFailedRetentionDays { get; set; } = 14;
}

public sealed class AiPrivacyRedactionRuleOptions
{
    public string Name { get; set; } = string.Empty;
    public string Pattern { get; set; } = string.Empty;
    public string Replacement { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public sealed class AiCreditPackOption
{
    public string PackCode { get; set; } = string.Empty;
    public decimal Credits { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "USD";
}

public sealed class AiCreditPaymentWebhookOptions
{
    public bool RequireSignature { get; set; } = true;
    public string SigningSecret { get; set; } = string.Empty;
    public string SigningSecretEnvironmentVariable { get; set; } = "SMARTPOS_AI_WEBHOOK_SIGNING_SECRET";
    public string SignatureHeaderName { get; set; } = "X-AI-Payment-Signature";
    public string SignatureScheme { get; set; } = "v1";
    public int TimestampToleranceSeconds { get; set; } = 300;
}
