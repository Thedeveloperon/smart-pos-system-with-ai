namespace SmartPos.Backend.Features.Licensing;

public sealed class LicenseOptions
{
    public const string SectionName = "Licensing";

    public string DefaultShopCode { get; set; } = "default";
    public string DefaultShopName { get; set; } = "Default SmartPOS Shop";
    public string DefaultPlan { get; set; } = "trial";
    public int GracePeriodDays { get; set; } = 7;
    public int TrialPeriodDays { get; set; } = 14;
    public int TrialSeatLimit { get; set; } = 3;
    public int TokenTtlMinutes { get; set; } = 15;
    public int TokenTtlHours { get; set; } = 24;
    public int TokenRotationOverlapSeconds { get; set; } = 90;
    public int TokenJtiCleanupIntervalSeconds { get; set; } = 300;
    public int TokenJtiRetentionHours { get; set; } = 24;
    public int OfflineGrantTtlHours { get; set; } = 48;
    public int OfflineGrantMaxHours { get; set; } = 72;
    public int OfflineMaxCheckoutOperations { get; set; } = 200;
    public int OfflineMaxRefundOperations { get; set; } = 40;
    public int ActivationEntitlementTtlDays { get; set; } = 90;
    public string ActivationEntitlementKeyPrefix { get; set; } = "SPK";
    public bool DisallowInlinePrivateKey { get; set; }
    public string SigningPrivateKeyEnvironmentVariable { get; set; } = "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM";
    public string SigningPrivateKeyPem { get; set; } = string.Empty;
    public string VerificationPublicKeyPem { get; set; } = string.Empty;
    public string SigningKeyId { get; set; } = "smartpos-k1";
    public string ActiveSigningKeyId { get; set; } = "smartpos-k1";
    public bool EncryptSensitiveDataAtRest { get; set; } = true;
    public string DataEncryptionKey { get; set; } = "smartpos-license-data-key-change-before-production";
    public string DataEncryptionKeyEnvironmentVariable { get; set; } = "SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY";
    public bool RequireDeviceKeyBinding { get; set; } = false;
    public bool AllowLegacyActivationWithoutDeviceKey { get; set; } = true;
    public int DeviceChallengeTtlSeconds { get; set; } = 300;
    public bool RequireSensitiveActionDeviceProof { get; set; } = false;
    public string[] SensitiveActionProtectedPathPrefixes { get; set; } = ["/api/checkout", "/api/refunds", "/api/admin"];
    public int SensitiveActionNonceTtlSeconds { get; set; } = 120;
    public int SensitiveActionTimestampToleranceSeconds { get; set; } = 300;
    public bool TokenCookieEnabled { get; set; } = true;
    public string TokenCookieName { get; set; } = "smartpos_license";
    public bool TokenCookieSecure { get; set; }
    public string TokenCookieSameSite { get; set; } = "Lax";
    public string TokenCookiePath { get; set; } = "/";
    public string AccessSuccessPageBaseUrl { get; set; } = "/license/success";
    public StripeBillingOptions Stripe { get; set; } = new();
    public string InstallerDownloadBaseUrl { get; set; } = string.Empty;
    public bool InstallerDownloadProtectedEnabled { get; set; }
    public int InstallerDownloadTokenTtlMinutes { get; set; } = 30;
    public string InstallerDownloadSigningSecret { get; set; } = string.Empty;
    public string InstallerDownloadSigningSecretEnvironmentVariable { get; set; } = "SMARTPOS_INSTALLER_DOWNLOAD_SIGNING_SECRET";
    public string InstallerChecksumSha256 { get; set; } = string.Empty;
    public bool AccessDeliveryEmailEnabled { get; set; }
    public string AccessDeliveryFromEmail { get; set; } = "noreply@smartpos.local";
    public string AccessDeliveryFromName { get; set; } = "SmartPOS Licensing";
    public string AccessDeliverySmtpHost { get; set; } = string.Empty;
    public int AccessDeliverySmtpPort { get; set; } = 587;
    public bool AccessDeliverySmtpEnableSsl { get; set; } = true;
    public string AccessDeliverySmtpUsername { get; set; } = string.Empty;
    public string AccessDeliverySmtpPassword { get; set; } = string.Empty;
    public string AccessDeliverySmtpPasswordEnvironmentVariable { get; set; } = "SMARTPOS_ACCESS_DELIVERY_SMTP_PASSWORD";
    public int SelfServiceDeviceDeactivationMaxPerDay { get; set; } = 2;
    public bool RequireSecondApprovalForHighValuePayments { get; set; } = true;
    public decimal HighValuePaymentSecondApprovalThreshold { get; set; } = 50000m;
    public bool RequireStepUpApprovalForHighRiskAdminActions { get; set; } = true;
    public int HighRiskGraceExtensionDaysThreshold { get; set; } = 7;
    public int HighRiskMassRevokeThreshold { get; set; } = 3;
    public int EmergencyCommandEnvelopeTtlSeconds { get; set; } = 120;
    public string EmergencyCommandSigningSecret { get; set; } = "smartpos-emergency-command-secret-change-before-production";
    public string EmergencyCommandSigningSecretEnvironmentVariable { get; set; } = "SMARTPOS_EMERGENCY_COMMAND_SIGNING_SECRET";
    public decimal BankReconciliationMismatchToleranceAmount { get; set; } = 1m;
    public bool BillingReconciliationEnabled { get; set; } = true;
    public int BillingReconciliationIntervalSeconds { get; set; } = 900;
    public int BillingWebhookMaxRetryAttempts { get; set; } = 3;
    public int BillingReconciliationPeriodEndGraceHours { get; set; } = 24;
    public int BillingReconciliationWebhookFailureLookbackHours { get; set; } = 72;
    public int BillingReconciliationTake { get; set; } = 100;
    public int BillingReconciliationWebhookFailureTake { get; set; } = 50;
    public bool MarketingManualBillingFallbackEnabled { get; set; } = true;
    public int ProvisioningRateLimitPerMinute { get; set; } = 20;
    public int MarketingPaymentRequestRateLimitPerMinute { get; set; } = 12;
    public int MarketingPaymentSubmitRateLimitPerMinute { get; set; } = 8;
    public int MarketingDownloadTrackRateLimitPerMinute { get; set; } = 40;
    public int LicenseAccessLookupRateLimitPerMinute { get; set; } = 60;
    public int AccountPortalRateLimitPerMinute { get; set; } = 60;
    public int AccountDeviceDeactivationRateLimitPerMinute { get; set; } = 20;
    public int InstallerDownloadAnomalyThresholdPerHour { get; set; } = 8;
    public int SelfServiceDeactivationAnomalyThresholdPerDay { get; set; } = 2;
    public int MarketingPaymentReplayGuardWindowMinutes { get; set; } = 15;
    public int MarketingPaymentProofMaxFileBytes { get; set; } = 10 * 1024 * 1024;
    public List<LicenseSigningKeyOptions> SigningKeys { get; set; } = [];
    public bool EnforceProtectedRoutes { get; set; } = true;
    public string[] SuspendedBlockedPathPrefixes { get; set; } = ["/api/checkout", "/api/refunds"];
    public List<LicensePlanDefinition> Plans { get; set; } =
    [
        new()
        {
            Code = "trial",
            SeatLimit = 0,
            FeatureFlags = ["checkout", "refunds", "reports-basic", "offline-grace"]
        },
        new()
        {
            Code = "starter",
            SeatLimit = 2,
            FeatureFlags = ["checkout", "refunds", "reports-basic"]
        },
        new()
        {
            Code = "growth",
            SeatLimit = 5,
            FeatureFlags = ["checkout", "refunds", "reports-advanced", "supplier-import"]
        },
        new()
        {
            Code = "pro",
            SeatLimit = 10,
            FeatureFlags = ["checkout", "refunds", "reports-advanced", "supplier-import", "multi-device"]
        }
    ];
    public BillingWebhookSecurityOptions WebhookSecurity { get; set; } = new();
    public LicenseAlertOptions Alerts { get; set; } = new();
}

