using System.Text.Json.Serialization;
using SmartPos.Backend.Domain;

namespace SmartPos.Backend.Features.Promotions;

public sealed class UpsertPromotionRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("scope")]
    public string Scope { get; set; } = "all";

    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("product_id")]
    public Guid? ProductId { get; set; }

    [JsonPropertyName("value_type")]
    public string ValueType { get; set; } = "percent";

    [JsonPropertyName("value")]
    public decimal Value { get; set; }

    [JsonPropertyName("starts_at_utc")]
    public DateTimeOffset StartsAtUtc { get; set; }

    [JsonPropertyName("ends_at_utc")]
    public DateTimeOffset EndsAtUtc { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class PromotionResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("scope")]
    public string Scope { get; set; } = "all";

    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("product_id")]
    public Guid? ProductId { get; set; }

    [JsonPropertyName("value_type")]
    public string ValueType { get; set; } = "percent";

    [JsonPropertyName("value")]
    public decimal Value { get; set; }

    [JsonPropertyName("starts_at_utc")]
    public DateTimeOffset StartsAtUtc { get; set; }

    [JsonPropertyName("ends_at_utc")]
    public DateTimeOffset EndsAtUtc { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("created_at_utc")]
    public DateTimeOffset CreatedAtUtc { get; set; }

    [JsonPropertyName("updated_at_utc")]
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}

public sealed record ActivePromotionDiscount(PromotionValueType ValueType, decimal Value);
