using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Auth;

public sealed class LoginRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("terminal_id")]
    public string? TerminalId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string? DeviceName { get; set; }

    [JsonPropertyName("mfa_code")]
    public string? MfaCode { get; set; }
}

public sealed class AccountLoginRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("mfa_code")]
    public string? MfaCode { get; set; }
}

public sealed class AuthSessionResponse
{
    [JsonPropertyName("user_id")]
    public Guid UserId { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("super_admin_scope")]
    public string? SuperAdminScope { get; set; }

    [JsonPropertyName("session_id")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("terminal_id")]
    public string TerminalId { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public Guid DeviceId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [JsonPropertyName("mfa_verified")]
    public bool MfaVerified { get; set; }

    [JsonPropertyName("auth_session_version")]
    public int AuthSessionVersion { get; set; }
}

public sealed class AccountSessionResponse
{
    [JsonPropertyName("user_id")]
    public Guid UserId { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("super_admin_scope")]
    public string? SuperAdminScope { get; set; }

    [JsonPropertyName("session_id")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [JsonPropertyName("mfa_verified")]
    public bool MfaVerified { get; set; }

    [JsonPropertyName("auth_session_version")]
    public int AuthSessionVersion { get; set; }
}

public sealed class AuthSessionDeviceRow
{
    [JsonPropertyName("session_id")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("terminal_id")]
    public string TerminalId { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public Guid DeviceId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = string.Empty;

    [JsonPropertyName("is_current")]
    public bool IsCurrent { get; set; }

    [JsonPropertyName("is_revoked")]
    public bool IsRevoked { get; set; }

    [JsonPropertyName("auth_session_version")]
    public int AuthSessionVersion { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("last_seen_at")]
    public DateTimeOffset? LastSeenAt { get; set; }

    [JsonPropertyName("last_auth_issued_at")]
    public DateTimeOffset? LastAuthIssuedAt { get; set; }

    [JsonPropertyName("revoked_at")]
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class AuthSessionsResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("current_terminal_id")]
    public string? CurrentTerminalId { get; set; }

    [JsonPropertyName("current_device_code")]
    public string? CurrentDeviceCode { get; set; }

    [JsonPropertyName("items")]
    public List<AuthSessionDeviceRow> Items { get; set; } = [];
}

public sealed class AuthSessionRevokeRequest
{
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AuthSessionRevokeResponse
{
    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("revoked_count")]
    public int RevokedCount { get; set; }

    [JsonPropertyName("target_session_id")]
    public Guid? TargetSessionId { get; set; }

    [JsonPropertyName("target_terminal_id")]
    public string? TargetTerminalId { get; set; }

    [JsonPropertyName("target_device_code")]
    public string? TargetDeviceCode { get; set; }

    [JsonPropertyName("current_session_revoked")]
    public bool CurrentSessionRevoked { get; set; }
}

public sealed class AccountTenantContextResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("full_name")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("super_admin_scope")]
    public string? SuperAdminScope { get; set; }
}
