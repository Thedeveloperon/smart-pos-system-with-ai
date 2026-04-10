using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SmartPos.Backend.IntegrationTests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private const string K1PrivateKeyPem = """
        -----BEGIN PRIVATE KEY-----
        MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDtQaprcoqCI5oa
        PViVCU6dg9h/cxp/LqFBXrmMksRo3a8Hp3lGuE+YtdJWH2zLHNtL+AiyszqZAT5V
        /TGwg3hLHDZn6/CncFmnlwkpKFimVlBFq82WDvew1IBxVbT4OyCh1RJyY1Y/9Hsy
        u+OzIHvpXy8OPshOekvb3BaZ+Uw/ZhVZWv/buJ6cHECy4IcvQTNh5Idfe5VrVsYB
        vfdULHzD9mresemM8R4DOWizYQItmT4fojwGhRYRiRxOLNKo9iIeuy3+sTElGURN
        TqG6vQ6b2vV3P5vRu4gb0rZ9kR5dXTQEP8XeY9MxXrV67rjx7Mjq1zcNYv1Jgi7m
        QYzFlJO5AgMBAAECggEAXA+85xB8+l6CL2hadQo1fR1p5pptT6hyXgE5knhoyiAr
        CJdNkcl26VS0F0L+XhoGZgYKqfyt4iz/WTJ0E4AQL2T1H4IH0ZDg2QzcOyIys+iO
        IVq23WFVb0IlzNRq8l9PHDynecdd8lcVbuxFQH58VmPeyHJIG1uND/TouDpqAbcF
        kQwPA5uvFNeERN6vBDVEwxYxSfuxbvSfn/K019U2XrFcKc62q5OkdqQbK6J8pduy
        oVRofivHwAzi0sikiu+xQ1F3q0q6+j7phcDn1VlfAUYrQ26QafPJrdZJGQycqZK6
        e/GkZJRBoRNF6UpCZOE454R/WD1Df0JC9Cy0g27r+QKBgQD4qMA0kNgkQpwuqp4+
        AXR+8vVrqTxgEQQEKuj6ByeYipr8pKHMtSE112F5IsJAvcGU4Ks6hqKvngT/JJ9F
        Ml51uhgRIHrsgT5pQYW4DeQ6SuROl4QTQ+HeYAZfIxDjtR7UL+1M+AL7ua65rbIn
        4DRfxiW+zRicfmeYf4aYkBCs9wKBgQD0Qr0kPxycP90yn/Tu7kE6mcn/gLi9xbIa
        w5Sx0G5j2j+OkeW/HiLRLPxCRtqMw36Vr4/sUCUF/gy2V8PhTeE4RZqQ7mAVRpjC
        UK2TTI411mCwzcuPt2yfY3392IVJHIBz2wuonVOhwe5y05O1YQK/G1ZLsBY8BiNn
        Z6PF65cIzwKBgQDR5OAZfwpz0SY03iClBmVno342Wqx0Cujw+6edJdzujlE1YWKS
        gXJ/GEdXEVgXfhWhrePbizpYM3LUS/2FU3cYuPUHv/sDGDWuc3iEXHWCHyWIka0S
        9gH6y+OU+uyOyZw0UCBnEBK0mZA7e7sencqX7ZJ+9HEJ6ElaGItszG7HEQKBgBJS
        f0WcxlSiJcGKZiEWFiaDKrfTvAfgMH/5c8nyzJUI5gOXxhgT9qCiMzn1fqdYcsJf
        rPgY+u38JI/4/WSFJwPFlNaSSvrNlN/elWabM3+uWQpqJX7eT3OVTvofp7/YN3p5
        T+KSCpfzqCNM46OTZ1VWg56h0skl3LoA+DP8fBPZAoGBAMFfldA9tCMRXvyf0YqZ
        eYNYZT7v5xLetgkW+WCNw2FkCjSXmrsXdOxR4OiuL4kRow7RNYhc77LlkQFvLtjy
        Uq405KKS+cHj6xZc8yT9xUFQ064khLFOdD+Wl9J5+1eCZAUJCoZrTy9sPfb33il8
        PPiHehubpHeHvuxFbu87Idkz
        -----END PRIVATE KEY-----
        """;

    private const string K1PublicKeyPem = """
        -----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7UGqa3KKgiOaGj1YlQlO
        nYPYf3Mafy6hQV65jJLEaN2vB6d5RrhPmLXSVh9syxzbS/gIsrM6mQE+Vf0xsIN4
        Sxw2Z+vwp3BZp5cJKShYplZQRavNlg73sNSAcVW0+DsgodUScmNWP/R7MrvjsyB7
        6V8vDj7ITnpL29wWmflMP2YVWVr/27ienBxAsuCHL0EzYeSHX3uVa1bGAb33VCx8
        w/Zq3rHpjPEeAzlos2ECLZk+H6I8BoUWEYkcTizSqPYiHrst/rExJRlETU6hur0O
        m9r1dz+b0buIG9K2fZEeXV00BD/F3mPTMV61eu648ezI6tc3DWL9SYIu5kGMxZST
        uQIDAQAB
        -----END PUBLIC KEY-----
        """;

    private const string K2PrivateKeyPem = """
        -----BEGIN PRIVATE KEY-----
        MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCVi+7rw22TpBRd
        Ik2qKfZmmxI09Aqt6mF8h72VEpl1XmXNX9rZ+M+bPwQhyj3By9Scb8OajLc9BfUw
        tVmzwTIhqaRGkRT0FzgLvsPQMqhshIfQfvB+I+xkHAHR3YJAsN3P8NHUkwIUJkVF
        nwIm6+Sn2ctMd5ASEdy8DPsYCTEfVGOeMCS2k7JhmskPIXqIzSeiGMw9eY3jIWQw
        N6ehloCWy4BmjagiM7eYwCkEvaRlbzi3V6r+y47b3dPZqXl1KrMlTfN1Nqpc+hVu
        v3CRZWt1blAcLf1CiDEcNWR4sBI4q8XFuiY54i3MOMARSDs8yaLklSUIzBtzVl3k
        ZQqnuBANAgMBAAECggEAQZzdvM9HumlZDevJC4nRs/8Bo/4W2WtmTk74HPnGHrrG
        C6+sw8novIKPe4vSQL7/j4tx1NM8aie9BhvrOXTgW+ikTNnGybmOO4j9PNGdF8+m
        DxJCzfVQ+DNZkQyQ43U2PM+6IHxHgzOvXPaA6TbCYeqqyegDbAouQMupN0iBJu8h
        9+hpLyLW5uBp9vwsfZ2pvhOQzwGvOFH7qJVseHJdxbKudueKvxSj69a9Mi+tfskw
        zJog/lbgiBMRQeRLD12yWfS6GUj8Und3zhFIOxOvlKwMLnH3VWi12eNCmLJQNRC0
        9hoS7AcdA4NtXZxsTwc/KvUaG6UPTUu9hhl+NPK3uQKBgQDGZ/6q8HkQoF++v9zr
        XsTtLrC4NyCstRWnHJQR5kKaIEBHQhm+M58J/6+h3+bEa5bF+/CiGTACu+8VsOxX
        JjkzFabk2jn3GK5vEHgH13q7dafMQROuQlieCniySrxsidzTGPAphPhegUndIACn
        xoxm5oXAQ27Wpjp/5q7qhKQpFwKBgQDA9RKSeaBI9S1tx9COb54Sx+c5e+ZCS4Ei
        mkw8arq2Hl0ITbpAYCd/0FjUaiaz+QCj99QZ+AnHJNU28q7hbPCqdfmta0G9DBnX
        7VecLtnWQvGdxv+MPetrO0BVRFyWyNnKrMwvnR+3usCVHr2hyG/I0eqGeLK67KuF
        On4oabl+ewKBgCdi6alhh4cHbzpcuCx5abpz9Fz9hJ0EbcH46GQNQ9d444nB035w
        nPfNLD6ERjlj6lBvTTvAqElCqZmyv5glXGGJwNHZiHxHCAnASTO1UQX5u0/O82s6
        fIETLxalw3YAgDff0X1MikmofNNK0RZ9Uc3zoUWjnVM7OI2/a6XeowANAoGBAIeV
        LMGjmM7rCErVVmRfZbFIqd6ogrkemNSZmuvxCtUhLLnC9BZ7+gVDfsdy91MKqjqM
        z4qX0TcPWIpNqDhZ9hmw4AnNDdoqgJZK/X6PJR362A/HXpVKhPtKHQBNEsoYw4A4
        PxlNzJWrMdsWSKU/U9zGM4bdlKjn1/W7jh4Te/W1AoGAPdw7R7c/Z/m7xFgaU/5H
        cUq9s27VF7gyTOsu7Jqg7bekHpH7YXavAUBGQ4o+NUosuGVpvpqhjS4/6LhCGKmd
        RS4/h405vXz1cb1TXMRA30l/iGsOF+Gtv0RwwQRjFWWQOU3J2eX25ati5oo+4q6J
        KK/a4Lj/Wa+FW8slpZMoO/4=
        -----END PRIVATE KEY-----
        """;

    private const string K2PublicKeyPem = """
        -----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlYvu68Ntk6QUXSJNqin2
        ZpsSNPQKrephfIe9lRKZdV5lzV/a2fjPmz8EIco9wcvUnG/Dmoy3PQX1MLVZs8Ey
        IamkRpEU9Bc4C77D0DKobISH0H7wfiPsZBwB0d2CQLDdz/DR1JMCFCZFRZ8CJuvk
        p9nLTHeQEhHcvAz7GAkxH1RjnjAktpOyYZrJDyF6iM0nohjMPXmN4yFkMDenoZaA
        lsuAZo2oIjO3mMApBL2kZW84t1eq/suO293T2al5dSqzJU3zdTaqXPoVbr9wkWVr
        dW5QHC39QogxHDVkeLASOKvFxbomOeItzDjAEUg7PMmi5JUlCMwbc1Zd5GUKp7gQ
        DQIDAQAB
        -----END PUBLIC KEY-----
        """;

    private readonly string sqliteDbPath = Path.Combine(
        Path.GetTempPath(),
        $"smartpos-it-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            var settings = new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Sqlite",
                ["ConnectionStrings:Sqlite"] = $"Data Source={sqliteDbPath}",
                ["CloudApi:ApiVersion"] = "v1",
                ["CloudApi:EnforceMinimumSupportedPosVersion"] = "true",
                ["CloudApi:MinimumSupportedPosVersion"] = "1.0.0",
                ["CloudApi:LatestPosVersion"] = "1.0.0",
                ["CloudApi:DefaultReleaseChannel"] = "stable",
                ["CloudApi:RequireInstallerChecksumInReleaseMetadata"] = "true",
                ["CloudApi:RequireInstallerSignatureInReleaseMetadata"] = "true",
                ["CloudApi:AllowRollbackToPreviousStable"] = "true",
                ["CloudApi:MinimumRollbackTargetVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:0:Channel"] = "stable",
                ["CloudApi:ReleaseChannels:0:LatestPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:0:MinimumSupportedPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:0:InstallerDownloadUrl"] = "https://downloads.smartpos.test/stable/SmartPOS-Setup.exe",
                ["CloudApi:ReleaseChannels:0:InstallerChecksumSha256"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                ["CloudApi:ReleaseChannels:0:InstallerSignatureSha256"] = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
                ["CloudApi:ReleaseChannels:0:InstallerSignatureAlgorithm"] = "sha256-rsa",
                ["CloudApi:ReleaseChannels:0:ReleaseNotesUrl"] = "https://docs.smartpos.test/releases/stable/1.0.0",
                ["CloudApi:ReleaseChannels:0:PublishedAtUtc"] = "2026-04-08T00:00:00Z",
                ["CloudApi:ReleaseChannels:0:RollbackTargetVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:1:Channel"] = "beta",
                ["CloudApi:ReleaseChannels:1:LatestPosVersion"] = "1.1.0-beta.1",
                ["CloudApi:ReleaseChannels:1:MinimumSupportedPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:1:InstallerDownloadUrl"] = "https://downloads.smartpos.test/beta/SmartPOS-Setup.exe",
                ["CloudApi:ReleaseChannels:1:InstallerChecksumSha256"] = "1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                ["CloudApi:ReleaseChannels:1:InstallerSignatureSha256"] = "bbcd1234567890abcdef0123456789abcdef0123456789abcdef0123456789ab",
                ["CloudApi:ReleaseChannels:1:InstallerSignatureAlgorithm"] = "sha256-rsa",
                ["CloudApi:ReleaseChannels:1:ReleaseNotesUrl"] = "https://docs.smartpos.test/releases/beta/1.1.0-beta.1",
                ["CloudApi:ReleaseChannels:1:PublishedAtUtc"] = "2026-04-08T00:00:00Z",
                ["CloudApi:ReleaseChannels:2:Channel"] = "internal",
                ["CloudApi:ReleaseChannels:2:LatestPosVersion"] = "1.1.0-internal.1",
                ["CloudApi:ReleaseChannels:2:MinimumSupportedPosVersion"] = "1.0.0",
                ["CloudApi:ReleaseChannels:2:InstallerDownloadUrl"] = "https://downloads.smartpos.test/internal/SmartPOS-Setup.exe",
                ["CloudApi:ReleaseChannels:2:InstallerChecksumSha256"] = "2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                ["CloudApi:ReleaseChannels:2:InstallerSignatureSha256"] = "ccde1234567890abcdef0123456789abcdef0123456789abcdef0123456789ab",
                ["CloudApi:ReleaseChannels:2:InstallerSignatureAlgorithm"] = "sha256-rsa",
                ["CloudApi:ReleaseChannels:2:ReleaseNotesUrl"] = "https://docs.smartpos.test/releases/internal/1.1.0-internal.1",
                ["CloudApi:ReleaseChannels:2:PublishedAtUtc"] = "2026-04-08T00:00:00Z",
                ["CloudApi:LegacyApiDeprecationEnabled"] = "true",
                ["CloudApi:LegacyApiDeprecationDateUtc"] = "2026-04-08T00:00:00Z",
                ["CloudApi:LegacyApiSunsetDateUtc"] = "2026-07-08T00:00:00Z",
                ["CloudApi:LegacyApiMigrationGuideUrl"] = "/cloud/v1/meta/contracts",
                ["CloudApi:RequiredWriteHeaders:0"] = "Idempotency-Key",
                ["CloudApi:RequiredWriteHeaders:1"] = "X-Device-Id",
                ["CloudApi:RequiredWriteHeaders:2"] = "X-POS-Version",
                ["JwtAuth:Issuer"] = "smartpos-api-tests",
                ["JwtAuth:Audience"] = "smartpos-tests",
                ["JwtAuth:SecretKey"] = "smartpos-integration-test-secret-key-2026",
                ["JwtAuth:ExpiryMinutes"] = "60",
                ["JwtAuth:CookieName"] = "smartpos_auth",
                ["JwtAuth:SecureCookie"] = "false",
                ["AuthSecurity:ImpossibleTravelLookbackMinutes"] = "30",
                ["AuthSecurity:ConcurrentDeviceWindowMinutes"] = "15",
                ["AuthSecurity:ConcurrentDeviceThreshold"] = "3",
                ["AuthSecurity:ConcurrentSourceThreshold"] = "2",
                ["AuthSecurity:EnableLoginLockout"] = "true",
                ["AuthSecurity:MaxFailedLoginAttempts"] = "5",
                ["AuthSecurity:FailedLoginAttemptWindowMinutes"] = "15",
                ["AuthSecurity:LockoutDurationMinutes"] = "15",
                ["AuthSecurity:FailureThrottleDelayMilliseconds"] = "10",
                ["AuthSecurity:EnforceSessionRevocation"] = "true",
                ["Licensing:DefaultShopCode"] = "default",
                ["Licensing:DefaultShopName"] = "Integration Test Shop",
                ["Licensing:DefaultBranchCode"] = "main",
                ["Licensing:AutoProvisionBranchAllocations"] = "true",
                ["Licensing:EnforceBranchSeatAllocation"] = "true",
                ["Licensing:Mode"] = "CloudCompatible",
                ["Licensing:RequireActivationEntitlementKey"] = "false",
                ["Licensing:CloudLicensingEndpointsEnabled"] = "true",
                ["Licensing:DefaultPlan"] = "trial",
                ["Licensing:GracePeriodDays"] = "7",
                ["Licensing:TrialPeriodDays"] = "14",
                ["Licensing:TrialSeatLimit"] = "3",
                ["Licensing:TokenTtlMinutes"] = "15",
                ["Licensing:TokenTtlHours"] = "24",
                ["Licensing:TokenRotationOverlapSeconds"] = "90",
                ["Licensing:TokenJtiCleanupIntervalSeconds"] = "300",
                ["Licensing:TokenJtiRetentionHours"] = "24",
                ["Licensing:OfflineGrantTtlHours"] = "48",
                ["Licensing:OfflineGrantMaxHours"] = "72",
                ["Licensing:OfflineMaxCheckoutOperations"] = "200",
                ["Licensing:OfflineMaxRefundOperations"] = "40",
                ["Licensing:OfflinePolicySnapshotEnforcementEnabled"] = "false",
                ["Licensing:OfflinePolicySnapshotTtlMinutes"] = "240",
                ["Licensing:OfflinePolicySnapshotClockSkewToleranceSeconds"] = "300",
                ["Licensing:OfflinePolicySnapshotProtectedPathPrefixes:0"] = "/api/checkout",
                ["Licensing:OfflinePolicySnapshotProtectedPathPrefixes:1"] = "/api/refunds",
                ["Licensing:OfflinePolicySnapshotProtectedPathPrefixes:2"] = "/api/ai",
                ["Licensing:Alerts:SecurityAnomalyThreshold"] = "8",
                ["Licensing:OpsAlerts:Enabled"] = "false",
                ["Licensing:OpsAlerts:WebhookUrl"] = "",
                ["Licensing:OpsAlerts:Channel"] = "integration-tests",
                ["Licensing:OpsAlerts:SourceSystem"] = "smartpos-backend-tests",
                ["Licensing:SigningKeyId"] = "it-k2",
                ["Licensing:SigningPrivateKeyPem"] = K2PrivateKeyPem,
                ["Licensing:VerificationPublicKeyPem"] = K2PublicKeyPem,
                ["Licensing:ActiveSigningKeyId"] = "it-k2",
                ["Licensing:SigningKeys:0:KeyId"] = "it-k1",
                ["Licensing:SigningKeys:0:PrivateKeyPem"] = K1PrivateKeyPem,
                ["Licensing:SigningKeys:0:PublicKeyPem"] = K1PublicKeyPem,
                ["Licensing:SigningKeys:1:KeyId"] = "it-k2",
                ["Licensing:SigningKeys:1:PrivateKeyPem"] = K2PrivateKeyPem,
                ["Licensing:SigningKeys:1:PublicKeyPem"] = K2PublicKeyPem,
                ["Licensing:TokenCookieEnabled"] = "true",
                ["Licensing:TokenCookieName"] = "smartpos_license",
                ["Licensing:TokenCookieSecure"] = "false",
                ["Licensing:TokenCookieSameSite"] = "Lax",
                ["Licensing:TokenCookiePath"] = "/",
                ["Licensing:AccessSuccessPageBaseUrl"] = "http://localhost/license/success",
                ["Licensing:InstallerDownloadBaseUrl"] = "https://downloads.smartpos.test/SmartPOS-Setup.exe",
                ["Licensing:InstallerDownloadProtectedEnabled"] = "true",
                ["Licensing:InstallerDownloadTokenTtlMinutes"] = "30",
                ["Licensing:InstallerDownloadSigningSecret"] = "smartpos-integration-installer-download-secret-2026",
                ["Licensing:InstallerChecksumSha256"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                ["Licensing:AccessDeliveryEmailEnabled"] = "false",
                ["Licensing:AccessDeliveryFromEmail"] = "noreply@smartpos.test",
                ["Licensing:SelfServiceDeviceDeactivationMaxPerDay"] = "2",
                ["Licensing:RequireSecondApprovalForHighValuePayments"] = "true",
                ["Licensing:HighValuePaymentSecondApprovalThreshold"] = "50000",
                ["Licensing:RequireStepUpApprovalForHighRiskAdminActions"] = "true",
                ["Licensing:HighRiskGraceExtensionDaysThreshold"] = "7",
                ["Licensing:HighRiskMassRevokeThreshold"] = "3",
                ["Licensing:EmergencyCommandEnvelopeTtlSeconds"] = "120",
                ["Licensing:EmergencyCommandSigningSecret"] = "smartpos-integration-emergency-command-secret-2026",
                ["Licensing:BankReconciliationMismatchToleranceAmount"] = "1",
                ["Licensing:BillingReconciliationEnabled"] = "false",
                ["Licensing:BillingReconciliationIntervalSeconds"] = "3600",
                ["Licensing:BillingReconciliationPeriodEndGraceHours"] = "24",
                ["Licensing:BillingReconciliationWebhookFailureLookbackHours"] = "72",
                ["Licensing:BillingReconciliationTake"] = "100",
                ["Licensing:BillingReconciliationWebhookFailureTake"] = "50",
                ["Licensing:ProvisioningRateLimitPerMinute"] = "600",
                ["Licensing:EnforceProtectedRoutes"] = "true",
                ["Licensing:WebhookSecurity:RequireSignature"] = "true",
                ["Licensing:WebhookSecurity:SigningSecret"] = "smartpos-integration-webhook-secret-2026",
                ["Licensing:WebhookSecurity:SignatureHeaderName"] = "Stripe-Signature",
                ["Licensing:WebhookSecurity:SignatureScheme"] = "v1",
                ["Licensing:WebhookSecurity:TimestampToleranceSeconds"] = "300",
                ["Purchasing:OcrProvider"] = "basic-text",
                ["AiInsights:PaymentProvider"] = "mockpay",
                ["AiInsights:CheckoutBaseUrl"] = "https://payments.smartpos.test/ai-checkout",
                ["AiInsights:CreditPacks:0:PackCode"] = "pack_100",
                ["AiInsights:CreditPacks:0:Credits"] = "100",
                ["AiInsights:CreditPacks:0:Price"] = "5",
                ["AiInsights:CreditPacks:0:Currency"] = "USD",
                ["AiInsights:EnableManualWalletTopUp"] = "true",
                ["AiInsights:EnableManualPaymentFallback"] = "true",
                ["AiInsights:PaymentCheckoutRateLimitPerMinute"] = "600",
                ["AiInsights:PaymentStatusRateLimitPerMinute"] = "600",
                ["AiInsights:PaymentWebhook:RequireSignature"] = "true",
                ["AiInsights:PaymentWebhook:SigningSecret"] = "smartpos-ai-webhook-test-secret-2026",
                ["AiInsights:PaymentWebhook:SigningSecretEnvironmentVariable"] = "SMARTPOS_AI_WEBHOOK_SIGNING_SECRET",
                ["AiInsights:PaymentWebhook:SignatureHeaderName"] = "X-AI-Payment-Signature",
                ["AiInsights:PaymentWebhook:SignatureScheme"] = "v1",
                ["AiInsights:PaymentWebhook:TimestampToleranceSeconds"] = "300",
                ["RecoveryOps:Enabled"] = "true",
                ["RecoveryOps:DryRun"] = "true",
                ["RecoveryOps:AllowCommandExecution"] = "false",
                ["RecoveryOps:CommandTimeoutSeconds"] = "120",
                ["RecoveryOps:ShellCommand"] = "bash",
                ["RecoveryOps:ScriptRootPath"] = "scripts/backup",
                ["RecoveryOps:BackupScriptName"] = "backup-db.sh",
                ["RecoveryOps:RestoreSmokeScriptName"] = "restore-smoke-test.sh",
                ["RecoveryOps:PreflightScriptName"] = "preflight-report.sh",
                ["RecoveryOps:BackupRootPath"] = "backups",
                ["RecoveryOps:MetricsFilePath"] = "backups/metrics/restore_metrics.jsonl",
                ["RecoveryOps:SchedulerEnabled"] = "false",
                ["RecoveryOps:SchedulerIntervalSeconds"] = "60",
                ["RecoveryOps:SchedulerRunOnStartup"] = "false",
                ["RecoveryOps:SchedulerRunPreflightFirst"] = "true",
                ["RecoveryOps:SchedulerBackupMode"] = "full",
                ["RecoveryOps:SchedulerBackupTier"] = "daily",
                ["RecoveryOps:MetricsAlertingEnabled"] = "false",
                ["RecoveryOps:MetricsAlertingIntervalSeconds"] = "300",
                ["RecoveryOps:MetricsAlertCooldownMinutes"] = "1",
                ["RecoveryOps:MaxRestoreDrillAgeHours"] = "168",
                ["RecoveryOps:RestoreDrillTargetRtoSeconds"] = "3600",
                ["RecoveryOps:RestoreDrillTargetRpoSeconds"] = "21600",
                ["Reminders:Enabled"] = "true",
                ["Reminders:SchedulerEnabled"] = "false",
                ["Reminders:SchedulerIntervalSeconds"] = "300",
                ["Reminders:AutoSeedDefaultRules"] = "true",
                ["Reminders:DefaultLowStockThreshold"] = "10",
                ["Reminders:LowStockTake"] = "20",
                ["Reminders:CurrentAppVersion"] = "1.0.0-test",
                ["Reminders:LatestAppVersion"] = "",
                ["Reminders:WeeklyReportDay"] = "Monday",
                ["Reminders:MonthlyReportDay"] = "1"
            };

            foreach (var (key, value) in GetAdditionalConfigurationOverrides())
            {
                settings[key] = value;
            }

            configBuilder.AddInMemoryCollection(settings);
        });
    }

    protected virtual IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing)
        {
            return;
        }

        try
        {
            if (File.Exists(sqliteDbPath))
            {
                File.Delete(sqliteDbPath);
            }
        }
        catch
        {
            // Best-effort cleanup for temp db.
        }
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Remove("Idempotency-Key");
        client.DefaultRequestHeaders.Add("Idempotency-Key", "integration-tests-default");
        client.DefaultRequestHeaders.Remove("X-Device-Id");
        client.DefaultRequestHeaders.Add("X-Device-Id", "integration-tests-device");
        client.DefaultRequestHeaders.Remove("X-POS-Version");
        client.DefaultRequestHeaders.Add("X-POS-Version", "it-pos-1.0.0");
    }
}
