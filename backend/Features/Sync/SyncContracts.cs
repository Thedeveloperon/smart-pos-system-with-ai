using System.Text.Json;
using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Sync;

public sealed class SyncEventsRequest
{
    [JsonPropertyName("device_id")]
    public Guid? DeviceId { get; set; }

    [JsonPropertyName("offline_grant_token")]
    public string? OfflineGrantToken { get; set; }

    [JsonPropertyName("events")]
    public List<SyncEventRequestItem> Events { get; set; } = [];
}

public sealed class SyncEventRequestItem
{
    [JsonPropertyName("event_id")]
    public Guid EventId { get; set; }

    [JsonPropertyName("store_id")]
    public Guid? StoreId { get; set; }

    [JsonPropertyName("device_id")]
    public Guid? DeviceId { get; set; }

    [JsonPropertyName("device_timestamp")]
    public DateTimeOffset DeviceTimestamp { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("payload")]
    public JsonElement Payload { get; set; }
}

public sealed class SyncEventsResponse
{
    [JsonPropertyName("results")]
    public List<SyncEventResult> Results { get; set; } = [];
}

public sealed class SyncEventResult
{
    [JsonPropertyName("event_id")]
    public Guid EventId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("server_timestamp")]
    public DateTimeOffset? ServerTimestamp { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
