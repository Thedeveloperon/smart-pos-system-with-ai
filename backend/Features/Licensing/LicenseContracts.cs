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

    [JsonPropertyName("activation_entitlement_key")]
    public string? ActivationEntitlementKey { get; set; }

    [JsonPropertyName("key_fingerprint")]
    public string? KeyFingerprint { get; set; }

    [JsonPropertyName("public_key_spki")]
    public string? PublicKeySpki { get; set; }

    [JsonPropertyName("key_algorithm")]
    public string? KeyAlgorithm { get; set; }

    [JsonPropertyName("challenge_id")]
    public string? ChallengeId { get; set; }

    [JsonPropertyName("challenge_signature")]
    public string? ChallengeSignature { get; set; }
}

public sealed class ProvisionChallengeRequest
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;
}

public sealed class ProvisionChallengeResponse
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
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(5);
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

    [JsonPropertyName("customer_email")]
    public string? CustomerEmail { get; set; }

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

    [JsonPropertyName("activation_entitlement")]
    public CustomerActivationEntitlementResponse? ActivationEntitlement { get; set; }

    [JsonPropertyName("access_delivery")]
    public LicenseAccessDeliveryResponse? AccessDelivery { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerActivationEntitlementResponse
{
    [JsonPropertyName("entitlement_id")]
    public Guid EntitlementId { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("activation_entitlement_key")]
    public string ActivationEntitlementKey { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = "payment_success";

    [JsonPropertyName("source_reference")]
    public string? SourceReference { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "active";

    [JsonPropertyName("max_activations")]
    public int MaxActivations { get; set; } = 1;

    [JsonPropertyName("activations_used")]
    public int ActivationsUsed { get; set; }

    [JsonPropertyName("issued_by")]
    public string? IssuedBy { get; set; }

    [JsonPropertyName("issued_at")]
    public DateTimeOffset IssuedAt { get; set; }

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }

    [JsonPropertyName("last_used_at")]
    public DateTimeOffset? LastUsedAt { get; set; }

    [JsonPropertyName("revoked_at")]
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class LicenseAccessEmailDeliveryResult
{
    [JsonPropertyName("recipient_email")]
    public string? RecipientEmail { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "skipped";

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class LicenseAccessDeliveryResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("success_page_url")]
    public string SuccessPageUrl { get; set; } = string.Empty;

    [JsonPropertyName("email_delivery")]
    public LicenseAccessEmailDeliveryResult EmailDelivery { get; set; } = new();

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class LicenseAccessSuccessResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

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

    [JsonPropertyName("entitlement_state")]
    public string EntitlementState { get; set; } = "active";

    [JsonPropertyName("can_activate")]
    public bool CanActivate { get; set; }

    [JsonPropertyName("installer_download_url")]
    public string? InstallerDownloadUrl { get; set; }

    [JsonPropertyName("installer_download_expires_at")]
    public DateTimeOffset? InstallerDownloadExpiresAt { get; set; }

    [JsonPropertyName("installer_download_protected")]
    public bool InstallerDownloadProtected { get; set; }

    [JsonPropertyName("installer_checksum_sha256")]
    public string? InstallerChecksumSha256 { get; set; }

    [JsonPropertyName("activation_entitlement")]
    public CustomerActivationEntitlementResponse ActivationEntitlement { get; set; } = new();
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

    [JsonPropertyName("offline_grant_token")]
    public string? OfflineGrantToken { get; set; }

    [JsonPropertyName("offline_grant_expires_at")]
    public DateTimeOffset? OfflineGrantExpiresAt { get; set; }

    [JsonPropertyName("offline_max_checkout_operations")]
    public int? OfflineMaxCheckoutOperations { get; set; }

    [JsonPropertyName("offline_max_refund_operations")]
    public int? OfflineMaxRefundOperations { get; set; }

    [JsonPropertyName("device_key_fingerprint")]
    public string? DeviceKeyFingerprint { get; set; }

    [JsonPropertyName("blocked_actions")]
    public List<string> BlockedActions { get; set; } = [];

    [JsonPropertyName("server_time")]
    public DateTimeOffset ServerTime { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CustomerLicensePortalResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

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

    [JsonPropertyName("self_service_deactivation_limit_per_day")]
    public int SelfServiceDeactivationLimitPerDay { get; set; }

    [JsonPropertyName("self_service_deactivations_used_today")]
    public int SelfServiceDeactivationsUsedToday { get; set; }

    [JsonPropertyName("self_service_deactivations_remaining_today")]
    public int SelfServiceDeactivationsRemainingToday { get; set; }

    [JsonPropertyName("can_deactivate_more_devices_today")]
    public bool CanDeactivateMoreDevicesToday { get; set; }

    [JsonPropertyName("latest_activation_entitlement")]
    public CustomerActivationEntitlementResponse? LatestActivationEntitlement { get; set; }

    [JsonPropertyName("devices")]
    public List<CustomerLicensePortalDeviceRow> Devices { get; set; } = [];
}

public sealed class CustomerLicensePortalDeviceRow
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

    [JsonPropertyName("assigned_at")]
    public DateTimeOffset AssignedAt { get; set; }

    [JsonPropertyName("last_heartbeat_at")]
    public DateTimeOffset? LastHeartbeatAt { get; set; }

    [JsonPropertyName("valid_until")]
    public DateTimeOffset? ValidUntil { get; set; }

    [JsonPropertyName("grace_until")]
    public DateTimeOffset? GraceUntil { get; set; }

    [JsonPropertyName("is_current_device")]
    public bool IsCurrentDevice { get; set; }
}

public sealed class CustomerSelfServiceDeviceDeactivationRequest
{
    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class CustomerSelfServiceDeviceDeactivationResponse
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "revoked";

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = "self_service_seat_recovery";

    [JsonPropertyName("deactivations_used_today")]
    public int DeactivationsUsedToday { get; set; }

    [JsonPropertyName("deactivation_limit_per_day")]
    public int DeactivationLimitPerDay { get; set; }

    [JsonPropertyName("deactivations_remaining_today")]
    public int DeactivationsRemainingToday { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
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

    [JsonPropertyName("latest_activation_entitlement")]
    public CustomerActivationEntitlementResponse? LatestActivationEntitlement { get; set; }

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

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminDeviceGraceExtensionRequest
{
    [JsonPropertyName("extend_days")]
    public int ExtendDays { get; set; } = 1;

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("step_up_approved_by")]
    public string? StepUpApprovedBy { get; set; }

    [JsonPropertyName("step_up_approval_note")]
    public string? StepUpApprovalNote { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminDeviceSeatTransferRequest
{
    [JsonPropertyName("target_shop_code")]
    public string? TargetShopCode { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

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

public sealed class AdminDeviceSeatTransferResponse
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; set; } = "transfer_seat";

    [JsonPropertyName("source_shop_id")]
    public Guid SourceShopId { get; set; }

    [JsonPropertyName("source_shop_code")]
    public string SourceShopCode { get; set; } = string.Empty;

    [JsonPropertyName("target_shop_id")]
    public Guid TargetShopId { get; set; }

    [JsonPropertyName("target_shop_code")]
    public string TargetShopCode { get; set; } = string.Empty;

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

public sealed class AdminMassDeviceRevokeRequest
{
    [JsonPropertyName("device_codes")]
    public List<string> DeviceCodes { get; set; } = [];

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("step_up_approved_by")]
    public string? StepUpApprovedBy { get; set; }

    [JsonPropertyName("step_up_approval_note")]
    public string? StepUpApprovalNote { get; set; }
}

public sealed class AdminMassDeviceRevokeResponse
{
    [JsonPropertyName("action")]
    public string Action { get; set; } = "mass_revoke";

    [JsonPropertyName("requested_count")]
    public int RequestedCount { get; set; }

    [JsonPropertyName("revoked_count")]
    public int RevokedCount { get; set; }

    [JsonPropertyName("already_revoked_count")]
    public int AlreadyRevokedCount { get; set; }

    [JsonPropertyName("items")]
    public List<AdminDeviceActionResponse> Items { get; set; } = [];

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminEmergencyCommandEnvelopeRequest
{
    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("ttl_seconds")]
    public int? TtlSeconds { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }
}

public sealed class AdminEmergencyCommandEnvelopeResponse
{
    [JsonPropertyName("command_id")]
    public string CommandId { get; set; } = string.Empty;

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("envelope_token")]
    public string EnvelopeToken { get; set; } = string.Empty;

    [JsonPropertyName("issued_at")]
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(2);
}

public sealed class AdminEmergencyCommandExecuteRequest
{
    [JsonPropertyName("envelope_token")]
    public string EnvelopeToken { get; set; } = string.Empty;
}

public sealed class AdminEmergencyCommandExecuteResponse
{
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "ok";

    [JsonPropertyName("revoked_token_sessions")]
    public int RevokedTokenSessions { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminLicenseResyncRequest
{
    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

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

public sealed class MarketingPaymentRequestCreateRequest
{
    [JsonPropertyName("shop_name")]
    public string? ShopName { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("contact_name")]
    public string? ContactName { get; set; }

    [JsonPropertyName("contact_email")]
    public string? ContactEmail { get; set; }

    [JsonPropertyName("contact_phone")]
    public string? ContactPhone { get; set; }

    [JsonPropertyName("plan_code")]
    public string? PlanCode { get; set; }

    [JsonPropertyName("payment_method")]
    public string? PaymentMethod { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("campaign")]
    public string? Campaign { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}

public sealed class MarketingPaymentInstructionsResponse
{
    [JsonPropertyName("payment_method")]
    public string PaymentMethod { get; set; } = "bank_deposit";

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("reference_hint")]
    public string ReferenceHint { get; set; } = string.Empty;
}

public sealed class MarketingPaymentInvoiceResponse
{
    [JsonPropertyName("invoice_id")]
    public Guid InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "open";

    [JsonPropertyName("due_at")]
    public DateTimeOffset DueAt { get; set; }
}

public sealed class MarketingPaymentRequestCreateResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("shop_name")]
    public string ShopName { get; set; } = string.Empty;

    [JsonPropertyName("contact_name")]
    public string? ContactName { get; set; }

    [JsonPropertyName("contact_email")]
    public string? ContactEmail { get; set; }

    [JsonPropertyName("contact_phone")]
    public string? ContactPhone { get; set; }

    [JsonPropertyName("marketing_plan_code")]
    public string MarketingPlanCode { get; set; } = string.Empty;

    [JsonPropertyName("internal_plan_code")]
    public string InternalPlanCode { get; set; } = string.Empty;

    [JsonPropertyName("requires_payment")]
    public bool RequiresPayment { get; set; } = true;

    [JsonPropertyName("amount_due")]
    public decimal AmountDue { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("invoice")]
    public MarketingPaymentInvoiceResponse? Invoice { get; set; }

    [JsonPropertyName("instructions")]
    public MarketingPaymentInstructionsResponse Instructions { get; set; } = new();

    [JsonPropertyName("next_step")]
    public string NextStep { get; set; } = "await_customer_payment";
}

public sealed class MarketingPaymentSubmissionRequest
{
    [JsonPropertyName("invoice_id")]
    public Guid? InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("payment_method")]
    public string? PaymentMethod { get; set; }

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("bank_reference")]
    public string? BankReference { get; set; }

    [JsonPropertyName("deposit_slip_url")]
    public string? DepositSlipUrl { get; set; }

    [JsonPropertyName("paid_at")]
    public DateTimeOffset? PaidAt { get; set; }

    [JsonPropertyName("contact_name")]
    public string? ContactName { get; set; }

    [JsonPropertyName("contact_email")]
    public string? ContactEmail { get; set; }

    [JsonPropertyName("contact_phone")]
    public string? ContactPhone { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}

public sealed class MarketingPaymentSubmissionResponse
{
    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("invoice_id")]
    public Guid InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("invoice_status")]
    public string InvoiceStatus { get; set; } = "pending_verification";

    [JsonPropertyName("payment_id")]
    public Guid PaymentId { get; set; }

    [JsonPropertyName("payment_status")]
    public string PaymentStatus { get; set; } = "pending_verification";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "Payment submitted and pending verification.";

    [JsonPropertyName("next_step")]
    public string NextStep { get; set; } = "await_admin_verification";
}

public sealed class MarketingPaymentProofUploadResponse
{
    [JsonPropertyName("uploaded_at")]
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("proof_url")]
    public string ProofUrl { get; set; } = string.Empty;

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("content_type")]
    public string ContentType { get; set; } = string.Empty;

    [JsonPropertyName("size_bytes")]
    public long SizeBytes { get; set; }

    [JsonPropertyName("sha256")]
    public string Sha256 { get; set; } = string.Empty;

    [JsonPropertyName("scan_status")]
    public string ScanStatus { get; set; } = "clean";

    [JsonPropertyName("scan_message")]
    public string? ScanMessage { get; set; }
}

public sealed class MarketingLicenseDownloadTrackRequest
{
    [JsonPropertyName("activation_entitlement_key")]
    public string? ActivationEntitlementKey { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("channel")]
    public string? Channel { get; set; }
}

public sealed class MarketingLicenseDownloadTrackResponse
{
    [JsonPropertyName("tracked_at")]
    public DateTimeOffset TrackedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("activation_entitlement_key")]
    public string ActivationEntitlementKey { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("channel")]
    public string Channel { get; set; } = string.Empty;

    [JsonPropertyName("payment_id")]
    public Guid? PaymentId { get; set; }

    [JsonPropertyName("invoice_id")]
    public Guid? InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }
}

