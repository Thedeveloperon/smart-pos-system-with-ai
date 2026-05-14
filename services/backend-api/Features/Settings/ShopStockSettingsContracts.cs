using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Settings;

public sealed class ShopStockSettingsResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("store_id")]
    public Guid? StoreId { get; set; }

    [JsonPropertyName("default_low_stock_threshold")]
    public decimal DefaultLowStockThreshold { get; set; }

    [JsonPropertyName("threshold_multiplier")]
    public decimal ThresholdMultiplier { get; set; }

    [JsonPropertyName("default_safety_stock")]
    public decimal DefaultSafetyStock { get; set; }

    [JsonPropertyName("default_lead_time_days")]
    public int DefaultLeadTimeDays { get; set; }

    [JsonPropertyName("default_target_days_of_cover")]
    public decimal DefaultTargetDaysOfCover { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpdateShopStockSettingsRequest
{
    [JsonPropertyName("default_low_stock_threshold")]
    public decimal DefaultLowStockThreshold { get; set; } = 5m;

    [JsonPropertyName("threshold_multiplier")]
    public decimal ThresholdMultiplier { get; set; } = 1m;

    [JsonPropertyName("default_safety_stock")]
    public decimal DefaultSafetyStock { get; set; }

    [JsonPropertyName("default_lead_time_days")]
    public int DefaultLeadTimeDays { get; set; } = 7;

    [JsonPropertyName("default_target_days_of_cover")]
    public decimal DefaultTargetDaysOfCover { get; set; } = 14m;
}
