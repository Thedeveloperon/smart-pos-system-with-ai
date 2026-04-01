using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Licensing;

public sealed class ProvisionActivateRequest
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string? DeviceName { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class ProvisionDeactivateRequest
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class LicenseHeartbeatRequest
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("license_token")]
    public string? LicenseToken { get; set; }
}

public sealed class BillingProviderIdsUpsertRequest
{
    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("price_id")]
    public string? PriceId { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class BillingProviderIdsResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("price_id")]
    public string? PriceId { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class BillingWebhookEventRequest
{
    [JsonPropertyName("event_id")]
    public string? EventId { get; set; }

    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("price_id")]
    public string? PriceId { get; set; }

    [JsonPropertyName("plan")]
    public string? Plan { get; set; }

    [JsonPropertyName("subscription_status")]
    public string? SubscriptionStatus { get; set; }

    [JsonPropertyName("period_start")]
    public DateTimeOffset? PeriodStart { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset? PeriodEnd { get; set; }

    [JsonPropertyName("occurred_at")]
    public DateTimeOffset? OccurredAt { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }
}

public sealed class BillingWebhookEventResponse
{
    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("handled")]
    public bool Handled { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("subscription_status")]
    public string? SubscriptionStatus { get; set; }

    [JsonPropertyName("plan")]
    public string? Plan { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset? PeriodEnd { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SubscriptionReconciliationRequest
{
    [JsonPropertyName("reconciliation_id")]
    public string? ReconciliationId { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("price_id")]
    public string? PriceId { get; set; }

    [JsonPropertyName("plan")]
    public string? Plan { get; set; }

    [JsonPropertyName("subscription_status")]
    public string? SubscriptionStatus { get; set; }

    [JsonPropertyName("period_start")]
    public DateTimeOffset? PeriodStart { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset? PeriodEnd { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class SubscriptionReconciliationResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("price_id")]
    public string? PriceId { get; set; }

    [JsonPropertyName("subscription_status")]
    public string SubscriptionStatus { get; set; } = "trialing";

    [JsonPropertyName("plan")]
    public string Plan { get; set; } = "trial";

    [JsonPropertyName("period_start")]
    public DateTimeOffset PeriodStart { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset PeriodEnd { get; set; }

    [JsonPropertyName("reconciled_at")]
    public DateTimeOffset ReconciledAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class LicenseStatusResponse
{
    [JsonPropertyName("state")]
    public string State { get; set; } = "unprovisioned";

    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("subscription_status")]
    public string? SubscriptionStatus { get; set; }

    [JsonPropertyName("plan")]
    public string? Plan { get; set; }

    [JsonPropertyName("seat_limit")]
    public int? SeatLimit { get; set; }

    [JsonPropertyName("active_seats")]
    public int? ActiveSeats { get; set; }

    [JsonPropertyName("valid_until")]
    public DateTimeOffset? ValidUntil { get; set; }

    [JsonPropertyName("grace_until")]
    public DateTimeOffset? GraceUntil { get; set; }

    [JsonPropertyName("license_token")]
    public string? LicenseToken { get; set; }

    [JsonPropertyName("blocked_actions")]
    public List<string> BlockedActions { get; set; } = [];

    [JsonPropertyName("server_time")]
    public DateTimeOffset ServerTime { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminShopsLicensingSnapshotResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("items")]
    public List<AdminShopLicensingSnapshotRow> Items { get; set; } = [];
}

public sealed class AdminShopLicensingSnapshotRow
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("shop_name")]
    public string ShopName { get; set; } = string.Empty;

    [JsonPropertyName("subscription_status")]
    public string SubscriptionStatus { get; set; } = "trialing";

    [JsonPropertyName("plan")]
    public string Plan { get; set; } = "trial";

    [JsonPropertyName("seat_limit")]
    public int SeatLimit { get; set; }

    [JsonPropertyName("active_seats")]
    public int ActiveSeats { get; set; }

    [JsonPropertyName("total_devices")]
    public int TotalDevices { get; set; }

    [JsonPropertyName("devices")]
    public List<AdminDeviceSeatRow> Devices { get; set; } = [];
}

public sealed class AdminDeviceSeatRow
{
    [JsonPropertyName("provisioned_device_id")]
    public Guid ProvisionedDeviceId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = string.Empty;

    [JsonPropertyName("device_status")]
    public string DeviceStatus { get; set; } = "active";

    [JsonPropertyName("license_state")]
    public string LicenseState { get; set; } = "unprovisioned";

    [JsonPropertyName("valid_until")]
    public DateTimeOffset? ValidUntil { get; set; }

    [JsonPropertyName("grace_until")]
    public DateTimeOffset? GraceUntil { get; set; }

    [JsonPropertyName("last_heartbeat_at")]
    public DateTimeOffset? LastHeartbeatAt { get; set; }
}

public sealed class AdminDeviceActionRequest
{
    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminDeviceGraceExtensionRequest
{
    [JsonPropertyName("extend_days")]
    public int ExtendDays { get; set; } = 1;

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminDeviceActionResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "active";

    [JsonPropertyName("license_state")]
    public string LicenseState { get; set; } = "active";

    [JsonPropertyName("valid_until")]
    public DateTimeOffset? ValidUntil { get; set; }

    [JsonPropertyName("grace_until")]
    public DateTimeOffset? GraceUntil { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminLicenseResyncRequest
{
    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminLicenseResyncResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("subscription_status")]
    public string SubscriptionStatus { get; set; } = "trialing";

    [JsonPropertyName("plan")]
    public string Plan { get; set; } = "trial";

    [JsonPropertyName("reissued_devices")]
    public int ReissuedDevices { get; set; }

    [JsonPropertyName("revoked_licenses")]
    public int RevokedLicenses { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminAuditLogsResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("items")]
    public List<AdminAuditLogRow> Items { get; set; } = [];
}

public sealed class AdminAuditLogRow
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("device_id")]
    public Guid? ProvisionedDeviceId { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("actor")]
    public string Actor { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("metadata_json")]
    public string? MetadataJson { get; set; }

    [JsonPropertyName("is_manual_override")]
    public bool IsManualOverride { get; set; }

    [JsonPropertyName("immutable_hash")]
    public string? ImmutableHash { get; set; }

    [JsonPropertyName("immutable_previous_hash")]
    public string? ImmutablePreviousHash { get; set; }
}

public sealed class LicenseErrorPayload
{
    [JsonPropertyName("error")]
    public required LicenseErrorItem Error { get; set; }
}

public sealed class LicenseErrorItem
{
    [JsonPropertyName("code")]
    public required string Code { get; set; }

    [JsonPropertyName("message")]
    public required string Message { get; set; }
}

internal sealed class LicenseException(string code, string message, int statusCode = StatusCodes.Status400BadRequest)
    : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

internal static class LicenseErrorCodes
{
    public const string SeatLimitExceeded = "SEAT_LIMIT_EXCEEDED";
    public const string LicenseExpired = "LICENSE_EXPIRED";
    public const string Revoked = "REVOKED";
    public const string Unprovisioned = "UNPROVISIONED";
    public const string InvalidToken = "INVALID_LICENSE_TOKEN";
    public const string DeviceMismatch = "DEVICE_MISMATCH";
    public const string InvalidWebhook = "INVALID_BILLING_WEBHOOK";
    public const string InvalidWebhookSignature = "INVALID_BILLING_WEBHOOK_SIGNATURE";
    public const string InvalidReconciliation = "INVALID_SUBSCRIPTION_RECONCILIATION";
    public const string InvalidAdminRequest = "INVALID_ADMIN_REQUEST";
}
