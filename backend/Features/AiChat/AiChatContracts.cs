using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.AiChat;

public sealed class AiChatCreateSessionRequest
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("usage_type")]
    public string? UsageType { get; set; }
}

public sealed class AiChatMessageCreateRequest
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("usage_type")]
    public string? UsageType { get; set; }

    [JsonPropertyName("idempotency_key")]
    public string? IdempotencyKey { get; set; }
}

public sealed class AiChatHistoryResponse
{
    [JsonPropertyName("items")]
    public List<AiChatSessionSummaryResponse> Items { get; set; } = [];
}

public sealed class AiChatSessionDetailResponse
{
    [JsonPropertyName("session")]
    public AiChatSessionSummaryResponse Session { get; set; } = new();

    [JsonPropertyName("messages")]
    public List<AiChatMessageResponse> Messages { get; set; } = [];
}

public sealed class AiChatPostMessageResponse
{
    [JsonPropertyName("session")]
    public AiChatSessionSummaryResponse Session { get; set; } = new();

    [JsonPropertyName("user_message")]
    public AiChatMessageResponse UserMessage { get; set; } = new();

    [JsonPropertyName("assistant_message")]
    public AiChatMessageResponse AssistantMessage { get; set; } = new();

    [JsonPropertyName("remaining_credits")]
    public decimal RemainingCredits { get; set; }
}

public sealed class AiChatSessionSummaryResponse
{
    [JsonPropertyName("session_id")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("default_usage_type")]
    public string DefaultUsageType { get; set; } = "quick_insights";

    [JsonPropertyName("message_count")]
    public int MessageCount { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }

    [JsonPropertyName("last_message_at")]
    public DateTimeOffset? LastMessageAt { get; set; }
}

public sealed class AiChatMessageResponse
{
    [JsonPropertyName("message_id")]
    public Guid MessageId { get; set; }

    [JsonPropertyName("role")]
    public string Role { get; set; } = "assistant";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "succeeded";

    [JsonPropertyName("usage_type")]
    public string UsageType { get; set; } = "quick_insights";

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;

    [JsonPropertyName("confidence")]
    public string? Confidence { get; set; }

    [JsonPropertyName("citations")]
    public List<AiChatCitationResponse> Citations { get; set; } = [];

    [JsonPropertyName("input_tokens")]
    public int InputTokens { get; set; }

    [JsonPropertyName("output_tokens")]
    public int OutputTokens { get; set; }

    [JsonPropertyName("reserved_credits")]
    public decimal ReservedCredits { get; set; }

    [JsonPropertyName("charged_credits")]
    public decimal ChargedCredits { get; set; }

    [JsonPropertyName("refunded_credits")]
    public decimal RefundedCredits { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }
}

public sealed class AiChatCitationResponse
{
    [JsonPropertyName("bucket_key")]
    public string BucketKey { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("summary")]
    public string Summary { get; set; } = string.Empty;
}