public sealed class AdminManualBillingInvoiceCreateRequest
{
    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("amount_due")]
    public decimal AmountDue { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("due_at")]
    public DateTimeOffset? DueAt { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }
}

public sealed class AdminManualBillingInvoicesResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("items")]
    public List<AdminManualBillingInvoiceRow> Items { get; set; } = [];
}

public sealed class AdminManualBillingInvoiceRow
{
    [JsonPropertyName("invoice_id")]
    public Guid InvoiceId { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("amount_due")]
    public decimal AmountDue { get; set; }

    [JsonPropertyName("amount_paid")]
    public decimal AmountPaid { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "open";

    [JsonPropertyName("due_at")]
    public DateTimeOffset DueAt { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("created_by")]
    public string? CreatedBy { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class AdminManualBillingPaymentRecordRequest
{
    [JsonPropertyName("invoice_id")]
    public Guid? InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("method")]
    public string Method { get; set; } = "bank_deposit";

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("bank_reference")]
    public string? BankReference { get; set; }

    [JsonPropertyName("deposit_slip_url")]
    public string? DepositSlipUrl { get; set; }

    [JsonPropertyName("received_at")]
    public DateTimeOffset? ReceivedAt { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }
}

public sealed class AdminManualBillingPaymentsResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("items")]
    public List<AdminManualBillingPaymentRow> Items { get; set; } = [];
}

