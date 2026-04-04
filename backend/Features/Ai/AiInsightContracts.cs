using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiInsightRequestPayload
{
    [JsonPropertyName("prompt")]
    public string Prompt { get; set; } = string.Empty;

    [JsonPropertyName("idempotency_key")]
    public string? IdempotencyKey { get; set; }

    [JsonPropertyName("usage_type")]
    public string? UsageType { get; set; }
}

public sealed class AiInsightEstimateRequestPayload
{
    [JsonPropertyName("prompt")]
    public string Prompt { get; set; } = string.Empty;

    [JsonPropertyName("usage_type")]
    public string? UsageType { get; set; }
}

public sealed class AiInsightEstimateResponse
{
    [JsonPropertyName("estimated_input_tokens")]
    public int EstimatedInputTokens { get; set; }

    [JsonPropertyName("estimated_output_tokens")]
    public int EstimatedOutputTokens { get; set; }

    [JsonPropertyName("estimated_charge_credits")]
    public decimal EstimatedChargeCredits { get; set; }

    [JsonPropertyName("reserve_credits")]
    public decimal ReserveCredits { get; set; }

    [JsonPropertyName("available_credits")]
    public decimal AvailableCredits { get; set; }

    [JsonPropertyName("daily_remaining_credits")]
    public decimal DailyRemainingCredits { get; set; }

    [JsonPropertyName("can_afford")]
    public bool CanAfford { get; set; }

    [JsonPropertyName("pricing_rules_version")]
    public string PricingRulesVersion { get; set; } = string.Empty;

    [JsonPropertyName("usage_type")]
    public string UsageType { get; set; } = "quick_insights";
}

public sealed class AiInsightResponse
{
    [JsonPropertyName("request_id")]
    public Guid RequestId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "succeeded";

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "local";

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("pricing_rules_version")]
    public string PricingRulesVersion { get; set; } = string.Empty;

    [JsonPropertyName("insight")]
    public string Insight { get; set; } = string.Empty;

    [JsonPropertyName("input_tokens")]
    public int InputTokens { get; set; }

    [JsonPropertyName("output_tokens")]
    public int OutputTokens { get; set; }

    [JsonPropertyName("reserved_credits")]
    public decimal ReservedCredits { get; set; }

    [JsonPropertyName("charged_credits")]
    public decimal ChargedCredits { get; set; }

    [JsonPropertyName("credits_used")]
    public decimal CreditsUsed => ChargedCredits;

    [JsonPropertyName("refunded_credits")]
    public decimal RefundedCredits { get; set; }

    [JsonPropertyName("remaining_credits")]
    public decimal RemainingCredits { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset CompletedAt { get; set; }

    [JsonPropertyName("usage_type")]
    public string UsageType { get; set; } = "quick_insights";
}

