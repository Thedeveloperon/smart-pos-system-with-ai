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
    public int TokenTtlHours { get; set; } = 24;
    public bool DisallowInlinePrivateKey { get; set; }
    public string SigningPrivateKeyEnvironmentVariable { get; set; } = "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM";
    public string SigningPrivateKeyPem { get; set; } = string.Empty;
    public string VerificationPublicKeyPem { get; set; } = string.Empty;
    public string SigningKeyId { get; set; } = "smartpos-k1";
    public string ActiveSigningKeyId { get; set; } = "smartpos-k1";
    public bool EncryptSensitiveDataAtRest { get; set; } = true;
    public string DataEncryptionKey { get; set; } = "smartpos-license-data-key-change-before-production";
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
}

public sealed class BillingWebhookSecurityOptions
{
    public bool RequireSignature { get; set; } = true;
    public string SigningSecret { get; set; } = "smartpos-billing-webhook-secret-change-before-production";
    public string SignatureHeaderName { get; set; } = "Stripe-Signature";
    public string SignatureScheme { get; set; } = "v1";
    public int TimestampToleranceSeconds { get; set; } = 300;
}