public sealed class AdminManualBillingPaymentRow
{
    [JsonPropertyName("payment_id")]
    public Guid PaymentId { get; set; }

    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("invoice_id")]
    public Guid InvoiceId { get; set; }

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("method")]
    public string Method { get; set; } = "bank_deposit";

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "pending_verification";

    [JsonPropertyName("bank_reference")]
    public string? BankReference { get; set; }

    [JsonPropertyName("deposit_slip_url")]
    public string? DepositSlipUrl { get; set; }

    [JsonPropertyName("received_at")]
    public DateTimeOffset ReceivedAt { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("recorded_by")]
    public string? RecordedBy { get; set; }

    [JsonPropertyName("verified_by")]
    public string? VerifiedBy { get; set; }

    [JsonPropertyName("verified_at")]
    public DateTimeOffset? VerifiedAt { get; set; }

    [JsonPropertyName("rejected_by")]
    public string? RejectedBy { get; set; }

    [JsonPropertyName("rejected_at")]
    public DateTimeOffset? RejectedAt { get; set; }

    [JsonPropertyName("rejection_reason")]
    public string? RejectionReason { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class AdminManualBillingPaymentVerifyRequest
{
    [JsonPropertyName("extend_days")]
    public int ExtendDays { get; set; } = 30;

    [JsonPropertyName("plan")]
    public string? Plan { get; set; }

    [JsonPropertyName("seat_limit")]
    public int? SeatLimit { get; set; }

    [JsonPropertyName("customer_email")]
    public string? CustomerEmail { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminManualBillingPaymentRejectRequest
{
    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminManualBillingPaymentVerificationResponse
{
    [JsonPropertyName("payment")]
    public required AdminManualBillingPaymentRow Payment { get; set; }

    [JsonPropertyName("invoice")]
    public required AdminManualBillingInvoiceRow Invoice { get; set; }

    [JsonPropertyName("subscription_status")]
    public string SubscriptionStatus { get; set; } = "active";

    [JsonPropertyName("plan")]
    public string Plan { get; set; } = "trial";

    [JsonPropertyName("seat_limit")]
    public int SeatLimit { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset PeriodEnd { get; set; }

    [JsonPropertyName("activation_entitlement")]
    public CustomerActivationEntitlementResponse? ActivationEntitlement { get; set; }

    [JsonPropertyName("access_delivery")]
    public LicenseAccessDeliveryResponse? AccessDelivery { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminManualBillingDailyReconciliationResponse
{
    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty;

    [JsonPropertyName("window_start")]
    public DateTimeOffset WindowStart { get; set; }

    [JsonPropertyName("window_end")]
    public DateTimeOffset WindowEnd { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("expected_bank_total")]
    public decimal? ExpectedBankTotal { get; set; }

    [JsonPropertyName("recorded_bank_total")]
    public decimal RecordedBankTotal { get; set; }

    [JsonPropertyName("verified_bank_total")]
    public decimal VerifiedBankTotal { get; set; }

    [JsonPropertyName("pending_bank_total")]
    public decimal PendingBankTotal { get; set; }

    [JsonPropertyName("rejected_bank_total")]
    public decimal RejectedBankTotal { get; set; }

    [JsonPropertyName("mismatch_amount")]
    public decimal? MismatchAmount { get; set; }

    [JsonPropertyName("has_mismatch")]
    public bool HasMismatch { get; set; }

    [JsonPropertyName("mismatch_reasons")]
    public List<string> MismatchReasons { get; set; } = [];

    [JsonPropertyName("alert_count")]
    public int AlertCount { get; set; }

    [JsonPropertyName("alerts")]
    public List<AdminManualBillingReconciliationAlertRow> Alerts { get; set; } = [];

    [JsonPropertyName("count")]
    public int Count { get; set; }

    [JsonPropertyName("items")]
    public List<AdminManualBillingReconciliationItemRow> Items { get; set; } = [];

    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AdminManualBillingReconciliationAlertRow
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("severity")]
    public string Severity { get; set; } = "info";

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public sealed class AdminManualBillingReconciliationItemRow
{
    [JsonPropertyName("payment_id")]
    public Guid PaymentId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("method")]
    public string Method { get; set; } = "bank_deposit";

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "pending_verification";

    [JsonPropertyName("bank_reference")]
    public string? BankReference { get; set; }

    [JsonPropertyName("received_at")]
    public DateTimeOffset ReceivedAt { get; set; }

    [JsonPropertyName("recorded_by")]
    public string? RecordedBy { get; set; }

    [JsonPropertyName("verified_by")]
    public string? VerifiedBy { get; set; }

    [JsonPropertyName("mismatch_flags")]
    public List<string> MismatchFlags { get; set; } = [];
}

public sealed class AdminBillingStateReconciliationRunRequest
{
    [JsonPropertyName("dry_run")]
    public bool DryRun { get; set; }

    [JsonPropertyName("take")]
    public int? Take { get; set; }

    [JsonPropertyName("webhook_failure_take")]
    public int? WebhookFailureTake { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class AdminBillingStateReconciliationRunResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("source")]
    public string Source { get; set; } = "manual_admin";

    [JsonPropertyName("dry_run")]
    public bool DryRun { get; set; }

    [JsonPropertyName("actor")]
    public string Actor { get; set; } = "billing-reconciliation";

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("period_end_grace_hours")]
    public int PeriodEndGraceHours { get; set; }

    [JsonPropertyName("webhook_failure_lookback_hours")]
    public int WebhookFailureLookbackHours { get; set; }

    [JsonPropertyName("billing_subscriptions_scanned")]
    public int BillingSubscriptionsScanned { get; set; }

    [JsonPropertyName("drift_candidates")]
    public int DriftCandidates { get; set; }

    [JsonPropertyName("subscriptions_reconciled")]
    public int SubscriptionsReconciled { get; set; }

    [JsonPropertyName("webhook_failures_detected")]
    public int WebhookFailuresDetected { get; set; }

    [JsonPropertyName("subscription_updates")]
    public List<AdminBillingStateReconciliationSubscriptionRow> SubscriptionUpdates { get; set; } = [];

    [JsonPropertyName("failed_webhook_events")]
    public List<AdminBillingStateReconciliationWebhookFailureRow> FailedWebhookEvents { get; set; } = [];
}

public sealed class AdminBillingStateReconciliationSubscriptionRow
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("customer_id")]
    public string? CustomerId { get; set; }

    [JsonPropertyName("period_end")]
    public DateTimeOffset PeriodEnd { get; set; }

    [JsonPropertyName("previous_status")]
    public string PreviousStatus { get; set; } = "trialing";

    [JsonPropertyName("reconciled_status")]
    public string ReconciledStatus { get; set; } = "past_due";

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = "period_end_elapsed_without_webhook";

    [JsonPropertyName("applied")]
    public bool Applied { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

public sealed class AdminBillingStateReconciliationWebhookFailureRow
{
    [JsonPropertyName("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonPropertyName("event_type")]
    public string EventType { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "failed";

    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("subscription_id")]
    public string? SubscriptionId { get; set; }

    [JsonPropertyName("last_error_code")]
    public string? LastErrorCode { get; set; }

    [JsonPropertyName("received_at")]
    public DateTimeOffset ReceivedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
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
    public const string InvalidDeviceProof = "INVALID_DEVICE_PROOF";
    public const string DeviceKeyMismatch = "DEVICE_KEY_MISMATCH";
    public const string DeviceProofRequired = "DEVICE_PROOF_REQUIRED";
    public const string ChallengeExpired = "CHALLENGE_EXPIRED";
    public const string ChallengeConsumed = "CHALLENGE_CONSUMED";
    public const string TokenReplayDetected = "TOKEN_REPLAY_DETECTED";
    public const string OfflineGrantRequired = "OFFLINE_GRANT_REQUIRED";
    public const string OfflineGrantExpired = "OFFLINE_GRANT_EXPIRED";
    public const string OfflineGrantLimitExceeded = "OFFLINE_GRANT_LIMIT_EXCEEDED";
    public const string ActivationEntitlementNotFound = "ACTIVATION_ENTITLEMENT_NOT_FOUND";
    public const string InvalidActivationEntitlement = "INVALID_ACTIVATION_ENTITLEMENT";
    public const string ActivationEntitlementExpired = "ACTIVATION_ENTITLEMENT_EXPIRED";
    public const string SelfServiceDeactivationLimitReached = "SELF_SERVICE_DEVICE_DEACTIVATION_LIMIT_REACHED";
    public const string InvoiceNotFound = "INVOICE_NOT_FOUND";
    public const string PaymentNotFound = "PAYMENT_NOT_FOUND";
    public const string InvalidPaymentStatus = "INVALID_PAYMENT_STATUS";
    public const string SecondApprovalRequired = "SECOND_APPROVAL_REQUIRED";
    public const string RateLimitExceeded = "RATE_LIMIT_EXCEEDED";
    public const string DuplicateSubmission = "DUPLICATE_SUBMISSION";
}