public sealed class LicensePlanDefinition
{
    public string Code { get; set; } = string.Empty;
    public int SeatLimit { get; set; }
    public string[] FeatureFlags { get; set; } = [];
}

public sealed class LicenseSigningKeyOptions
{
    public string KeyId { get; set; } = string.Empty;
    public string? PrivateKeyPem { get; set; }
    public string? PublicKeyPem { get; set; }
}

public sealed class LicenseAlertOptions
{
    public bool Enabled { get; set; } = true;
    public int EvaluationIntervalSeconds { get; set; } = 30;
    public int WindowMinutes { get; set; } = 10;
    public int CooldownMinutes { get; set; } = 10;
    public int LicenseValidationSpikeThreshold { get; set; } = 20;
    public int WebhookFailureThreshold { get; set; } = 5;
    public int SecurityAnomalyThreshold { get; set; } = 8;
}

public sealed class BillingWebhookSecurityOptions
{
    public bool RequireSignature { get; set; } = true;
    public string SigningSecret { get; set; } = "smartpos-billing-webhook-secret-change-before-production";
    public string SigningSecretEnvironmentVariable { get; set; } = "SMARTPOS_BILLING_WEBHOOK_SIGNING_SECRET";
    public string SignatureHeaderName { get; set; } = "Stripe-Signature";
    public string SignatureScheme { get; set; } = "v1";
    public int TimestampToleranceSeconds { get; set; } = 300;
}

public sealed class StripeBillingOptions
{
    public bool Enabled { get; set; }
    public string ApiBaseUrl { get; set; } = "https://api.stripe.com";
    public string SecretKey { get; set; } = string.Empty;
    public string SecretKeyEnvironmentVariable { get; set; } = "SMARTPOS_STRIPE_SECRET_KEY";
    public string CheckoutSuccessUrl { get; set; } = string.Empty;
    public string CheckoutCancelUrl { get; set; } = string.Empty;
    public string StarterPriceId { get; set; } = string.Empty;
    public string ProPriceId { get; set; } = string.Empty;
    public string BusinessPriceId { get; set; } = string.Empty;
}
