using System.Text.Json.Serialization;

namespace SmartPos.Backend.Security;

public sealed class DeviceActionChallengeRequest
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;
}

public sealed class DeviceActionChallengeResponse
{
    [JsonPropertyName("challenge_id")]
    public string ChallengeId { get; set; } = string.Empty;

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("nonce")]
    public string Nonce { get; set; } = string.Empty;

    [JsonPropertyName("key_algorithm")]
    public string KeyAlgorithm { get; set; } = "ECDSA_P256_SHA256";

    [JsonPropertyName("issued_at")]
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(2);
}
