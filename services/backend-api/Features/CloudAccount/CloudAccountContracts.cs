using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.CloudAccount;

public sealed class CloudAccountLinkRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

public sealed class CloudAccountStatusResponse
{
    [JsonPropertyName("is_linked")]
    public bool IsLinked { get; set; }

    [JsonPropertyName("cloud_username")]
    public string? CloudUsername { get; set; }

    [JsonPropertyName("cloud_full_name")]
    public string? CloudFullName { get; set; }

    [JsonPropertyName("cloud_role")]
    public string? CloudRole { get; set; }

    [JsonPropertyName("cloud_shop_code")]
    public string? CloudShopCode { get; set; }

    [JsonPropertyName("token_expires_at")]
    public DateTimeOffset? TokenExpiresAt { get; set; }

    [JsonPropertyName("is_token_expired")]
    public bool IsTokenExpired { get; set; }

    [JsonPropertyName("linked_at")]
    public DateTimeOffset? LinkedAt { get; set; }

    [JsonPropertyName("cloud_relay_configured")]
    public bool CloudRelayConfigured { get; set; }
}

public sealed class CloudAccountLinkResponse
{
    [JsonPropertyName("cloud_username")]
    public string CloudUsername { get; set; } = string.Empty;

    [JsonPropertyName("cloud_full_name")]
    public string CloudFullName { get; set; } = string.Empty;

    [JsonPropertyName("cloud_role")]
    public string CloudRole { get; set; } = string.Empty;

    [JsonPropertyName("cloud_shop_code")]
    public string CloudShopCode { get; set; } = string.Empty;

    [JsonPropertyName("token_expires_at")]
    public DateTimeOffset TokenExpiresAt { get; set; }

    [JsonPropertyName("linked_at")]
    public DateTimeOffset LinkedAt { get; set; }
}

internal sealed class CloudLoginResponse
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }
}

internal sealed class CloudTenantContextResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; set; } = string.Empty;
}