public sealed class AiWalletResponse
{
    [JsonPropertyName("available_credits")]
    public decimal AvailableCredits { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class AiWalletTopUpRequest
{
    [JsonPropertyName("user_id")]
    public Guid? UserId { get; set; }

    [JsonPropertyName("credits")]
    public decimal Credits { get; set; }

    [JsonPropertyName("purchase_reference")]
    public string PurchaseReference { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public sealed class AiWalletTopUpResponse
{
    [JsonPropertyName("available_credits")]
    public decimal AvailableCredits { get; set; }

    [JsonPropertyName("applied_credits")]
    public decimal AppliedCredits { get; set; }

    [JsonPropertyName("purchase_reference")]
    public string PurchaseReference { get; set; } = string.Empty;

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class AiWalletAdjustmentRequest
{
    [JsonPropertyName("user_id")]
    public Guid? UserId { get; set; }

    [JsonPropertyName("delta_credits")]
    public decimal DeltaCredits { get; set; }

    [JsonPropertyName("reference")]
    public string Reference { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AiWalletAdjustmentResponse
{
    [JsonPropertyName("available_credits")]
    public decimal AvailableCredits { get; set; }

    [JsonPropertyName("applied_delta")]
    public decimal AppliedDelta { get; set; }

    [JsonPropertyName("reference")]
    public string Reference { get; set; } = string.Empty;

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class AiInsightHistoryResponse
{
    [JsonPropertyName("items")]
    public List<AiInsightHistoryItemResponse> Items { get; set; } = [];
}

public sealed class AiInsightHistoryItemResponse
{
    [JsonPropertyName("request_id")]
    public Guid RequestId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("pricing_rules_version")]
    public string PricingRulesVersion { get; set; } = string.Empty;

    [JsonPropertyName("input_tokens")]
    public int InputTokens { get; set; }

    [JsonPropertyName("output_tokens")]
    public int OutputTokens { get; set; }

    [JsonPropertyName("reserved_credits")]
    public decimal ReservedCredits { get; set; }

    [JsonPropertyName("charged_credits")]
    public decimal ChargedCredits { get; set; }

    [JsonPropertyName("credits_used")]
    public decimal CreditsUsed => ChargedCredits;

    [JsonPropertyName("refunded_credits")]
    public decimal RefundedCredits { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("usage_type")]
    public string UsageType { get; set; } = "quick_insights";
}

public sealed class AiCreditPackResponse
{
    [JsonPropertyName("pack_code")]
    public string PackCode { get; set; } = string.Empty;

    [JsonPropertyName("credits")]
    public decimal Credits { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "USD";
}

public sealed class AiCreditPackListResponse
{
    [JsonPropertyName("items")]
    public List<AiCreditPackResponse> Items { get; set; } = [];
}

public sealed class AiCheckoutSessionRequest
{
    [JsonPropertyName("pack_code")]
    public string PackCode { get; set; } = string.Empty;

    [JsonPropertyName("idempotency_key")]
    public string? IdempotencyKey { get; set; }
}

public sealed class AiCheckoutSessionResponse
{
    [JsonPropertyName("payment_id")]
    public Guid PaymentId { get; set; }

    [JsonPropertyName("payment_status")]
    public string PaymentStatus { get; set; } = "pending";

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("pack_code")]
    public string PackCode { get; set; } = string.Empty;

    [JsonPropertyName("credits")]
    public decimal Credits { get; set; }

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "USD";

    [JsonPropertyName("external_reference")]
    public string ExternalReference { get; set; } = string.Empty;

    [JsonPropertyName("checkout_url")]
    public string? CheckoutUrl { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AiPaymentWebhookRequest
{
    [JsonPropertyName("event_id")]
    public string? EventId { get; set; }

    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("payment_id")]
    public string? ProviderPaymentId { get; set; }

    [JsonPropertyName("checkout_session_id")]
    public string? ProviderCheckoutSessionId { get; set; }

    [JsonPropertyName("external_reference")]
    public string? ExternalReference { get; set; }

    [JsonPropertyName("credits")]
    public decimal? Credits { get; set; }

    [JsonPropertyName("amount")]
    public decimal? Amount { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("occurred_at")]
    public DateTimeOffset? OccurredAt { get; set; }

    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }
}

public sealed class AiPaymentWebhookResponse
{
    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("handled")]
    public bool Handled { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("payment_id")]
    public Guid? PaymentId { get; set; }

    [JsonPropertyName("payment_status")]
    public string? PaymentStatus { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AiPaymentHistoryResponse
{
    [JsonPropertyName("items")]
    public List<AiPaymentHistoryItemResponse> Items { get; set; } = [];
}

public sealed class AiPaymentHistoryItemResponse
{
    [JsonPropertyName("payment_id")]
    public Guid PaymentId { get; set; }

    [JsonPropertyName("payment_status")]
    public string PaymentStatus { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("credits")]
    public decimal Credits { get; set; }

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "USD";

    [JsonPropertyName("external_reference")]
    public string ExternalReference { get; set; } = string.Empty;

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }
}
