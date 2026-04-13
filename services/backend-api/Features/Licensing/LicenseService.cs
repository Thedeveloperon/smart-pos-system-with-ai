using System.Security.Claims;
using System.Security.Cryptography;
using System.Net;
using System.Net.Mail;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Globalization;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.Purchases;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicenseService(
    SmartPosDbContext dbContext,
    AiCreditBillingService aiCreditBillingService,
    IOptions<LicenseOptions> optionsAccessor,
    IOptions<AiInsightOptions> aiInsightOptionsAccessor,
    LicensingMetrics metrics,
    IHttpContextAccessor httpContextAccessor,
    ILicensingAlertMonitor licensingAlertMonitor,
    IWebHostEnvironment webHostEnvironment,
    IHttpClientFactory httpClientFactory)
{
    private static readonly HashSet<string> SupportedBillingWebhookEvents = new(StringComparer.OrdinalIgnoreCase)
    {
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "checkout.session.completed"
    };
    private const string WebhookEventStatusProcessing = "processing";
    private const string WebhookEventStatusProcessed = "processed";
    private const string WebhookEventStatusFailed = "failed";
    private const string WebhookEventStatusDeadLetter = "dead_letter";
    private const string EncryptedValuePrefix = "enc:v1:";
    private const string DefaultDeviceKeyAlgorithm = "ECDSA_P256_SHA256";
    private const int DefaultManualPaymentExtensionDays = 30;
    private const string BankReconciliationMissingReferenceCode = "BANK_REFERENCE_MISSING";
    private const string BankReconciliationDuplicateReferenceCode = "BANK_REFERENCE_DUPLICATE";
    private const string BankReconciliationExpectedTotalMismatchCode = "BANK_TOTAL_MISMATCH";
    private const string BillingReconciliationDriftReasonCode = "period_end_elapsed_without_webhook";
    private const string EmergencyActionLockDevice = "lock_device";
    private const string EmergencyActionRevokeToken = "revoke_token";
    private const string EmergencyActionForceReauth = "force_reauth";
    private const string MarketingInvoiceMetadataPrefix = "MARKETING_REQUEST:";
    private const string MarketingPaymentSubmissionMetadataPrefix = "MARKETING_PAYMENT_SUBMISSION:";
    private const string OwnerAiCreditInvoiceMetadataPrefix = "OWNER_AI_CREDIT_INVOICE:";
    private const string AiCreditOrderSettlementReferencePrefix = "ai_order";
    private const string CloudOwnerAccountAiCreditOrderSource = "cloud_owner_account";
    private const int MarketingBankReferenceMaxLength = 128;
    private const string LocalOfflineMode = "LocalOffline";
    private const string OfflineLocalManualBatchEntitlementSource = "offline_local_batch_manual";
    private const int OfflineLocalManualBatchEntitlementCount = 10;
    private const int OfflineLocalManualBatchMaxActivations = 1000000;
    private const int OfflineLocalManualBatchTtlDays = 3650;
    private static readonly char[] AllowedBranchCodeCharacters = "abcdefghijklmnopqrstuvwxyz0123456789-_".ToCharArray();
    private static readonly HashSet<string> EmergencyActions = new(StringComparer.OrdinalIgnoreCase)
    {
        EmergencyActionLockDevice,
        EmergencyActionRevokeToken,
        EmergencyActionForceReauth
    };
    private static readonly HashSet<string> AllowedDepositSlipFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".pdf"
    };
    private static readonly Dictionary<string, MarketingPlanQuote> MarketingPlanCatalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["starter"] = new MarketingPlanQuote("starter", "trial", 0m, "USD", false),
        ["pro"] = new MarketingPlanQuote("pro", "growth", 19m, "USD", true),
        ["business"] = new MarketingPlanQuote("business", "pro", 49m, "USD", true)
    };
    private static readonly Dictionary<string, decimal> MarketingAiCreditPackageCatalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["trial_credits"] = 25m,
        ["pack_100"] = 100m,
        ["pack_500"] = 500m,
        ["pack_2000"] = 2000m
    };
    private static readonly string[] ManagedShopRolePriority =
    [
        SmartPosRoles.Owner,
        SmartPosRoles.Manager,
        SmartPosRoles.Cashier
    ];
    private static readonly HashSet<string> ManagedShopRoleCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        SmartPosRoles.Owner,
        SmartPosRoles.Manager,
        SmartPosRoles.Cashier
    };

    private enum TokenRotationMode
    {
        Immediate = 1,
        Overlap = 2
    }

    private enum TokenValidationPurpose
    {
        General = 1,
        Heartbeat = 2
    }

    private enum MarketingProofFileKind
    {
        Unknown = 0,
        Pdf = 1,
        Png = 2,
        Jpeg = 3,
        Webp = 4
    }

    public readonly record struct ValidatedLicenseTokenContext(
        Guid ShopId,
        string DeviceCode,
        Guid LicenseId,
        DateTimeOffset ValidUntil);

    private readonly record struct ManualOverrideContext(
        string Actor,
        string ReasonCode,
        string ActorNote,
        string AuditReason);

    private readonly record struct StepUpApprovalContext(
        string ApprovedBy,
        string ApprovalNote,
        bool Applied);

    private readonly record struct MarketingPlanQuote(
        string MarketingPlanCode,
        string InternalPlanCode,
        decimal AmountDue,
        string Currency,
        bool RequiresPayment);
    private readonly record struct BranchSeatPolicy(
        string BranchCode,
        int SeatQuota,
        int TotalAllocatedSeats);
    private readonly record struct StripeCheckoutSessionResult(
        string SessionId,
        string CheckoutUrl,
        DateTimeOffset? ExpiresAt);
    private readonly record struct StripeCheckoutSessionLookup(
        string SessionId,
        string Status,
        string PaymentStatus,
        string? CustomerId,
        string? SubscriptionId,
        DateTimeOffset? ExpiresAt,
        string? InvoiceId,
        string? InvoiceNumber,
        string? ShopCode,
        string? ShopName);
    private readonly record struct InstallerDownloadAccess(
        string? DownloadUrl,
        DateTimeOffset? ExpiresAt,
        bool IsProtected);
    private readonly record struct OwnerAccountProvisioningResult(
        AppUser User,
        string AccountState);
    private readonly record struct ShopDeactivationDependencySnapshot(
        int ActiveDevices,
        int NonTerminalSubscriptions,
        int OpenOrPendingInvoices,
        int PendingManualPayments,
        int PendingAiOrders,
        int PendingAiPayments)
    {
        public bool HasBlockingDependencies =>
            ActiveDevices > 0 ||
            NonTerminalSubscriptions > 0 ||
            OpenOrPendingInvoices > 0 ||
            PendingManualPayments > 0 ||
            PendingAiOrders > 0 ||
            PendingAiPayments > 0;
    }

    private readonly record struct OwnerManagedShopContext(
        AppUser User,
        Shop Shop,
        string RoleCode);

    private sealed class OwnerAiCreditInvoiceMetadataState
    {
        public string? PackCode { get; set; }
        public decimal? RequestedCredits { get; set; }
        public string? RequestedByUserId { get; set; }
        public string? RequestedByUsername { get; set; }
        public string? RequestedByFullName { get; set; }
        public string? RequestedNote { get; set; }
        public string? ApprovedBy { get; set; }
        public DateTimeOffset? ApprovedAt { get; set; }
        public string? ApprovedScope { get; set; }
        public string? ApprovedActorNote { get; set; }
        public string? RejectedBy { get; set; }
        public DateTimeOffset? RejectedAt { get; set; }
        public string? RejectedReasonCode { get; set; }
        public string? RejectedActorNote { get; set; }
    }

    private static readonly JsonSerializerOptions TokenSerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly LicenseOptions options = optionsAccessor.Value;
    private readonly Dictionary<string, LicensePlanDefinition> planCatalog = BuildPlanCatalog(optionsAccessor.Value);
    private readonly Dictionary<string, AiCreditPackOption> aiCreditPackCatalog = BuildAiCreditPackCatalog(aiInsightOptionsAccessor.Value);

    private bool IsLocalOfflineMode()
    {
        return string.Equals(
            NormalizeOptionalValue(options.Mode),
            LocalOfflineMode,
            StringComparison.OrdinalIgnoreCase);
    }

    public async Task<ProvisionChallengeResponse> CreateActivationChallengeAsync(
        ProvisionChallengeRequest request,
        CancellationToken cancellationToken)
    {
        var deviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (string.IsNullOrWhiteSpace(deviceCode))
        {
            throw new LicenseException(LicenseErrorCodes.Unprovisioned, "device_code is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var ttlSeconds = Math.Clamp(options.DeviceChallengeTtlSeconds, 30, 900);
        var challenge = new DeviceKeyChallenge
        {
            DeviceCode = deviceCode,
            Nonce = Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddSeconds(ttlSeconds)
        };

        dbContext.DeviceKeyChallenges.Add(challenge);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new ProvisionChallengeResponse
        {
            ChallengeId = challenge.Id.ToString(),
            TerminalId = deviceCode,
            DeviceCode = deviceCode,
            Nonce = challenge.Nonce,
            KeyAlgorithm = DefaultDeviceKeyAlgorithm,
            IssuedAt = challenge.CreatedAtUtc,
            ExpiresAt = challenge.ExpiresAtUtc
        };
    }

    public async Task<LicenseStatusResponse> ActivateAsync(
        ProvisionActivateRequest request,
        CancellationToken cancellationToken)
    {
        var deviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (string.IsNullOrWhiteSpace(deviceCode))
        {
            throw new LicenseException(LicenseErrorCodes.Unprovisioned, "device_code is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var requestSource = ResolveRequestSourceContext();
        var existingDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken);
        var activationEntitlement = await ResolveActivationEntitlementForActivationAsync(
            request.ActivationEntitlementKey,
            now,
            cancellationToken);

        Shop shop;
        if (existingDevice is not null)
        {
            shop = await dbContext.Shops
                .FirstOrDefaultAsync(x => x.Id == existingDevice.ShopId, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidActivationEntitlement,
                    "Device is linked to an unknown shop.",
                    StatusCodes.Status403Forbidden);

            if (activationEntitlement is not null &&
                activationEntitlement.Entitlement.ShopId != shop.Id)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidActivationEntitlement,
                    "activation_entitlement_key does not belong to this device shop.",
                    StatusCodes.Status403Forbidden);
            }
        }
        else
        {
            shop = activationEntitlement?.Shop ?? await GetOrCreateDefaultShopAsync(now, cancellationToken);
        }

        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        if (subscription.Status == SubscriptionStatus.Canceled)
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "Subscription is canceled. Device activation is blocked.",
                StatusCodes.Status403Forbidden);
        }

        var deviceKeyProof = await ResolveAndValidateDeviceKeyProofAsync(
            request,
            existingDevice,
            deviceCode,
            now,
            cancellationToken);

        var seatLimit = ResolveSeatLimit(subscription);
        var branchCode = ResolveBranchCode(request.BranchCode, existingDevice?.BranchCode);
        BranchSeatPolicy? branchPolicy = null;
        if (options.AutoProvisionBranchAllocations || options.EnforceBranchSeatAllocation)
        {
            branchPolicy = await EnsureBranchSeatPolicyAsync(
                shop,
                seatLimit,
                branchCode,
                now,
                cancellationToken);
        }

        var activeSeats = await dbContext.ProvisionedDevices
            .CountAsync(
                x => x.ShopId == shop.Id && x.Status == ProvisionedDeviceStatus.Active &&
                     (existingDevice == null || x.Id != existingDevice.Id),
                cancellationToken);
        var activeBranchSeats = await CountActiveSeatsByBranchAsync(
            shop.Id,
            branchCode,
            existingDevice?.Id,
            cancellationToken);

        var requiresSeat = existingDevice is null || existingDevice.Status != ProvisionedDeviceStatus.Active;
        if (requiresSeat && activeSeats >= seatLimit)
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                "Device activation failed because seat limit has been reached.",
                StatusCodes.Status409Conflict);
        }

        var branchSeatLimit = branchPolicy?.SeatQuota ?? seatLimit;
        if (requiresSeat &&
            options.EnforceBranchSeatAllocation &&
            activeBranchSeats >= branchSeatLimit)
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                $"Branch '{branchCode}' seat quota has been reached.",
                StatusCodes.Status409Conflict);
        }

        if (activationEntitlement is not null && requiresSeat)
        {
            ConsumeActivationEntitlement(activationEntitlement.Entitlement, now);
        }

        var appDevice = await dbContext.Devices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken);

        if (existingDevice is null)
        {
            existingDevice = new ProvisionedDevice
            {
                ShopId = shop.Id,
                DeviceCode = deviceCode,
                DeviceId = appDevice?.Id,
                Name = ResolveDeviceName(request.DeviceName),
                BranchCode = branchCode,
                Status = ProvisionedDeviceStatus.Active,
                AssignedAtUtc = now,
                LastHeartbeatAtUtc = now,
                DeviceKeyFingerprint = deviceKeyProof?.Fingerprint,
                DevicePublicKeySpki = deviceKeyProof?.PublicKeySpki,
                DeviceKeyAlgorithm = deviceKeyProof?.KeyAlgorithm,
                DeviceKeyRegisteredAtUtc = deviceKeyProof is null ? null : now,
                Shop = shop
            };
            dbContext.ProvisionedDevices.Add(existingDevice);
        }
        else
        {
            existingDevice.Name = ResolveDeviceName(request.DeviceName, existingDevice.Name);
            existingDevice.DeviceId = appDevice?.Id ?? existingDevice.DeviceId;
            existingDevice.BranchCode = branchCode;
            existingDevice.Status = ProvisionedDeviceStatus.Active;
            existingDevice.AssignedAtUtc = now;
            existingDevice.RevokedAtUtc = null;
            existingDevice.LastHeartbeatAtUtc = now;
            if (deviceKeyProof is not null)
            {
                existingDevice.DeviceKeyFingerprint = deviceKeyProof.Fingerprint;
                existingDevice.DevicePublicKeySpki = deviceKeyProof.PublicKeySpki;
                existingDevice.DeviceKeyAlgorithm = deviceKeyProof.KeyAlgorithm;
                existingDevice.DeviceKeyRegisteredAtUtc ??= now;
            }
        }

        IssuedLicenseResult issuedLicense;
        try
        {
            issuedLicense = await IssueLicenseAsync(
                shop,
                existingDevice,
                subscription,
                now,
                TokenRotationMode.Immediate,
                cancellationToken);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        if (requiresSeat)
        {
            await ForceReissueLicensesForShopAsync(
                shop,
                subscription,
                now,
                string.IsNullOrWhiteSpace(request.Actor) ? "system" : request.Actor.Trim(),
                "device_status_changed",
                existingDevice.Id,
                cancellationToken);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            ProvisionedDeviceId = existingDevice.Id,
            Action = "provision_activate",
            Actor = string.IsNullOrWhiteSpace(request.Actor) ? "system" : request.Actor.Trim(),
            Reason = request.Reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = deviceCode,
                branch_code = branchCode,
                branch_seat_quota = branchSeatLimit,
                branch_active_seats = activeBranchSeats + (requiresSeat ? 1 : 0),
                branch_total_allocated_seats = branchPolicy?.TotalAllocatedSeats,
                seat_limit = seatLimit,
                active_seats = activeSeats + (requiresSeat ? 1 : 0),
                subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                source_ip = requestSource.SourceIp,
                source_ip_prefix = requestSource.SourceIpPrefix,
                source_forwarded_for = requestSource.ForwardedFor,
                source_user_agent = requestSource.UserAgent,
                source_user_agent_family = requestSource.UserAgentFamily,
                source_fingerprint = requestSource.SourceFingerprint,
                activation_entitlement_id = activationEntitlement?.Entitlement.Id,
                activation_entitlement_source = activationEntitlement?.Entitlement.Source
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        metrics.RecordActivation();

        LicenseStatusSnapshot status;
        try
        {
            status = await ResolveStatusSnapshotAsync(deviceCode, issuedLicense.PlainToken, strictTokenValidation: true, cancellationToken);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        return CreateResponse(status with { LicenseToken = issuedLicense.PlainToken });
    }

    public async Task<LicenseStatusResponse> DeactivateAsync(
        ProvisionDeactivateRequest request,
        CancellationToken cancellationToken)
    {
        var deviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (string.IsNullOrWhiteSpace(deviceCode))
        {
            throw new LicenseException(LicenseErrorCodes.Unprovisioned, "device_code is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var requestSource = ResolveRequestSourceContext();
        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);
        var wasActive = provisionedDevice.Status == ProvisionedDeviceStatus.Active;

        provisionedDevice.Status = ProvisionedDeviceStatus.Revoked;
        provisionedDevice.RevokedAtUtc = now;
        provisionedDevice.LastHeartbeatAtUtc = now;

        List<LicenseRecord> activeLicenses;
        if (dbContext.Database.IsSqlite())
        {
            activeLicenses = (await dbContext.Licenses
                    .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                                x.Status == LicenseRecordStatus.Active)
                    .ToListAsync(cancellationToken))
                .Where(x => !x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now)
                .ToList();
        }
        else
        {
            activeLicenses = await dbContext.Licenses
                .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                            x.Status == LicenseRecordStatus.Active &&
                            (!x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now))
                .ToListAsync(cancellationToken);
        }

        foreach (var activeLicense in activeLicenses)
        {
            activeLicense.Status = LicenseRecordStatus.Revoked;
            activeLicense.RevokedAtUtc = now;
        }

        await RevokeTokenSessionsForLicensesAsync(
            activeLicenses.Select(x => x.Id),
            now,
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "provision_deactivate",
            Actor = string.IsNullOrWhiteSpace(request.Actor) ? "system" : request.Actor.Trim(),
            Reason = request.Reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = deviceCode,
                source_ip = requestSource.SourceIp,
                source_ip_prefix = requestSource.SourceIpPrefix,
                source_forwarded_for = requestSource.ForwardedFor,
                source_user_agent = requestSource.UserAgent,
                source_user_agent_family = requestSource.UserAgentFamily,
                source_fingerprint = requestSource.SourceFingerprint
            })
        });

        if (wasActive)
        {
            var subscription = await GetLatestSubscriptionAsync(provisionedDevice.ShopId, cancellationToken);
            if (subscription is not null)
            {
                await ForceReissueLicensesForShopAsync(
                    await dbContext.Shops.FirstAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken),
                    subscription,
                    now,
                    string.IsNullOrWhiteSpace(request.Actor) ? "system" : request.Actor.Trim(),
                    "device_status_changed",
                    provisionedDevice.Id,
                    cancellationToken);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var status = await ResolveStatusSnapshotAsync(deviceCode, null, strictTokenValidation: false, cancellationToken);
        return CreateResponse(status);
    }

    public async Task<LicenseStatusResponse> GetStatusAsync(
        string? deviceCode,
        string? licenseToken,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            return new LicenseStatusResponse
            {
                State = LicenseState.Unprovisioned.ToString().ToLowerInvariant(),
                DeviceCode = string.Empty,
                ServerTime = DateTimeOffset.UtcNow
            };
        }

        LicenseStatusSnapshot snapshot;
        try
        {
            snapshot = await ResolveStatusSnapshotAsync(
                normalizedDeviceCode,
                licenseToken,
                strictTokenValidation: !string.IsNullOrWhiteSpace(licenseToken),
                cancellationToken);

            snapshot = await RefreshStatusSnapshotTokenIfNeededAsync(
                normalizedDeviceCode,
                licenseToken,
                snapshot,
                cancellationToken);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        return CreateResponse(snapshot);
    }

    public async Task<ValidatedLicenseTokenContext> ValidateLicenseTokenAsync(
        string? licenseToken,
        CancellationToken cancellationToken)
    {
        var normalizedLicenseToken = NormalizeOptionalValue(licenseToken);
        if (string.IsNullOrWhiteSpace(normalizedLicenseToken))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "license_token is required.",
                StatusCodes.Status401Unauthorized);
        }

        try
        {
            var payload = ParseAndValidateToken(normalizedLicenseToken);
            var normalizedDeviceCode = NormalizeDeviceCode(payload.DeviceCode);
            if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token device code is invalid.",
                    StatusCodes.Status403Forbidden);
            }

            var provisionedDevice = await dbContext.ProvisionedDevices
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.Unprovisioned,
                    "Device is not provisioned.",
                    StatusCodes.Status403Forbidden);

            if (payload.ShopId != provisionedDevice.ShopId)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token is not valid for this shop.",
                    StatusCodes.Status403Forbidden);
            }

            if (!string.IsNullOrWhiteSpace(provisionedDevice.DeviceKeyFingerprint))
            {
                var payloadFingerprint = NormalizeOptionalValue(payload.DeviceKeyFingerprint);
                if (string.IsNullOrWhiteSpace(payloadFingerprint) ||
                    !string.Equals(
                        NormalizeKeyFingerprint(payloadFingerprint),
                        NormalizeKeyFingerprint(provisionedDevice.DeviceKeyFingerprint),
                        StringComparison.Ordinal))
                {
                    throw new LicenseException(
                        LicenseErrorCodes.DeviceKeyMismatch,
                        "license_token device key binding is invalid.",
                        StatusCodes.Status403Forbidden);
                }
            }

            var record = await dbContext.Licenses
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.Id == payload.LicenseId && x.ProvisionedDeviceId == provisionedDevice.Id,
                    cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token is unknown.",
                    StatusCodes.Status403Forbidden);

            var storedSignature = UnprotectSensitiveValue(record.Signature);
            if (!string.Equals(storedSignature, GetSignaturePart(normalizedLicenseToken), StringComparison.Ordinal))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token signature metadata mismatch.",
                    StatusCodes.Status403Forbidden);
            }

            await ValidateTokenSessionAsync(
                payload,
                provisionedDevice,
                TokenValidationPurpose.General,
                cancellationToken);

            var now = DateTimeOffset.UtcNow;
            if (record.Status == LicenseRecordStatus.Revoked ||
                (record.RevokedAtUtc.HasValue && now >= record.RevokedAtUtc.Value))
            {
                throw new LicenseException(
                    LicenseErrorCodes.TokenReplayDetected,
                    "license_token has been rotated or revoked.",
                    StatusCodes.Status403Forbidden);
            }

            return new ValidatedLicenseTokenContext(
                payload.ShopId,
                normalizedDeviceCode,
                payload.LicenseId,
                payload.ValidUntil);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }
    }

    private async Task<LicenseStatusSnapshot> RefreshStatusSnapshotTokenIfNeededAsync(
        string normalizedDeviceCode,
        string? requestLicenseToken,
        LicenseStatusSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(requestLicenseToken) ||
            (snapshot.State is not LicenseState.Active and not LicenseState.Grace))
        {
            return snapshot;
        }

        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);
        if (provisionedDevice is null)
        {
            return snapshot;
        }

        var hasReusableSnapshotToken = await HasReusableStatusTokenAsync(
            snapshot.LicenseToken,
            provisionedDevice,
            cancellationToken);
        if (hasReusableSnapshotToken)
        {
            return snapshot;
        }

        var subscription = await GetLatestSubscriptionAsync(provisionedDevice.ShopId, cancellationToken);
        if (subscription is null)
        {
            return snapshot;
        }

        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken);
        if (shop is null)
        {
            return snapshot;
        }

        var now = DateTimeOffset.UtcNow;
        var refreshedLicense = await IssueLicenseAsync(
            shop,
            provisionedDevice,
            subscription,
            now,
            TokenRotationMode.Overlap,
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "license_status_token_refreshed",
            Actor = "system",
            Reason = "status_refresh_stale_snapshot_token",
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                previous_state = snapshot.State.ToString().ToLowerInvariant(),
                issued_license_id = refreshedLicense.Record.Id
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        var refreshedSnapshot = await ResolveStatusSnapshotAsync(
            normalizedDeviceCode,
            refreshedLicense.PlainToken,
            strictTokenValidation: true,
            cancellationToken);

        return refreshedSnapshot with { LicenseToken = refreshedLicense.PlainToken };
    }

    private async Task<bool> HasReusableStatusTokenAsync(
        string? candidateToken,
        ProvisionedDevice provisionedDevice,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(candidateToken))
        {
            return false;
        }

        try
        {
            var resolved = await ResolveLicenseRecordAsync(
                provisionedDevice,
                candidateToken,
                strictTokenValidation: true,
                tokenValidationPurpose: TokenValidationPurpose.General,
                cancellationToken);

            return resolved is not null;
        }
        catch (LicenseException)
        {
            return false;
        }
    }

    public async Task<LicenseStatusResponse> HeartbeatAsync(
        LicenseHeartbeatRequest request,
        CancellationToken cancellationToken)
    {
        var deviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (string.IsNullOrWhiteSpace(deviceCode))
        {
            throw new LicenseException(LicenseErrorCodes.Unprovisioned, "device_code is required.");
        }

        if (string.IsNullOrWhiteSpace(request.LicenseToken))
        {
            throw new LicenseException(LicenseErrorCodes.InvalidToken, "license_token is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var requestSource = ResolveRequestSourceContext();
        LicenseStatusSnapshot currentStatus;
        try
        {
            currentStatus = await ResolveStatusSnapshotAsync(
                deviceCode,
                request.LicenseToken,
                strictTokenValidation: true,
                cancellationToken,
                tokenValidationPurpose: TokenValidationPurpose.Heartbeat);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        if (currentStatus.State == LicenseState.Unprovisioned)
        {
            throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);
        }

        if (currentStatus.State == LicenseState.Revoked)
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "License is revoked.",
                StatusCodes.Status403Forbidden);
        }

        if (currentStatus.State == LicenseState.Suspended)
        {
            throw new LicenseException(
                LicenseErrorCodes.LicenseExpired,
                "License has expired and grace period ended.",
                StatusCodes.Status403Forbidden);
        }

        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        var subscription = await GetLatestSubscriptionAsync(provisionedDevice.ShopId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.LicenseExpired,
                "Subscription not found for this device.",
                StatusCodes.Status403Forbidden);

        provisionedDevice.LastHeartbeatAtUtc = now;

        IssuedLicenseResult refreshedLicense;
        try
        {
            refreshedLicense = await IssueLicenseAsync(
                (await dbContext.Shops.FirstAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken)),
                provisionedDevice,
                subscription,
                now,
                TokenRotationMode.Overlap,
                cancellationToken);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "license_heartbeat",
            Actor = "device",
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = deviceCode,
                issued_license_id = refreshedLicense.Record.Id,
                source_ip = requestSource.SourceIp,
                source_ip_prefix = requestSource.SourceIpPrefix,
                source_forwarded_for = requestSource.ForwardedFor,
                source_user_agent = requestSource.UserAgent,
                source_user_agent_family = requestSource.UserAgentFamily,
                source_fingerprint = requestSource.SourceFingerprint
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        LicenseStatusSnapshot status;
        try
        {
            status = await ResolveStatusSnapshotAsync(deviceCode, refreshedLicense.PlainToken, strictTokenValidation: true, cancellationToken);
        }
        catch (Exception ex) when (IsLicensingConfigurationException(ex))
        {
            throw CreateLicensingConfigurationException(ex);
        }

        return CreateResponse(status with { LicenseToken = refreshedLicense.PlainToken });
    }

    public async Task<BillingProviderIdsResponse> UpsertBillingProviderIdsAsync(
        BillingProviderIdsUpsertRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var shop = await GetOrCreateShopAsync(request.ShopCode, now, cancellationToken);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);

        var normalizedCustomerId = NormalizeOptionalValue(request.CustomerId);
        var normalizedSubscriptionId = NormalizeOptionalValue(request.SubscriptionId);
        var normalizedPriceId = NormalizeOptionalValue(request.PriceId);

        var previousCustomerId = subscription.BillingCustomerId;
        var previousSubscriptionId = subscription.BillingSubscriptionId;
        var previousPriceId = subscription.BillingPriceId;

        subscription.BillingCustomerId = normalizedCustomerId;
        subscription.BillingSubscriptionId = normalizedSubscriptionId;
        subscription.BillingPriceId = normalizedPriceId;
        subscription.UpdatedAtUtc = now;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "billing_provider_ids_upserted",
            Actor = string.IsNullOrWhiteSpace(request.Actor) ? "billing-sync" : request.Actor.Trim(),
            Reason = request.Reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_code = shop.Code,
                previous = new
                {
                    customer_id = previousCustomerId,
                    subscription_id = previousSubscriptionId,
                    price_id = previousPriceId
                },
                current = new
                {
                    customer_id = normalizedCustomerId,
                    subscription_id = normalizedSubscriptionId,
                    price_id = normalizedPriceId
                }
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new BillingProviderIdsResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            CustomerId = subscription.BillingCustomerId,
            SubscriptionId = subscription.BillingSubscriptionId,
            PriceId = subscription.BillingPriceId,
            UpdatedAt = now
        };
    }

    public async Task<BillingWebhookEventResponse> HandleBillingWebhookAsync(
        BillingWebhookEventRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var eventType = NormalizeOptionalValue(request.EventType)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(eventType))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "event_type is required.",
                StatusCodes.Status400BadRequest);
        }

        if (!SupportedBillingWebhookEvents.Contains(eventType))
        {
            return new BillingWebhookEventResponse
            {
                EventType = eventType,
                Handled = false,
                Reason = "unsupported_event",
                ProcessedAt = now
            };
        }

        var providerEventId = NormalizeOptionalValue(request.EventId);
        if (string.IsNullOrWhiteSpace(providerEventId))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "event_id is required for idempotent webhook processing.",
                StatusCodes.Status400BadRequest);
        }

        var eventLog = await ReserveWebhookEventAsync(providerEventId, eventType, now, cancellationToken);
        if (eventLog is null)
        {
            var existingEvent = await dbContext.BillingWebhookEvents
                .AsNoTracking()
                .FirstAsync(x => x.ProviderEventId == providerEventId, cancellationToken);
            var existingStatus = NormalizeOptionalValue(existingEvent.Status)?.ToLowerInvariant();
            var reason = string.Equals(existingStatus, WebhookEventStatusDeadLetter, StringComparison.Ordinal)
                ? "dead_letter_event"
                : "duplicate_event";

            return new BillingWebhookEventResponse
            {
                EventType = eventType,
                Handled = false,
                Reason = reason,
                ShopId = existingEvent.ShopId,
                SubscriptionId = existingEvent.BillingSubscriptionId,
                ProcessedAt = now
            };
        }

        var subscription = await ResolveSubscriptionForWebhookAsync(request, now, cancellationToken);
        if (subscription is null)
        {
            var deadLettered = await MarkWebhookEventFailedAsync(eventLog, LicenseErrorCodes.InvalidWebhook, now, cancellationToken);
            if (deadLettered)
            {
                return new BillingWebhookEventResponse
                {
                    EventType = eventType,
                    Handled = false,
                    Reason = "dead_letter_event",
                    ShopId = eventLog.ShopId,
                    SubscriptionId = eventLog.BillingSubscriptionId,
                    ProcessedAt = now
                };
            }

            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "Webhook does not include enough identifiers to resolve a subscription.",
                StatusCodes.Status400BadRequest);
        }

        var previousState = new
        {
            subscription.Status,
            subscription.Plan,
            subscription.PeriodStartUtc,
            subscription.PeriodEndUtc,
            subscription.BillingCustomerId,
            subscription.BillingSubscriptionId,
            subscription.BillingPriceId
        };

        var normalizedCustomerId = NormalizeOptionalValue(request.CustomerId);
        var normalizedSubscriptionId = NormalizeOptionalValue(request.SubscriptionId);
        var normalizedPriceId = NormalizeOptionalValue(request.PriceId);

        if (normalizedCustomerId is not null)
        {
            subscription.BillingCustomerId = normalizedCustomerId;
        }

        if (normalizedSubscriptionId is not null)
        {
            subscription.BillingSubscriptionId = normalizedSubscriptionId;
        }

        if (normalizedPriceId is not null)
        {
            subscription.BillingPriceId = normalizedPriceId;
        }

        try
        {
            var previousStatus = subscription.Status;
            var previousPlan = subscription.Plan;
            var previousPeriodStart = subscription.PeriodStartUtc;
            var previousPeriodEnd = subscription.PeriodEndUtc;
            var webhookActor = string.IsNullOrWhiteSpace(request.Actor) ? "billing-webhook" : request.Actor.Trim();
            CustomerActivationEntitlementResponse? activationEntitlementResponse = null;
            LicenseAccessDeliveryResponse? accessDeliveryResponse = null;

            switch (eventType)
            {
                case "invoice.paid":
                    subscription.Status = SubscriptionStatus.Active;
                    ApplyWebhookPeriodBounds(subscription, request.PeriodStart, request.PeriodEnd);
                    break;

                case "invoice.payment_failed":
                    subscription.Status = SubscriptionStatus.PastDue;
                    ApplyWebhookPeriodBounds(subscription, request.PeriodStart, request.PeriodEnd);
                    break;

                case "customer.subscription.updated":
                {
                    var mappedStatus = MapWebhookSubscriptionStatus(request.SubscriptionStatus);
                    if (mappedStatus.HasValue)
                    {
                        subscription.Status = mappedStatus.Value;
                    }

                    var normalizedPlan = NormalizeOptionalValue(request.Plan);
                    if (!string.IsNullOrWhiteSpace(normalizedPlan))
                    {
                        normalizedPlan = ResolvePlanCode(normalizedPlan);
                        subscription.Plan = normalizedPlan;
                        subscription.SeatLimit = ResolveSeatLimitFromPlan(normalizedPlan);
                        subscription.FeatureFlagsJson = ResolveFeatureFlagsJson(normalizedPlan);
                    }

                    ApplyWebhookPeriodBounds(subscription, request.PeriodStart, request.PeriodEnd);
                    break;
                }

                case "customer.subscription.deleted":
                    subscription.Status = SubscriptionStatus.Canceled;
                    if (request.PeriodEnd.HasValue)
                    {
                        subscription.PeriodEndUtc = request.PeriodEnd.Value;
                    }
                    else if (subscription.PeriodEndUtc > now)
                    {
                        subscription.PeriodEndUtc = now;
                    }

                    break;
            }

            subscription.UpdatedAtUtc = now;
            var shouldForceReissue = HasSubscriptionTokenRelevantChange(
                previousStatus,
                previousPlan,
                previousPeriodStart,
                previousPeriodEnd,
                subscription);

            var shop = await dbContext.Shops
                .FirstOrDefaultAsync(x => x.Id == subscription.ShopId, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidWebhook,
                    "Webhook subscription references an unknown shop.",
                    StatusCodes.Status400BadRequest);
            var shopCode = shop.Code;
            if (string.Equals(eventType, "invoice.paid", StringComparison.OrdinalIgnoreCase))
            {
                activationEntitlementResponse = await IssueActivationEntitlementAsync(
                    shop,
                    ResolveSeatLimit(subscription),
                    "billing_webhook_invoice_paid",
                    providerEventId,
                    webhookActor,
                    now,
                    cancellationToken);
                accessDeliveryResponse = await DeliverAccessDetailsAsync(
                    shop,
                    activationEntitlementResponse,
                    request.CustomerEmail,
                    "billing_webhook_invoice_paid",
                    providerEventId,
                    webhookActor,
                    now,
                    cancellationToken);
            }

            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = subscription.ShopId,
                Action = "billing_webhook_processed",
                Actor = webhookActor,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    event_id = providerEventId,
                    event_type = eventType,
                    occurred_at = request.OccurredAt,
                    shop_code = shopCode,
                    activation_entitlement_id = activationEntitlementResponse?.EntitlementId,
                    access_delivery_email_status = accessDeliveryResponse?.EmailDelivery.Status,
                    access_delivery_success_page_url = accessDeliveryResponse?.SuccessPageUrl,
                    previous = new
                    {
                        subscription_status = previousState.Status.ToString().ToLowerInvariant(),
                        plan = previousState.Plan,
                        period_start = previousState.PeriodStartUtc,
                        period_end = previousState.PeriodEndUtc,
                        customer_id = previousState.BillingCustomerId,
                        subscription_id = previousState.BillingSubscriptionId,
                        price_id = previousState.BillingPriceId
                    },
                    current = new
                    {
                        subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                        plan = subscription.Plan,
                        period_start = subscription.PeriodStartUtc,
                        period_end = subscription.PeriodEndUtc,
                        customer_id = subscription.BillingCustomerId,
                        subscription_id = subscription.BillingSubscriptionId,
                        price_id = subscription.BillingPriceId
                    }
                })
            });

            if (shouldForceReissue)
            {
                await ForceReissueLicensesForShopAsync(
                    shop,
                    subscription,
                    now,
                    webhookActor,
                    "subscription_status_or_plan_changed",
                    excludedProvisionedDeviceId: null,
                    cancellationToken);
            }

            eventLog.Status = WebhookEventStatusProcessed;
            eventLog.ShopId = subscription.ShopId;
            eventLog.BillingSubscriptionId = subscription.BillingSubscriptionId;
            eventLog.LastErrorCode = null;
            eventLog.DeadLetteredAtUtc = null;
            eventLog.ProcessedAtUtc = now;
            eventLog.UpdatedAtUtc = now;

            await dbContext.SaveChangesAsync(cancellationToken);

            return new BillingWebhookEventResponse
            {
                EventType = eventType,
                Handled = true,
                ShopId = subscription.ShopId,
                ShopCode = shopCode,
                SubscriptionId = subscription.BillingSubscriptionId,
                SubscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
                Plan = subscription.Plan,
                PeriodEnd = subscription.PeriodEndUtc,
                ActivationEntitlement = activationEntitlementResponse,
                AccessDelivery = accessDeliveryResponse,
                ProcessedAt = now
            };
        }
        catch (LicenseException ex)
        {
            var deadLettered = await MarkWebhookEventFailedAsync(eventLog, ex.Code, now, cancellationToken);
            if (deadLettered)
            {
                return new BillingWebhookEventResponse
                {
                    EventType = eventType,
                    Handled = false,
                    Reason = "dead_letter_event",
                    ShopId = eventLog.ShopId,
                    SubscriptionId = eventLog.BillingSubscriptionId,
                    ProcessedAt = now
                };
            }

            throw;
        }
        catch (Exception ex)
        {
            var deadLettered = await MarkWebhookEventFailedAsync(eventLog, ex.GetType().Name, now, cancellationToken);
            if (deadLettered)
            {
                return new BillingWebhookEventResponse
                {
                    EventType = eventType,
                    Handled = false,
                    Reason = "dead_letter_event",
                    ShopId = eventLog.ShopId,
                    SubscriptionId = eventLog.BillingSubscriptionId,
                    ProcessedAt = now
                };
            }

            throw;
        }
    }

    public BillingWebhookEventRequest MapStripeWebhookEvent(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "Webhook payload is empty.",
                StatusCodes.Status400BadRequest);
        }

        JsonElement root;
        try
        {
            using var document = JsonDocument.Parse(payload);
            root = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "Webhook payload is invalid JSON.",
                StatusCodes.Status400BadRequest);
        }

        var eventId = TryGetString(root, "id");
        var eventType = TryGetString(root, "type");
        if (string.IsNullOrWhiteSpace(eventId) || string.IsNullOrWhiteSpace(eventType))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhook,
                "Stripe webhook is missing required fields (id/type).",
                StatusCodes.Status400BadRequest);
        }

        var request = new BillingWebhookEventRequest
        {
            EventId = eventId,
            EventType = eventType,
            OccurredAt = TryGetUnixTimestamp(root, "created"),
            Actor = "stripe-webhook"
        };

        if (!TryGetObject(root, "data", out var dataElement) ||
            !TryGetObject(dataElement, "object", out var stripeObject))
        {
            return request;
        }

        request.CustomerId = TryGetString(stripeObject, "customer");
        request.CustomerEmail =
            TryGetString(stripeObject, "customer_email")
            ?? TryGetNestedString(stripeObject, "customer_details", "email");

        var metadata = TryGetObject(stripeObject, "metadata", out var metadataElement)
            ? metadataElement
            : default;
        if (metadata.ValueKind == JsonValueKind.Object)
        {
            request.ShopCode =
                TryGetString(metadata, "shop_code")
                ?? TryGetString(metadata, "shopCode");
            request.Plan =
                TryGetString(metadata, "internal_plan_code")
                ?? TryGetString(metadata, "plan")
                ?? TryGetString(metadata, "plan_code");
            request.CustomerEmail ??= TryGetString(metadata, "contact_email");
        }

        switch (eventType.Trim().ToLowerInvariant())
        {
            case "invoice.paid":
            case "invoice.payment_failed":
                request.SubscriptionId = TryGetString(stripeObject, "subscription");
                request.PriceId =
                    TryGetNestedString(stripeObject, "lines", "data", "price", "id")
                    ?? TryGetNestedString(stripeObject, "lines", "data", "plan", "id");
                request.PeriodStart =
                    TryGetNestedUnixTimestamp(stripeObject, "lines", "data", "period", "start")
                    ?? TryGetUnixTimestamp(stripeObject, "period_start");
                request.PeriodEnd =
                    TryGetNestedUnixTimestamp(stripeObject, "lines", "data", "period", "end")
                    ?? TryGetUnixTimestamp(stripeObject, "period_end");
                break;

            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                request.SubscriptionId = TryGetString(stripeObject, "id");
                request.SubscriptionStatus = TryGetString(stripeObject, "status");
                request.PriceId =
                    TryGetNestedString(stripeObject, "items", "data", "price", "id")
                    ?? TryGetNestedString(stripeObject, "items", "data", "plan", "id");
                request.PeriodStart = TryGetUnixTimestamp(stripeObject, "current_period_start");
                request.PeriodEnd = TryGetUnixTimestamp(stripeObject, "current_period_end");
                break;

            case "checkout.session.completed":
                request.SubscriptionId = TryGetString(stripeObject, "subscription");
                request.PriceId = TryGetString(stripeObject, "price");
                request.SubscriptionStatus = TryGetString(stripeObject, "status");
                request.CustomerEmail ??=
                    TryGetNestedString(stripeObject, "customer_details", "email")
                    ?? TryGetString(stripeObject, "customer_email");
                break;
        }

        if (string.IsNullOrWhiteSpace(request.Plan))
        {
            request.Plan = ResolveInternalPlanCodeForStripePrice(request.PriceId);
        }

        if (string.IsNullOrWhiteSpace(request.SubscriptionId) &&
            TryGetObject(stripeObject, "subscription_details", out var subscriptionDetails))
        {
            request.SubscriptionId = TryGetString(subscriptionDetails, "id");
        }

        return request;
    }

    public async Task<SubscriptionReconciliationResponse> ReconcileSubscriptionStateAsync(
        SubscriptionReconciliationRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var subscription = await ResolveSubscriptionByIdentifiersAsync(
            request.SubscriptionId,
            request.CustomerId,
            request.ShopCode,
            now,
            cancellationToken);

        if (subscription is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidReconciliation,
                "Reconciliation does not include enough identifiers to resolve a subscription.",
                StatusCodes.Status400BadRequest);
        }

        var shopCode = await dbContext.Shops
            .Where(x => x.Id == subscription.ShopId)
            .Select(x => x.Code)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(shopCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidReconciliation,
                "Unable to resolve shop for subscription reconciliation.",
                StatusCodes.Status400BadRequest);
        }

        var previousState = new
        {
            subscription.Status,
            subscription.Plan,
            subscription.PeriodStartUtc,
            subscription.PeriodEndUtc,
            subscription.BillingCustomerId,
            subscription.BillingSubscriptionId,
            subscription.BillingPriceId
        };

        var normalizedSubscriptionStatus = NormalizeOptionalValue(request.SubscriptionStatus);
        if (!string.IsNullOrWhiteSpace(normalizedSubscriptionStatus))
        {
            var mappedStatus = MapWebhookSubscriptionStatus(normalizedSubscriptionStatus);
            if (!mappedStatus.HasValue)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidReconciliation,
                    $"Unsupported subscription_status '{normalizedSubscriptionStatus}'.",
                    StatusCodes.Status400BadRequest);
            }

            subscription.Status = mappedStatus.Value;
        }

        var normalizedPlan = NormalizeOptionalValue(request.Plan);
        if (!string.IsNullOrWhiteSpace(normalizedPlan))
        {
            normalizedPlan = ResolvePlanCode(normalizedPlan);
            subscription.Plan = normalizedPlan;
            subscription.SeatLimit = ResolveSeatLimitFromPlan(normalizedPlan);
            subscription.FeatureFlagsJson = ResolveFeatureFlagsJson(normalizedPlan);
        }

        if (request.PeriodStart.HasValue)
        {
            subscription.PeriodStartUtc = request.PeriodStart.Value;
        }

        if (request.PeriodEnd.HasValue)
        {
            subscription.PeriodEndUtc = request.PeriodEnd.Value;
        }

        var normalizedCustomerId = NormalizeOptionalValue(request.CustomerId);
        if (normalizedCustomerId is not null)
        {
            subscription.BillingCustomerId = normalizedCustomerId;
        }

        var normalizedSubscriptionId = NormalizeOptionalValue(request.SubscriptionId);
        if (normalizedSubscriptionId is not null)
        {
            subscription.BillingSubscriptionId = normalizedSubscriptionId;
        }

        var normalizedPriceId = NormalizeOptionalValue(request.PriceId);
        if (normalizedPriceId is not null)
        {
            subscription.BillingPriceId = normalizedPriceId;
        }

        subscription.UpdatedAtUtc = now;
        var shouldForceReissue = HasSubscriptionTokenRelevantChange(
            previousState.Status,
            previousState.Plan,
            previousState.PeriodStartUtc,
            previousState.PeriodEndUtc,
            subscription);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = subscription.ShopId,
            Action = "subscription_reconciled",
            Actor = string.IsNullOrWhiteSpace(request.Actor) ? "billing-reconciliation" : request.Actor.Trim(),
            Reason = request.Reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                reconciliation_id = NormalizeOptionalValue(request.ReconciliationId),
                source = "server_reconciliation",
                shop_code = shopCode,
                previous = new
                {
                    subscription_status = previousState.Status.ToString().ToLowerInvariant(),
                    plan = previousState.Plan,
                    period_start = previousState.PeriodStartUtc,
                    period_end = previousState.PeriodEndUtc,
                    customer_id = previousState.BillingCustomerId,
                    subscription_id = previousState.BillingSubscriptionId,
                    price_id = previousState.BillingPriceId
                },
                current = new
                {
                    subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                    plan = subscription.Plan,
                    period_start = subscription.PeriodStartUtc,
                    period_end = subscription.PeriodEndUtc,
                    customer_id = subscription.BillingCustomerId,
                    subscription_id = subscription.BillingSubscriptionId,
                    price_id = subscription.BillingPriceId
                }
            })
        });

        if (shouldForceReissue)
        {
            await ForceReissueLicensesForShopAsync(
                await dbContext.Shops.FirstAsync(x => x.Id == subscription.ShopId, cancellationToken),
                subscription,
                now,
                string.IsNullOrWhiteSpace(request.Actor) ? "billing-reconciliation" : request.Actor.Trim(),
                "subscription_status_or_plan_changed",
                excludedProvisionedDeviceId: null,
                cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new SubscriptionReconciliationResponse
        {
            ShopId = subscription.ShopId,
            ShopCode = shopCode,
            CustomerId = subscription.BillingCustomerId,
            SubscriptionId = subscription.BillingSubscriptionId,
            PriceId = subscription.BillingPriceId,
            SubscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
            Plan = subscription.Plan,
            PeriodStart = subscription.PeriodStartUtc,
            PeriodEnd = subscription.PeriodEndUtc,
            ReconciledAt = now
        };
    }

    public async Task<CustomerActivationEntitlementResponse> GetLatestActivationEntitlementAsync(
        string? shopCode,
        CancellationToken cancellationToken)
    {
        var resolvedShopCode = ResolveShopCode(shopCode);
        var shop = await dbContext.Shops
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Code == resolvedShopCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.ActivationEntitlementNotFound,
                "No activation entitlement was found for this shop.",
                StatusCodes.Status404NotFound);

        var entitlement = (await dbContext.CustomerActivationEntitlements
                .AsNoTracking()
                .Where(x => x.ShopId == shop.Id)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefault()
            ?? throw new LicenseException(
                LicenseErrorCodes.ActivationEntitlementNotFound,
                "No activation entitlement was found for this shop.",
                StatusCodes.Status404NotFound);

        return MapActivationEntitlementResponse(entitlement, shop.Code);
    }

    public async Task<LicenseAccessSuccessResponse> GetLicenseAccessSuccessAsync(
        string activationEntitlementKey,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var resolved = await ResolveActivationEntitlementByPresentedKeyAsync(
            activationEntitlementKey,
            cancellationToken);
        var subscription = await GetLatestSubscriptionAsync(resolved.Shop.Id, cancellationToken);
        var seatLimit = subscription is null ? Math.Max(1, options.TrialSeatLimit) : ResolveSeatLimit(subscription);
        var entitlementState = DetermineEntitlementState(resolved.Entitlement, now);
        var activationEntitlement = MapActivationEntitlementResponse(
            resolved.Entitlement,
            resolved.Shop.Code);
        var installerDownloadAccess = BuildInstallerDownloadAccessForSuccess(resolved, now);

        return new LicenseAccessSuccessResponse
        {
            GeneratedAt = now,
            ShopId = resolved.Shop.Id,
            ShopCode = resolved.Shop.Code,
            ShopName = resolved.Shop.Name,
            SubscriptionStatus = (subscription?.Status ?? SubscriptionStatus.Trialing).ToString().ToLowerInvariant(),
            Plan = subscription?.Plan ?? ResolvePlanCode(options.DefaultPlan),
            SeatLimit = seatLimit,
            EntitlementState = entitlementState,
            CanActivate = string.Equals(entitlementState, "active", StringComparison.Ordinal),
            InstallerDownloadUrl = installerDownloadAccess.DownloadUrl,
            InstallerDownloadExpiresAt = installerDownloadAccess.ExpiresAt,
            InstallerDownloadProtected = installerDownloadAccess.IsProtected,
            InstallerChecksumSha256 = NormalizeOptionalValue(options.InstallerChecksumSha256),
            ActivationEntitlement = activationEntitlement
        };
    }

    public async Task<CustomerLicensePortalResponse> GetCustomerLicensePortalAsync(
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var context = await ResolveCurrentShopContextAsync(now, cancellationToken);
        var shop = context.Shop;
        var subscription = await GetLatestSubscriptionAsync(shop.Id, cancellationToken);
        var seatLimit = subscription is null ? Math.Max(1, options.TrialSeatLimit) : ResolveSeatLimit(subscription);

        var devices = (await dbContext.ProvisionedDevices
                .AsNoTracking()
                .Where(x => x.ShopId == shop.Id)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.LastHeartbeatAtUtc ?? x.AssignedAtUtc)
            .ThenBy(x => x.DeviceCode, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var latestLicenseByDevice = new Dictionary<Guid, LicenseRecord>();
        var deviceIds = devices.Select(x => x.Id).Distinct().ToList();
        if (deviceIds.Count > 0)
        {
            latestLicenseByDevice = (await dbContext.Licenses
                    .AsNoTracking()
                    .Where(x => deviceIds.Contains(x.ProvisionedDeviceId))
                    .ToListAsync(cancellationToken))
                .GroupBy(x => x.ProvisionedDeviceId)
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .OrderByDescending(x => x.IssuedAtUtc)
                        .First());
        }

        var latestEntitlement = (await dbContext.CustomerActivationEntitlements
                .AsNoTracking()
                .Where(x => x.ShopId == shop.Id)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefault();

        var activeSeats = devices.Count(x => x.Status == ProvisionedDeviceStatus.Active);
        var deactivationLimitPerDay = Math.Max(0, options.SelfServiceDeviceDeactivationMaxPerDay);
        var deactivationsUsedToday = await CountSelfServiceDeactivationsUsedTodayAsync(shop.Id, now, cancellationToken);
        var remaining = Math.Max(0, deactivationLimitPerDay - deactivationsUsedToday);

        return new CustomerLicensePortalResponse
        {
            GeneratedAt = now,
            ShopId = shop.Id,
            ShopCode = shop.Code,
            ShopName = shop.Name,
            SubscriptionStatus = (subscription?.Status ?? SubscriptionStatus.Trialing).ToString().ToLowerInvariant(),
            Plan = subscription?.Plan ?? ResolvePlanCode(options.DefaultPlan),
            SeatLimit = seatLimit,
            ActiveSeats = activeSeats,
            SelfServiceDeactivationLimitPerDay = deactivationLimitPerDay,
            SelfServiceDeactivationsUsedToday = deactivationsUsedToday,
            SelfServiceDeactivationsRemainingToday = remaining,
            CanDeactivateMoreDevicesToday = remaining > 0,
            LatestActivationEntitlement = latestEntitlement is null
                ? null
                : MapActivationEntitlementResponse(latestEntitlement, shop.Code),
            Devices = devices
                .Select(device =>
                {
                    latestLicenseByDevice.TryGetValue(device.Id, out var latestLicense);
                    var licenseState = latestLicense is null
                        ? (device.Status == ProvisionedDeviceStatus.Revoked
                            ? LicenseState.Revoked
                            : LicenseState.Unprovisioned)
                        : DetermineState(device, subscription, latestLicense, now);
                    return new CustomerLicensePortalDeviceRow
                    {
                        ProvisionedDeviceId = device.Id,
                        TerminalId = device.DeviceCode,
                        DeviceCode = device.DeviceCode,
                        DeviceName = device.Name,
                        BranchCode = ResolveBranchCode(device.BranchCode),
                        DeviceStatus = device.Status.ToString().ToLowerInvariant(),
                        LicenseState = licenseState.ToString().ToLowerInvariant(),
                        AssignedAt = device.AssignedAtUtc,
                        LastHeartbeatAt = device.LastHeartbeatAtUtc,
                        ValidUntil = latestLicense?.ValidUntil,
                        GraceUntil = latestLicense?.GraceUntil,
                        IsCurrentDevice = !string.IsNullOrWhiteSpace(context.CurrentDeviceCode) &&
                                          string.Equals(context.CurrentDeviceCode, device.DeviceCode, StringComparison.Ordinal)
                    };
                })
                .ToList()
        };
    }

    public async Task<AiCreditInvoiceRowResponse> CreateOwnerAiCreditInvoiceAsync(
        OwnerAiCreditInvoiceCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var ownerContext = await ResolveCurrentOwnerManagedShopContextAsync(cancellationToken);
        var pack = ResolveConfiguredAiCreditPack(request.PackCode);
        var normalizedNote = NormalizeOptionalValue(request.Note);
        var invoiceNumber = await ResolveManualBillingInvoiceNumberAsync(null, cancellationToken);

        var metadata = new OwnerAiCreditInvoiceMetadataState
        {
            PackCode = pack.PackCode,
            RequestedCredits = pack.Credits,
            RequestedByUserId = ownerContext.User.Id.ToString("D"),
            RequestedByUsername = ownerContext.User.Username,
            RequestedByFullName = ownerContext.User.FullName,
            RequestedNote = normalizedNote
        };

        var invoice = new ManualBillingInvoice
        {
            ShopId = ownerContext.Shop.Id,
            Shop = ownerContext.Shop,
            InvoiceNumber = invoiceNumber,
            AmountDue = decimal.Round(pack.Price, 2, MidpointRounding.AwayFromZero),
            AmountPaid = 0m,
            Currency = ResolveCurrency(pack.Currency),
            Status = ManualBillingInvoiceStatus.Open,
            DueAtUtc = now.AddDays(7),
            Notes = BuildOwnerAiCreditInvoiceNotes(metadata),
            CreatedBy = ownerContext.User.Username,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var aiCreditOrder = new AiCreditOrder
        {
            ShopId = ownerContext.Shop.Id,
            Shop = ownerContext.Shop,
            InvoiceId = invoice.Id,
            Invoice = invoice,
            TargetUserId = ownerContext.User.Id,
            TargetUser = ownerContext.User,
            TargetUsername = ownerContext.User.Username,
            PackageCode = pack.PackCode,
            RequestedCredits = RoundAiCredits(pack.Credits),
            SettledCredits = 0m,
            Status = AiCreditOrderStatus.Submitted,
            Source = CloudOwnerAccountAiCreditOrderSource,
            MetadataJson = SerializeOwnerAiCreditInvoiceMetadata(metadata),
            SubmittedAtUtc = now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.ManualBillingInvoices.Add(invoice);
        dbContext.AiCreditOrders.Add(aiCreditOrder);
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = ownerContext.Shop.Id,
            Action = "owner_ai_credit_invoice_created",
            Actor = ownerContext.User.Username,
            Reason = "cloud_owner_invoice_created",
            MetadataJson = JsonSerializer.Serialize(new
            {
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                ai_credit_order_id = aiCreditOrder.Id,
                pack_code = pack.PackCode,
                requested_credits = aiCreditOrder.RequestedCredits,
                amount_due = invoice.AmountDue,
                currency = invoice.Currency
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapAiCreditInvoiceRow(invoice, aiCreditOrder, ownerContext.Shop.Code);
    }

    public async Task<AiCreditInvoicesResponse> GetOwnerAiCreditInvoicesAsync(
        int take,
        CancellationToken cancellationToken)
    {
        var ownerContext = await ResolveCurrentOwnerManagedShopContextAsync(cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 200);

        var query = dbContext.AiCreditOrders
            .AsNoTracking()
            .Include(x => x.Invoice)
            .Where(x =>
                x.ShopId == ownerContext.Shop.Id &&
                x.Source == CloudOwnerAccountAiCreditOrderSource &&
                x.InvoiceId.HasValue);

        List<AiCreditOrder> orders;
        if (dbContext.Database.IsSqlite())
        {
            orders = (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.SubmittedAtUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            orders = await query
                .OrderByDescending(x => x.SubmittedAtUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var items = orders
            .Where(x => x.Invoice is not null)
            .Select(x => MapAiCreditInvoiceRow(x.Invoice!, x, ownerContext.Shop.Code))
            .ToList();

        return new AiCreditInvoicesResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Count = items.Count,
            Items = items
        };
    }

    public async Task<AiCreditInvoicesResponse> GetAdminPendingAiCreditInvoicesAsync(
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 300);
        var pendingStates = new[]
        {
            AiCreditOrderStatus.Submitted,
            AiCreditOrderStatus.PendingVerification,
            AiCreditOrderStatus.Verified
        };

        var query = dbContext.AiCreditOrders
            .AsNoTracking()
            .Include(x => x.Invoice)
            .Include(x => x.Shop)
            .Where(x =>
                x.Source == CloudOwnerAccountAiCreditOrderSource &&
                x.InvoiceId.HasValue &&
                pendingStates.Contains(x.Status));

        List<AiCreditOrder> orders;
        if (dbContext.Database.IsSqlite())
        {
            orders = (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.SubmittedAtUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            orders = await query
                .OrderByDescending(x => x.SubmittedAtUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var items = orders
            .Where(x => x.Invoice is not null)
            .Select(x =>
            {
                var shopCode = x.Shop?.Code ?? ResolveShopCode(null);
                return MapAiCreditInvoiceRow(x.Invoice!, x, shopCode);
            })
            .ToList();

        return new AiCreditInvoicesResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Count = items.Count,
            Items = items
        };
    }

    public async Task<AdminAiCreditInvoiceActionResponse> ApproveOwnerAiCreditInvoiceAsync(
        Guid invoiceId,
        AdminAiCreditInvoiceApproveRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (invoiceId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "invoice_id is required.",
                StatusCodes.Status400BadRequest);
        }

        var actorNote = NormalizeOptionalValue(request.ActorNote);
        if (string.IsNullOrWhiteSpace(actorNote))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "actor_note is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var actor = ResolveCurrentAdminActor();
        var actorScope = ResolveCurrentAdminScope();
        var aiCreditOrder = await ResolveOwnerAiCreditOrderByInvoiceIdAsync(invoiceId, cancellationToken);
        if (aiCreditOrder.Status == AiCreditOrderStatus.Rejected)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Rejected AI credit invoices cannot be approved.",
                StatusCodes.Status409Conflict);
        }

        var invoice = aiCreditOrder.Invoice
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "AI credit invoice is missing invoice metadata.",
                StatusCodes.Status409Conflict);
        var metadata = ParseOwnerAiCreditInvoiceMetadata(aiCreditOrder.MetadataJson);

        if (aiCreditOrder.Status != AiCreditOrderStatus.Settled)
        {
            if (invoice.Status == ManualBillingInvoiceStatus.Canceled)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidPaymentStatus,
                    "Canceled AI credit invoices cannot be approved.",
                    StatusCodes.Status409Conflict);
            }

            invoice.AmountPaid = invoice.AmountDue;
            invoice.Status = ManualBillingInvoiceStatus.Paid;
            invoice.UpdatedAtUtc = now;

            metadata.ApprovedBy = actor;
            metadata.ApprovedAt = now;
            metadata.ApprovedScope = actorScope;
            metadata.ApprovedActorNote = actorNote;
            metadata.RejectedBy = null;
            metadata.RejectedAt = null;
            metadata.RejectedReasonCode = null;
            metadata.RejectedActorNote = null;
            aiCreditOrder.MetadataJson = SerializeOwnerAiCreditInvoiceMetadata(metadata);

            aiCreditOrder.Status = AiCreditOrderStatus.Verified;
            aiCreditOrder.VerifiedAtUtc ??= now;
            aiCreditOrder.UpdatedAtUtc = now;
            await SettleAiCreditOrderAsync(aiCreditOrder, actor, now, cancellationToken);

            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = aiCreditOrder.ShopId,
                Action = "owner_ai_credit_invoice_approved",
                Actor = actor,
                Reason = "cloud_owner_invoice_approved",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    invoice_id = invoice.Id,
                    invoice_number = invoice.InvoiceNumber,
                    ai_credit_order_id = aiCreditOrder.Id,
                    credits_settled = aiCreditOrder.SettledCredits,
                    wallet_ledger_reference = aiCreditOrder.WalletLedgerReference,
                    actor_scope = actorScope,
                    actor_note = actorNote
                }),
                CreatedAtUtc = now
            });

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var shopCode = aiCreditOrder.Shop?.Code ?? ResolveShopCode(null);
        return new AdminAiCreditInvoiceActionResponse
        {
            Invoice = MapAiCreditInvoiceRow(invoice, aiCreditOrder, shopCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminAiCreditInvoiceActionResponse> RejectOwnerAiCreditInvoiceAsync(
        Guid invoiceId,
        AdminAiCreditInvoiceRejectRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (invoiceId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "invoice_id is required.",
                StatusCodes.Status400BadRequest);
        }

        var actorNote = NormalizeOptionalValue(request.ActorNote);
        if (string.IsNullOrWhiteSpace(actorNote))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "actor_note is required.",
                StatusCodes.Status400BadRequest);
        }

        var reasonCode = NormalizeReasonCode(request.ReasonCode) ?? "owner_ai_credit_invoice_rejected";
        var now = DateTimeOffset.UtcNow;
        var actor = ResolveCurrentAdminActor();
        var actorScope = ResolveCurrentAdminScope();
        var aiCreditOrder = await ResolveOwnerAiCreditOrderByInvoiceIdAsync(invoiceId, cancellationToken);
        if (aiCreditOrder.Status == AiCreditOrderStatus.Settled)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Settled AI credit invoices cannot be rejected.",
                StatusCodes.Status409Conflict);
        }

        var invoice = aiCreditOrder.Invoice
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "AI credit invoice is missing invoice metadata.",
                StatusCodes.Status409Conflict);

        if (aiCreditOrder.Status != AiCreditOrderStatus.Rejected)
        {
            var metadata = ParseOwnerAiCreditInvoiceMetadata(aiCreditOrder.MetadataJson);
            metadata.RejectedBy = actor;
            metadata.RejectedAt = now;
            metadata.RejectedReasonCode = reasonCode;
            metadata.RejectedActorNote = actorNote;
            metadata.ApprovedBy = null;
            metadata.ApprovedAt = null;
            metadata.ApprovedScope = null;
            metadata.ApprovedActorNote = null;
            aiCreditOrder.MetadataJson = SerializeOwnerAiCreditInvoiceMetadata(metadata);

            aiCreditOrder.Status = AiCreditOrderStatus.Rejected;
            aiCreditOrder.RejectedAtUtc = now;
            aiCreditOrder.UpdatedAtUtc = now;
            aiCreditOrder.SettlementError = reasonCode;

            invoice.Status = ManualBillingInvoiceStatus.Canceled;
            invoice.UpdatedAtUtc = now;

            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = aiCreditOrder.ShopId,
                Action = "owner_ai_credit_invoice_rejected",
                Actor = actor,
                Reason = reasonCode,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    invoice_id = invoice.Id,
                    invoice_number = invoice.InvoiceNumber,
                    ai_credit_order_id = aiCreditOrder.Id,
                    actor_scope = actorScope,
                    actor_note = actorNote
                }),
                CreatedAtUtc = now
            });

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var shopCode = aiCreditOrder.Shop?.Code ?? ResolveShopCode(null);
        return new AdminAiCreditInvoiceActionResponse
        {
            Invoice = MapAiCreditInvoiceRow(invoice, aiCreditOrder, shopCode),
            ProcessedAt = now
        };
    }

    public async Task<CustomerSelfServiceDeviceDeactivationResponse> DeactivateDeviceViaSelfServiceAsync(
        string deviceCode,
        CustomerSelfServiceDeviceDeactivationRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var context = await ResolveCurrentShopContextAsync(now, cancellationToken);
        var targetDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(
                x => x.ShopId == context.Shop.Id && x.DeviceCode == normalizedDeviceCode,
                cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned for your shop.",
                StatusCodes.Status404NotFound);

        if (targetDevice.Status != ProvisionedDeviceStatus.Active)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Only active devices can be deactivated.",
                StatusCodes.Status409Conflict);
        }

        var deactivationLimitPerDay = Math.Max(0, options.SelfServiceDeviceDeactivationMaxPerDay);
        if (deactivationLimitPerDay <= 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.SelfServiceDeactivationLimitReached,
                "Self-service device deactivation is disabled.",
                StatusCodes.Status409Conflict);
        }

        var deactivationsUsedToday = await CountSelfServiceDeactivationsUsedTodayAsync(context.Shop.Id, now, cancellationToken);
        if (deactivationsUsedToday >= deactivationLimitPerDay)
        {
            throw new LicenseException(
                LicenseErrorCodes.SelfServiceDeactivationLimitReached,
                "Daily self-service device deactivation limit reached.",
                StatusCodes.Status409Conflict);
        }

        if (!string.IsNullOrWhiteSpace(context.CurrentDeviceCode) &&
            string.Equals(context.CurrentDeviceCode, normalizedDeviceCode, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Current device cannot be self-deactivated from this session.",
                StatusCodes.Status409Conflict);
        }

        var actor = ResolveCurrentAdminActor();
        var reason = NormalizeOptionalValue(request.Reason) ?? "self_service_seat_recovery";
        await DeactivateAsync(new ProvisionDeactivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = actor,
            Reason = reason
        }, cancellationToken);

        deactivationsUsedToday++;
        var remaining = Math.Max(0, deactivationLimitPerDay - deactivationsUsedToday);
        var deactivationAnomalyThreshold = Math.Max(1, options.SelfServiceDeactivationAnomalyThresholdPerDay);
        if (deactivationsUsedToday >= deactivationAnomalyThreshold)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("self_service_device_deactivation_spike");
        }

        if (remaining == 0)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("self_service_device_deactivation_limit_reached");
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = context.Shop.Id,
            ProvisionedDeviceId = targetDevice.Id,
            Action = "self_service_device_deactivate",
            Actor = actor,
            Reason = reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                deactivations_used_today = deactivationsUsedToday,
                deactivation_limit_per_day = deactivationLimitPerDay,
                deactivations_remaining_today = remaining
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new CustomerSelfServiceDeviceDeactivationResponse
        {
            ShopId = context.Shop.Id,
            ShopCode = context.Shop.Code,
            DeviceCode = normalizedDeviceCode,
            Status = ProvisionedDeviceStatus.Revoked.ToString().ToLowerInvariant(),
            Reason = reason,
            DeactivationsUsedToday = deactivationsUsedToday,
            DeactivationLimitPerDay = deactivationLimitPerDay,
            DeactivationsRemainingToday = remaining,
            ProcessedAt = now
        };
    }

    public async Task<AdminShopsLicensingSnapshotResponse> GetAdminShopsSnapshotAsync(
        string? search,
        bool includeInactive,
        int take,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedTake = Math.Clamp(take, 1, 500);
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();

        var shopsQuery = dbContext.Shops.AsNoTracking();
        if (!includeInactive)
        {
            shopsQuery = shopsQuery.Where(x => x.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            shopsQuery = shopsQuery.Where(x =>
                x.Code.ToLower().Contains(normalizedSearch) ||
                x.Name.ToLower().Contains(normalizedSearch));
        }

        var shops = await shopsQuery
            .OrderBy(x => x.Code)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        if (shops.Count == 0)
        {
            return new AdminShopsLicensingSnapshotResponse
            {
                GeneratedAt = now,
                Items = []
            };
        }

        var shopIds = shops.Select(x => x.Id).ToList();
        var subscriptions = await dbContext.Subscriptions
            .AsNoTracking()
            .Where(x => shopIds.Contains(x.ShopId))
            .ToListAsync(cancellationToken);
        var devices = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .Where(x => shopIds.Contains(x.ShopId))
            .ToListAsync(cancellationToken);
        var deviceIds = devices.Select(x => x.Id).ToList();
        var licenses = deviceIds.Count == 0
            ? []
            : await dbContext.Licenses
                .AsNoTracking()
                .Where(x => deviceIds.Contains(x.ProvisionedDeviceId))
                .ToListAsync(cancellationToken);

        var latestSubscriptionByShop = subscriptions
            .GroupBy(x => x.ShopId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                    .First());

        var latestLicenseByDevice = licenses
            .GroupBy(x => x.ProvisionedDeviceId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(x => x.IssuedAtUtc)
                    .First());

        var latestActivationEntitlementByShop = (await dbContext.CustomerActivationEntitlements
                .AsNoTracking()
                .Where(x => shopIds.Contains(x.ShopId))
                .ToListAsync(cancellationToken))
            .GroupBy(x => x.ShopId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(x => x.IssuedAtUtc)
                    .First());

        var rows = new List<AdminShopLicensingSnapshotRow>(shops.Count);

        foreach (var shop in shops)
        {
            latestSubscriptionByShop.TryGetValue(shop.Id, out var subscription);
            latestActivationEntitlementByShop.TryGetValue(shop.Id, out var latestActivationEntitlement);
            var shopDevices = devices
                .Where(x => x.ShopId == shop.Id)
                .OrderBy(x => x.DeviceCode, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var deviceRows = new List<AdminDeviceSeatRow>(shopDevices.Count);
            foreach (var device in shopDevices)
            {
                latestLicenseByDevice.TryGetValue(device.Id, out var latestLicense);
                var licenseState = latestLicense is null
                    ? (device.Status == ProvisionedDeviceStatus.Revoked
                        ? LicenseState.Revoked
                        : LicenseState.Unprovisioned)
                    : DetermineState(device, subscription, latestLicense, now);

                deviceRows.Add(new AdminDeviceSeatRow
                {
                    ProvisionedDeviceId = device.Id,
                    DeviceCode = device.DeviceCode,
                    DeviceName = device.Name,
                    BranchCode = ResolveBranchCode(device.BranchCode),
                    DeviceStatus = device.Status.ToString().ToLowerInvariant(),
                    LicenseState = licenseState.ToString().ToLowerInvariant(),
                    ValidUntil = latestLicense?.ValidUntil,
                    GraceUntil = latestLicense?.GraceUntil,
                    LastHeartbeatAt = device.LastHeartbeatAtUtc
                });
            }

            var seatLimit = subscription is null ? Math.Max(1, options.TrialSeatLimit) : ResolveSeatLimit(subscription);
            rows.Add(new AdminShopLicensingSnapshotRow
            {
                ShopId = shop.Id,
                ShopCode = shop.Code,
                ShopName = shop.Name,
                IsActive = shop.IsActive,
                SubscriptionStatus = (subscription?.Status ?? SubscriptionStatus.Trialing).ToString().ToLowerInvariant(),
                Plan = subscription?.Plan ?? ResolvePlanCode(options.DefaultPlan),
                SeatLimit = seatLimit,
                ActiveSeats = shopDevices.Count(x => x.Status == ProvisionedDeviceStatus.Active),
                TotalDevices = shopDevices.Count,
                LatestActivationEntitlement = latestActivationEntitlement is null
                    ? null
                    : MapActivationEntitlementResponse(latestActivationEntitlement, shop.Code),
                Devices = deviceRows
            });
        }

        return new AdminShopsLicensingSnapshotResponse
        {
            GeneratedAt = now,
            Items = rows
        };
    }

    public async Task<AdminShopMutationResponse> CreateAdminShopAsync(
        AdminShopCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_create");
        var shopCode = NormalizeMarketingShopCode(request.ShopCode);
        var shopName = ResolveManagedShopName(request.ShopName, "shop_name");
        var ownerUsername = ResolveMarketingOwnerUsername(request.OwnerUsername);
        var ownerPassword = ResolveMarketingOwnerPassword(request.OwnerPassword);
        var ownerFullName = ResolveMarketingOwnerFullName(request.OwnerFullName, shopName);

        var shopExists = await dbContext.Shops
            .AsNoTracking()
            .AnyAsync(x => x.Code.ToLower() == shopCode.ToLower(), cancellationToken);
        if (shopExists)
        {
            throw new LicenseException(
                LicenseErrorCodes.DuplicateSubmission,
                "shop_code already exists.",
                StatusCodes.Status409Conflict);
        }

        var ownerUsernameExists = await dbContext.Users
            .AsNoTracking()
            .AnyAsync(x => x.Username.ToLower() == ownerUsername, cancellationToken);
        if (ownerUsernameExists)
        {
            throw new LicenseException(
                LicenseErrorCodes.DuplicateSubmission,
                "owner_username is already in use.",
                StatusCodes.Status409Conflict);
        }

        var ownerRole = await ResolveManagedShopRoleEntityAsync(SmartPosRoles.Owner, cancellationToken);
        var shop = new Shop
        {
            Code = shopCode,
            Name = shopName,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = null
        };

        var ownerUser = new AppUser
        {
            StoreId = shop.Id,
            Username = ownerUsername,
            FullName = ownerFullName,
            PasswordHash = string.Empty,
            IsActive = true,
            CreatedAtUtc = now,
            LastLoginAtUtc = null
        };
        ownerUser.PasswordHash = PasswordHashing.HashPassword(ownerUser, ownerPassword);

        dbContext.Shops.Add(shop);
        dbContext.Users.Add(ownerUser);
        dbContext.UserRoles.Add(new UserRole
        {
            UserId = ownerUser.Id,
            RoleId = ownerRole.Id,
            AssignedAtUtc = now,
            User = ownerUser,
            Role = ownerRole
        });

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_created",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                shop_name = shop.Name,
                is_active = shop.IsActive,
                owner_user_id = ownerUser.Id,
                owner_username = ownerUser.Username,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_create",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                shop_name = shop.Name,
                is_active = shop.IsActive,
                owner_user_id = ownerUser.Id,
                owner_username = ownerUser.Username,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopMutationResponse
        {
            Action = "create",
            Shop = MapAdminShopMutationRow(shop),
            Owner = MapAdminShopOwnerSummary(ownerUser),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopMutationResponse> UpdateAdminShopAsync(
        Guid shopId,
        AdminShopUpdateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_update");
        var shop = await ResolveExistingShopByIdAsync(shopId, cancellationToken);
        var changed = new List<string>();

        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(request.ShopCode)))
        {
            var normalizedRequestedCode = NormalizeMarketingShopCode(request.ShopCode);
            if (!string.Equals(shop.Code, normalizedRequestedCode, StringComparison.OrdinalIgnoreCase))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "shop_code is immutable and cannot be changed.",
                    StatusCodes.Status409Conflict);
            }
        }

        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(request.ShopName)))
        {
            var nextShopName = ResolveManagedShopName(request.ShopName, "shop_name");
            if (!string.Equals(shop.Name, nextShopName, StringComparison.Ordinal))
            {
                shop.Name = nextShopName;
                shop.UpdatedAtUtc = now;
                changed.Add("shop_name");
            }
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_updated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                shop_name = shop.Name,
                is_active = shop.IsActive,
                changed,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_update",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                shop_name = shop.Name,
                is_active = shop.IsActive,
                changed,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopMutationResponse
        {
            Action = "update",
            Shop = MapAdminShopMutationRow(shop),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopMutationResponse> DeactivateAdminShopAsync(
        Guid shopId,
        AdminShopDeactivateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_deactivate");
        var shop = await ResolveExistingShopByIdAsync(shopId, cancellationToken);
        var dependencySnapshot = await BuildShopDeactivationDependencySnapshotAsync(shop.Id, cancellationToken);

        if (dependencySnapshot.HasBlockingDependencies)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"Shop cannot be deactivated while active dependents exist (active_devices={dependencySnapshot.ActiveDevices}, non_terminal_subscriptions={dependencySnapshot.NonTerminalSubscriptions}, open_or_pending_invoices={dependencySnapshot.OpenOrPendingInvoices}, pending_manual_payments={dependencySnapshot.PendingManualPayments}, pending_ai_orders={dependencySnapshot.PendingAiOrders}, pending_ai_payments={dependencySnapshot.PendingAiPayments}).",
                StatusCodes.Status409Conflict);
        }

        var wasActive = shop.IsActive;
        shop.IsActive = false;
        shop.UpdatedAtUtc = now;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_deactivated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                was_active = wasActive,
                is_active = shop.IsActive,
                active_devices = dependencySnapshot.ActiveDevices,
                non_terminal_subscriptions = dependencySnapshot.NonTerminalSubscriptions,
                open_or_pending_invoices = dependencySnapshot.OpenOrPendingInvoices,
                pending_manual_payments = dependencySnapshot.PendingManualPayments,
                pending_ai_orders = dependencySnapshot.PendingAiOrders,
                pending_ai_payments = dependencySnapshot.PendingAiPayments,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_deactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                was_active = wasActive,
                is_active = shop.IsActive,
                active_devices = dependencySnapshot.ActiveDevices,
                non_terminal_subscriptions = dependencySnapshot.NonTerminalSubscriptions,
                open_or_pending_invoices = dependencySnapshot.OpenOrPendingInvoices,
                pending_manual_payments = dependencySnapshot.PendingManualPayments,
                pending_ai_orders = dependencySnapshot.PendingAiOrders,
                pending_ai_payments = dependencySnapshot.PendingAiPayments,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopMutationResponse
        {
            Action = "deactivate",
            Shop = MapAdminShopMutationRow(shop),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopMutationResponse> ReactivateAdminShopAsync(
        Guid shopId,
        AdminShopReactivateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_reactivate");
        var shop = await ResolveExistingShopByIdAsync(shopId, cancellationToken);
        var wasActive = shop.IsActive;
        shop.IsActive = true;
        shop.UpdatedAtUtc = now;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_reactivated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                was_active = wasActive,
                is_active = shop.IsActive,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_reactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                was_active = wasActive,
                is_active = shop.IsActive,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopMutationResponse
        {
            Action = "reactivate",
            Shop = MapAdminShopMutationRow(shop),
            ProcessedAt = now
        };
    }

    public async Task<AdminBranchSeatAllocationListResponse> GetBranchSeatAllocationsAsAdminAsync(
        string shopCode,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var shop = await ResolveExistingShopByCodeAsync(shopCode, cancellationToken);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        var seatLimit = ResolveSeatLimit(subscription);

        if (options.AutoProvisionBranchAllocations)
        {
            _ = await EnsureBranchSeatPolicyAsync(
                shop,
                seatLimit,
                ResolveBranchCode(null),
                now,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var allocations = await dbContext.ShopBranchSeatAllocations
            .AsNoTracking()
            .Where(x => x.ShopId == shop.Id)
            .ToListAsync(cancellationToken);
        var activeSeatsByBranch = await GetActiveSeatCountsByBranchAsync(shop.Id, cancellationToken);
        var activeSeatTotal = activeSeatsByBranch.Values.Sum();
        var totalAllocatedSeats = allocations
            .Where(x => x.IsActive)
            .Sum(x => Math.Max(0, x.SeatQuota));
        var defaultBranchCode = ResolveBranchCode(null);

        var rows = allocations
            .OrderBy(x => x.BranchCode, StringComparer.OrdinalIgnoreCase)
            .Select(x =>
            {
                var branchCode = ResolveBranchCode(x.BranchCode);
                var activeSeats = activeSeatsByBranch.TryGetValue(branchCode, out var count) ? count : 0;
                var quota = Math.Max(0, x.SeatQuota);
                return new AdminBranchSeatAllocationRow
                {
                    BranchCode = branchCode,
                    SeatQuota = quota,
                    IsActive = x.IsActive,
                    ActiveSeats = activeSeats,
                    AvailableSeats = x.IsActive ? Math.Max(0, quota - activeSeats) : 0,
                    IsDefaultBranch = string.Equals(branchCode, defaultBranchCode, StringComparison.Ordinal),
                    UpdatedAt = x.UpdatedAtUtc ?? x.CreatedAtUtc
                };
            })
            .ToList();

        return new AdminBranchSeatAllocationListResponse
        {
            GeneratedAt = now,
            ShopId = shop.Id,
            ShopCode = shop.Code,
            SeatLimit = seatLimit,
            ActiveSeats = activeSeatTotal,
            TotalAllocatedSeats = totalAllocatedSeats,
            Items = rows
        };
    }

    public async Task<AdminBranchSeatAllocationUpsertResponse> UpsertBranchSeatAllocationAsAdminAsync(
        string shopCode,
        string branchCode,
        AdminBranchSeatAllocationUpsertRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var shop = await ResolveExistingShopByCodeAsync(shopCode, cancellationToken);
        var normalizedBranchCode = ResolveBranchCode(branchCode);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        var seatLimit = ResolveSeatLimit(subscription);
        var normalizedSeatQuota = Math.Max(0, request.SeatQuota);
        var requestedActive = request.IsActive;
        if (requestedActive && normalizedSeatQuota <= 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "seat_quota must be greater than zero when the allocation is active.",
                StatusCodes.Status400BadRequest);
        }

        var allocations = await dbContext.ShopBranchSeatAllocations
            .Where(x => x.ShopId == shop.Id)
            .ToListAsync(cancellationToken);
        var existing = allocations.FirstOrDefault(x =>
            string.Equals(ResolveBranchCode(x.BranchCode), normalizedBranchCode, StringComparison.Ordinal));

        var otherAllocatedSeats = allocations
            .Where(x => x.Id != existing?.Id && x.IsActive)
            .Sum(x => Math.Max(0, x.SeatQuota));
        var effectiveSeatQuota = requestedActive ? normalizedSeatQuota : 0;
        if (otherAllocatedSeats + effectiveSeatQuota > seatLimit)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"seat_quota would exceed seat_limit ({seatLimit}) for shop '{shop.Code}'.",
                StatusCodes.Status409Conflict);
        }

        var branchActiveSeats = await CountActiveSeatsByBranchAsync(
            shop.Id,
            normalizedBranchCode,
            excludedProvisionedDeviceId: null,
            cancellationToken);
        if (requestedActive && normalizedSeatQuota < branchActiveSeats)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"seat_quota ({normalizedSeatQuota}) cannot be lower than active seats ({branchActiveSeats}) in branch '{normalizedBranchCode}'.",
                StatusCodes.Status409Conflict);
        }

        if (existing is null)
        {
            existing = new ShopBranchSeatAllocation
            {
                ShopId = shop.Id,
                Shop = shop,
                BranchCode = normalizedBranchCode,
                SeatQuota = normalizedSeatQuota,
                IsActive = requestedActive,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.ShopBranchSeatAllocations.Add(existing);
        }
        else
        {
            existing.BranchCode = normalizedBranchCode;
            existing.SeatQuota = normalizedSeatQuota;
            existing.IsActive = requestedActive;
            existing.UpdatedAtUtc = now;
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "branch_seat_allocation_update");
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "branch_seat_allocation_upsert",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                branch_code = normalizedBranchCode,
                seat_quota = normalizedSeatQuota,
                is_active = requestedActive,
                seat_limit = seatLimit,
                active_seats_in_branch = branchActiveSeats,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            IsManualOverride = true,
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        var refreshedAllocations = await dbContext.ShopBranchSeatAllocations
            .AsNoTracking()
            .Where(x => x.ShopId == shop.Id)
            .ToListAsync(cancellationToken);
        var totalAllocatedSeats = refreshedAllocations
            .Where(x => x.IsActive)
            .Sum(x => Math.Max(0, x.SeatQuota));
        var activeSeatsByBranch = await GetActiveSeatCountsByBranchAsync(shop.Id, cancellationToken);
        var activeSeats = activeSeatsByBranch.Values.Sum();
        var defaultBranchCode = ResolveBranchCode(null);

        var responseRow = new AdminBranchSeatAllocationRow
        {
            BranchCode = normalizedBranchCode,
            SeatQuota = Math.Max(0, existing.SeatQuota),
            IsActive = existing.IsActive,
            ActiveSeats = activeSeatsByBranch.TryGetValue(normalizedBranchCode, out var count) ? count : 0,
            AvailableSeats = existing.IsActive
                ? Math.Max(0, existing.SeatQuota - (activeSeatsByBranch.TryGetValue(normalizedBranchCode, out var used) ? used : 0))
                : 0,
            IsDefaultBranch = string.Equals(normalizedBranchCode, defaultBranchCode, StringComparison.Ordinal),
            UpdatedAt = existing.UpdatedAtUtc ?? existing.CreatedAtUtc
        };

        return new AdminBranchSeatAllocationUpsertResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            SeatLimit = seatLimit,
            TotalAllocatedSeats = totalAllocatedSeats,
            ActiveSeats = activeSeats,
            Item = responseRow,
            ProcessedAt = now
        };
    }

    public async Task<AdminShopUsersResponse> GetAdminShopUsersAsync(
        string? shopCode,
        string? search,
        bool includeInactive,
        int take,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedTake = Math.Clamp(take, 1, 200);
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();

        Shop? targetShop = null;
        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(shopCode)))
        {
            targetShop = await ResolveExistingShopByCodeAsync(shopCode, cancellationToken);
        }

        var usersQuery = dbContext.Users
            .AsNoTracking()
            .Where(x => x.StoreId.HasValue && x.StoreId.Value != Guid.Empty);
        if (targetShop is not null)
        {
            usersQuery = usersQuery.Where(x => x.StoreId == targetShop.Id);
        }

        if (!includeInactive)
        {
            usersQuery = usersQuery.Where(x => x.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            usersQuery = usersQuery.Where(x =>
                x.Username.ToLower().Contains(normalizedSearch) ||
                x.FullName.ToLower().Contains(normalizedSearch));
        }

        var candidates = await usersQuery
            .OrderBy(x => x.Username)
            .Take(1000)
            .ToListAsync(cancellationToken);
        if (candidates.Count == 0)
        {
            return new AdminShopUsersResponse
            {
                GeneratedAt = now,
                Count = 0,
                Items = []
            };
        }

        var candidateUserIds = candidates.Select(x => x.Id).ToList();
        var roleAssignments = await (
            from userRole in dbContext.UserRoles.AsNoTracking()
            join role in dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where candidateUserIds.Contains(userRole.UserId)
            select new
            {
                userRole.UserId,
                RoleCode = role.Code.ToLower()
            })
            .ToListAsync(cancellationToken);

        var roleCodeByUserId = roleAssignments
            .Where(x => ManagedShopRoleCodes.Contains(x.RoleCode))
            .GroupBy(x => x.UserId)
            .ToDictionary(
                x => x.Key,
                x => ResolveManagedRoleCodeFromCandidates(x.Select(item => item.RoleCode)));

        var userStoreIds = candidates
            .Where(x => roleCodeByUserId.ContainsKey(x.Id) && x.StoreId.HasValue)
            .Select(x => x.StoreId!.Value)
            .Distinct()
            .ToList();
        var shopsById = userStoreIds.Count == 0
            ? new Dictionary<Guid, Shop>()
            : await dbContext.Shops
                .AsNoTracking()
                .Where(x => userStoreIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, cancellationToken);

        var rows = new List<AdminShopUserRow>(candidates.Count);
        foreach (var user in candidates)
        {
            if (!roleCodeByUserId.TryGetValue(user.Id, out var managedRoleCode))
            {
                continue;
            }

            if (!user.StoreId.HasValue || !shopsById.TryGetValue(user.StoreId.Value, out var shop))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(normalizedSearch) &&
                !user.Username.ToLower().Contains(normalizedSearch) &&
                !user.FullName.ToLower().Contains(normalizedSearch) &&
                !managedRoleCode.Contains(normalizedSearch) &&
                !shop.Code.ToLower().Contains(normalizedSearch) &&
                !shop.Name.ToLower().Contains(normalizedSearch))
            {
                continue;
            }

            rows.Add(MapAdminShopUserRow(user, shop, managedRoleCode));
        }

        var orderedRows = rows
            .OrderBy(x => x.ShopCode, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.Username, StringComparer.OrdinalIgnoreCase)
            .Take(normalizedTake)
            .ToList();

        return new AdminShopUsersResponse
        {
            GeneratedAt = now,
            Count = orderedRows.Count,
            Items = orderedRows
        };
    }

    public async Task<AdminShopUserMutationResponse> CreateAdminShopUserAsync(
        AdminShopUserCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_user_create");
        var shop = await ResolveExistingShopByCodeAsync(request.ShopCode, cancellationToken);
        var username = ResolveManagedShopUsername(request.Username, "username");
        var fullName = ResolveManagedShopFullName(request.FullName);
        var roleCode = ResolveManagedShopRoleCode(request.RoleCode);
        var password = ResolveManagedShopPassword(request.Password, "password");

        var usernameTaken = await dbContext.Users
            .AsNoTracking()
            .AnyAsync(x => x.Username.ToLower() == username, cancellationToken);
        if (usernameTaken)
        {
            throw new LicenseException(
                LicenseErrorCodes.DuplicateSubmission,
                "username is already in use.",
                StatusCodes.Status409Conflict);
        }

        var role = await ResolveManagedShopRoleEntityAsync(roleCode, cancellationToken);
        var user = new AppUser
        {
            StoreId = shop.Id,
            Username = username,
            FullName = fullName,
            PasswordHash = string.Empty,
            IsActive = true,
            CreatedAtUtc = now,
            LastLoginAtUtc = null
        };
        user.PasswordHash = PasswordHashing.HashPassword(user, password);

        dbContext.Users.Add(user);
        dbContext.UserRoles.Add(new UserRole
        {
            UserId = user.Id,
            RoleId = role.Id,
            AssignedAtUtc = now,
            User = user,
            Role = role
        });

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_user_created",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                user_id = user.Id,
                username,
                role_code = roleCode,
                is_active = true,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_user_create",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                user_id = user.Id,
                username,
                role_code = roleCode,
                is_active = true,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopUserMutationResponse
        {
            Action = "create",
            User = MapAdminShopUserRow(user, shop, roleCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopUserMutationResponse> UpdateAdminShopUserAsync(
        Guid userId,
        AdminShopUserUpdateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_user_update");
        var (user, shop, currentRoleCode) = await ResolveManagedShopUserContextAsync(userId, cancellationToken);

        var nextUsername = user.Username;
        var nextFullName = user.FullName;
        var nextRoleCode = currentRoleCode;
        var changeFlags = new List<string>();

        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(request.Username)))
        {
            var normalizedUsername = ResolveManagedShopUsername(request.Username, "username");
            if (!string.Equals(user.Username, normalizedUsername, StringComparison.OrdinalIgnoreCase))
            {
                var usernameTaken = await dbContext.Users
                    .AsNoTracking()
                    .AnyAsync(x => x.Id != user.Id && x.Username.ToLower() == normalizedUsername, cancellationToken);
                if (usernameTaken)
                {
                    throw new LicenseException(
                        LicenseErrorCodes.DuplicateSubmission,
                        "username is already in use.",
                        StatusCodes.Status409Conflict);
                }

                user.Username = normalizedUsername;
                nextUsername = normalizedUsername;
                changeFlags.Add("username");
            }
        }

        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(request.FullName)))
        {
            var normalizedFullName = ResolveManagedShopFullName(request.FullName);
            if (!string.Equals(user.FullName, normalizedFullName, StringComparison.Ordinal))
            {
                user.FullName = normalizedFullName;
                nextFullName = normalizedFullName;
                changeFlags.Add("full_name");
            }
        }

        if (!string.IsNullOrWhiteSpace(NormalizeOptionalValue(request.RoleCode)))
        {
            var normalizedRoleCode = ResolveManagedShopRoleCode(request.RoleCode);
            if (!string.Equals(currentRoleCode, normalizedRoleCode, StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(currentRoleCode, SmartPosRoles.Owner, StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(normalizedRoleCode, SmartPosRoles.Owner, StringComparison.OrdinalIgnoreCase))
                {
                    await EnsureShopHasAnotherActiveOwnerAsync(shop.Id, user.Id, cancellationToken);
                }

                await ReplaceManagedRoleForUserAsync(user, normalizedRoleCode, now, cancellationToken);
                nextRoleCode = normalizedRoleCode;
                changeFlags.Add("role_code");
            }
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_user_updated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                user_id = user.Id,
                username = nextUsername,
                full_name = nextFullName,
                role_code = nextRoleCode,
                changed = changeFlags,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_user_update",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                user_id = user.Id,
                username = nextUsername,
                full_name = nextFullName,
                role_code = nextRoleCode,
                changed = changeFlags,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopUserMutationResponse
        {
            Action = "update",
            User = MapAdminShopUserRow(user, shop, nextRoleCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopUserMutationResponse> DeactivateAdminShopUserAsync(
        Guid userId,
        AdminShopUserDeactivateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_user_deactivate");
        var (user, shop, roleCode) = await ResolveManagedShopUserContextAsync(userId, cancellationToken);

        if (string.Equals(roleCode, SmartPosRoles.Owner, StringComparison.OrdinalIgnoreCase))
        {
            await EnsureShopHasAnotherActiveOwnerAsync(shop.Id, user.Id, cancellationToken);
        }

        user.IsActive = false;
        var revokedSessions = await RevokeAuthSessionsForUserAsync(
            user.Id,
            now,
            "admin_user_deactivated",
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_user_deactivated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                revoked_sessions = revokedSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_user_deactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                revoked_sessions = revokedSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopUserMutationResponse
        {
            Action = "deactivate",
            User = MapAdminShopUserRow(user, shop, roleCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopUserMutationResponse> ReactivateAdminShopUserAsync(
        Guid userId,
        AdminShopUserReactivateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_user_reactivate");
        var (user, shop, roleCode) = await ResolveManagedShopUserContextAsync(userId, cancellationToken);
        user.IsActive = true;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_user_reactivated",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_user_reactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopUserMutationResponse
        {
            Action = "reactivate",
            User = MapAdminShopUserRow(user, shop, roleCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminShopUserMutationResponse> ResetAdminShopUserPasswordAsync(
        Guid userId,
        AdminShopUserPasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_shop_user_password_reset");
        var (user, shop, roleCode) = await ResolveManagedShopUserContextAsync(userId, cancellationToken);
        var newPassword = ResolveManagedShopPassword(request.NewPassword, "new_password");
        user.PasswordHash = PasswordHashing.HashPassword(user, newPassword);

        var revokedSessions = await RevokeAuthSessionsForUserAsync(
            user.Id,
            now,
            "admin_password_reset",
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "shop_user_password_reset",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                revoked_sessions = revokedSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_shop_user_password_reset",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                user_id = user.Id,
                username = user.Username,
                role_code = roleCode,
                revoked_sessions = revokedSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminShopUserMutationResponse
        {
            Action = "reset_password",
            User = MapAdminShopUserRow(user, shop, roleCode),
            ProcessedAt = now
        };
    }

    public async Task<AdminAuditLogsResponse> GetAdminAuditLogsAsync(
        string? search,
        string? action,
        string? actor,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();
        var normalizedAction = NormalizeOptionalValue(action)?.ToLowerInvariant();
        var normalizedActor = NormalizeOptionalValue(actor)?.ToLowerInvariant();
        var normalizedTake = Math.Clamp(take, 1, 200);

        var query = dbContext.LicenseAuditLogs
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(normalizedAction))
        {
            query = query.Where(x => x.Action.ToLower().Contains(normalizedAction));
        }

        if (!string.IsNullOrWhiteSpace(normalizedActor))
        {
            query = query.Where(x => x.Actor.ToLower().Contains(normalizedActor));
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(x =>
                x.Action.ToLower().Contains(normalizedSearch) ||
                x.Actor.ToLower().Contains(normalizedSearch) ||
                (x.Reason != null && x.Reason.ToLower().Contains(normalizedSearch)) ||
                (x.MetadataJson != null && x.MetadataJson.ToLower().Contains(normalizedSearch)));
        }

        List<LicenseAuditLog> logs;
        if (dbContext.Database.IsSqlite())
        {
            // SQLite provider does not support ordering DateTimeOffset in SQL.
            // Keep filters in SQL, then order/take in-memory.
            logs = (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            logs = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        return new AdminAuditLogsResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Count = logs.Count,
            Items = logs
                .Select(x => new AdminAuditLogRow
                {
                    Id = x.Id,
                    Timestamp = x.CreatedAtUtc,
                    ShopId = x.ShopId,
                    ProvisionedDeviceId = x.ProvisionedDeviceId,
                    Action = x.Action,
                    Actor = x.Actor,
                    Reason = x.Reason,
                    MetadataJson = x.MetadataJson,
                    IsManualOverride = x.IsManualOverride,
                    ImmutableHash = x.ImmutableHash,
                    ImmutablePreviousHash = x.ImmutablePreviousHash
                })
                .ToList()
        };
    }

    public async Task<string> ExportAdminAuditLogsCsvAsync(
        string? search,
        string? action,
        string? actor,
        int take,
        CancellationToken cancellationToken)
    {
        var response = await GetAdminAuditLogsAsync(
            search,
            action,
            actor,
            take,
            cancellationToken);
        var builder = new StringBuilder();
        builder.AppendLine("id,timestamp,shop_id,device_id,action,actor,reason,is_manual_override,immutable_hash,immutable_previous_hash,metadata_json");
        foreach (var item in response.Items)
        {
            builder.Append(EscapeCsv(item.Id.ToString()));
            builder.Append(',');
            builder.Append(EscapeCsv(item.Timestamp.ToString("O")));
            builder.Append(',');
            builder.Append(EscapeCsv(item.ShopId?.ToString()));
            builder.Append(',');
            builder.Append(EscapeCsv(item.ProvisionedDeviceId?.ToString()));
            builder.Append(',');
            builder.Append(EscapeCsv(item.Action));
            builder.Append(',');
            builder.Append(EscapeCsv(item.Actor));
            builder.Append(',');
            builder.Append(EscapeCsv(item.Reason));
            builder.Append(',');
            builder.Append(EscapeCsv(item.IsManualOverride ? "true" : "false"));
            builder.Append(',');
            builder.Append(EscapeCsv(item.ImmutableHash));
            builder.Append(',');
            builder.Append(EscapeCsv(item.ImmutablePreviousHash));
            builder.Append(',');
            builder.Append(EscapeCsv(item.MetadataJson));
            builder.AppendLine();
        }

        return builder.ToString();
    }

    public async Task<string> ExportAdminAuditLogsJsonAsync(
        string? search,
        string? action,
        string? actor,
        int take,
        CancellationToken cancellationToken)
    {
        var response = await GetAdminAuditLogsAsync(
            search,
            action,
            actor,
            take,
            cancellationToken);
        return JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            WriteIndented = true
        });
    }

    public async Task<AdminDeviceActionResponse> RevokeDeviceAsAdminAsync(
        string deviceCode,
        AdminDeviceActionRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_device_revoke");
        var status = await DeactivateAsync(new ProvisionDeactivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = overrideContext.Actor,
            Reason = overrideContext.ActorNote
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_revoke",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            DateTimeOffset.UtcNow,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminDeviceActionResponse
        {
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "revoke",
            Status = ProvisionedDeviceStatus.Revoked.ToString().ToLowerInvariant(),
            LicenseState = status.State,
            ValidUntil = status.ValidUntil,
            GraceUntil = status.GraceUntil,
            ProcessedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<AdminDeviceActionResponse> DeactivateDeviceAsAdminAsync(
        string deviceCode,
        AdminDeviceActionRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_device_deactivate");
        var status = await DeactivateAsync(new ProvisionDeactivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = overrideContext.Actor,
            Reason = overrideContext.ActorNote
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_deactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            DateTimeOffset.UtcNow,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminDeviceActionResponse
        {
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "deactivate",
            Status = ProvisionedDeviceStatus.Revoked.ToString().ToLowerInvariant(),
            LicenseState = status.State,
            ValidUntil = status.ValidUntil,
            GraceUntil = status.GraceUntil,
            ProcessedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<AdminDeviceActionResponse> ReactivateDeviceAsAdminAsync(
        string deviceCode,
        AdminDeviceActionRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_device_reactivate");
        var status = await ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = overrideContext.Actor,
            Reason = overrideContext.ActorNote
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_reactivate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            DateTimeOffset.UtcNow,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminDeviceActionResponse
        {
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "reactivate",
            Status = ProvisionedDeviceStatus.Active.ToString().ToLowerInvariant(),
            LicenseState = status.State,
            ValidUntil = status.ValidUntil,
            GraceUntil = status.GraceUntil,
            ProcessedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<AdminDeviceActionResponse> ActivateDeviceAsAdminAsync(
        string deviceCode,
        AdminDeviceActionRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_device_activate");
        var status = await ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = overrideContext.Actor,
            Reason = overrideContext.ActorNote
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_activate",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            DateTimeOffset.UtcNow,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminDeviceActionResponse
        {
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "activate",
            Status = ProvisionedDeviceStatus.Active.ToString().ToLowerInvariant(),
            LicenseState = status.State,
            ValidUntil = status.ValidUntil,
            GraceUntil = status.GraceUntil,
            ProcessedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<AdminDeviceSeatTransferResponse> TransferDeviceSeatAsAdminAsync(
        string deviceCode,
        AdminDeviceSeatTransferRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedTargetShopCode = NormalizeOptionalValue(request.TargetShopCode);
        var targetBranchCode = ResolveBranchCode(request.TargetBranchCode);
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_transfer_seat");

        var now = DateTimeOffset.UtcNow;
        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        if (provisionedDevice.Status != ProvisionedDeviceStatus.Active)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Only active devices can be transferred.",
                StatusCodes.Status409Conflict);
        }

        var sourceShop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Device is linked to an unknown source shop.",
                StatusCodes.Status409Conflict);
        var sourceBranchCode = ResolveBranchCode(provisionedDevice.BranchCode);
        var sourceSubscription = await GetOrCreateSubscriptionAsync(sourceShop, now, cancellationToken);

        Shop targetShop;
        if (string.IsNullOrWhiteSpace(normalizedTargetShopCode))
        {
            targetShop = sourceShop;
        }
        else
        {
            targetShop = await GetOrCreateShopAsync(normalizedTargetShopCode, now, cancellationToken);
        }

        if (targetShop.Id == sourceShop.Id &&
            string.Equals(sourceBranchCode, targetBranchCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "target_branch_code must be different when target_shop_code is the same as the current shop.",
                StatusCodes.Status409Conflict);
        }

        var targetSubscription = await GetOrCreateSubscriptionAsync(targetShop, now, cancellationToken);
        if (targetSubscription.Status == SubscriptionStatus.Canceled)
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "Cannot transfer a device to a canceled subscription shop.",
                StatusCodes.Status409Conflict);
        }

        var targetSeatLimit = ResolveSeatLimit(targetSubscription);
        var targetBranchPolicy = await EnsureBranchSeatPolicyAsync(
            targetShop,
            targetSeatLimit,
            targetBranchCode,
            now,
            cancellationToken);
        var targetActiveSeats = await dbContext.ProvisionedDevices
            .CountAsync(
                x => x.ShopId == targetShop.Id &&
                     x.Status == ProvisionedDeviceStatus.Active &&
                     x.Id != provisionedDevice.Id,
                cancellationToken);
        if (targetActiveSeats >= targetSeatLimit)
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                "Target shop seat limit has been reached.",
                StatusCodes.Status409Conflict);
        }
        var targetBranchActiveSeats = await CountActiveSeatsByBranchAsync(
            targetShop.Id,
            targetBranchCode,
            provisionedDevice.Id,
            cancellationToken);
        if (targetBranchActiveSeats >= targetBranchPolicy.SeatQuota)
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                $"Target branch '{targetBranchCode}' seat quota has been reached.",
                StatusCodes.Status409Conflict);
        }

        var sourceShopId = sourceShop.Id;
        var sourceShopCode = sourceShop.Code;
        provisionedDevice.ShopId = targetShop.Id;
        provisionedDevice.Shop = targetShop;
        provisionedDevice.BranchCode = targetBranchCode;
        provisionedDevice.AssignedAtUtc = now;
        provisionedDevice.LastHeartbeatAtUtc = now;

        var movedDeviceLicense = await IssueLicenseAsync(
            targetShop,
            provisionedDevice,
            targetSubscription,
            now,
            TokenRotationMode.Immediate,
            cancellationToken);

        if (sourceShopId == targetShop.Id)
        {
            await ForceReissueLicensesForShopAsync(
                targetShop,
                targetSubscription,
                now,
                overrideContext.Actor,
                "seat_transfer",
                excludedProvisionedDeviceId: provisionedDevice.Id,
                cancellationToken);
        }
        else
        {
            await ForceReissueLicensesForShopAsync(
                sourceShop,
                sourceSubscription,
                now,
                overrideContext.Actor,
                "seat_transfer",
                excludedProvisionedDeviceId: null,
                cancellationToken);
            await ForceReissueLicensesForShopAsync(
                targetShop,
                targetSubscription,
                now,
                overrideContext.Actor,
                "seat_transfer",
                excludedProvisionedDeviceId: provisionedDevice.Id,
                cancellationToken);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = targetShop.Id,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "device_seat_transferred",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                source_shop_id = sourceShopId,
                source_shop_code = sourceShopCode,
                source_branch_code = sourceBranchCode,
                target_shop_id = targetShop.Id,
                target_shop_code = targetShop.Code,
                target_branch_code = targetBranchCode,
                target_seat_limit = targetSeatLimit,
                target_active_seats_after_transfer = targetActiveSeats + 1,
                target_branch_seat_quota = targetBranchPolicy.SeatQuota,
                target_branch_active_seats_after_transfer = targetBranchActiveSeats + 1,
                moved_device_license_id = movedDeviceLicense.Record.Id,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            targetShop.Id,
            provisionedDevice.Id,
            "manual_override_transfer_seat",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                source_shop_id = sourceShopId,
                source_shop_code = sourceShopCode,
                source_branch_code = sourceBranchCode,
                target_shop_id = targetShop.Id,
                target_shop_code = targetShop.Code,
                target_branch_code = targetBranchCode,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        var status = await ResolveStatusSnapshotAsync(
            normalizedDeviceCode,
            movedDeviceLicense.PlainToken,
            strictTokenValidation: true,
            cancellationToken);

        return new AdminDeviceSeatTransferResponse
        {
            DeviceCode = normalizedDeviceCode,
            Action = "transfer_seat",
            SourceShopId = sourceShopId,
            SourceShopCode = sourceShopCode,
            SourceBranchCode = sourceBranchCode,
            TargetShopId = targetShop.Id,
            TargetShopCode = targetShop.Code,
            TargetBranchCode = targetBranchCode,
            Status = provisionedDevice.Status.ToString().ToLowerInvariant(),
            LicenseState = status.State.ToString().ToLowerInvariant(),
            ValidUntil = status.ValidUntil,
            GraceUntil = status.GraceUntil,
            ProcessedAt = now
        };
    }

    public async Task<AdminMassDeviceRevokeResponse> MassRevokeDevicesAsAdminAsync(
        AdminMassDeviceRevokeRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var deviceCodes = request.DeviceCodes
            .Select(NormalizeDeviceCode)
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (deviceCodes.Count == 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_codes must contain at least one device_code.",
                StatusCodes.Status400BadRequest);
        }

        if (deviceCodes.Count > 100)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_codes supports up to 100 devices per request.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote,
            defaultActor: "security-admin",
            defaultReasonCode: "manual_mass_revoke");
        var requiresStepUp = options.RequireStepUpApprovalForHighRiskAdminActions &&
                             deviceCodes.Count >= Math.Max(2, options.HighRiskMassRevokeThreshold);
        var stepUpApproval = ResolveStepUpApproval(
            requiresStepUp,
            request.StepUpApprovedBy,
            request.StepUpApprovalNote,
            "mass_revoke_high_risk");
        var now = DateTimeOffset.UtcNow;
        var items = new List<AdminDeviceActionResponse>(deviceCodes.Count);
        var alreadyRevokedCount = 0;

        foreach (var code in deviceCodes)
        {
            var existing = await dbContext.ProvisionedDevices
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.DeviceCode == code, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.Unprovisioned,
                    $"Device '{code}' is not provisioned.",
                    StatusCodes.Status404NotFound);

            if (existing.Status == ProvisionedDeviceStatus.Revoked)
            {
                var snapshot = await ResolveStatusSnapshotAsync(
                    code,
                    null,
                    strictTokenValidation: false,
                    cancellationToken);
                items.Add(new AdminDeviceActionResponse
                {
                    ShopId = existing.ShopId,
                    DeviceCode = code,
                    Action = "revoke",
                    Status = ProvisionedDeviceStatus.Revoked.ToString().ToLowerInvariant(),
                    LicenseState = snapshot.State.ToString().ToLowerInvariant(),
                    ValidUntil = snapshot.ValidUntil,
                    GraceUntil = snapshot.GraceUntil,
                    ProcessedAt = now
                });
                alreadyRevokedCount += 1;
                continue;
            }

            var actionResponse = await RevokeDeviceAsAdminAsync(
                code,
                new AdminDeviceActionRequest
                {
                    Actor = overrideContext.Actor,
                    ReasonCode = overrideContext.ReasonCode,
                    ActorNote = overrideContext.ActorNote
                },
                cancellationToken);
            items.Add(actionResponse);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            Action = "admin_mass_revoke_executed",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                requested_count = deviceCodes.Count,
                revoked_count = items.Count - alreadyRevokedCount,
                already_revoked_count = alreadyRevokedCount,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote,
                step_up_required = requiresStepUp,
                step_up_applied = stepUpApproval.Applied,
                step_up_approved_by = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null,
                devices = deviceCodes
            }),
            CreatedAtUtc = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminMassDeviceRevokeResponse
        {
            RequestedCount = deviceCodes.Count,
            RevokedCount = items.Count - alreadyRevokedCount,
            AlreadyRevokedCount = alreadyRevokedCount,
            Items = items,
            ProcessedAt = now
        };
    }

    public async Task<AdminEmergencyCommandEnvelopeResponse> CreateEmergencyCommandEnvelopeAsAdminAsync(
        string deviceCode,
        AdminEmergencyCommandEnvelopeRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedAction = NormalizeEmergencyAction(request.Action);
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote,
            defaultActor: "security-admin",
            defaultReasonCode: $"emergency_{normalizedAction}");
        var now = DateTimeOffset.UtcNow;
        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        var ttlSeconds = Math.Clamp(
            request.TtlSeconds ?? options.EmergencyCommandEnvelopeTtlSeconds,
            30,
            600);
        var challenge = new DeviceActionChallenge
        {
            DeviceCode = normalizedDeviceCode,
            Nonce = Base64UrlEncode(RandomNumberGenerator.GetBytes(24)),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddSeconds(ttlSeconds)
        };
        dbContext.DeviceActionChallenges.Add(challenge);

        var payload = new EmergencyCommandEnvelopePayload
        {
            CommandId = challenge.Id,
            DeviceCode = normalizedDeviceCode,
            Action = normalizedAction,
            Nonce = challenge.Nonce,
            Actor = overrideContext.Actor,
            ReasonCode = overrideContext.ReasonCode,
            ActorNote = overrideContext.ActorNote,
            IssuedAtUnix = now.ToUnixTimeSeconds(),
            ExpiresAtUnix = challenge.ExpiresAtUtc.ToUnixTimeSeconds()
        };
        var envelopeToken = SignEmergencyCommandEnvelope(payload);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "admin_emergency_command_envelope_issued",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                command_id = challenge.Id,
                device_code = normalizedDeviceCode,
                action = normalizedAction,
                expires_at = challenge.ExpiresAtUtc,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminEmergencyCommandEnvelopeResponse
        {
            CommandId = challenge.Id.ToString(),
            DeviceCode = normalizedDeviceCode,
            Action = normalizedAction,
            EnvelopeToken = envelopeToken,
            IssuedAt = now,
            ExpiresAt = challenge.ExpiresAtUtc
        };
    }

    public async Task<AdminEmergencyCommandExecuteResponse> ExecuteEmergencyCommandAsAdminAsync(
        string deviceCode,
        AdminEmergencyCommandExecuteRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var token = NormalizeOptionalValue(request.EnvelopeToken);
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "envelope_token is required.",
                StatusCodes.Status400BadRequest);
        }

        var payload = ParseAndValidateEmergencyCommandEnvelope(token);
        if (!string.Equals(payload.DeviceCode, normalizedDeviceCode, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Command envelope does not match the requested device_code.",
                StatusCodes.Status409Conflict);
        }

        var now = DateTimeOffset.UtcNow;
        if (DateTimeOffset.FromUnixTimeSeconds(payload.ExpiresAtUnix) <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.ChallengeExpired,
                "Command envelope has expired.",
                StatusCodes.Status403Forbidden);
        }

        var challenge = await dbContext.DeviceActionChallenges
            .FirstOrDefaultAsync(x => x.Id == payload.CommandId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "Command envelope nonce is invalid.",
                StatusCodes.Status403Forbidden);
        if (!string.Equals(challenge.DeviceCode, normalizedDeviceCode, StringComparison.Ordinal) ||
            !string.Equals(challenge.Nonce, payload.Nonce, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "Command envelope nonce binding is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (challenge.ConsumedAtUtc.HasValue)
        {
            throw new LicenseException(
                LicenseErrorCodes.ChallengeConsumed,
                "Command envelope has already been used.",
                StatusCodes.Status409Conflict);
        }

        if (challenge.ExpiresAtUtc <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.ChallengeExpired,
                "Command envelope nonce has expired.",
                StatusCodes.Status403Forbidden);
        }

        challenge.ConsumedAtUtc = now;

        var revokedTokenSessions = 0;
        var normalizedAction = NormalizeEmergencyAction(payload.Action);
        if (string.Equals(normalizedAction, EmergencyActionLockDevice, StringComparison.Ordinal))
        {
            await DeactivateDeviceAsAdminAsync(
                normalizedDeviceCode,
                new AdminDeviceActionRequest
                {
                    Actor = payload.Actor,
                    ReasonCode = payload.ReasonCode,
                    ActorNote = payload.ActorNote
                },
                cancellationToken);
        }
        else
        {
            revokedTokenSessions = await RevokeDeviceTokenSessionsAsAdminAsync(
                normalizedDeviceCode,
                payload.Actor,
                payload.ReasonCode,
                payload.ActorNote,
                string.Equals(normalizedAction, EmergencyActionRevokeToken, StringComparison.Ordinal)
                    ? "manual_override_emergency_revoke_token"
                    : "manual_override_emergency_force_reauth",
                string.Equals(normalizedAction, EmergencyActionRevokeToken, StringComparison.Ordinal)
                    ? "device_tokens_revoked"
                    : "device_force_reauth_triggered",
                now,
                cancellationToken);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            Action = "admin_emergency_command_executed",
            Actor = payload.Actor,
            Reason = payload.ReasonCode,
            MetadataJson = JsonSerializer.Serialize(new
            {
                command_id = payload.CommandId,
                action = normalizedAction,
                device_code = normalizedDeviceCode,
                revoked_token_sessions = revokedTokenSessions,
                reason_code = payload.ReasonCode,
                actor_note = payload.ActorNote
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new AdminEmergencyCommandExecuteResponse
        {
            DeviceCode = normalizedDeviceCode,
            Action = normalizedAction,
            Status = "completed",
            RevokedTokenSessions = revokedTokenSessions,
            ProcessedAt = now
        };
    }

    public async Task<AdminDeviceActionResponse> ExtendGraceAsAdminAsync(
        string deviceCode,
        AdminDeviceGraceExtensionRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_extend_grace");
        var extendDays = Math.Clamp(request.ExtendDays, 1, 30);
        var requiresStepUp = options.RequireStepUpApprovalForHighRiskAdminActions &&
                             extendDays >= Math.Max(1, options.HighRiskGraceExtensionDaysThreshold);
        var stepUpApproval = ResolveStepUpApproval(
            requiresStepUp,
            request.StepUpApprovedBy,
            request.StepUpApprovalNote,
            "extend_grace_high_risk");
        var now = DateTimeOffset.UtcNow;

        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        if (provisionedDevice.Status == ProvisionedDeviceStatus.Revoked)
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "Cannot extend grace for a revoked device.",
                StatusCodes.Status409Conflict);
        }

        List<LicenseRecord> activeLicenses;
        if (dbContext.Database.IsSqlite())
        {
            activeLicenses = (await dbContext.Licenses
                    .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                                x.Status == LicenseRecordStatus.Active)
                    .ToListAsync(cancellationToken))
                .Where(x => !x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now)
                .ToList();
        }
        else
        {
            activeLicenses = await dbContext.Licenses
                .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                            x.Status == LicenseRecordStatus.Active &&
                            (!x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now))
                .ToListAsync(cancellationToken);
        }

        if (activeLicenses.Count == 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Device has no active license to extend grace.",
                StatusCodes.Status409Conflict);
        }

        var previousGraceUntil = activeLicenses.Max(x => x.GraceUntil);
        var baseline = previousGraceUntil > now ? previousGraceUntil : now;
        var updatedGraceUntil = baseline.AddDays(extendDays);

        foreach (var license in activeLicenses)
        {
            license.GraceUntil = updatedGraceUntil;
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "device_grace_extended",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                extend_days = extendDays,
                previous_grace_until = previousGraceUntil,
                updated_grace_until = updatedGraceUntil,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote,
                step_up_required = requiresStepUp,
                step_up_applied = stepUpApproval.Applied,
                step_up_approved_by = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null
            })
        });

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_extend_grace",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                extend_days = extendDays,
                previous_grace_until = previousGraceUntil,
                updated_grace_until = updatedGraceUntil,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote,
                step_up_required = requiresStepUp,
                step_up_applied = stepUpApproval.Applied,
                step_up_approved_by = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        var status = await ResolveStatusSnapshotAsync(
            normalizedDeviceCode,
            null,
            strictTokenValidation: false,
            cancellationToken);

        return new AdminDeviceActionResponse
        {
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "extend_grace",
            Status = provisionedDevice.Status.ToString().ToLowerInvariant(),
            LicenseState = status.State.ToString().ToLowerInvariant(),
            ValidUntil = status.ValidUntil,
            GraceUntil = updatedGraceUntil,
            ProcessedAt = now
        };
    }

    public async Task<AdminLicenseResyncResponse> ForceLicenseResyncAsync(
        AdminLicenseResyncRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "security-admin",
            defaultReasonCode: "manual_license_resync");

        var shop = await GetOrCreateShopAsync(request.ShopCode, now, cancellationToken);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        var outcome = await ForceReissueLicensesForShopAsync(
            shop,
            subscription,
            now,
            overrideContext.Actor,
            "manual_resync",
            excludedProvisionedDeviceId: null,
            cancellationToken);

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_force_resync",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                shop_code = shop.Code,
                reissued_devices = outcome.ReissuedCount,
                revoked_licenses = outcome.RevokedCount,
                active_devices = outcome.ActiveDeviceCount,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminLicenseResyncResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            SubscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
            Plan = subscription.Plan,
            ReissuedDevices = outcome.ReissuedCount,
            RevokedLicenses = outcome.RevokedCount,
            ProcessedAt = now
        };
    }

    public async Task<AdminAiWalletCorrectionResponse> CorrectAiWalletBalanceAsAdminAsync(
        string shopCode,
        AdminAiWalletCorrectionRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var normalizedShopCode = ResolveShopCode(shopCode);
        var normalizedReference = NormalizeOptionalValue(request.Reference);
        if (string.IsNullOrWhiteSpace(normalizedReference))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reference is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "billing-admin",
            defaultReasonCode: "manual_wallet_correction");
        var now = DateTimeOffset.UtcNow;
        var shop = await ResolveExistingShopByCodeAsync(normalizedShopCode, cancellationToken);
        var actorUser = await ResolveAdminActorUserAsync(overrideContext.Actor, cancellationToken);

        var previousBalance = await dbContext.AiCreditWallets
            .AsNoTracking()
            .Where(x => x.ShopId == shop.Id)
            .Select(x => x.AvailableCredits)
            .FirstOrDefaultAsync(cancellationToken);

        AiWalletAdjustmentResult adjustmentResult;
        try
        {
            adjustmentResult = await aiCreditBillingService.AdjustCreditsForShopAsync(
                shop.Id,
                actorUser.Id,
                request.DeltaCredits,
                normalizedReference,
                overrideContext.ActorNote,
                cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                exception.Message,
                StatusCodes.Status400BadRequest);
        }

        var status = adjustmentResult.AppliedDelta == 0m ? "duplicate_reference_noop" : "applied";
        if (adjustmentResult.AppliedDelta != 0m)
        {
            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = shop.Id,
                Action = "ai_wallet_corrected",
                Actor = overrideContext.Actor,
                Reason = overrideContext.AuditReason,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    shop_code = shop.Code,
                    reference = normalizedReference,
                    previous_balance = previousBalance,
                    applied_delta = adjustmentResult.AppliedDelta,
                    updated_balance = adjustmentResult.AvailableCredits,
                    reason_code = overrideContext.ReasonCode,
                    actor_note = overrideContext.ActorNote
                }),
                CreatedAtUtc = now
            });

            await AddManualOverrideAuditLogAsync(
                shop.Id,
                null,
                "manual_override_ai_wallet_correction",
                overrideContext.Actor,
                overrideContext.AuditReason,
                new
                {
                    shop_code = shop.Code,
                    reference = normalizedReference,
                    previous_balance = previousBalance,
                    applied_delta = adjustmentResult.AppliedDelta,
                    updated_balance = adjustmentResult.AvailableCredits,
                    reason_code = overrideContext.ReasonCode,
                    actor_note = overrideContext.ActorNote
                },
                now,
                cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AdminAiWalletCorrectionResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            Status = status,
            Reference = normalizedReference,
            PreviousBalance = previousBalance,
            UpdatedBalance = adjustmentResult.AvailableCredits,
            AppliedDelta = adjustmentResult.AppliedDelta,
            ProcessedAt = now
        };
    }

    public async Task<AdminDeviceFraudLockResponse> ApplyFraudLockToDeviceAsAdminAsync(
        string deviceCode,
        AdminDeviceFraudLockRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required.",
                StatusCodes.Status400BadRequest);
        }

        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "security-admin",
            defaultReasonCode: "fraud_lock_device");
        var requiresStepUp = options.RequireStepUpApprovalForHighRiskAdminActions;
        var stepUpApproval = ResolveStepUpApproval(
            requiresStepUp,
            request.StepUpApprovedBy,
            request.StepUpApprovalNote,
            "fraud_lock_device");
        var now = DateTimeOffset.UtcNow;

        var deactivation = await DeactivateDeviceAsAdminAsync(
            normalizedDeviceCode,
            new AdminDeviceActionRequest
            {
                Actor = overrideContext.Actor,
                ReasonCode = overrideContext.ReasonCode,
                ActorNote = overrideContext.ActorNote
            },
            cancellationToken);

        var revokedTokenSessions = await RevokeDeviceTokenSessionsAsAdminAsync(
            normalizedDeviceCode,
            overrideContext.Actor,
            overrideContext.ReasonCode,
            overrideContext.ActorNote,
            "manual_override_fraud_lock_revoke_tokens",
            "device_fraud_lock_tokens_revoked",
            now,
            cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "device_fraud_lock_applied",
            Actor = overrideContext.Actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                revoked_token_sessions = revokedTokenSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote,
                step_up_required = requiresStepUp,
                step_up_applied = stepUpApproval.Applied,
                step_up_approved_by = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_fraud_lock_device",
            overrideContext.Actor,
            overrideContext.AuditReason,
            new
            {
                device_code = normalizedDeviceCode,
                revoked_token_sessions = revokedTokenSessions,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote,
                step_up_required = requiresStepUp,
                step_up_applied = stepUpApproval.Applied,
                step_up_approved_by = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminDeviceFraudLockResponse
        {
            ShopId = deactivation.ShopId,
            DeviceCode = normalizedDeviceCode,
            Action = "fraud_lock",
            Status = deactivation.Status,
            LicenseState = deactivation.LicenseState,
            RevokedTokenSessions = revokedTokenSessions,
            StepUpRequired = requiresStepUp,
            StepUpApplied = stepUpApproval.Applied,
            StepUpApprovedBy = stepUpApproval.Applied ? stepUpApproval.ApprovedBy : null,
            ProcessedAt = now
        };
    }

    public async Task<MarketingPaymentRequestCreateResponse> CreateMarketingPaymentRequestAsync(
        MarketingPaymentRequestCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var shopName = NormalizeOptionalValue(request.ShopName);
        if (string.IsNullOrWhiteSpace(shopName))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "shop_name is required.",
                StatusCodes.Status400BadRequest);
        }

        var contactName = NormalizeOptionalValue(request.ContactName);
        if (string.IsNullOrWhiteSpace(contactName))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "contact_name is required.",
                StatusCodes.Status400BadRequest);
        }

        var contactEmail = NormalizeOptionalValue(request.ContactEmail);
        var contactPhone = NormalizeOptionalValue(request.ContactPhone);
        if (string.IsNullOrWhiteSpace(contactEmail) && string.IsNullOrWhiteSpace(contactPhone))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Either contact_email or contact_phone is required.",
                StatusCodes.Status400BadRequest);
        }

        var quote = ResolveMarketingPlanQuote(request.PlanCode);
        var normalizedDeviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (quote.RequiresPayment && quote.AmountDue > 0m && string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required for paid plan onboarding.",
                StatusCodes.Status400BadRequest);
        }

        var paymentMethod = ResolveMarketingPaymentMethod(request.PaymentMethod);
        var normalizedCurrency = ResolveCurrency(request.Currency ?? quote.Currency);
        var normalizedSource = NormalizeOptionalValue(request.Source) ?? "marketing_website";
        var normalizedCampaign = NormalizeOptionalValue(request.Campaign);
        var normalizedLocale = NormalizeOptionalValue(request.Locale);
        var customerNotes = NormalizeOptionalValue(request.Notes);
        var ownerUsername = ResolveMarketingOwnerUsername(request.OwnerUsername);
        var ownerPassword = ResolveMarketingOwnerPassword(request.OwnerPassword);
        var ownerFullName = ResolveMarketingOwnerFullName(request.OwnerFullName, contactName);
        var shopCode = string.IsNullOrWhiteSpace(request.ShopCode)
            ? await GenerateUniqueMarketingShopCodeAsync(shopName, cancellationToken)
            : NormalizeMarketingShopCode(request.ShopCode);

        if (!quote.RequiresPayment || quote.AmountDue <= 0m)
        {
            var trialShop = await GetOrCreateShopAsync(shopCode, now, cancellationToken);
            EnsureMarketingShopName(trialShop, shopName, now);
            var ownerAccount = await EnsureMarketingOwnerAccountAsync(
                trialShop,
                ownerUsername,
                ownerPassword,
                ownerFullName,
                now,
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new MarketingPaymentRequestCreateResponse
            {
                GeneratedAt = now,
                ShopCode = trialShop.Code,
                ShopName = trialShop.Name,
                ContactName = contactName,
                ContactEmail = contactEmail,
                ContactPhone = contactPhone,
                MarketingPlanCode = quote.MarketingPlanCode,
                InternalPlanCode = quote.InternalPlanCode,
                RequiresPayment = false,
                AmountDue = 0m,
                Currency = normalizedCurrency,
                NextStep = "open_pos_and_activate_trial",
                Instructions = new MarketingPaymentInstructionsResponse
                {
                    PaymentMethod = paymentMethod,
                    Message = "This plan does not require payment. Install SmartPOS and continue with trial activation.",
                    ReferenceHint = "No payment reference required for free trial."
                },
                OwnerUsername = ownerAccount.User.Username,
                OwnerAccountState = ownerAccount.AccountState
            };
        }

        var invoiceNotes = BuildMarketingInvoiceNotes(
            quote,
            paymentMethod,
            normalizedDeviceCode,
            contactName,
            contactEmail,
            contactPhone,
            ownerUsername,
            normalizedSource,
            normalizedCampaign,
            normalizedLocale,
            customerNotes);
        var actorNote = $"plan={quote.InternalPlanCode}; method={paymentMethod}; source={normalizedSource}";

        var invoiceRow = await CreateManualInvoiceAsAdminAsync(
            new AdminManualBillingInvoiceCreateRequest
            {
                ShopCode = shopCode,
                AmountDue = decimal.Round(quote.AmountDue, 2),
                Currency = normalizedCurrency,
                DueAt = now.AddDays(7),
                Notes = invoiceNotes,
                Actor = "marketing-website",
                ReasonCode = "marketing_payment_request_created",
                ActorNote = actorNote
            },
            cancellationToken);

        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == invoiceRow.ShopId, cancellationToken);
        var persistedShop = shop ??
                            await dbContext.Shops
                                .FirstOrDefaultAsync(x => x.Id == invoiceRow.ShopId, cancellationToken) ??
                            throw new LicenseException(
                                LicenseErrorCodes.InvalidAdminRequest,
                                "Shop was not found for marketing payment request.",
                                StatusCodes.Status404NotFound);
        EnsureMarketingShopName(persistedShop, shopName, now);
        var ownerAccountResult = await EnsureMarketingOwnerAccountAsync(
            persistedShop,
            ownerUsername,
            ownerPassword,
            ownerFullName,
            now,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new MarketingPaymentRequestCreateResponse
        {
            GeneratedAt = now,
            ShopCode = persistedShop.Code,
            ShopName = persistedShop.Name,
            ContactName = contactName,
            ContactEmail = contactEmail,
            ContactPhone = contactPhone,
            MarketingPlanCode = quote.MarketingPlanCode,
            InternalPlanCode = quote.InternalPlanCode,
            RequiresPayment = true,
            AmountDue = invoiceRow.AmountDue,
            Currency = invoiceRow.Currency,
            NextStep = "await_customer_payment",
            Invoice = new MarketingPaymentInvoiceResponse
            {
                InvoiceId = invoiceRow.InvoiceId,
                InvoiceNumber = invoiceRow.InvoiceNumber,
                Status = invoiceRow.Status,
                DueAt = invoiceRow.DueAt
            },
            Instructions = BuildMarketingPaymentInstructions(paymentMethod),
            OwnerUsername = ownerAccountResult.User.Username,
            OwnerAccountState = ownerAccountResult.AccountState
        };
    }

    public async Task<MarketingStripeCheckoutSessionResponse> CreateMarketingStripeCheckoutSessionAsync(
        MarketingPaymentRequestCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var shopName = NormalizeOptionalValue(request.ShopName);
        if (string.IsNullOrWhiteSpace(shopName))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "shop_name is required.",
                StatusCodes.Status400BadRequest);
        }

        var contactName = NormalizeOptionalValue(request.ContactName);
        if (string.IsNullOrWhiteSpace(contactName))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "contact_name is required.",
                StatusCodes.Status400BadRequest);
        }

        var contactEmail = NormalizeOptionalValue(request.ContactEmail);
        var contactPhone = NormalizeOptionalValue(request.ContactPhone);
        if (string.IsNullOrWhiteSpace(contactEmail) && string.IsNullOrWhiteSpace(contactPhone))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Either contact_email or contact_phone is required.",
                StatusCodes.Status400BadRequest);
        }

        var quote = ResolveMarketingPlanQuote(request.PlanCode);
        if (!quote.RequiresPayment || quote.AmountDue <= 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Selected plan does not require Stripe checkout.",
                StatusCodes.Status400BadRequest);
        }

        var normalizedCurrency = ResolveCurrency(request.Currency ?? quote.Currency);
        var normalizedDeviceCode = NormalizeDeviceCode(request.DeviceCode);
        var normalizedSource = NormalizeOptionalValue(request.Source) ?? "marketing_website";
        var normalizedCampaign = NormalizeOptionalValue(request.Campaign);
        var normalizedLocale = NormalizeOptionalValue(request.Locale);
        var customerNotes = NormalizeOptionalValue(request.Notes);
        var ownerUsername = ResolveMarketingOwnerUsername(request.OwnerUsername);
        var ownerPassword = ResolveMarketingOwnerPassword(request.OwnerPassword);
        var ownerFullName = ResolveMarketingOwnerFullName(request.OwnerFullName, contactName);

        var shopCode = string.IsNullOrWhiteSpace(request.ShopCode)
            ? await GenerateUniqueMarketingShopCodeAsync(shopName, cancellationToken)
            : NormalizeMarketingShopCode(request.ShopCode);

        var invoiceNotes = BuildMarketingInvoiceNotes(
            quote,
            paymentMethod: "stripe",
            normalizedDeviceCode,
            contactName,
            contactEmail,
            contactPhone,
            ownerUsername,
            normalizedSource,
            normalizedCampaign,
            normalizedLocale,
            customerNotes);
        var actorNote = $"plan={quote.InternalPlanCode}; method=stripe; source={normalizedSource}";

        var invoiceRow = await CreateManualInvoiceAsAdminAsync(
            new AdminManualBillingInvoiceCreateRequest
            {
                ShopCode = shopCode,
                AmountDue = decimal.Round(quote.AmountDue, 2),
                Currency = normalizedCurrency,
                DueAt = now.AddDays(7),
                Notes = invoiceNotes,
                Actor = "marketing-stripe-checkout",
                ReasonCode = "marketing_stripe_checkout_created",
                ActorNote = actorNote
            },
            cancellationToken);

        var persistedShop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == invoiceRow.ShopId, cancellationToken);
        if (persistedShop is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Shop was not found for marketing Stripe checkout.",
                StatusCodes.Status404NotFound);
        }

        EnsureMarketingShopName(persistedShop, shopName, now);
        var ownerAccountResult = await EnsureMarketingOwnerAccountAsync(
            persistedShop,
            ownerUsername,
            ownerPassword,
            ownerFullName,
            now,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        var priceId = ResolveStripePriceIdForMarketingPlan(quote.MarketingPlanCode);
        var successUrl = ResolveStripeCheckoutSuccessUrl();
        var cancelUrl = ResolveStripeCheckoutCancelUrl();
        var stripeSession = await CreateStripeCheckoutSessionAsync(
            priceId,
            successUrl,
            cancelUrl,
            contactEmail,
            invoiceRow,
            persistedShop.Code,
            persistedShop.Name,
            quote,
            normalizedSource,
            normalizedCampaign,
            normalizedLocale,
            cancellationToken);

        return new MarketingStripeCheckoutSessionResponse
        {
            CreatedAt = now,
            ShopCode = persistedShop.Code,
            ShopName = persistedShop.Name,
            MarketingPlanCode = quote.MarketingPlanCode,
            InternalPlanCode = quote.InternalPlanCode,
            AmountDue = invoiceRow.AmountDue,
            Currency = invoiceRow.Currency,
            Invoice = new MarketingPaymentInvoiceResponse
            {
                InvoiceId = invoiceRow.InvoiceId,
                InvoiceNumber = invoiceRow.InvoiceNumber,
                Status = invoiceRow.Status,
                DueAt = invoiceRow.DueAt
            },
            OwnerUsername = ownerAccountResult.User.Username,
            OwnerAccountState = ownerAccountResult.AccountState,
            CheckoutSessionId = stripeSession.SessionId,
            CheckoutUrl = stripeSession.CheckoutUrl,
            ExpiresAt = stripeSession.ExpiresAt
        };
    }

    public async Task<MarketingStripeCheckoutSessionStatusResponse> GetMarketingStripeCheckoutSessionStatusAsync(
        string sessionId,
        CancellationToken cancellationToken)
    {
        var normalizedSessionId = NormalizeOptionalValue(sessionId);
        if (string.IsNullOrWhiteSpace(normalizedSessionId))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "session_id is required.",
                StatusCodes.Status400BadRequest);
        }

        if (!normalizedSessionId.StartsWith("cs_", StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "session_id format is invalid.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var checkout = await RetrieveStripeCheckoutSessionAsync(normalizedSessionId, cancellationToken);

        ManualBillingInvoice? invoice = null;
        var invoiceId = TryParseGuid(checkout.InvoiceId);
        if (invoiceId.HasValue)
        {
            invoice = await dbContext.ManualBillingInvoices
                .Include(x => x.Shop)
                .FirstOrDefaultAsync(x => x.Id == invoiceId.Value, cancellationToken);
        }

        if (invoice is null && !string.IsNullOrWhiteSpace(checkout.InvoiceNumber))
        {
            invoice = await dbContext.ManualBillingInvoices
                .Include(x => x.Shop)
                .FirstOrDefaultAsync(
                    x => x.InvoiceNumber.ToLower() == checkout.InvoiceNumber.ToLower(),
                    cancellationToken);
        }

        var invoiceStatus = invoice is null ? null : MapManualBillingInvoiceStatusValue(invoice.Status);
        string? paymentStatus = null;
        if (invoice is not null)
        {
            var latestPayment = (await dbContext.ManualBillingPayments
                    .AsNoTracking()
                    .Where(x => x.InvoiceId == invoice.Id)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                .FirstOrDefault();
            paymentStatus = latestPayment is null ? null : MapManualBillingPaymentStatusValue(latestPayment.Status);
        }

        Subscription? subscription = null;
        if (invoice is not null)
        {
            subscription = await dbContext.Subscriptions
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.ShopId == invoice.ShopId, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(checkout.SubscriptionId))
        {
            subscription = await dbContext.Subscriptions
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.BillingSubscriptionId == checkout.SubscriptionId, cancellationToken);
        }

        var subscriptionStatus = subscription?.Status.ToString().ToLowerInvariant();
        var accessReady =
            string.Equals(subscriptionStatus, "active", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(invoiceStatus, "paid", StringComparison.OrdinalIgnoreCase);

        string? stripeEventHint = null;
        if (accessReady)
        {
            stripeEventHint = "license_access_ready";
        }
        else if (string.Equals(checkout.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase) &&
                 !string.Equals(invoiceStatus, "paid", StringComparison.OrdinalIgnoreCase))
        {
            stripeEventHint = "awaiting_webhook_processing";
        }
        else if (string.Equals(checkout.Status, "expired", StringComparison.OrdinalIgnoreCase))
        {
            stripeEventHint = "checkout_session_expired";
        }

        return new MarketingStripeCheckoutSessionStatusResponse
        {
            GeneratedAt = now,
            CheckoutSessionId = checkout.SessionId,
            CheckoutStatus = checkout.Status,
            CheckoutPaymentStatus = checkout.PaymentStatus,
            ShopCode = checkout.ShopCode ?? invoice?.Shop.Code,
            ShopName = checkout.ShopName ?? invoice?.Shop.Name,
            Invoice = invoice is null
                ? (string.IsNullOrWhiteSpace(checkout.InvoiceNumber) ? null : new MarketingPaymentInvoiceResponse
                {
                    InvoiceId = invoiceId ?? Guid.Empty,
                    InvoiceNumber = checkout.InvoiceNumber!,
                    Status = "open",
                    DueAt = now.AddDays(7)
                })
                : new MarketingPaymentInvoiceResponse
                {
                    InvoiceId = invoice.Id,
                    InvoiceNumber = invoice.InvoiceNumber,
                    Status = invoiceStatus ?? "open",
                    DueAt = invoice.DueAtUtc
                },
            PaymentStatus = paymentStatus,
            SubscriptionId = subscription?.BillingSubscriptionId ?? checkout.SubscriptionId,
            SubscriptionStatus = subscriptionStatus,
            Plan = subscription?.Plan,
            AccessReady = accessReady,
            StripeEventHint = stripeEventHint
        };
    }

    public async Task<MarketingPaymentSubmissionResponse> SubmitMarketingPaymentAsync(
        MarketingPaymentSubmissionRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        EnsureMarketingManualBillingFallbackEnabled("payment_submit");

        if (request.Amount <= 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "amount must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var paymentMethod = ResolveMarketingPaymentMethod(request.PaymentMethod);
        var contactName = NormalizeOptionalValue(request.ContactName);
        var contactEmail = NormalizeOptionalValue(request.ContactEmail);
        var contactPhone = NormalizeOptionalValue(request.ContactPhone);
        var normalizedNotes = NormalizeOptionalValue(request.Notes);
        var normalizedBankReference = NormalizeMarketingBankReference(request.BankReference);
        var normalizedDeviceCode = NormalizeDeviceCode(request.DeviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code is required for paid plan onboarding.",
                StatusCodes.Status400BadRequest);
        }

        var manualPaymentMethod = ParseManualBillingPaymentMethod(paymentMethod);
        var actorNote = "customer submitted payment details via marketing website";

        ValidateManualPaymentEvidence(
            manualPaymentMethod,
            normalizedBankReference,
            "submit");

        var invoice = await ResolveManualBillingInvoiceForPaymentAsync(
            new AdminManualBillingPaymentRecordRequest
            {
                InvoiceId = request.InvoiceId,
                InvoiceNumber = request.InvoiceNumber
            },
            cancellationToken);
        var expectedDeviceCode = TryResolveDeviceCodeFromMarketingMetadata(invoice.Notes);
        if (!string.IsNullOrWhiteSpace(expectedDeviceCode) &&
            !string.Equals(expectedDeviceCode, normalizedDeviceCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "device_code does not match the original onboarding request.",
                StatusCodes.Status409Conflict);
        }

        var hasExistingOpenSubmission = await dbContext.ManualBillingPayments
            .AsNoTracking()
            .AnyAsync(
                x => x.InvoiceId == invoice.Id && x.Status != ManualBillingPaymentStatus.Rejected,
                cancellationToken);
        if (hasExistingOpenSubmission)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("marketing_payment_duplicate_invoice_submission");
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "A payment submission already exists for this invoice.",
                StatusCodes.Status409Conflict);
        }

        if (!string.IsNullOrWhiteSpace(normalizedBankReference))
        {
            var reusedAcrossInvoices = await dbContext.ManualBillingPayments
                .AsNoTracking()
                .AnyAsync(
                    x => x.InvoiceId != invoice.Id &&
                         x.Status != ManualBillingPaymentStatus.Rejected &&
                         x.BankReference != null &&
                         x.BankReference.ToLower() == normalizedBankReference.ToLower(),
                    cancellationToken);
            if (reusedAcrossInvoices)
            {
                licensingAlertMonitor.RecordSecurityAnomaly("marketing_payment_bank_reference_reused");
            }
        }

        var paymentNotes = BuildMarketingPaymentSubmissionNotes(
            normalizedDeviceCode,
            contactName,
            contactEmail,
            contactPhone,
            normalizedNotes);

        var paymentRow = await RecordManualPaymentAsAdminAsync(
            new AdminManualBillingPaymentRecordRequest
            {
                InvoiceId = invoice.Id,
                InvoiceNumber = invoice.InvoiceNumber,
                Method = paymentMethod,
                Amount = decimal.Round(request.Amount, 2),
                Currency = ResolveCurrency(request.Currency),
                BankReference = normalizedBankReference,
                ReceivedAt = request.PaidAt ?? now,
                Notes = paymentNotes,
                Actor = "marketing-customer",
                ReasonCode = "marketing_payment_submission_pending",
                ActorNote = actorNote
            },
            cancellationToken);

        var persistedInvoice = await dbContext.ManualBillingInvoices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == paymentRow.InvoiceId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvoiceNotFound,
                "Invoice was not found after payment submission.",
                StatusCodes.Status404NotFound);

        AiCreditOrder? aiCreditOrder;
        var aiCreditOrderQuery = dbContext.AiCreditOrders
            .Where(x => x.InvoiceId == paymentRow.InvoiceId);
        if (dbContext.Database.IsSqlite())
        {
            aiCreditOrder = (await aiCreditOrderQuery.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();
        }
        else
        {
            aiCreditOrder = await aiCreditOrderQuery
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }
        if (aiCreditOrder is not null)
        {
            aiCreditOrder.PaymentId = paymentRow.PaymentId;
            aiCreditOrder.Status = AiCreditOrderStatus.PendingVerification;
            aiCreditOrder.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new MarketingPaymentSubmissionResponse
        {
            ProcessedAt = now,
            ShopCode = paymentRow.ShopCode,
            InvoiceId = persistedInvoice.Id,
            InvoiceNumber = persistedInvoice.InvoiceNumber,
            InvoiceStatus = MapManualBillingInvoiceStatusValue(persistedInvoice.Status),
            PaymentId = paymentRow.PaymentId,
            PaymentStatus = paymentRow.Status,
            Message = "Payment submitted successfully. Verification is pending with the billing team.",
            NextStep = "await_admin_verification",
            AiCreditOrder = aiCreditOrder is null
                ? null
                : MapMarketingAiCreditOrderSummary(aiCreditOrder)
        };
    }

    public async Task<MarketingAiCreditOrderStatusResponse> GetMarketingAiCreditOrderStatusAsync(
        Guid? orderId,
        string? invoiceNumber,
        CancellationToken cancellationToken)
    {
        EnsureMarketingManualBillingFallbackEnabled("ai_credit_order_status");
        var normalizedInvoiceNumber = NormalizeOptionalValue(invoiceNumber);
        var hasOrderId = orderId.HasValue && orderId.Value != Guid.Empty;
        if (!hasOrderId && string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Either order_id or invoice_number is required.",
                StatusCodes.Status400BadRequest);
        }

        AiCreditOrder? order;
        if (hasOrderId)
        {
            order = await dbContext.AiCreditOrders
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == orderId!.Value, cancellationToken);
        }
        else
        {
            var invoice = await dbContext.ManualBillingInvoices
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.InvoiceNumber.ToLower() == normalizedInvoiceNumber!.ToLower(),
                    cancellationToken);
            if (invoice is null)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvoiceNotFound,
                    "Invoice was not found.",
                    StatusCodes.Status404NotFound);
            }

            var query = dbContext.AiCreditOrders
                .AsNoTracking()
                .Where(x => x.InvoiceId == invoice.Id);
            if (dbContext.Database.IsSqlite())
            {
                order = (await query.ToListAsync(cancellationToken))
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .FirstOrDefault();
            }
            else
            {
                order = await query
                    .OrderByDescending(x => x.CreatedAtUtc)
                    .FirstOrDefaultAsync(cancellationToken);
            }
        }

        if (order is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvoiceNotFound,
                "AI credit order was not found.",
                StatusCodes.Status404NotFound);
        }

        ManualBillingInvoice? invoiceRow = null;
        if (order.InvoiceId.HasValue)
        {
            invoiceRow = await dbContext.ManualBillingInvoices
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == order.InvoiceId.Value, cancellationToken);
        }

        ManualBillingPayment? paymentRow = null;
        if (order.PaymentId.HasValue)
        {
            paymentRow = await dbContext.ManualBillingPayments
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == order.PaymentId.Value, cancellationToken);
        }

        var shopCode = await dbContext.Shops
                           .AsNoTracking()
                           .Where(x => x.Id == order.ShopId)
                           .Select(x => x.Code)
                           .FirstOrDefaultAsync(cancellationToken)
                       ?? ResolveShopCode(null);

        return new MarketingAiCreditOrderStatusResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            ShopCode = shopCode,
            InvoiceNumber = invoiceRow?.InvoiceNumber,
            InvoiceStatus = invoiceRow is null
                ? null
                : MapManualBillingInvoiceStatusValue(invoiceRow.Status),
            PaymentStatus = paymentRow is null
                ? null
                : MapManualBillingPaymentStatusValue(paymentRow.Status),
            Order = MapMarketingAiCreditOrderSummary(order)
        };
    }

    public Task<MarketingPaymentProofUploadResponse> UploadMarketingPaymentProofAsync(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        _ = file;
        _ = cancellationToken;
        return Task.FromException<MarketingPaymentProofUploadResponse>(
            new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Payment slip uploads are disabled. Submit manual payments with reference number only.",
                StatusCodes.Status410Gone));
    }

    public async Task<MarketingLicenseDownloadTrackResponse> TrackMarketingLicenseDownloadAsync(
        MarketingLicenseDownloadTrackRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var normalizedKey = NormalizeOptionalValue(request.ActivationEntitlementKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "activation_entitlement_key is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var normalizedSource = NormalizeOptionalValue(request.Source) ?? "license_access_success";
        var normalizedChannel = NormalizeOptionalValue(request.Channel) ?? "installer_download";
        var entitlementLookup = await ResolveActivationEntitlementByPresentedKeyAsync(normalizedKey, cancellationToken);
        var entitlement = entitlementLookup.Entitlement;

        Guid? paymentId = null;
        Guid? invoiceId = null;
        string? invoiceNumber = null;
        var sourceReference = NormalizeOptionalValue(entitlement.SourceReference);
        if (Guid.TryParse(sourceReference, out var parsedPaymentId))
        {
            var payment = await dbContext.ManualBillingPayments
                .AsNoTracking()
                .Include(x => x.Invoice)
                .FirstOrDefaultAsync(x => x.Id == parsedPaymentId, cancellationToken);
            if (payment is not null)
            {
                paymentId = payment.Id;
                invoiceId = payment.InvoiceId;
                invoiceNumber = payment.Invoice.InvoiceNumber;
            }
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = entitlement.ShopId,
            Action = "marketing_installer_download_tracked",
            Actor = "marketing-customer",
            Reason = normalizedSource,
            MetadataJson = JsonSerializer.Serialize(new
            {
                source = normalizedSource,
                channel = normalizedChannel,
                activation_entitlement_id = entitlement.Id,
                activation_entitlement_source = entitlement.Source,
                activation_entitlement_source_reference = sourceReference,
                payment_id = paymentId,
                invoice_id = invoiceId,
                invoice_number = invoiceNumber
            }),
            CreatedAtUtc = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        var anomalyThresholdPerHour = Math.Max(1, options.InstallerDownloadAnomalyThresholdPerHour);
        var recentDownloadCount = await CountRecentInstallerDownloadEventsAsync(entitlement.ShopId, now, cancellationToken);
        if (recentDownloadCount >= anomalyThresholdPerHour)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("installer_download_frequency_spike");
        }

        return new MarketingLicenseDownloadTrackResponse
        {
            TrackedAt = now,
            ShopCode = entitlementLookup.Shop.Code,
            ActivationEntitlementKey = entitlementLookup.NormalizedKeyForDisplay,
            Source = normalizedSource,
            Channel = normalizedChannel,
            PaymentId = paymentId,
            InvoiceId = invoiceId,
            InvoiceNumber = invoiceNumber
        };
    }

    private async Task<int> CountRecentInstallerDownloadEventsAsync(
        Guid shopId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var windowStart = now.AddHours(-1);
        if (dbContext.Database.IsSqlite())
        {
            return (await dbContext.LicenseAuditLogs
                    .AsNoTracking()
                    .Where(x =>
                        x.ShopId == shopId &&
                        x.Action == "marketing_installer_download_tracked")
                    .ToListAsync(cancellationToken))
                .Count(x => x.CreatedAtUtc >= windowStart);
        }

        return await dbContext.LicenseAuditLogs
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.Action == "marketing_installer_download_tracked" &&
                x.CreatedAtUtc >= windowStart)
            .CountAsync(cancellationToken);
    }

    public async Task<string> ResolveProtectedInstallerDownloadRedirectAsync(
        string token,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var parsedToken = ParseAndValidateInstallerDownloadToken(token);
        if (parsedToken.ExpiresAt <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download link has expired.",
                StatusCodes.Status410Gone);
        }

        var entitlement = await dbContext.CustomerActivationEntitlements
            .Include(x => x.Shop)
            .FirstOrDefaultAsync(
                x => x.Id == parsedToken.EntitlementId && x.ShopId == parsedToken.ShopId,
                cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download link is invalid.",
                StatusCodes.Status404NotFound);

        if (entitlement.Status == ActivationEntitlementStatus.Revoked || entitlement.ExpiresAtUtc <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download link is no longer valid.",
                StatusCodes.Status410Gone);
        }

        var downloadBaseUrl = ResolveInstallerDownloadBaseUrl()
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Installer download is not configured.",
                StatusCodes.Status404NotFound);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = entitlement.ShopId,
            Action = "installer_download_redirect_issued",
            Actor = "license-download",
            Reason = "protected_link_validated",
            MetadataJson = JsonSerializer.Serialize(new
            {
                entitlement_id = entitlement.Id,
                entitlement_source = entitlement.Source,
                entitlement_source_reference = entitlement.SourceReference,
                token_expires_at = parsedToken.ExpiresAt,
                download_url = downloadBaseUrl
            }),
            CreatedAtUtc = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return downloadBaseUrl;
    }

    public async Task<AdminManualBillingInvoicesResponse> GetAdminManualInvoicesAsync(
        string? search,
        string? status,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();
        var statusFilter = ParseManualBillingInvoiceStatus(status);
        var normalizedTake = Math.Clamp(take, 1, 200);

        var query = dbContext.ManualBillingInvoices
            .AsNoTracking();

        if (statusFilter.HasValue)
        {
            query = query.Where(x => x.Status == statusFilter.Value);
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(x =>
                x.InvoiceNumber.ToLower().Contains(normalizedSearch) ||
                (x.Notes != null && x.Notes.ToLower().Contains(normalizedSearch)) ||
                (x.CreatedBy != null && x.CreatedBy.ToLower().Contains(normalizedSearch)));
        }

        List<ManualBillingInvoice> invoices;
        if (dbContext.Database.IsSqlite())
        {
            invoices = (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            invoices = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var shopCodeById = await dbContext.Shops
            .AsNoTracking()
            .Where(x => invoices.Select(invoice => invoice.ShopId).Distinct().Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, cancellationToken);

        return new AdminManualBillingInvoicesResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Count = invoices.Count,
            Items = invoices
                .Select(x => MapManualBillingInvoiceRow(
                    x,
                    shopCodeById.TryGetValue(x.ShopId, out var shopCode) ? shopCode : ResolveShopCode(null)))
                .ToList()
        };
    }

    public async Task<AdminManualBillingInvoiceRow> CreateManualInvoiceAsAdminAsync(
        AdminManualBillingInvoiceCreateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.AmountDue <= 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "amount_due must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Notes,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_billing_invoice_created");
        var actor = overrideContext.Actor;
        var shop = await GetOrCreateShopAsync(request.ShopCode, now, cancellationToken);
        var invoiceNumber = await ResolveManualBillingInvoiceNumberAsync(
            request.InvoiceNumber,
            cancellationToken);
        var dueAt = request.DueAt ?? now.AddDays(7);
        var normalizedCurrency = ResolveCurrency(request.Currency);
        var normalizedNotes = NormalizeOptionalValue(request.Notes);

        var invoice = new ManualBillingInvoice
        {
            ShopId = shop.Id,
            Shop = shop,
            InvoiceNumber = invoiceNumber,
            AmountDue = decimal.Round(request.AmountDue, 2),
            AmountPaid = 0m,
            Currency = normalizedCurrency,
            Status = ManualBillingInvoiceStatus.Open,
            DueAtUtc = dueAt,
            Notes = normalizedNotes,
            CreatedBy = actor,
            CreatedAtUtc = now
        };

        dbContext.ManualBillingInvoices.Add(invoice);
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "manual_invoice_created",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                amount_due = invoice.AmountDue,
                currency = invoice.Currency,
                due_at = invoice.DueAtUtc,
                notes = invoice.Notes,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_invoice_create",
            actor,
            overrideContext.AuditReason,
            new
            {
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                amount_due = invoice.AmountDue,
                currency = invoice.Currency,
                due_at = invoice.DueAtUtc,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapManualBillingInvoiceRow(invoice, shop.Code);
    }

    public async Task<AdminManualBillingPaymentsResponse> GetAdminManualPaymentsAsync(
        string? search,
        string? status,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();
        var statusFilter = ParseManualBillingPaymentStatus(status);
        var normalizedTake = Math.Clamp(take, 1, 200);

        var query = dbContext.ManualBillingPayments
            .AsNoTracking();

        if (statusFilter.HasValue)
        {
            query = query.Where(x => x.Status == statusFilter.Value);
        }

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            query = query.Where(x =>
                (x.BankReference != null && x.BankReference.ToLower().Contains(normalizedSearch)) ||
                (x.Notes != null && x.Notes.ToLower().Contains(normalizedSearch)) ||
                (x.RecordedBy != null && x.RecordedBy.ToLower().Contains(normalizedSearch)) ||
                (x.VerifiedBy != null && x.VerifiedBy.ToLower().Contains(normalizedSearch)) ||
                (x.RejectedBy != null && x.RejectedBy.ToLower().Contains(normalizedSearch)));
        }

        List<ManualBillingPayment> payments;
        if (dbContext.Database.IsSqlite())
        {
            payments = (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            payments = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var invoiceIds = payments
            .Select(x => x.InvoiceId)
            .Distinct()
            .ToList();
        var invoices = await dbContext.ManualBillingInvoices
            .AsNoTracking()
            .Where(x => invoiceIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var shopCodeById = await dbContext.Shops
            .AsNoTracking()
            .Where(x => payments.Select(payment => payment.ShopId).Distinct().Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, cancellationToken);

        return new AdminManualBillingPaymentsResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Count = payments.Count,
            Items = payments
                .Select(payment =>
                {
                    var shopCode = shopCodeById.TryGetValue(payment.ShopId, out var code)
                        ? code
                        : ResolveShopCode(null);
                    var invoiceNumber = invoices.TryGetValue(payment.InvoiceId, out var invoice)
                        ? invoice.InvoiceNumber
                        : string.Empty;
                    return MapManualBillingPaymentRow(payment, shopCode, invoiceNumber);
                })
                .ToList()
        };
    }

    public async Task<AdminManualBillingPaymentRow> RecordManualPaymentAsAdminAsync(
        AdminManualBillingPaymentRecordRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.Amount <= 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "amount must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Notes,
            defaultActor: "support-admin",
            defaultReasonCode: "manual_payment_pending_verification");
        var actor = overrideContext.Actor;
        var normalizedBankReference = NormalizeMarketingBankReference(request.BankReference);
        var paymentMethod = ParseManualBillingPaymentMethod(request.Method);
        ValidateManualPaymentEvidence(
            paymentMethod,
            normalizedBankReference,
            "record");
        var invoice = await ResolveManualBillingInvoiceForPaymentAsync(request, cancellationToken);
        if (invoice.Status is ManualBillingInvoiceStatus.Paid or ManualBillingInvoiceStatus.Canceled)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Cannot record a payment for an invoice that is already closed.",
                StatusCodes.Status409Conflict);
        }

        var payment = new ManualBillingPayment
        {
            ShopId = invoice.ShopId,
            Shop = invoice.Shop,
            InvoiceId = invoice.Id,
            Invoice = invoice,
            Method = paymentMethod,
            Amount = decimal.Round(request.Amount, 2),
            Currency = ResolveCurrency(request.Currency ?? invoice.Currency),
            Status = ManualBillingPaymentStatus.PendingVerification,
            BankReference = normalizedBankReference,
            DepositSlipUrl = null,
            ReceivedAtUtc = request.ReceivedAt ?? now,
            Notes = NormalizeOptionalValue(request.Notes),
            RecordedBy = actor,
            CreatedAtUtc = now
        };

        dbContext.ManualBillingPayments.Add(payment);
        invoice.Status = ManualBillingInvoiceStatus.PendingVerification;
        invoice.UpdatedAtUtc = now;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = invoice.ShopId,
            Action = "manual_payment_recorded",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                method = payment.Method.ToString().ToLowerInvariant(),
                amount = payment.Amount,
                currency = payment.Currency,
                bank_reference = payment.BankReference,
                proof_mode = "reference_only",
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            invoice.ShopId,
            null,
            "manual_override_payment_record",
            actor,
            overrideContext.AuditReason,
            new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                amount = payment.Amount,
                currency = payment.Currency,
                proof_mode = "reference_only",
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapManualBillingPaymentRow(payment, invoice.Shop.Code, invoice.InvoiceNumber);
    }

    public async Task<AdminManualBillingPaymentVerificationResponse> VerifyManualPaymentAsAdminAsync(
        Guid paymentId,
        AdminManualBillingPaymentVerifyRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (paymentId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "payment_id is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "billing-admin",
            defaultReasonCode: "manual_payment_verified");
        var actor = overrideContext.Actor;
        var payment = await dbContext.ManualBillingPayments
            .Include(x => x.Invoice)
            .ThenInclude(x => x.Shop)
            .FirstOrDefaultAsync(x => x.Id == paymentId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.PaymentNotFound,
                "Manual payment was not found.",
                StatusCodes.Status404NotFound);

        if (payment.Status != ManualBillingPaymentStatus.PendingVerification)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Only pending-verification payments can be verified.",
                StatusCodes.Status409Conflict);
        }

        ValidateManualPaymentEvidence(
            payment.Method,
            payment.BankReference,
            "verify");

        var invoice = payment.Invoice;
        if (invoice.Status == ManualBillingInvoiceStatus.Canceled)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Cannot verify a payment for a canceled invoice.",
                StatusCodes.Status409Conflict);
        }

        var highValueSecondApprovalThreshold = Math.Max(0m, options.HighValuePaymentSecondApprovalThreshold);
        if (options.RequireSecondApprovalForHighValuePayments &&
            payment.Amount >= highValueSecondApprovalThreshold &&
            !string.IsNullOrWhiteSpace(payment.RecordedBy) &&
            string.Equals(payment.RecordedBy.Trim(), actor, StringComparison.OrdinalIgnoreCase))
        {
            licensingAlertMonitor.RecordSecurityAnomaly("manual_payment_second_approval_required");
            throw new LicenseException(
                LicenseErrorCodes.SecondApprovalRequired,
                $"Payments of {highValueSecondApprovalThreshold:0.00} or more require a different approver than the recorder.",
                StatusCodes.Status409Conflict);
        }

        decimal verifiedAmountBefore;
        if (dbContext.Database.IsSqlite())
        {
            verifiedAmountBefore = (await dbContext.ManualBillingPayments
                    .AsNoTracking()
                    .Where(x => x.InvoiceId == invoice.Id && x.Status == ManualBillingPaymentStatus.Verified)
                    .ToListAsync(cancellationToken))
                .Sum(x => x.Amount);
        }
        else
        {
            verifiedAmountBefore = await dbContext.ManualBillingPayments
                .AsNoTracking()
                .Where(x => x.InvoiceId == invoice.Id && x.Status == ManualBillingPaymentStatus.Verified)
                .SumAsync(x => x.Amount, cancellationToken);
        }

        var verifiedAmountAfter = decimal.Round(verifiedAmountBefore + payment.Amount, 2);
        if (verifiedAmountAfter < invoice.AmountDue)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Verified total is below the invoice due amount.",
                StatusCodes.Status409Conflict);
        }

        payment.Status = ManualBillingPaymentStatus.Verified;
        payment.VerifiedBy = actor;
        payment.VerifiedAtUtc = now;
        payment.RejectedBy = null;
        payment.RejectedAtUtc = null;
        payment.RejectionReason = null;
        payment.UpdatedAtUtc = now;

        invoice.AmountPaid = verifiedAmountAfter;
        invoice.Status = ManualBillingInvoiceStatus.Paid;
        invoice.UpdatedAtUtc = now;

        var subscription = await GetOrCreateSubscriptionAsync(invoice.Shop, now, cancellationToken);
        var previousSubscriptionStatus = subscription.Status;
        var previousPlan = subscription.Plan;
        var previousPeriodEnd = subscription.PeriodEndUtc;

        var requestedPlan = NormalizeOptionalValue(request.Plan);
        if (string.IsNullOrWhiteSpace(requestedPlan))
        {
            requestedPlan = TryResolveRequestedPlanFromMarketingMetadata(invoice.Notes);
        }

        if (!string.IsNullOrWhiteSpace(requestedPlan))
        {
            subscription.Plan = ResolvePlanCode(requestedPlan);
        }

        if (request.SeatLimit.HasValue && request.SeatLimit.Value > 0)
        {
            subscription.SeatLimit = request.SeatLimit.Value;
        }
        else if (subscription.SeatLimit <= 0)
        {
            subscription.SeatLimit = ResolveSeatLimitFromPlan(subscription.Plan);
        }

        subscription.Status = SubscriptionStatus.Active;
        subscription.FeatureFlagsJson = ResolveFeatureFlagsJson(subscription.Plan);

        var extendDays = Math.Clamp(
            request.ExtendDays <= 0 ? DefaultManualPaymentExtensionDays : request.ExtendDays,
            1,
            365);
        var periodBaseline = subscription.PeriodEndUtc > now ? subscription.PeriodEndUtc : now;
        subscription.PeriodStartUtc = now;
        subscription.PeriodEndUtc = periodBaseline.AddDays(extendDays);
        subscription.UpdatedAtUtc = now;

        var reissueOutcome = await ForceReissueLicensesForShopAsync(
            invoice.Shop,
            subscription,
            now,
            actor,
            "manual_payment_verified",
            excludedProvisionedDeviceId: null,
            cancellationToken);

        AiCreditOrder? settledAiCreditOrder = null;
        var aiCreditOrder = await ResolveAiCreditOrderForManualPaymentAsync(
            invoice.Id,
            payment.Id,
            cancellationToken);
        if (aiCreditOrder is not null)
        {
            aiCreditOrder.PaymentId ??= payment.Id;
            aiCreditOrder.Status = AiCreditOrderStatus.Verified;
            aiCreditOrder.VerifiedAtUtc = now;
            aiCreditOrder.UpdatedAtUtc = now;
            await SettleAiCreditOrderAsync(aiCreditOrder, actor, now, cancellationToken);
            settledAiCreditOrder = aiCreditOrder;
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = invoice.ShopId,
            Action = "manual_payment_verified",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                payment_amount = payment.Amount,
                amount_due = invoice.AmountDue,
                amount_paid = invoice.AmountPaid,
                extend_days = extendDays,
                previous_subscription_status = previousSubscriptionStatus.ToString().ToLowerInvariant(),
                previous_plan = previousPlan,
                previous_period_end = previousPeriodEnd,
                current_subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                current_plan = subscription.Plan,
                current_period_end = subscription.PeriodEndUtc,
                ai_credit_order_id = settledAiCreditOrder?.Id,
                ai_credit_order_status = settledAiCreditOrder is null
                    ? null
                    : MapAiCreditOrderStatusValue(settledAiCreditOrder.Status),
                ai_credit_requested = settledAiCreditOrder?.RequestedCredits,
                ai_credit_settled = settledAiCreditOrder?.SettledCredits,
                ai_wallet_ledger_reference = settledAiCreditOrder?.WalletLedgerReference,
                reissued_devices = reissueOutcome.ReissuedCount,
                revoked_licenses = reissueOutcome.RevokedCount,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            invoice.ShopId,
            null,
            "manual_override_payment_verify",
            actor,
            overrideContext.AuditReason,
            new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                amount_due = invoice.AmountDue,
                amount_paid = invoice.AmountPaid,
                extend_days = extendDays,
                subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                plan = subscription.Plan,
                period_end = subscription.PeriodEndUtc,
                ai_credit_order_id = settledAiCreditOrder?.Id,
                ai_credit_order_status = settledAiCreditOrder is null
                    ? null
                    : MapAiCreditOrderStatusValue(settledAiCreditOrder.Status),
                ai_credit_requested = settledAiCreditOrder?.RequestedCredits,
                ai_credit_settled = settledAiCreditOrder?.SettledCredits,
                ai_wallet_ledger_reference = settledAiCreditOrder?.WalletLedgerReference,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminManualBillingPaymentVerificationResponse
        {
            Payment = MapManualBillingPaymentRow(payment, invoice.Shop.Code, invoice.InvoiceNumber),
            Invoice = MapManualBillingInvoiceRow(invoice, invoice.Shop.Code),
            SubscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
            Plan = subscription.Plan,
            SeatLimit = ResolveSeatLimit(subscription),
            PeriodEnd = subscription.PeriodEndUtc,
            ActivationEntitlement = null,
            AccessDelivery = null,
            AiCreditOrder = settledAiCreditOrder is null
                ? null
                : MapMarketingAiCreditOrderSummary(settledAiCreditOrder),
            ProcessedAt = now
        };
    }

    public async Task<AdminManualBillingPaymentLicenseCodeGenerateResponse> GenerateManualPaymentLicenseCodeAsAdminAsync(
        Guid paymentId,
        AdminManualBillingPaymentLicenseCodeGenerateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (paymentId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "payment_id is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "billing-admin",
            defaultReasonCode: "manual_payment_license_code_generated");
        var actor = overrideContext.Actor;

        var payment = await dbContext.ManualBillingPayments
            .Include(x => x.Invoice)
            .ThenInclude(x => x.Shop)
            .FirstOrDefaultAsync(x => x.Id == paymentId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.PaymentNotFound,
                "Manual payment was not found.",
                StatusCodes.Status404NotFound);

        if (payment.Status != ManualBillingPaymentStatus.Verified)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Only verified payments can generate a license code.",
                StatusCodes.Status409Conflict);
        }

        var invoice = payment.Invoice;
        if (invoice.Status != ManualBillingInvoiceStatus.Paid)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Invoice must be paid before generating a license code.",
                StatusCodes.Status409Conflict);
        }

        var activeEntitlementsQuery = dbContext.CustomerActivationEntitlements
            .Where(x => x.ShopId == invoice.ShopId);

        List<CustomerActivationEntitlement> activeEntitlements;
        if (dbContext.Database.IsSqlite())
        {
            activeEntitlements = (await activeEntitlementsQuery
                    .ToListAsync(cancellationToken))
                .Where(x => x.Status == ActivationEntitlementStatus.Active)
                .ToList();
        }
        else
        {
            activeEntitlements = await activeEntitlementsQuery
                .Where(x => x.Status == ActivationEntitlementStatus.Active)
                .ToListAsync(cancellationToken);
        }

        var revokedEntitlementsCount = 0;
        foreach (var entitlement in activeEntitlements)
        {
            entitlement.Status = ActivationEntitlementStatus.Revoked;
            entitlement.RevokedAtUtc ??= now;
            revokedEntitlementsCount++;
        }

        var subscription = await GetLatestSubscriptionAsync(invoice.ShopId, cancellationToken)
            ?? await GetOrCreateSubscriptionAsync(invoice.Shop, now, cancellationToken);

        var activationEntitlement = await IssueActivationEntitlementAsync(
            invoice.Shop,
            ResolveSeatLimit(subscription),
            "manual_payment_license_code_generated",
            payment.Id.ToString("N"),
            actor,
            now,
            cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Unable to generate license code for this payment.",
                StatusCodes.Status503ServiceUnavailable);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = invoice.ShopId,
            Action = "manual_payment_license_code_generated",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                activation_entitlement_id = activationEntitlement.EntitlementId,
                revoked_entitlements_count = revokedEntitlementsCount,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            invoice.ShopId,
            null,
            "manual_override_payment_generate_license_code",
            actor,
            overrideContext.AuditReason,
            new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                activation_entitlement_id = activationEntitlement.EntitlementId,
                revoked_entitlements_count = revokedEntitlementsCount,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminManualBillingPaymentLicenseCodeGenerateResponse
        {
            Payment = MapManualBillingPaymentRow(payment, invoice.Shop.Code, invoice.InvoiceNumber),
            Invoice = MapManualBillingInvoiceRow(invoice, invoice.Shop.Code),
            ActivationEntitlement = activationEntitlement,
            RevokedEntitlementsCount = revokedEntitlementsCount,
            ProcessedAt = now
        };
    }

    public async Task<AdminOfflineActivationEntitlementBatchGenerateResponse> GenerateOfflineActivationEntitlementsBatchAsAdminAsync(
        AdminOfflineActivationEntitlementBatchGenerateRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "offline-licensing-admin",
            defaultReasonCode: "offline_activation_batch_generated");
        var actor = overrideContext.Actor;

        var requestedCount = request.Count <= 0
            ? OfflineLocalManualBatchEntitlementCount
            : request.Count;
        if (requestedCount != OfflineLocalManualBatchEntitlementCount)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"count must be exactly {OfflineLocalManualBatchEntitlementCount}.",
                StatusCodes.Status400BadRequest);
        }

        var resolvedMaxActivations = request.MaxActivations ?? OfflineLocalManualBatchMaxActivations;
        if (resolvedMaxActivations <= 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "max_activations must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        var maxActivations = Math.Clamp(resolvedMaxActivations, 1, OfflineLocalManualBatchMaxActivations);
        var resolvedTtlDays = request.TtlDays ?? OfflineLocalManualBatchTtlDays;
        if (resolvedTtlDays <= 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "ttl_days must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        var ttlDays = Math.Clamp(resolvedTtlDays, 1, OfflineLocalManualBatchTtlDays);
        var shop = await GetOrCreateShopAsync(request.ShopCode, now, cancellationToken);

        int existingActiveBatchCount;
        if (dbContext.Database.IsSqlite())
        {
            existingActiveBatchCount = (await dbContext.CustomerActivationEntitlements
                    .AsNoTracking()
                    .Where(x =>
                        x.ShopId == shop.Id &&
                        x.Source == OfflineLocalManualBatchEntitlementSource)
                    .ToListAsync(cancellationToken))
                .Count(x =>
                    x.Status == ActivationEntitlementStatus.Active &&
                    x.ExpiresAtUtc > now);
        }
        else
        {
            existingActiveBatchCount = await dbContext.CustomerActivationEntitlements
                .AsNoTracking()
                .Where(x =>
                    x.ShopId == shop.Id &&
                    x.Source == OfflineLocalManualBatchEntitlementSource &&
                    x.Status == ActivationEntitlementStatus.Active &&
                    x.ExpiresAtUtc > now)
                .CountAsync(cancellationToken);
        }
        if (existingActiveBatchCount > 0 && !request.AllowIfExistingBatch)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"An active offline batch already exists for shop '{shop.Code}'. Existing active keys: {existingActiveBatchCount}.",
                StatusCodes.Status409Conflict);
        }

        var sourceReference = $"offline-batch-{now:yyyyMMddHHmmss}-{Guid.NewGuid():N}";
        if (sourceReference.Length > 160)
        {
            sourceReference = sourceReference[..160];
        }

        var generatedEntitlements = new List<CustomerActivationEntitlementResponse>(requestedCount);
        for (var index = 0; index < requestedCount; index++)
        {
            var entitlement = await IssueActivationEntitlementAsync(
                shop,
                maxActivations,
                OfflineLocalManualBatchEntitlementSource,
                sourceReference,
                actor,
                now,
                cancellationToken,
                ttlDays)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "Unable to generate offline activation entitlement keys.",
                    StatusCodes.Status503ServiceUnavailable);
            generatedEntitlements.Add(entitlement);
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "offline_activation_batch_generated",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_code = shop.Code,
                source = OfflineLocalManualBatchEntitlementSource,
                source_reference = sourceReference,
                requested_count = requestedCount,
                generated_count = generatedEntitlements.Count,
                max_activations = maxActivations,
                ttl_days = ttlDays,
                existing_active_batch_count = existingActiveBatchCount,
                allow_if_existing_batch = request.AllowIfExistingBatch,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_offline_activation_batch_generated",
            actor,
            overrideContext.AuditReason,
            new
            {
                shop_code = shop.Code,
                source = OfflineLocalManualBatchEntitlementSource,
                source_reference = sourceReference,
                requested_count = requestedCount,
                generated_count = generatedEntitlements.Count,
                max_activations = maxActivations,
                ttl_days = ttlDays,
                existing_active_batch_count = existingActiveBatchCount,
                allow_if_existing_batch = request.AllowIfExistingBatch,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AdminOfflineActivationEntitlementBatchGenerateResponse
        {
            GeneratedAt = now,
            ShopId = shop.Id,
            ShopCode = shop.Code,
            Source = OfflineLocalManualBatchEntitlementSource,
            SourceReference = sourceReference,
            RequestedCount = requestedCount,
            GeneratedCount = generatedEntitlements.Count,
            MaxActivations = maxActivations,
            TtlDays = ttlDays,
            ExistingActiveBatchCount = existingActiveBatchCount,
            Entitlements = generatedEntitlements
        };
    }

    public async Task<AdminManualBillingPaymentRow> RejectManualPaymentAsAdminAsync(
        Guid paymentId,
        AdminManualBillingPaymentRejectRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (paymentId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "payment_id is required.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var overrideContext = ResolveManualOverrideContext(
            request.Actor,
            request.ReasonCode,
            request.ActorNote ?? request.Reason,
            defaultActor: "billing-admin",
            defaultReasonCode: "manual_payment_rejected");
        var actor = overrideContext.Actor;
        var payment = await dbContext.ManualBillingPayments
            .Include(x => x.Invoice)
            .ThenInclude(x => x.Shop)
            .FirstOrDefaultAsync(x => x.Id == paymentId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.PaymentNotFound,
                "Manual payment was not found.",
                StatusCodes.Status404NotFound);

        if (payment.Status != ManualBillingPaymentStatus.PendingVerification)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidPaymentStatus,
                "Only pending-verification payments can be rejected.",
                StatusCodes.Status409Conflict);
        }

        payment.Status = ManualBillingPaymentStatus.Rejected;
        payment.RejectedBy = actor;
        payment.RejectedAtUtc = now;
        payment.RejectionReason = overrideContext.ActorNote;
        payment.VerifiedBy = null;
        payment.VerifiedAtUtc = null;
        payment.UpdatedAtUtc = now;

        var invoice = payment.Invoice;
        var hasOtherPending = await dbContext.ManualBillingPayments
            .AsNoTracking()
            .AnyAsync(
                x => x.InvoiceId == invoice.Id &&
                     x.Id != payment.Id &&
                     x.Status == ManualBillingPaymentStatus.PendingVerification,
                cancellationToken);
        invoice.Status = hasOtherPending ? ManualBillingInvoiceStatus.PendingVerification : ManualBillingInvoiceStatus.Open;
        invoice.UpdatedAtUtc = now;

        var aiCreditOrder = await ResolveAiCreditOrderForManualPaymentAsync(
            invoice.Id,
            payment.Id,
            cancellationToken);
        if (aiCreditOrder is not null)
        {
            aiCreditOrder.Status = AiCreditOrderStatus.Rejected;
            aiCreditOrder.RejectedAtUtc = now;
            aiCreditOrder.SettlementError = "payment_rejected";
            aiCreditOrder.UpdatedAtUtc = now;
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = invoice.ShopId,
            Action = "manual_payment_rejected",
            Actor = actor,
            Reason = overrideContext.AuditReason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                ai_credit_order_id = aiCreditOrder?.Id,
                ai_credit_order_status = aiCreditOrder is null
                    ? null
                    : MapAiCreditOrderStatusValue(aiCreditOrder.Status),
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            })
        });

        await AddManualOverrideAuditLogAsync(
            invoice.ShopId,
            null,
            "manual_override_payment_reject",
            actor,
            overrideContext.AuditReason,
            new
            {
                payment_id = payment.Id,
                invoice_id = invoice.Id,
                invoice_number = invoice.InvoiceNumber,
                reason_code = overrideContext.ReasonCode,
                actor_note = overrideContext.ActorNote
            },
            now,
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapManualBillingPaymentRow(payment, invoice.Shop.Code, invoice.InvoiceNumber);
    }

    public async Task<AdminManualBillingDailyReconciliationResponse> GetDailyManualBankReconciliationAsync(
        string? date,
        string? currency,
        decimal? expectedTotal,
        int take,
        CancellationToken cancellationToken)
    {
        var reconciliationDate = ResolveReconciliationDate(date);
        var now = DateTimeOffset.UtcNow;
        var windowStart = new DateTimeOffset(
            reconciliationDate.Year,
            reconciliationDate.Month,
            reconciliationDate.Day,
            0,
            0,
            0,
            TimeSpan.Zero);
        var windowEnd = windowStart.AddDays(1);
        var normalizedCurrency = ResolveCurrency(currency);
        var normalizedTake = Math.Clamp(take, 1, 200);
        var normalizedExpectedTotal = expectedTotal.HasValue ? decimal.Round(expectedTotal.Value, 2) : (decimal?)null;
        if (normalizedExpectedTotal.HasValue && normalizedExpectedTotal.Value < 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "expected_total cannot be negative.",
                StatusCodes.Status400BadRequest);
        }

        List<ManualBillingPayment> dailyPayments;
        if (dbContext.Database.IsSqlite())
        {
            dailyPayments = (await dbContext.ManualBillingPayments
                    .AsNoTracking()
                    .ToListAsync(cancellationToken))
                .Where(x =>
                    x.ReceivedAtUtc >= windowStart &&
                    x.ReceivedAtUtc < windowEnd &&
                    string.Equals(x.Currency, normalizedCurrency, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        else
        {
            dailyPayments = await dbContext.ManualBillingPayments
                .AsNoTracking()
                .Where(x =>
                    x.ReceivedAtUtc >= windowStart &&
                    x.ReceivedAtUtc < windowEnd &&
                    x.Currency == normalizedCurrency)
                .ToListAsync(cancellationToken);
        }
        var bankPayments = dailyPayments
            .Where(x => x.Method != ManualBillingPaymentMethod.Cash)
            .OrderByDescending(x => x.ReceivedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToList();

        var invoiceById = await dbContext.ManualBillingInvoices
            .AsNoTracking()
            .Where(x => bankPayments.Select(payment => payment.InvoiceId).Distinct().Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var shopCodeById = await dbContext.Shops
            .AsNoTracking()
            .Where(x => bankPayments.Select(payment => payment.ShopId).Distinct().Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Code, cancellationToken);

        var duplicateReferenceGroups = bankPayments
            .Where(x => !string.IsNullOrWhiteSpace(x.BankReference))
            .GroupBy(x => x.BankReference!.Trim().ToUpperInvariant())
            .Where(group => group.Count() > 1)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var duplicateReferenceKeys = duplicateReferenceGroups.Keys.ToHashSet(StringComparer.Ordinal);
        var duplicateReferenceCount = duplicateReferenceGroups.Values.Sum();
        var missingReferenceCount = bankPayments.Count(x => string.IsNullOrWhiteSpace(x.BankReference));

        var recordedBankTotal = decimal.Round(bankPayments.Sum(x => x.Amount), 2);
        var verifiedBankTotal = decimal.Round(
            bankPayments.Where(x => x.Status == ManualBillingPaymentStatus.Verified).Sum(x => x.Amount),
            2);
        var pendingBankTotal = decimal.Round(
            bankPayments.Where(x => x.Status == ManualBillingPaymentStatus.PendingVerification).Sum(x => x.Amount),
            2);
        var rejectedBankTotal = decimal.Round(
            bankPayments.Where(x => x.Status == ManualBillingPaymentStatus.Rejected).Sum(x => x.Amount),
            2);
        var pendingVerificationCount = bankPayments.Count(x => x.Status == ManualBillingPaymentStatus.PendingVerification);

        var mismatchAmount = normalizedExpectedTotal.HasValue
            ? decimal.Round(verifiedBankTotal - normalizedExpectedTotal.Value, 2)
            : (decimal?)null;
        var mismatchTolerance = Math.Max(0m, options.BankReconciliationMismatchToleranceAmount);
        var hasExpectedTotalMismatch = mismatchAmount.HasValue && decimal.Abs(mismatchAmount.Value) > mismatchTolerance;

        var alerts = new List<AdminManualBillingReconciliationAlertRow>();
        var mismatchReasons = new List<string>();

        if (missingReferenceCount > 0)
        {
            mismatchReasons.Add("missing_bank_reference");
            alerts.Add(new AdminManualBillingReconciliationAlertRow
            {
                Code = BankReconciliationMissingReferenceCode,
                Severity = "warning",
                Count = missingReferenceCount,
                Message = $"{missingReferenceCount} bank payment(s) are missing a bank reference."
            });
        }

        if (duplicateReferenceGroups.Count > 0)
        {
            mismatchReasons.Add("duplicate_bank_reference");
            var duplicateReferencePreview = string.Join(", ", duplicateReferenceGroups.Keys.OrderBy(x => x).Take(3));
            alerts.Add(new AdminManualBillingReconciliationAlertRow
            {
                Code = BankReconciliationDuplicateReferenceCode,
                Severity = "critical",
                Count = duplicateReferenceCount,
                Message = $"Duplicate bank references detected ({duplicateReferencePreview})."
            });
        }

        if (pendingVerificationCount > 0)
        {
            alerts.Add(new AdminManualBillingReconciliationAlertRow
            {
                Code = "BANK_PENDING_VERIFICATION",
                Severity = "info",
                Count = pendingVerificationCount,
                Message = $"{pendingVerificationCount} bank payment(s) are still pending verification."
            });
        }

        if (hasExpectedTotalMismatch)
        {
            mismatchReasons.Add("expected_bank_total_mismatch");
            alerts.Add(new AdminManualBillingReconciliationAlertRow
            {
                Code = BankReconciliationExpectedTotalMismatchCode,
                Severity = "critical",
                Count = 1,
                Message =
                    $"Verified total ({verifiedBankTotal:0.00}) does not match expected total ({normalizedExpectedTotal:0.00})."
            });
        }

        var hasMismatch = mismatchReasons.Count > 0;
        var actor = ResolveCurrentAdminActor();
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            Action = "manual_bank_reconciliation_generated",
            Actor = actor,
            Reason = hasMismatch ? "mismatch_detected" : "ok",
            MetadataJson = JsonSerializer.Serialize(new
            {
                date = reconciliationDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                window_start = windowStart,
                window_end = windowEnd,
                currency = normalizedCurrency,
                expected_bank_total = normalizedExpectedTotal,
                recorded_bank_total = recordedBankTotal,
                verified_bank_total = verifiedBankTotal,
                pending_bank_total = pendingBankTotal,
                rejected_bank_total = rejectedBankTotal,
                mismatch_amount = mismatchAmount,
                mismatch_reasons = mismatchReasons,
                alert_count = alerts.Count
            }),
            CreatedAtUtc = now
        });

        if (hasMismatch)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("manual_billing_reconciliation_mismatch");
            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                Action = "manual_bank_reconciliation_mismatch",
                Actor = actor,
                Reason = string.Join(",", mismatchReasons),
                MetadataJson = JsonSerializer.Serialize(new
                {
                    date = reconciliationDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    currency = normalizedCurrency,
                    mismatch_amount = mismatchAmount,
                    mismatch_reasons = mismatchReasons
                }),
                CreatedAtUtc = now
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var itemRows = bankPayments
            .Take(normalizedTake)
            .Select(payment =>
            {
                var mismatchFlags = new List<string>();
                if (string.IsNullOrWhiteSpace(payment.BankReference))
                {
                    mismatchFlags.Add("missing_bank_reference");
                }
                else
                {
                    var normalizedBankReference = payment.BankReference.Trim().ToUpperInvariant();
                    if (duplicateReferenceKeys.Contains(normalizedBankReference))
                    {
                        mismatchFlags.Add("duplicate_bank_reference");
                    }
                }

                if (payment.Status == ManualBillingPaymentStatus.PendingVerification)
                {
                    mismatchFlags.Add("pending_verification");
                }

                return new AdminManualBillingReconciliationItemRow
                {
                    PaymentId = payment.Id,
                    ShopCode = shopCodeById.TryGetValue(payment.ShopId, out var shopCode)
                        ? shopCode
                        : ResolveShopCode(null),
                    InvoiceNumber = invoiceById.TryGetValue(payment.InvoiceId, out var invoice)
                        ? invoice.InvoiceNumber
                        : string.Empty,
                    Method = MapManualBillingPaymentMethodValue(payment.Method),
                    Amount = payment.Amount,
                    Currency = payment.Currency,
                    Status = MapManualBillingPaymentStatusValue(payment.Status),
                    BankReference = payment.BankReference,
                    ReceivedAt = payment.ReceivedAtUtc,
                    RecordedBy = payment.RecordedBy,
                    VerifiedBy = payment.VerifiedBy,
                    MismatchFlags = mismatchFlags
                };
            })
            .ToList();

        return new AdminManualBillingDailyReconciliationResponse
        {
            Date = reconciliationDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            WindowStart = windowStart,
            WindowEnd = windowEnd,
            Currency = normalizedCurrency,
            ExpectedBankTotal = normalizedExpectedTotal,
            RecordedBankTotal = recordedBankTotal,
            VerifiedBankTotal = verifiedBankTotal,
            PendingBankTotal = pendingBankTotal,
            RejectedBankTotal = rejectedBankTotal,
            MismatchAmount = mismatchAmount,
            HasMismatch = hasMismatch,
            MismatchReasons = mismatchReasons,
            AlertCount = alerts.Count,
            Alerts = alerts,
            Count = itemRows.Count,
            Items = itemRows,
            GeneratedAt = now
        };
    }

    public async Task<AdminBillingStateReconciliationRunResponse> RunBillingStateReconciliationAsAdminAsync(
        AdminBillingStateReconciliationRunRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var actor = NormalizeOptionalValue(request.Actor) ?? ResolveCurrentAdminActor();
        var reason = NormalizeReasonCode(request.ReasonCode)
                     ?? NormalizeOptionalValue(request.Reason)
                     ?? "manual_admin_billing_reconciliation";
        var actorNote = NormalizeOptionalValue(request.ActorNote);

        return await RunBillingStateReconciliationCoreAsync(
            source: "manual_admin",
            dryRun: request.DryRun,
            actor: actor,
            reason: string.IsNullOrWhiteSpace(actorNote) ? reason : $"{reason}:{actorNote}",
            take: request.Take ?? options.BillingReconciliationTake,
            webhookFailureTake: request.WebhookFailureTake ?? options.BillingReconciliationWebhookFailureTake,
            emitAuditWhenNoFindings: true,
            cancellationToken);
    }

    public async Task<AdminBillingStateReconciliationRunResponse> RunScheduledBillingStateReconciliationAsync(
        CancellationToken cancellationToken)
    {
        return await RunBillingStateReconciliationCoreAsync(
            source: "scheduled_job",
            dryRun: false,
            actor: "billing-reconciliation-job",
            reason: "scheduled_billing_reconciliation",
            take: options.BillingReconciliationTake,
            webhookFailureTake: options.BillingReconciliationWebhookFailureTake,
            emitAuditWhenNoFindings: false,
            cancellationToken);
    }

    private async Task<AdminBillingStateReconciliationRunResponse> RunBillingStateReconciliationCoreAsync(
        string source,
        bool dryRun,
        string actor,
        string reason,
        int take,
        int webhookFailureTake,
        bool emitAuditWhenNoFindings,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedSource = NormalizeOptionalValue(source) ?? "manual_admin";
        var normalizedActor = NormalizeOptionalValue(actor) ?? "billing-reconciliation";
        var normalizedReason = NormalizeOptionalValue(reason) ?? "billing_reconciliation";
        var normalizedTake = Math.Clamp(take, 1, 500);
        var normalizedWebhookFailureTake = Math.Clamp(webhookFailureTake, 1, 500);
        var periodEndGraceHours = Math.Clamp(options.BillingReconciliationPeriodEndGraceHours, 0, 168);
        var webhookFailureLookbackHours = Math.Clamp(options.BillingReconciliationWebhookFailureLookbackHours, 1, 720);
        var driftCutoff = now.AddHours(-periodEndGraceHours);
        var webhookFailureWindowStart = now.AddHours(-webhookFailureLookbackHours);

        var billingSubscriptionsQuery = dbContext.Subscriptions
            .AsNoTracking()
            .Where(x => x.BillingSubscriptionId != null || x.BillingCustomerId != null);

        var billingSubscriptionsScanned = await billingSubscriptionsQuery.CountAsync(cancellationToken);

        List<BillingReconciliationDriftCandidate> driftCandidates;
        if (dbContext.Database.IsSqlite())
        {
            driftCandidates = (await billingSubscriptionsQuery
                    .Select(x => new BillingReconciliationDriftCandidate(
                        x.ShopId,
                        x.BillingSubscriptionId,
                        x.BillingCustomerId,
                        x.PeriodEndUtc,
                        x.Status,
                        x.CreatedAtUtc))
                    .ToListAsync(cancellationToken))
                .Where(x =>
                    (x.Status == SubscriptionStatus.Active || x.Status == SubscriptionStatus.Trialing) &&
                    x.PeriodEndUtc <= driftCutoff)
                .OrderBy(x => x.PeriodEndUtc)
                .ThenBy(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            driftCandidates = await billingSubscriptionsQuery
                .Where(x =>
                    x.PeriodEndUtc <= driftCutoff &&
                    (x.Status == SubscriptionStatus.Active || x.Status == SubscriptionStatus.Trialing))
                .OrderBy(x => x.PeriodEndUtc)
                .ThenBy(x => x.CreatedAtUtc)
                .Select(x => new BillingReconciliationDriftCandidate(
                    x.ShopId,
                    x.BillingSubscriptionId,
                    x.BillingCustomerId,
                    x.PeriodEndUtc,
                    x.Status,
                    x.CreatedAtUtc))
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var driftCandidateShopIds = driftCandidates
            .Select(candidate => candidate.ShopId)
            .Distinct()
            .ToList();

        var shopCodeById = driftCandidateShopIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await dbContext.Shops
                .AsNoTracking()
                .Where(x => driftCandidateShopIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.Code, cancellationToken);

        var subscriptionUpdates = new List<AdminBillingStateReconciliationSubscriptionRow>();
        var subscriptionsReconciled = 0;

        foreach (var candidate in driftCandidates)
        {
            var shopCode = shopCodeById.TryGetValue(candidate.ShopId, out var resolvedShopCode)
                ? resolvedShopCode
                : ResolveShopCode(null);
            var row = new AdminBillingStateReconciliationSubscriptionRow
            {
                ShopId = candidate.ShopId,
                ShopCode = shopCode,
                SubscriptionId = candidate.BillingSubscriptionId,
                CustomerId = candidate.BillingCustomerId,
                PeriodEnd = candidate.PeriodEndUtc,
                PreviousStatus = candidate.Status.ToString().ToLowerInvariant(),
                ReconciledStatus = "past_due",
                Reason = BillingReconciliationDriftReasonCode,
                Applied = false
            };

            if (!dryRun)
            {
                try
                {
                    var reconciliation = await ReconcileSubscriptionStateAsync(
                        new SubscriptionReconciliationRequest
                        {
                            ReconciliationId = $"billing-drift-{Guid.NewGuid():N}",
                            ShopCode = shopCode,
                            CustomerId = candidate.BillingCustomerId,
                            SubscriptionId = candidate.BillingSubscriptionId,
                            SubscriptionStatus = "past_due",
                            Actor = normalizedActor,
                            Reason = normalizedReason
                        },
                        cancellationToken);
                    row.ReconciledStatus = string.Equals(
                        reconciliation.SubscriptionStatus,
                        "pastdue",
                        StringComparison.OrdinalIgnoreCase)
                        ? "past_due"
                        : reconciliation.SubscriptionStatus;
                    row.Applied = true;
                    subscriptionsReconciled += 1;
                }
                catch (Exception ex)
                {
                    row.Error = TruncateAccessDeliveryReason(ex.Message);
                }
            }

            subscriptionUpdates.Add(row);
        }

        List<BillingWebhookEvent> failedWebhookEventsSource;
        if (dbContext.Database.IsSqlite())
        {
            failedWebhookEventsSource = (await dbContext.BillingWebhookEvents
                    .AsNoTracking()
                    .ToListAsync(cancellationToken))
                .Where(x =>
                    IsFailedOrDeadLetterWebhookStatus(x.Status) &&
                    x.ReceivedAtUtc >= webhookFailureWindowStart)
                .OrderByDescending(x => x.ReceivedAtUtc)
                .ThenByDescending(x => x.UpdatedAtUtc)
                .Take(normalizedWebhookFailureTake)
                .ToList();
        }
        else
        {
            failedWebhookEventsSource = await dbContext.BillingWebhookEvents
                .AsNoTracking()
                .Where(x =>
                    (x.Status == WebhookEventStatusFailed || x.Status == WebhookEventStatusDeadLetter) &&
                    x.ReceivedAtUtc >= webhookFailureWindowStart)
                .OrderByDescending(x => x.ReceivedAtUtc)
                .ThenByDescending(x => x.UpdatedAtUtc)
                .Take(normalizedWebhookFailureTake)
                .ToListAsync(cancellationToken);
        }

        var failedWebhookShopIds = failedWebhookEventsSource
            .Where(entry => entry.ShopId.HasValue)
            .Select(entry => entry.ShopId!.Value)
            .Distinct()
            .ToList();

        var failedWebhookShopCodeById = failedWebhookShopIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await dbContext.Shops
                .AsNoTracking()
                .Where(x => failedWebhookShopIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.Code, cancellationToken);

        var failedWebhookRows = failedWebhookEventsSource
            .Select(entry => new AdminBillingStateReconciliationWebhookFailureRow
            {
                EventId = entry.ProviderEventId,
                EventType = entry.EventType,
                Status = entry.Status,
                ShopId = entry.ShopId,
                ShopCode = entry.ShopId.HasValue && failedWebhookShopCodeById.TryGetValue(entry.ShopId.Value, out var shopCode)
                    ? shopCode
                    : null,
                SubscriptionId = entry.BillingSubscriptionId,
                LastErrorCode = entry.LastErrorCode,
                FailureCount = entry.FailureCount,
                ReceivedAt = entry.ReceivedAtUtc,
                DeadLetteredAt = entry.DeadLetteredAtUtc,
                UpdatedAt = entry.UpdatedAtUtc
            })
            .ToList();

        if (!dryRun)
        {
            foreach (var failedWebhookRow in failedWebhookRows)
            {
                licensingAlertMonitor.RecordWebhookFailure(
                    failedWebhookRow.EventType,
                    failedWebhookRow.LastErrorCode);
            }
        }

        var hasFindings = subscriptionUpdates.Count > 0 || failedWebhookRows.Count > 0;
        if (emitAuditWhenNoFindings || hasFindings)
        {
            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                Action = dryRun
                    ? "billing_webhook_reconciliation_previewed"
                    : "billing_webhook_reconciliation_run",
                Actor = normalizedActor,
                Reason = normalizedReason,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    source = normalizedSource,
                    dry_run = dryRun,
                    period_end_grace_hours = periodEndGraceHours,
                    webhook_failure_lookback_hours = webhookFailureLookbackHours,
                    billing_subscriptions_scanned = billingSubscriptionsScanned,
                    drift_candidates = subscriptionUpdates.Count,
                    subscriptions_reconciled = subscriptionsReconciled,
                    webhook_failures_detected = failedWebhookRows.Count,
                    subscription_updates = subscriptionUpdates
                        .Take(20)
                        .Select(update => new
                        {
                            shop_code = update.ShopCode,
                            subscription_id = update.SubscriptionId,
                            customer_id = update.CustomerId,
                            period_end = update.PeriodEnd,
                            previous_status = update.PreviousStatus,
                            reconciled_status = update.ReconciledStatus,
                            applied = update.Applied,
                            error = update.Error
                        }),
                    failed_webhook_events = failedWebhookRows
                        .Take(20)
                        .Select(entry => new
                        {
                            event_id = entry.EventId,
                            event_type = entry.EventType,
                            status = entry.Status,
                            shop_code = entry.ShopCode,
                            subscription_id = entry.SubscriptionId,
                            last_error_code = entry.LastErrorCode,
                            failure_count = entry.FailureCount,
                            dead_lettered_at = entry.DeadLetteredAt,
                            received_at = entry.ReceivedAt
                        })
                }),
                CreatedAtUtc = now
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new AdminBillingStateReconciliationRunResponse
        {
            GeneratedAt = now,
            Source = normalizedSource,
            DryRun = dryRun,
            Actor = normalizedActor,
            Reason = normalizedReason,
            PeriodEndGraceHours = periodEndGraceHours,
            WebhookFailureLookbackHours = webhookFailureLookbackHours,
            BillingSubscriptionsScanned = billingSubscriptionsScanned,
            DriftCandidates = subscriptionUpdates.Count,
            SubscriptionsReconciled = subscriptionsReconciled,
            WebhookFailuresDetected = failedWebhookRows.Count,
            SubscriptionUpdates = subscriptionUpdates,
            FailedWebhookEvents = failedWebhookRows
        };
    }

    private void EnsureMarketingManualBillingFallbackEnabled(string operation)
    {
        if (options.MarketingManualBillingFallbackEnabled)
        {
            return;
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            $"Manual payment fallback is disabled for this environment ({operation}).",
            StatusCodes.Status403Forbidden);
    }

    public void VerifyBillingWebhookSignature(string payload, IHeaderDictionary headers)
    {
        if (!options.WebhookSecurity.RequireSignature)
        {
            return;
        }

        var signatureHeaderName = ResolveWebhookSignatureHeaderName();
        if (!headers.TryGetValue(signatureHeaderName, out var signatureHeaderValues))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhookSignature,
                $"Missing required webhook signature header '{signatureHeaderName}'.",
                StatusCodes.Status401Unauthorized);
        }

        var signatureHeaderValue = signatureHeaderValues.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(signatureHeaderValue))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhookSignature,
                "Webhook signature header is empty.",
                StatusCodes.Status401Unauthorized);
        }

        var signatureScheme = ResolveWebhookSignatureScheme();
        if (!TryParseStripeStyleSignatureHeader(signatureHeaderValue, signatureScheme, out var timestamp, out var signatures))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhookSignature,
                "Webhook signature header format is invalid.",
                StatusCodes.Status401Unauthorized);
        }

        var toleranceSeconds = Math.Max(30, options.WebhookSecurity.TimestampToleranceSeconds);
        var signedAt = DateTimeOffset.FromUnixTimeSeconds(timestamp);
        var ageSeconds = Math.Abs((DateTimeOffset.UtcNow - signedAt).TotalSeconds);
        if (ageSeconds > toleranceSeconds)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidWebhookSignature,
                "Webhook signature timestamp is outside the allowed tolerance window.",
                StatusCodes.Status401Unauthorized);
        }

        var signingSecret = ResolveWebhookSigningSecret();

        var signedPayload = $"{timestamp}.{payload}";
        var expectedSignatureBytes = ComputeHmacSha256(Encoding.UTF8.GetBytes(signingSecret), signedPayload);
        foreach (var signature in signatures)
        {
            if (!TryHexDecode(signature, out var providedSignatureBytes))
            {
                continue;
            }

            if (CryptographicOperations.FixedTimeEquals(expectedSignatureBytes, providedSignatureBytes))
            {
                return;
            }
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidWebhookSignature,
            "Webhook signature verification failed.",
            StatusCodes.Status401Unauthorized);
    }

    public async Task<LicenseGuardDecision> EvaluateRequestAsync(
        string? deviceCode,
        string? licenseToken,
        PathString requestPath,
        string method,
        CancellationToken cancellationToken,
        string? policySnapshotToken = null,
        string? policySnapshotClientTime = null)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            return LicenseGuardDecision.Allow();
        }

        LicenseStatusSnapshot status;
        try
        {
            status = await ResolveStatusSnapshotAsync(
                normalizedDeviceCode,
                licenseToken,
                strictTokenValidation: !string.IsNullOrWhiteSpace(licenseToken),
                cancellationToken);
        }
        catch (LicenseException ex)
        {
            return LicenseGuardDecision.Deny(ex.Code, ex.Message, ex.StatusCode);
        }

        if (status.State == LicenseState.Unprovisioned)
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (status.State == LicenseState.Revoked)
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.Revoked,
                "License is revoked.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (status.State == LicenseState.Suspended && IsBlockedWhenSuspended(requestPath, method))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.LicenseExpired,
                "License is suspended for checkout/refund operations.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (ShouldEnforcePolicySnapshot(requestPath, method))
        {
            var snapshotDecision = ValidatePolicySnapshotForRequest(
                normalizedDeviceCode,
                status,
                policySnapshotToken,
                policySnapshotClientTime,
                DateTimeOffset.UtcNow);
            if (!snapshotDecision.AllowRequest)
            {
                return snapshotDecision;
            }
        }

        return LicenseGuardDecision.Allow(status.State);
    }

    public string ResolveDeviceCode(string? explicitDeviceCode, HttpContext httpContext)
    {
        if (!string.IsNullOrWhiteSpace(explicitDeviceCode))
        {
            return NormalizeDeviceCode(explicitDeviceCode);
        }

        if (httpContext.Request.Headers.TryGetValue("X-Terminal-Id", out var headerTerminalId))
        {
            var fromTerminalHeader = NormalizeDeviceCode(headerTerminalId.FirstOrDefault());
            if (!string.IsNullOrWhiteSpace(fromTerminalHeader))
            {
                return fromTerminalHeader;
            }
        }

        if (httpContext.Request.Headers.TryGetValue("X-Device-Code", out var headerDeviceCode))
        {
            var fromHeader = NormalizeDeviceCode(headerDeviceCode.FirstOrDefault());
            if (!string.IsNullOrWhiteSpace(fromHeader))
            {
                return fromHeader;
            }
        }

        var claimValue = httpContext.User.FindFirstValue("terminal_id") ??
                         httpContext.User.FindFirstValue("device_code");
        return NormalizeDeviceCode(claimValue);
    }

    public string? ResolveLicenseToken(HttpContext httpContext, bool includeCookie = true)
    {
        if (httpContext.Request.Headers.TryGetValue("X-License-Token", out var headerToken))
        {
            var token = headerToken.FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }

        if (includeCookie &&
            options.TokenCookieEnabled &&
            httpContext.Request.Cookies.TryGetValue(ResolveLicenseTokenCookieName(), out var cookieToken))
        {
            var token = cookieToken?.Trim();
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }

        return null;
    }

    public string? ResolvePolicySnapshotToken(HttpContext httpContext)
    {
        if (httpContext.Request.Headers.TryGetValue("X-License-Policy-Snapshot", out var snapshotToken))
        {
            var token = snapshotToken.FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }

        return null;
    }

    public string? ResolvePolicySnapshotClientTime(HttpContext httpContext)
    {
        if (httpContext.Request.Headers.TryGetValue("X-License-Policy-Client-Time", out var clientTime))
        {
            var value = clientTime.FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
    }

    public void WriteLicenseTokenCookie(HttpContext httpContext, string? token, DateTimeOffset? expiresAtUtc = null)
    {
        if (!options.TokenCookieEnabled)
        {
            return;
        }

        var cookieName = ResolveLicenseTokenCookieName();
        if (string.IsNullOrWhiteSpace(token))
        {
            httpContext.Response.Cookies.Delete(cookieName, BuildLicenseTokenCookieOptions(expiresAtUtc: null));
            return;
        }

        var cookieOptions = BuildLicenseTokenCookieOptions(expiresAtUtc);
        httpContext.Response.Cookies.Append(cookieName, token.Trim(), cookieOptions);
    }

    private CookieOptions BuildLicenseTokenCookieOptions(DateTimeOffset? expiresAtUtc)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = options.TokenCookieSecure,
            SameSite = ResolveTokenCookieSameSite(options.TokenCookieSameSite),
            Path = string.IsNullOrWhiteSpace(options.TokenCookiePath) ? "/" : options.TokenCookiePath.Trim(),
            Expires = expiresAtUtc?.UtcDateTime
        };
    }

    private static SameSiteMode ResolveTokenCookieSameSite(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured))
        {
            return SameSiteMode.Lax;
        }

        return configured.Trim().ToLowerInvariant() switch
        {
            "strict" => SameSiteMode.Strict,
            "none" => SameSiteMode.None,
            _ => SameSiteMode.Lax
        };
    }

    private string ResolveLicenseTokenCookieName()
    {
        var configuredName = NormalizeOptionalValue(options.TokenCookieName);
        return string.IsNullOrWhiteSpace(configuredName) ? "smartpos_license" : configuredName;
    }

    public async Task<OfflineGrantValidationSnapshot> ValidateOfflineGrantForSyncAsync(
        string? offlineGrantToken,
        string deviceCode,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.OfflineGrantRequired,
                "Device code is required for offline grant validation.",
                StatusCodes.Status403Forbidden);
        }

        var rawToken = NormalizeOptionalValue(offlineGrantToken);
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            throw new LicenseException(
                LicenseErrorCodes.OfflineGrantRequired,
                "offline_grant_token is required for offline checkout/refund sync.",
                StatusCodes.Status403Forbidden);
        }

        var payload = ParseAndValidateOfflineGrantToken(rawToken);
        if (!string.Equals(payload.Type, "offline_grant", StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token payload type is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (!string.Equals(payload.DeviceCode, normalizedDeviceCode, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.DeviceMismatch,
                "offline_grant_token does not belong to the current device.",
                StatusCodes.Status403Forbidden);
        }

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status403Forbidden);

        if (payload.ShopId != provisionedDevice.ShopId)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token is not valid for this shop.",
                StatusCodes.Status403Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(provisionedDevice.DeviceKeyFingerprint))
        {
            var payloadFingerprint = NormalizeOptionalValue(payload.DeviceKeyFingerprint);
            if (string.IsNullOrWhiteSpace(payloadFingerprint) ||
                !string.Equals(
                    NormalizeKeyFingerprint(provisionedDevice.DeviceKeyFingerprint),
                    NormalizeKeyFingerprint(payloadFingerprint),
                    StringComparison.Ordinal))
            {
                throw new LicenseException(
                    LicenseErrorCodes.DeviceKeyMismatch,
                    "offline_grant_token device key binding is invalid.",
                    StatusCodes.Status403Forbidden);
            }
        }

        var now = DateTimeOffset.UtcNow;
        if (payload.ExpiresAt <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.OfflineGrantExpired,
                "offline_grant_token has expired.",
                StatusCodes.Status403Forbidden);
        }

        var existingEvents = await dbContext.OfflineEvents
            .AsNoTracking()
            .Where(x => x.OfflineGrantId == payload.GrantId &&
                        x.Status != OfflineEventStatus.Rejected)
            .ToListAsync(cancellationToken);

        var usedCheckoutOperations = existingEvents.Count(x => x.Type == OfflineEventType.Sale);
        var usedRefundOperations = existingEvents.Count(x => x.Type == OfflineEventType.Refund);

        return new OfflineGrantValidationSnapshot(
            payload.GrantId,
            payload.ShopId,
            payload.DeviceCode,
            payload.DeviceKeyFingerprint,
            payload.IssuedAt,
            payload.ExpiresAt,
            Math.Max(0, payload.MaxCheckoutOperations),
            Math.Max(0, payload.MaxRefundOperations),
            usedCheckoutOperations,
            usedRefundOperations);
    }

    public bool IsBlockedWhenSuspended(PathString requestPath, string method)
    {
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method))
        {
            return false;
        }

        return options.SuspendedBlockedPathPrefixes.Any(prefix =>
            requestPath.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public bool ShouldEnforcePolicySnapshot(PathString requestPath, string method)
    {
        if (!options.OfflinePolicySnapshotEnforcementEnabled)
        {
            return false;
        }

        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            return false;
        }

        return options.OfflinePolicySnapshotProtectedPathPrefixes.Any(prefix =>
            requestPath.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public bool IsEnforcementEnabled() => options.EnforceProtectedRoutes;

    private LicenseGuardDecision ValidatePolicySnapshotForRequest(
        string deviceCode,
        LicenseStatusSnapshot status,
        string? policySnapshotToken,
        string? policySnapshotClientTime,
        DateTimeOffset now)
    {
        var rawToken = NormalizeOptionalValue(policySnapshotToken);
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotRequired,
                "license_policy_snapshot is required for protected feature access.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        PolicySnapshotTokenPayload payload;
        try
        {
            payload = ParseAndValidatePolicySnapshotToken(rawToken);
        }
        catch (LicenseException ex)
        {
            var code = ex.Code == LicenseErrorCodes.InvalidToken
                ? LicenseErrorCodes.PolicySnapshotInvalid
                : ex.Code;
            return LicenseGuardDecision.Deny(
                code,
                ex.Message,
                ex.StatusCode,
                status.State);
        }

        if (!string.Equals(payload.Type, "policy_snapshot", StringComparison.OrdinalIgnoreCase))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot payload type is invalid.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        var skewToleranceSeconds = Math.Max(30, options.OfflinePolicySnapshotClockSkewToleranceSeconds);
        if (payload.ExpiresAt < now)
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotExpired,
                "license_policy_snapshot has expired.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (payload.IssuedAt > now.AddSeconds(skewToleranceSeconds))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotClockSkew,
                "license_policy_snapshot issued_at is outside allowed clock skew.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (!string.Equals(payload.DeviceCode, deviceCode, StringComparison.Ordinal))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.DeviceMismatch,
                "license_policy_snapshot does not belong to the current device.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (!string.IsNullOrWhiteSpace(status.BranchCode) &&
            !string.Equals(
                ResolveBranchCode(payload.BranchCode),
                ResolveBranchCode(status.BranchCode),
                StringComparison.Ordinal))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotStale,
                "license_policy_snapshot branch binding is stale.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (status.ShopId.HasValue && payload.ShopId != status.ShopId.Value)
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotStale,
                "license_policy_snapshot shop binding is stale.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        var currentState = status.State.ToString().ToLowerInvariant();
        if (!string.Equals(payload.State, currentState, StringComparison.OrdinalIgnoreCase) ||
            !HaveEquivalentBlockedActions(payload.BlockedActions, status.BlockedActions))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotStale,
                "license_policy_snapshot no longer matches current policy state.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        var rawClientTime = NormalizeOptionalValue(policySnapshotClientTime);
        if (string.IsNullOrWhiteSpace(rawClientTime))
        {
            return LicenseGuardDecision.Allow(status.State);
        }

        if (!DateTimeOffset.TryParse(rawClientTime, out var clientTime))
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot client time is invalid.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        if (Math.Abs((now - clientTime).TotalSeconds) > skewToleranceSeconds)
        {
            return LicenseGuardDecision.Deny(
                LicenseErrorCodes.PolicySnapshotClockSkew,
                "client clock skew exceeds tolerance for protected feature access.",
                StatusCodes.Status403Forbidden,
                status.State);
        }

        return LicenseGuardDecision.Allow(status.State);
    }

    private static bool HaveEquivalentBlockedActions(IReadOnlyCollection<string>? left, IReadOnlyCollection<string>? right)
    {
        static HashSet<string> NormalizeSet(IReadOnlyCollection<string>? values)
        {
            return values?
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value.Trim().ToLowerInvariant())
                .ToHashSet(StringComparer.Ordinal) ?? [];
        }

        var leftSet = NormalizeSet(left);
        var rightSet = NormalizeSet(right);
        return leftSet.SetEquals(rightSet);
    }

    private async Task<DeviceKeyBindingProof?> ResolveAndValidateDeviceKeyProofAsync(
        ProvisionActivateRequest request,
        ProvisionedDevice? existingDevice,
        string deviceCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var hasAnyProofField =
            !string.IsNullOrWhiteSpace(request.ChallengeId) ||
            !string.IsNullOrWhiteSpace(request.ChallengeSignature) ||
            !string.IsNullOrWhiteSpace(request.PublicKeySpki) ||
            !string.IsNullOrWhiteSpace(request.KeyFingerprint);

        var hasExistingBinding = !string.IsNullOrWhiteSpace(existingDevice?.DeviceKeyFingerprint);
        var requiresProof = options.RequireDeviceKeyBinding || hasExistingBinding || !options.AllowLegacyActivationWithoutDeviceKey;

        if (!requiresProof && !hasAnyProofField)
        {
            return null;
        }

        var challengeIdRaw = NormalizeOptionalValue(request.ChallengeId);
        var challengeSignatureRaw = NormalizeOptionalValue(request.ChallengeSignature);
        var publicKeySpkiRaw = NormalizeOptionalValue(request.PublicKeySpki);
        var keyFingerprintRaw = NormalizeOptionalValue(request.KeyFingerprint);

        if (string.IsNullOrWhiteSpace(challengeIdRaw) ||
            string.IsNullOrWhiteSpace(challengeSignatureRaw) ||
            string.IsNullOrWhiteSpace(publicKeySpkiRaw))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device key proof is required for activation.");
        }

        if (!Guid.TryParse(challengeIdRaw, out var challengeId))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "challenge_id is invalid.");
        }

        var challenge = await dbContext.DeviceKeyChallenges
            .FirstOrDefaultAsync(x => x.Id == challengeId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "challenge_id is unknown.");

        if (!string.Equals(challenge.DeviceCode, deviceCode, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "challenge_id does not belong to this device_code.");
        }

        if (challenge.ConsumedAtUtc.HasValue)
        {
            throw new LicenseException(
                LicenseErrorCodes.ChallengeConsumed,
                "challenge_id was already used.",
                StatusCodes.Status409Conflict);
        }

        if (challenge.ExpiresAtUtc < now)
        {
            throw new LicenseException(
                LicenseErrorCodes.ChallengeExpired,
                "challenge_id has expired.",
                StatusCodes.Status403Forbidden);
        }

        byte[] signatureBytes;
        byte[] publicKeySpkiBytes;
        try
        {
            signatureBytes = Base64UrlDecode(challengeSignatureRaw);
            publicKeySpkiBytes = Base64UrlDecode(publicKeySpkiRaw);
        }
        catch (FormatException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "challenge signature or public key format is invalid.");
        }

        var computedFingerprint = ComputeDeviceKeyFingerprint(publicKeySpkiBytes);
        if (!string.IsNullOrWhiteSpace(keyFingerprintRaw) &&
            !string.Equals(
                NormalizeKeyFingerprint(keyFingerprintRaw),
                computedFingerprint,
                StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "key_fingerprint does not match public_key_spki.");
        }

        var activationPayload = BuildActivationChallengePayload(challenge.Id, challenge.Nonce, deviceCode);
        var payloadBytes = Encoding.UTF8.GetBytes(activationPayload);
        if (!VerifyDeviceKeySignature(payloadBytes, signatureBytes, publicKeySpkiBytes))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "challenge signature verification failed.",
                StatusCodes.Status403Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(existingDevice?.DeviceKeyFingerprint) &&
            !string.Equals(
                NormalizeKeyFingerprint(existingDevice.DeviceKeyFingerprint),
                computedFingerprint,
                StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.DeviceKeyMismatch,
                "Device key does not match existing key binding.",
                StatusCodes.Status403Forbidden);
        }

        challenge.ConsumedAtUtc = now;

        return new DeviceKeyBindingProof(
            computedFingerprint,
            publicKeySpkiRaw,
            ResolveDeviceKeyAlgorithm(request.KeyAlgorithm),
            challenge.Id);
    }

    private async Task<LicenseStatusSnapshot> ResolveStatusSnapshotAsync(
        string deviceCode,
        string? licenseToken,
        bool strictTokenValidation,
        CancellationToken cancellationToken,
        TokenValidationPurpose tokenValidationPurpose = TokenValidationPurpose.General)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        if (provisionedDevice is null)
        {
            return LicenseStatusSnapshot.Unprovisioned(normalizedDeviceCode, now);
        }

        var subscription = await GetLatestSubscriptionAsync(provisionedDevice.ShopId, cancellationToken);

        var licenseRecord = await ResolveLicenseRecordAsync(
            provisionedDevice,
            licenseToken,
            strictTokenValidation,
            tokenValidationPurpose,
            cancellationToken);

        if (licenseRecord is null)
        {
            return LicenseStatusSnapshot.Unprovisioned(normalizedDeviceCode, now) with
            {
                ShopId = provisionedDevice.ShopId,
                BranchCode = ResolveBranchCode(provisionedDevice.BranchCode),
                SubscriptionStatus = subscription?.Status,
                Plan = subscription?.Plan,
                SeatLimit = subscription is null ? null : ResolveSeatLimit(subscription),
                ActiveSeats = await CountActiveSeatsAsync(provisionedDevice.ShopId, cancellationToken),
                DeviceKeyFingerprint = provisionedDevice.DeviceKeyFingerprint
            };
        }

        var state = DetermineState(provisionedDevice, subscription, licenseRecord, now);
        List<string> blockedActions = state switch
        {
            LicenseState.Suspended => ["checkout", "refund"],
            LicenseState.Revoked => ["all"],
            _ => []
        };

        return new LicenseStatusSnapshot
        {
            State = state,
            ShopId = provisionedDevice.ShopId,
            DeviceCode = normalizedDeviceCode,
            BranchCode = ResolveBranchCode(provisionedDevice.BranchCode),
            SubscriptionStatus = subscription?.Status,
            Plan = subscription?.Plan,
            SeatLimit = subscription is null ? null : ResolveSeatLimit(subscription),
            ActiveSeats = await CountActiveSeatsAsync(provisionedDevice.ShopId, cancellationToken),
            ValidUntil = licenseRecord.ValidUntil,
            GraceUntil = licenseRecord.GraceUntil,
            LicenseToken = UnprotectSensitiveValue(licenseRecord.Token),
            DeviceKeyFingerprint = provisionedDevice.DeviceKeyFingerprint,
            BlockedActions = blockedActions,
            ServerTime = now
        };
    }

    private async Task<Subscription?> GetLatestSubscriptionAsync(Guid shopId, CancellationToken cancellationToken)
    {
        return await dbContext.Subscriptions
            .FirstOrDefaultAsync(x => x.ShopId == shopId, cancellationToken);
    }

    private async Task<LicenseRecord?> ResolveLicenseRecordAsync(
        ProvisionedDevice provisionedDevice,
        string? licenseToken,
        bool strictTokenValidation,
        TokenValidationPurpose tokenValidationPurpose,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(licenseToken))
        {
            var token = licenseToken.Trim();
            var payload = ParseAndValidateToken(token);

            if (!string.Equals(payload.DeviceCode, provisionedDevice.DeviceCode, StringComparison.Ordinal))
            {
                throw new LicenseException(
                    LicenseErrorCodes.DeviceMismatch,
                    "license_token does not belong to the current device.",
                    StatusCodes.Status403Forbidden);
            }

            if (payload.ShopId != provisionedDevice.ShopId)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token is not valid for this shop.",
                    StatusCodes.Status403Forbidden);
            }

            if (!string.IsNullOrWhiteSpace(provisionedDevice.DeviceKeyFingerprint))
            {
                var payloadFingerprint = NormalizeOptionalValue(payload.DeviceKeyFingerprint);
                if (string.IsNullOrWhiteSpace(payloadFingerprint) ||
                    !string.Equals(
                        NormalizeKeyFingerprint(payloadFingerprint),
                        NormalizeKeyFingerprint(provisionedDevice.DeviceKeyFingerprint),
                        StringComparison.Ordinal))
                {
                    throw new LicenseException(
                        LicenseErrorCodes.DeviceKeyMismatch,
                        "license_token device key binding is invalid.",
                        StatusCodes.Status403Forbidden);
                }
            }

            var record = await dbContext.Licenses
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.Id == payload.LicenseId && x.ProvisionedDeviceId == provisionedDevice.Id,
                    cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token is unknown.",
                    StatusCodes.Status403Forbidden);

            var storedSignature = UnprotectSensitiveValue(record.Signature);
            if (!string.Equals(storedSignature, GetSignaturePart(token), StringComparison.Ordinal))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token signature metadata mismatch.",
                    StatusCodes.Status403Forbidden);
            }

            await ValidateTokenSessionAsync(payload, provisionedDevice, tokenValidationPurpose, cancellationToken);

            var now = DateTimeOffset.UtcNow;
            if (record.Status == LicenseRecordStatus.Revoked ||
                (record.RevokedAtUtc.HasValue && now >= record.RevokedAtUtc.Value))
            {
                throw new LicenseException(
                    LicenseErrorCodes.TokenReplayDetected,
                    "license_token has been rotated or revoked.",
                    StatusCodes.Status403Forbidden);
            }

            return record;
        }

        // SQLite does not support ordering DateTimeOffset server-side in all query shapes.
        // Fetch this small device-scoped set and pick the newest record in-memory.
        var latestRecord = (await dbContext.Licenses
                .AsNoTracking()
                .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefault();

        if (latestRecord is null)
        {
            return null;
        }

        try
        {
            var storedToken = UnprotectSensitiveValue(latestRecord.Token);
            var payload = ParseAndValidateToken(storedToken);
            if (!string.Equals(payload.DeviceCode, provisionedDevice.DeviceCode, StringComparison.Ordinal) ||
                payload.ShopId != provisionedDevice.ShopId ||
                payload.LicenseId != latestRecord.Id)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "Stored license token has invalid binding.",
                    StatusCodes.Status403Forbidden);
            }

            if (!string.IsNullOrWhiteSpace(provisionedDevice.DeviceKeyFingerprint))
            {
                var payloadFingerprint = NormalizeOptionalValue(payload.DeviceKeyFingerprint);
                if (string.IsNullOrWhiteSpace(payloadFingerprint) ||
                    !string.Equals(
                        NormalizeKeyFingerprint(payloadFingerprint),
                        NormalizeKeyFingerprint(provisionedDevice.DeviceKeyFingerprint),
                        StringComparison.Ordinal))
                {
                    throw new LicenseException(
                        LicenseErrorCodes.DeviceKeyMismatch,
                        "Stored license token has invalid device key binding.",
                        StatusCodes.Status403Forbidden);
                }
            }

            var now = DateTimeOffset.UtcNow;
            if (latestRecord.Status == LicenseRecordStatus.Revoked ||
                (latestRecord.RevokedAtUtc.HasValue && now >= latestRecord.RevokedAtUtc.Value))
            {
                throw new LicenseException(
                    LicenseErrorCodes.TokenReplayDetected,
                    "Stored license token has been rotated or revoked.",
                    StatusCodes.Status403Forbidden);
            }
        }
        catch (LicenseException) when (!strictTokenValidation)
        {
            return latestRecord;
        }

        return latestRecord;
    }

    private async Task<Shop> GetOrCreateDefaultShopAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        return await GetOrCreateShopAsync(options.DefaultShopCode, now, cancellationToken);
    }

    private async Task<Shop> GetOrCreateShopAsync(
        string? shopCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var resolvedShopCode = ResolveShopCode(shopCode);
        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Code == resolvedShopCode, cancellationToken);

        if (shop is not null)
        {
            return shop;
        }

        var defaultShopCode = ResolveShopCode(options.DefaultShopCode);
        var shopName = string.Equals(resolvedShopCode, defaultShopCode, StringComparison.OrdinalIgnoreCase)
            ? (string.IsNullOrWhiteSpace(options.DefaultShopName) ? "Default SmartPOS Shop" : options.DefaultShopName.Trim())
            : $"Shop {resolvedShopCode}";

        shop = new Shop
        {
            Code = resolvedShopCode,
            Name = shopName,
            IsActive = true,
            CreatedAtUtc = now
        };

        dbContext.Shops.Add(shop);
        return shop;
    }

    private async Task<Shop> ResolveExistingShopByCodeAsync(
        string? shopCode,
        CancellationToken cancellationToken)
    {
        var resolvedShopCode = ResolveShopCode(shopCode);
        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Code == resolvedShopCode, cancellationToken);
        if (shop is not null)
        {
            return shop;
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            $"Shop '{resolvedShopCode}' was not found.",
            StatusCodes.Status404NotFound);
    }

    private async Task<Subscription> GetOrCreateSubscriptionAsync(
        Shop shop,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.Subscriptions
            .FirstOrDefaultAsync(x => x.ShopId == shop.Id, cancellationToken);

        if (existing is not null)
        {
            if (existing.SeatLimit <= 0)
            {
                existing.SeatLimit = ResolveSeatLimit(existing);
            }

            if (string.IsNullOrWhiteSpace(existing.FeatureFlagsJson))
            {
                existing.FeatureFlagsJson = ResolveFeatureFlagsJson(existing.Plan);
            }

            return existing;
        }

        var defaultPlan = ResolvePlanCode(options.DefaultPlan);
        var subscription = new Subscription
        {
            ShopId = shop.Id,
            Shop = shop,
            Plan = defaultPlan,
            Status = SubscriptionStatus.Trialing,
            PeriodStartUtc = now,
            PeriodEndUtc = now.AddDays(Math.Max(1, options.TrialPeriodDays)),
            SeatLimit = ResolveSeatLimitFromPlan(defaultPlan),
            FeatureFlagsJson = ResolveFeatureFlagsJson(defaultPlan),
            CreatedAtUtc = now
        };

        dbContext.Subscriptions.Add(subscription);
        return subscription;
    }

    private async Task<IssuedLicenseResult> IssueLicenseAsync(
        Shop shop,
        ProvisionedDevice provisionedDevice,
        Subscription subscription,
        DateTimeOffset now,
        TokenRotationMode rotationMode,
        CancellationToken cancellationToken)
    {
        var activeSigningKey = ResolveActiveSigningKey();
        var validUntil = now.Add(ResolveTokenTtl());
        if (subscription.PeriodEndUtc < validUntil)
        {
            validUntil = subscription.PeriodEndUtc;
        }

        if (validUntil < now)
        {
            validUntil = now;
        }

        var graceUntil = validUntil.AddDays(Math.Max(1, options.GracePeriodDays));

        var record = new LicenseRecord
        {
            ShopId = shop.Id,
            ProvisionedDeviceId = provisionedDevice.Id,
            Token = string.Empty,
            ValidUntil = validUntil,
            GraceUntil = graceUntil,
            SignatureAlgorithm = "RS256",
            SignatureKeyId = activeSigningKey.KeyId,
            Signature = string.Empty,
            Status = LicenseRecordStatus.Active,
            IssuedAtUtc = now,
            Shop = shop,
            ProvisionedDevice = provisionedDevice
        };

        var jti = GenerateTokenJti();
        var tokenPayload = new LicenseTokenPayload
        {
            LicenseId = record.Id,
            ShopId = shop.Id,
            DeviceCode = provisionedDevice.DeviceCode,
            ValidUntil = record.ValidUntil,
            IssuedAt = now,
            KeyId = record.SignatureKeyId,
            SubscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
            Plan = ResolvePlanCode(subscription.Plan),
            SeatLimit = ResolveSeatLimit(subscription),
            DeviceKeyFingerprint = NormalizeOptionalValue(provisionedDevice.DeviceKeyFingerprint),
            Jti = jti
        };

        var token = SignToken(tokenPayload, activeSigningKey);
        record.Token = ProtectSensitiveValue(token);
        record.Signature = ProtectSensitiveValue(GetSignaturePart(token));

        dbContext.Licenses.Add(record);

        var staleActiveLicenses = await dbContext.Licenses
            .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                        x.Status == LicenseRecordStatus.Active &&
                        x.Id != record.Id)
            .ToListAsync(cancellationToken);

        if (rotationMode == TokenRotationMode.Overlap)
        {
            var overlapUntil = now.Add(ResolveRotationOverlapWindow());
            foreach (var staleLicense in staleActiveLicenses)
            {
                var rejectAt = staleLicense.ValidUntil < overlapUntil
                    ? staleLicense.ValidUntil
                    : overlapUntil;
                staleLicense.RevokedAtUtc = staleLicense.RevokedAtUtc.HasValue && staleLicense.RevokedAtUtc.Value < rejectAt
                    ? staleLicense.RevokedAtUtc
                    : rejectAt;
            }
        }
        else
        {
            foreach (var staleLicense in staleActiveLicenses)
            {
                staleLicense.Status = LicenseRecordStatus.Revoked;
                staleLicense.RevokedAtUtc = now;
            }
        }

        dbContext.LicenseTokenSessions.Add(new LicenseTokenSession
        {
            ShopId = shop.Id,
            ProvisionedDeviceId = provisionedDevice.Id,
            LicenseId = record.Id,
            Jti = jti,
            IssuedAtUtc = now,
            ExpiresAtUtc = validUntil,
            RejectAfterUtc = validUntil
        });

        var staleTokenSessions = (await dbContext.LicenseTokenSessions
                .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                            x.Jti != jti)
                .ToListAsync(cancellationToken))
            .Where(x => x.RejectAfterUtc > now)
            .ToList();

        if (rotationMode == TokenRotationMode.Overlap)
        {
            var overlapUntil = now.Add(ResolveRotationOverlapWindow());
            foreach (var staleSession in staleTokenSessions)
            {
                var rejectAfter = staleSession.ExpiresAtUtc < overlapUntil
                    ? staleSession.ExpiresAtUtc
                    : overlapUntil;
                if (staleSession.RejectAfterUtc > rejectAfter)
                {
                    staleSession.RejectAfterUtc = rejectAfter;
                }

                staleSession.RevokedAtUtc = now;
                staleSession.ReplacedByJti = jti;
            }
        }
        else
        {
            foreach (var staleSession in staleTokenSessions)
            {
                staleSession.RejectAfterUtc = now;
                staleSession.RevokedAtUtc = now;
                staleSession.ReplacedByJti = jti;
            }
        }

        return new IssuedLicenseResult(record, token);
    }

    private TimeSpan ResolveTokenTtl()
    {
        var configuredMinutes = options.TokenTtlMinutes > 0
            ? options.TokenTtlMinutes
            : Math.Max(1, options.TokenTtlHours) * 60;
        var normalizedMinutes = Math.Clamp(configuredMinutes, 10, 15);
        return TimeSpan.FromMinutes(normalizedMinutes);
    }

    private TimeSpan ResolveRotationOverlapWindow()
    {
        var overlapSeconds = Math.Clamp(options.TokenRotationOverlapSeconds, 0, 300);
        return TimeSpan.FromSeconds(overlapSeconds);
    }

    private static string GenerateTokenJti()
    {
        return Base64UrlEncode(RandomNumberGenerator.GetBytes(24));
    }

    private LicenseState DetermineState(
        ProvisionedDevice device,
        Subscription? subscription,
        LicenseRecord license,
        DateTimeOffset now)
    {
        if (device.Status == ProvisionedDeviceStatus.Revoked ||
            license.Status == LicenseRecordStatus.Revoked ||
            (license.RevokedAtUtc.HasValue && now >= license.RevokedAtUtc.Value))
        {
            return LicenseState.Revoked;
        }

        if (subscription is null)
        {
            return now <= license.GraceUntil ? LicenseState.Grace : LicenseState.Suspended;
        }

        if (subscription.Status == SubscriptionStatus.Canceled)
        {
            return LicenseState.Revoked;
        }

        if (subscription.Status == SubscriptionStatus.PastDue)
        {
            return now <= license.GraceUntil ? LicenseState.Grace : LicenseState.Suspended;
        }

        if (now <= license.ValidUntil)
        {
            return LicenseState.Active;
        }

        if (now <= license.GraceUntil)
        {
            return LicenseState.Grace;
        }

        return LicenseState.Suspended;
    }

    private int ResolveSeatLimit(Subscription subscription)
    {
        if (subscription.SeatLimit > 0)
        {
            return subscription.SeatLimit;
        }

        return ResolveSeatLimitFromPlan(subscription.Plan);
    }

    private int ResolveSeatLimitFromPlan(string? planCode)
    {
        var normalizedPlanCode = ResolvePlanCode(planCode);
        if (planCatalog.TryGetValue(normalizedPlanCode, out var plan) && plan.SeatLimit > 0)
        {
            return plan.SeatLimit;
        }

        return Math.Max(1, options.TrialSeatLimit);
    }

    private string? ResolveFeatureFlagsJson(string? planCode)
    {
        var normalizedPlanCode = ResolvePlanCode(planCode);
        if (!planCatalog.TryGetValue(normalizedPlanCode, out var plan) || plan.FeatureFlags.Length == 0)
        {
            return null;
        }

        var normalizedFlags = plan.FeatureFlags
            .Where(flag => !string.IsNullOrWhiteSpace(flag))
            .Select(flag => flag.Trim().ToLowerInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(flag => flag, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return normalizedFlags.Count == 0
            ? null
            : JsonSerializer.Serialize(normalizedFlags);
    }

    private static string ResolvePlanCode(string? planCode)
    {
        if (string.IsNullOrWhiteSpace(planCode))
        {
            return "trial";
        }

        return planCode.Trim().ToLowerInvariant();
    }

    private static Dictionary<string, LicensePlanDefinition> BuildPlanCatalog(LicenseOptions options)
    {
        var catalog = new Dictionary<string, LicensePlanDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var plan in options.Plans)
        {
            var code = ResolvePlanCode(plan.Code);
            if (string.IsNullOrWhiteSpace(code))
            {
                continue;
            }

            catalog[code] = new LicensePlanDefinition
            {
                Code = code,
                SeatLimit = plan.SeatLimit,
                FeatureFlags = plan.FeatureFlags
            };
        }

        return catalog;
    }

    private static Dictionary<string, AiCreditPackOption> BuildAiCreditPackCatalog(AiInsightOptions options)
    {
        var catalog = new Dictionary<string, AiCreditPackOption>(StringComparer.OrdinalIgnoreCase);
        foreach (var pack in options.CreditPacks)
        {
            var packCode = NormalizeOptionalValue(pack.PackCode);
            if (string.IsNullOrWhiteSpace(packCode))
            {
                continue;
            }

            var credits = RoundAiCredits(pack.Credits);
            var price = decimal.Round(pack.Price, 2, MidpointRounding.AwayFromZero);
            if (credits <= 0m || price <= 0m)
            {
                continue;
            }

            catalog[packCode] = new AiCreditPackOption
            {
                PackCode = packCode,
                Credits = credits,
                Price = price,
                Currency = ResolveCurrency(pack.Currency)
            };
        }

        return catalog;
    }

    private async Task<BillingWebhookEvent?> ReserveWebhookEventAsync(
        string providerEventId,
        string eventType,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var maxRetryAttempts = ResolveBillingWebhookMaxRetryAttempts();
        var existing = await dbContext.BillingWebhookEvents
            .FirstOrDefaultAsync(x => x.ProviderEventId == providerEventId, cancellationToken);

        if (existing is null)
        {
            var newEvent = new BillingWebhookEvent
            {
                ProviderEventId = providerEventId,
                EventType = eventType,
                Status = WebhookEventStatusProcessing,
                FailureCount = 0,
                ReceivedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.BillingWebhookEvents.Add(newEvent);

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return newEvent;
            }
            catch (DbUpdateException)
            {
                var raceWinner = await dbContext.BillingWebhookEvents
                    .FirstOrDefaultAsync(x => x.ProviderEventId == providerEventId, cancellationToken);
                if (raceWinner is null)
                {
                    throw;
                }

                return string.Equals(raceWinner.Status, WebhookEventStatusFailed, StringComparison.OrdinalIgnoreCase)
                    ? await ResetFailedWebhookEventAsync(raceWinner, now, maxRetryAttempts, cancellationToken)
                    : null;
            }
        }

        return string.Equals(existing.Status, WebhookEventStatusFailed, StringComparison.OrdinalIgnoreCase)
            ? await ResetFailedWebhookEventAsync(existing, now, maxRetryAttempts, cancellationToken)
            : null;
    }

    private async Task<BillingWebhookEvent?> ResetFailedWebhookEventAsync(
        BillingWebhookEvent existing,
        DateTimeOffset now,
        int maxRetryAttempts,
        CancellationToken cancellationToken)
    {
        if (existing.FailureCount >= maxRetryAttempts)
        {
            await MarkWebhookEventDeadLetterAsync(existing, now, cancellationToken);
            return null;
        }

        existing.Status = WebhookEventStatusProcessing;
        existing.LastErrorCode = null;
        existing.DeadLetteredAtUtc = null;
        existing.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task<bool> MarkWebhookEventFailedAsync(
        BillingWebhookEvent eventLog,
        string errorCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var maxRetryAttempts = ResolveBillingWebhookMaxRetryAttempts();
        eventLog.FailureCount = Math.Max(0, eventLog.FailureCount) + 1;
        eventLog.LastErrorCode = NormalizeOptionalValue(errorCode) ?? "UNKNOWN";
        var shouldDeadLetter = eventLog.FailureCount >= maxRetryAttempts;
        eventLog.Status = shouldDeadLetter ? WebhookEventStatusDeadLetter : WebhookEventStatusFailed;
        eventLog.DeadLetteredAtUtc = shouldDeadLetter ? now : null;
        eventLog.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        if (shouldDeadLetter)
        {
            licensingAlertMonitor.RecordWebhookFailure(eventLog.EventType, $"dead_letter:{eventLog.LastErrorCode}");
            licensingAlertMonitor.RecordSecurityAnomaly("billing_webhook_dead_lettered");
            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = eventLog.ShopId,
                Action = "billing_webhook_dead_lettered",
                Actor = "billing-webhook",
                Reason = "max_retry_attempts_reached",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    event_id = eventLog.ProviderEventId,
                    event_type = eventLog.EventType,
                    failure_count = eventLog.FailureCount,
                    max_retry_attempts = maxRetryAttempts,
                    last_error_code = eventLog.LastErrorCode,
                    subscription_id = eventLog.BillingSubscriptionId,
                    dead_lettered_at = eventLog.DeadLetteredAtUtc
                }),
                CreatedAtUtc = now
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return shouldDeadLetter;
    }

    private async Task MarkWebhookEventDeadLetterAsync(
        BillingWebhookEvent eventLog,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (string.Equals(eventLog.Status, WebhookEventStatusDeadLetter, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        eventLog.Status = WebhookEventStatusDeadLetter;
        eventLog.DeadLetteredAtUtc = eventLog.DeadLetteredAtUtc ?? now;
        eventLog.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        licensingAlertMonitor.RecordWebhookFailure(eventLog.EventType, $"dead_letter:{eventLog.LastErrorCode ?? "UNKNOWN"}");
        licensingAlertMonitor.RecordSecurityAnomaly("billing_webhook_dead_lettered");
    }

    private int ResolveBillingWebhookMaxRetryAttempts()
    {
        return Math.Clamp(options.BillingWebhookMaxRetryAttempts, 1, 10);
    }

    private static bool IsFailedOrDeadLetterWebhookStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return false;
        }

        var normalized = status.Trim();
        return string.Equals(normalized, WebhookEventStatusFailed, StringComparison.OrdinalIgnoreCase)
            || string.Equals(normalized, WebhookEventStatusDeadLetter, StringComparison.OrdinalIgnoreCase);
    }

    private string ResolveWebhookSignatureHeaderName()
    {
        var configured = NormalizeOptionalValue(options.WebhookSecurity.SignatureHeaderName);
        return string.IsNullOrWhiteSpace(configured) ? "Stripe-Signature" : configured;
    }

    private string ResolveWebhookSignatureScheme()
    {
        var configured = NormalizeOptionalValue(options.WebhookSecurity.SignatureScheme);
        return string.IsNullOrWhiteSpace(configured) ? "v1" : configured.ToLowerInvariant();
    }

    private static bool TryParseStripeStyleSignatureHeader(
        string rawHeader,
        string signatureScheme,
        out long timestamp,
        out List<string> signatures)
    {
        timestamp = 0;
        signatures = [];

        var parts = rawHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var part in parts)
        {
            var keyValue = part.Split('=', 2, StringSplitOptions.TrimEntries);
            if (keyValue.Length != 2)
            {
                continue;
            }

            var key = keyValue[0];
            var value = keyValue[1];
            if (string.Equals(key, "t", StringComparison.OrdinalIgnoreCase))
            {
                if (long.TryParse(value, out var parsedTimestamp))
                {
                    timestamp = parsedTimestamp;
                }

                continue;
            }

            if (string.Equals(key, signatureScheme, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(value))
            {
                signatures.Add(value.Trim());
            }
        }

        return timestamp > 0 && signatures.Count > 0;
    }

    private static byte[] ComputeHmacSha256(byte[] secret, string payload)
    {
        using var hmac = new HMACSHA256(secret);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
    }

    private static bool TryHexDecode(string value, out byte[] bytes)
    {
        try
        {
            bytes = Convert.FromHexString(value);
            return true;
        }
        catch (FormatException)
        {
            bytes = [];
            return false;
        }
    }

    private async Task<int> CountActiveSeatsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        return await dbContext.ProvisionedDevices
            .CountAsync(x => x.ShopId == shopId && x.Status == ProvisionedDeviceStatus.Active, cancellationToken);
    }

    private async Task<int> CountActiveSeatsByBranchAsync(
        Guid shopId,
        string branchCode,
        Guid? excludedProvisionedDeviceId,
        CancellationToken cancellationToken)
    {
        var normalizedBranchCode = ResolveBranchCode(branchCode);
        var defaultBranchCode = ResolveBranchCode(null);

        return await dbContext.ProvisionedDevices
            .CountAsync(
                x => x.ShopId == shopId &&
                     x.Status == ProvisionedDeviceStatus.Active &&
                     (!excludedProvisionedDeviceId.HasValue || x.Id != excludedProvisionedDeviceId.Value) &&
                     (x.BranchCode ?? defaultBranchCode) == normalizedBranchCode,
                cancellationToken);
    }

    private async Task<Dictionary<string, int>> GetActiveSeatCountsByBranchAsync(
        Guid shopId,
        CancellationToken cancellationToken)
    {
        var defaultBranchCode = ResolveBranchCode(null);
        var activeDevices = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.Status == ProvisionedDeviceStatus.Active)
            .ToListAsync(cancellationToken);

        return activeDevices
            .GroupBy(device => ResolveBranchCode(device.BranchCode, defaultBranchCode), StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Count(),
                StringComparer.Ordinal);
    }

    private async Task<BranchSeatPolicy> EnsureBranchSeatPolicyAsync(
        Shop shop,
        int seatLimit,
        string branchCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedBranchCode = ResolveBranchCode(branchCode);
        var defaultBranchCode = ResolveBranchCode(null);
        var allocations = await dbContext.ShopBranchSeatAllocations
            .Where(x => x.ShopId == shop.Id)
            .ToListAsync(cancellationToken);

        if (allocations.Count == 0 && options.AutoProvisionBranchAllocations)
        {
            var defaultAllocation = new ShopBranchSeatAllocation
            {
                ShopId = shop.Id,
                Shop = shop,
                BranchCode = defaultBranchCode,
                SeatQuota = seatLimit,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.ShopBranchSeatAllocations.Add(defaultAllocation);
            allocations.Add(defaultAllocation);
        }

        var activeAllocations = allocations.Where(x => x.IsActive).ToList();
        var targetAllocation = activeAllocations.FirstOrDefault(x =>
            string.Equals(ResolveBranchCode(x.BranchCode), normalizedBranchCode, StringComparison.Ordinal));

        if (targetAllocation is null)
        {
            if (!options.AutoProvisionBranchAllocations)
            {
                throw new LicenseException(
                    LicenseErrorCodes.SeatLimitExceeded,
                    $"Branch '{normalizedBranchCode}' has no active seat allocation.",
                    StatusCodes.Status409Conflict);
            }

            var totalAllocatedSeats = activeAllocations.Sum(x => Math.Max(0, x.SeatQuota));
            var remainingSeats = Math.Max(0, seatLimit - totalAllocatedSeats);
            if (remainingSeats <= 0)
            {
                throw new LicenseException(
                    LicenseErrorCodes.SeatLimitExceeded,
                    $"No branch seat quota is available for branch '{normalizedBranchCode}'.",
                    StatusCodes.Status409Conflict);
            }

            targetAllocation = new ShopBranchSeatAllocation
            {
                ShopId = shop.Id,
                Shop = shop,
                BranchCode = normalizedBranchCode,
                SeatQuota = remainingSeats,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.ShopBranchSeatAllocations.Add(targetAllocation);
            allocations.Add(targetAllocation);
            activeAllocations.Add(targetAllocation);
        }

        var targetSeatQuota = Math.Max(0, targetAllocation.SeatQuota);
        if (options.EnforceBranchSeatAllocation && (!targetAllocation.IsActive || targetSeatQuota <= 0))
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                $"Branch '{normalizedBranchCode}' is not eligible for seat activation.",
                StatusCodes.Status409Conflict);
        }

        var totalActiveAllocatedSeats = activeAllocations.Sum(x => Math.Max(0, x.SeatQuota));
        return new BranchSeatPolicy(
            normalizedBranchCode,
            targetSeatQuota <= 0 ? seatLimit : targetSeatQuota,
            totalActiveAllocatedSeats);
    }

    private async Task RevokeTokenSessionsForLicensesAsync(
        IEnumerable<Guid> licenseIds,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedIds = licenseIds
            .Distinct()
            .ToList();
        if (normalizedIds.Count == 0)
        {
            return;
        }

        var sessions = (await dbContext.LicenseTokenSessions
                .Where(x => normalizedIds.Contains(x.LicenseId))
                .ToListAsync(cancellationToken))
            .Where(x => x.RejectAfterUtc > now)
            .ToList();

        foreach (var session in sessions)
        {
            session.RejectAfterUtc = now;
            session.RevokedAtUtc = now;
        }
    }

    private async Task<LicenseReissueOutcome> ForceReissueLicensesForShopAsync(
        Shop shop,
        Subscription subscription,
        DateTimeOffset now,
        string actor,
        string reason,
        Guid? excludedProvisionedDeviceId,
        CancellationToken cancellationToken)
    {
        var activeDevices = await dbContext.ProvisionedDevices
            .Where(x => x.ShopId == shop.Id &&
                        x.Status == ProvisionedDeviceStatus.Active &&
                        (!excludedProvisionedDeviceId.HasValue || x.Id != excludedProvisionedDeviceId.Value))
            .ToListAsync(cancellationToken);

        var reissuedCount = 0;
        var revokedCount = 0;
        if (subscription.Status == SubscriptionStatus.Canceled)
        {
            var activeLicenses = await dbContext.Licenses
                .Where(x => x.ShopId == shop.Id && x.Status == LicenseRecordStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var activeLicense in activeLicenses)
            {
                activeLicense.Status = LicenseRecordStatus.Revoked;
                activeLicense.RevokedAtUtc = now;
                revokedCount++;
            }

            await RevokeTokenSessionsForLicensesAsync(
                activeLicenses.Select(x => x.Id),
                now,
                cancellationToken);
        }
        else
        {
            foreach (var device in activeDevices)
            {
                await IssueLicenseAsync(
                    shop,
                    device,
                    subscription,
                    now,
                    TokenRotationMode.Immediate,
                    cancellationToken);
                reissuedCount++;
            }
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "license_tokens_forced_reissue",
            Actor = actor,
            Reason = reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                plan = subscription.Plan,
                subscription_status = subscription.Status.ToString().ToLowerInvariant(),
                active_device_count = activeDevices.Count,
                reissued_count = reissuedCount,
                revoked_count = revokedCount,
                excluded_provisioned_device_id = excludedProvisionedDeviceId
            })
        });

        return new LicenseReissueOutcome(reissuedCount, revokedCount, activeDevices.Count);
    }

    private async Task AddManualOverrideAuditLogAsync(
        Guid shopId,
        Guid? provisionedDeviceId,
        string action,
        string actor,
        string reason,
        object metadata,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var previousManualOverride = (await dbContext.LicenseAuditLogs
                .AsNoTracking()
                .Where(x => x.ShopId == shopId && x.IsManualOverride)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefault();

        var metadataJson = JsonSerializer.Serialize(metadata);
        var immutableHash = ComputeManualOverrideHash(
            previousManualOverride?.ImmutableHash,
            action,
            actor,
            reason,
            metadataJson,
            now);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shopId,
            ProvisionedDeviceId = provisionedDeviceId,
            Action = action,
            Actor = actor,
            Reason = reason,
            MetadataJson = metadataJson,
            IsManualOverride = true,
            ImmutablePreviousHash = previousManualOverride?.ImmutableHash,
            ImmutableHash = immutableHash,
            CreatedAtUtc = now
        });
    }

    private static string ComputeManualOverrideHash(
        string? previousHash,
        string action,
        string actor,
        string reason,
        string metadataJson,
        DateTimeOffset createdAtUtc)
    {
        var payload = string.Join("|",
            previousHash ?? string.Empty,
            action,
            actor,
            reason,
            metadataJson,
            createdAtUtc.UtcTicks);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash);
    }

    private static bool HasSubscriptionTokenRelevantChange(
        SubscriptionStatus previousStatus,
        string previousPlan,
        DateTimeOffset previousPeriodStart,
        DateTimeOffset previousPeriodEnd,
        Subscription current)
    {
        return previousStatus != current.Status
               || !string.Equals(previousPlan, current.Plan, StringComparison.OrdinalIgnoreCase)
               || previousPeriodStart != current.PeriodStartUtc
               || previousPeriodEnd != current.PeriodEndUtc;
    }

    private async Task ValidateTokenSessionAsync(
        LicenseTokenPayload payload,
        ProvisionedDevice provisionedDevice,
        TokenValidationPurpose validationPurpose,
        CancellationToken cancellationToken)
    {
        var tokenJti = NormalizeOptionalValue(payload.Jti);
        if (string.IsNullOrWhiteSpace(tokenJti))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "license_token is missing jti.",
                StatusCodes.Status403Forbidden);
        }

        var session = await dbContext.LicenseTokenSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Jti == tokenJti, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.TokenReplayDetected,
                "license_token jti is unknown or no longer valid.",
                StatusCodes.Status403Forbidden);

        if (session.LicenseId != payload.LicenseId ||
            session.ProvisionedDeviceId != provisionedDevice.Id ||
            session.ShopId != provisionedDevice.ShopId)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "license_token jti binding is invalid.",
                StatusCodes.Status403Forbidden);
        }

        var now = DateTimeOffset.UtcNow;
        if (session.RejectAfterUtc <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.TokenReplayDetected,
                "license_token jti was rotated or revoked.",
                StatusCodes.Status403Forbidden);
        }

        if (validationPurpose == TokenValidationPurpose.Heartbeat &&
            (!string.IsNullOrWhiteSpace(session.ReplacedByJti) || session.RevokedAtUtc.HasValue))
        {
            throw new LicenseException(
                LicenseErrorCodes.TokenReplayDetected,
                "license_token was already rotated and cannot be used for heartbeat renewal.",
                StatusCodes.Status403Forbidden);
        }
    }

    private async Task<ManualBillingInvoice> ResolveManualBillingInvoiceForPaymentAsync(
        AdminManualBillingPaymentRecordRequest request,
        CancellationToken cancellationToken)
    {
        if (request.InvoiceId.HasValue && request.InvoiceId.Value != Guid.Empty)
        {
            return await dbContext.ManualBillingInvoices
                .Include(x => x.Shop)
                .FirstOrDefaultAsync(x => x.Id == request.InvoiceId.Value, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvoiceNotFound,
                    "Manual billing invoice was not found.",
                    StatusCodes.Status404NotFound);
        }

        var invoiceNumber = NormalizeOptionalValue(request.InvoiceNumber);
        if (string.IsNullOrWhiteSpace(invoiceNumber))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "invoice_id or invoice_number is required.",
                StatusCodes.Status400BadRequest);
        }

        var matches = await dbContext.ManualBillingInvoices
            .Include(x => x.Shop)
            .Where(x => x.InvoiceNumber.ToLower() == invoiceNumber.ToLower())
            .Take(2)
            .ToListAsync(cancellationToken);

        if (matches.Count == 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvoiceNotFound,
                "Manual billing invoice was not found.",
                StatusCodes.Status404NotFound);
        }

        if (matches.Count > 1)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "invoice_number is ambiguous across shops. Provide invoice_id.",
                StatusCodes.Status409Conflict);
        }

        return matches[0];
    }

    private async Task<string> ResolveManualBillingInvoiceNumberAsync(
        string? requestedInvoiceNumber,
        CancellationToken cancellationToken)
    {
        var normalizedInvoiceNumber = NormalizeOptionalValue(requestedInvoiceNumber);
        if (!string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
        {
            var exists = await dbContext.ManualBillingInvoices
                .AnyAsync(
                    x => x.InvoiceNumber.ToLower() == normalizedInvoiceNumber.ToLower(),
                    cancellationToken);
            if (exists)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "invoice_number already exists.",
                    StatusCodes.Status409Conflict);
            }

            return normalizedInvoiceNumber;
        }

        while (true)
        {
            var generated = GenerateCompactInvoiceNumber();
            var exists = await dbContext.ManualBillingInvoices
                .AnyAsync(
                    x => x.InvoiceNumber.ToLower() == generated.ToLower(),
                    cancellationToken);
            if (!exists)
            {
                return generated;
            }
        }
    }

    private static string GenerateCompactInvoiceNumber()
    {
        var bytes = Guid.NewGuid().ToByteArray();
        Span<char> chars = stackalloc char[6];
        chars[0] = (char)('A' + (bytes[0] % 26));
        chars[1] = (char)('A' + (bytes[1] % 26));

        var number = ((bytes[2] << 8) | bytes[3]) % 10000;
        var d1 = number / 1000;
        var d2 = (number / 100) % 10;
        var d3 = (number / 10) % 10;
        var d4 = number % 10;
        chars[2] = (char)('0' + d1);
        chars[3] = (char)('0' + d2);
        chars[4] = (char)('0' + d3);
        chars[5] = (char)('0' + d4);

        return new string(chars);
    }

    private static MarketingPlanQuote ResolveMarketingPlanQuote(string? planCode)
    {
        var normalizedCode = NormalizeOptionalValue(planCode)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedCode) ||
            !MarketingPlanCatalog.TryGetValue(normalizedCode, out var quote))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "plan_code must be one of: starter, pro, business.",
                StatusCodes.Status400BadRequest);
        }

        return quote with
        {
            InternalPlanCode = ResolvePlanCode(quote.InternalPlanCode)
        };
    }

    private string ResolveStripePriceIdForMarketingPlan(string marketingPlanCode)
    {
        var normalizedPlan = NormalizeOptionalValue(marketingPlanCode)?.ToLowerInvariant();
        var stripeOptions = options.Stripe;
        var priceId = normalizedPlan switch
        {
            "starter" => NormalizeOptionalValue(stripeOptions.StarterPriceId),
            "pro" => NormalizeOptionalValue(stripeOptions.ProPriceId),
            "business" => NormalizeOptionalValue(stripeOptions.BusinessPriceId),
            _ => null
        };

        if (!string.IsNullOrWhiteSpace(priceId))
        {
            return priceId;
        }

        throw new LicenseException(
            LicenseErrorCodes.LicensingConfigurationError,
            $"Stripe price id is not configured for marketing plan '{marketingPlanCode}'.",
            StatusCodes.Status500InternalServerError);
    }

    private string ResolveStripeCheckoutSuccessUrl()
    {
        var configured = NormalizeOptionalValue(options.Stripe.CheckoutSuccessUrl);
        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                $"Stripe checkout success URL is not configured. Set '{LicenseOptions.SectionName}:Stripe:CheckoutSuccessUrl'.",
                StatusCodes.Status500InternalServerError);
        }

        if (!configured.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
            !configured.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                "Stripe checkout success URL must be an absolute http/https URL.",
                StatusCodes.Status500InternalServerError);
        }

        return configured;
    }

    private string ResolveStripeCheckoutCancelUrl()
    {
        var configured = NormalizeOptionalValue(options.Stripe.CheckoutCancelUrl);
        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                $"Stripe checkout cancel URL is not configured. Set '{LicenseOptions.SectionName}:Stripe:CheckoutCancelUrl'.",
                StatusCodes.Status500InternalServerError);
        }

        if (!configured.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
            !configured.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                "Stripe checkout cancel URL must be an absolute http/https URL.",
                StatusCodes.Status500InternalServerError);
        }

        return configured;
    }

    private string ResolveStripeSecretKey()
    {
        var fromConfig = NormalizeOptionalValue(options.Stripe.SecretKey);
        var envVarName = NormalizeOptionalValue(options.Stripe.SecretKeyEnvironmentVariable)
                         ?? "SMARTPOS_STRIPE_SECRET_KEY";
        var fromEnvironment = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVarName));
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        if (!string.IsNullOrWhiteSpace(fromConfig))
        {
            return fromConfig;
        }

        throw new LicenseException(
            LicenseErrorCodes.LicensingConfigurationError,
            $"Stripe secret key is not configured. Set '{LicenseOptions.SectionName}:Stripe:SecretKey' or environment variable '{envVarName}'.",
            StatusCodes.Status500InternalServerError);
    }

    private string? ResolveInternalPlanCodeForStripePrice(string? priceId)
    {
        var normalizedPriceId = NormalizeOptionalValue(priceId);
        if (string.IsNullOrWhiteSpace(normalizedPriceId))
        {
            return null;
        }

        if (string.Equals(normalizedPriceId, NormalizeOptionalValue(options.Stripe.StarterPriceId), StringComparison.Ordinal))
        {
            return "trial";
        }

        if (string.Equals(normalizedPriceId, NormalizeOptionalValue(options.Stripe.ProPriceId), StringComparison.Ordinal))
        {
            return "growth";
        }

        if (string.Equals(normalizedPriceId, NormalizeOptionalValue(options.Stripe.BusinessPriceId), StringComparison.Ordinal))
        {
            return "pro";
        }

        return null;
    }

    private static string ResolveMarketingPaymentMethod(string? paymentMethod)
    {
        var normalized = NormalizeOptionalValue(paymentMethod)?.ToLowerInvariant();
        return normalized switch
        {
            null or "" or "bank_deposit" or "bankdeposit" => "bank_deposit",
            "cash" => "cash",
            _ => throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "payment_method must be one of: cash, bank_deposit.",
                StatusCodes.Status400BadRequest)
        };
    }

    private static MarketingPaymentInstructionsResponse BuildMarketingPaymentInstructions(string paymentMethod)
    {
        if (string.Equals(paymentMethod, "cash", StringComparison.OrdinalIgnoreCase))
        {
            return new MarketingPaymentInstructionsResponse
            {
                PaymentMethod = "cash",
                Message = "Pay by cash at the billing desk and quote the invoice number.",
                ReferenceHint = "Use your invoice number when handing over cash payment details."
            };
        }

        return new MarketingPaymentInstructionsResponse
        {
            PaymentMethod = "bank_deposit",
            Message = "Complete a bank deposit and submit payment details with the invoice reference.",
            ReferenceHint = "Use the invoice number as your bank reference."
        };
    }

    private async Task<StripeCheckoutSessionResult> CreateStripeCheckoutSessionAsync(
        string priceId,
        string successUrl,
        string cancelUrl,
        string? contactEmail,
        AdminManualBillingInvoiceRow invoiceRow,
        string shopCode,
        string shopName,
        MarketingPlanQuote quote,
        string source,
        string? campaign,
        string? locale,
        CancellationToken cancellationToken)
    {
        if (!options.Stripe.Enabled)
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                $"Stripe checkout is disabled. Set '{LicenseOptions.SectionName}:Stripe:Enabled=true' to enable this endpoint.",
                StatusCodes.Status503ServiceUnavailable);
        }

        var secretKey = ResolveStripeSecretKey();
        var apiBaseUrl = NormalizeOptionalValue(options.Stripe.ApiBaseUrl) ?? "https://api.stripe.com";
        apiBaseUrl = apiBaseUrl.TrimEnd('/');

        var form = new List<KeyValuePair<string, string>>
        {
            new("mode", "subscription"),
            new("line_items[0][price]", priceId),
            new("line_items[0][quantity]", "1"),
            new("success_url", successUrl),
            new("cancel_url", cancelUrl),
            new("client_reference_id", invoiceRow.InvoiceNumber),
            new("metadata[invoice_id]", invoiceRow.InvoiceId.ToString("D")),
            new("metadata[invoice_number]", invoiceRow.InvoiceNumber),
            new("metadata[shop_code]", shopCode),
            new("metadata[shop_name]", shopName),
            new("metadata[marketing_plan_code]", quote.MarketingPlanCode),
            new("metadata[internal_plan_code]", quote.InternalPlanCode),
            new("metadata[source]", source),
            new("subscription_data[metadata][invoice_id]", invoiceRow.InvoiceId.ToString("D")),
            new("subscription_data[metadata][invoice_number]", invoiceRow.InvoiceNumber),
            new("subscription_data[metadata][shop_code]", shopCode),
            new("subscription_data[metadata][shop_name]", shopName),
            new("subscription_data[metadata][marketing_plan_code]", quote.MarketingPlanCode),
            new("subscription_data[metadata][internal_plan_code]", quote.InternalPlanCode),
            new("subscription_data[metadata][source]", source)
        };

        if (!string.IsNullOrWhiteSpace(contactEmail))
        {
            form.Add(new KeyValuePair<string, string>("customer_email", contactEmail));
        }

        if (!string.IsNullOrWhiteSpace(campaign))
        {
            form.Add(new KeyValuePair<string, string>("metadata[campaign]", campaign));
            form.Add(new KeyValuePair<string, string>("subscription_data[metadata][campaign]", campaign));
        }

        if (!string.IsNullOrWhiteSpace(locale))
        {
            form.Add(new KeyValuePair<string, string>("metadata[locale]", locale));
            form.Add(new KeyValuePair<string, string>("subscription_data[metadata][locale]", locale));
        }

        var client = httpClientFactory.CreateClient("stripe-billing");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl}/v1/checkout/sessions")
        {
            Content = new FormUrlEncodedContent(form)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secretKey);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detail = ExtractStripeErrorMessage(body) ?? response.ReasonPhrase ?? "Stripe request failed.";
            var statusCode = (int)response.StatusCode;
            var mappedStatus = statusCode >= 400 && statusCode < 500
                ? StatusCodes.Status400BadRequest
                : StatusCodes.Status502BadGateway;
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"Unable to create Stripe checkout session. {detail}",
                mappedStatus);
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var sessionId = TryGetString(root, "id");
            var checkoutUrl = TryGetString(root, "url");
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(checkoutUrl))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "Stripe checkout session response is missing id or url.",
                    StatusCodes.Status502BadGateway);
            }

            return new StripeCheckoutSessionResult(
                sessionId,
                checkoutUrl,
                TryGetUnixTimestamp(root, "expires_at"));
        }
        catch (JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Stripe checkout session response is invalid JSON.",
                StatusCodes.Status502BadGateway);
        }
    }

    private async Task<StripeCheckoutSessionLookup> RetrieveStripeCheckoutSessionAsync(
        string sessionId,
        CancellationToken cancellationToken)
    {
        if (!options.Stripe.Enabled)
        {
            throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                $"Stripe checkout is disabled. Set '{LicenseOptions.SectionName}:Stripe:Enabled=true' to enable this endpoint.",
                StatusCodes.Status503ServiceUnavailable);
        }

        var secretKey = ResolveStripeSecretKey();
        var apiBaseUrl = NormalizeOptionalValue(options.Stripe.ApiBaseUrl) ?? "https://api.stripe.com";
        apiBaseUrl = apiBaseUrl.TrimEnd('/');

        var client = httpClientFactory.CreateClient("stripe-billing");
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{apiBaseUrl}/v1/checkout/sessions/{Uri.EscapeDataString(sessionId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secretKey);

        using var response = await client.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detail = ExtractStripeErrorMessage(body) ?? response.ReasonPhrase ?? "Stripe request failed.";
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    $"Stripe checkout session '{sessionId}' was not found.",
                    StatusCodes.Status404NotFound);
            }

            var statusCode = (int)response.StatusCode;
            var mappedStatus = statusCode >= 400 && statusCode < 500
                ? StatusCodes.Status400BadRequest
                : StatusCodes.Status502BadGateway;
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"Unable to retrieve Stripe checkout session. {detail}",
                mappedStatus);
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var resolvedSessionId = TryGetString(root, "id");
            if (string.IsNullOrWhiteSpace(resolvedSessionId))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "Stripe checkout session response is missing id.",
                    StatusCodes.Status502BadGateway);
            }

            string? invoiceId = null;
            string? invoiceNumber = null;
            string? shopCode = null;
            string? shopName = null;
            if (TryGetObject(root, "metadata", out var metadata))
            {
                invoiceId = TryGetString(metadata, "invoice_id");
                invoiceNumber = TryGetString(metadata, "invoice_number");
                shopCode = TryGetString(metadata, "shop_code");
                shopName = TryGetString(metadata, "shop_name");
            }

            return new StripeCheckoutSessionLookup(
                resolvedSessionId,
                TryGetString(root, "status") ?? "open",
                TryGetString(root, "payment_status") ?? "unpaid",
                TryGetString(root, "customer"),
                TryGetString(root, "subscription"),
                TryGetUnixTimestamp(root, "expires_at"),
                invoiceId,
                invoiceNumber,
                shopCode,
                shopName);
        }
        catch (JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Stripe checkout session response is invalid JSON.",
                StatusCodes.Status502BadGateway);
        }
    }

    private async Task<string> GenerateUniqueMarketingShopCodeAsync(
        string shopName,
        CancellationToken cancellationToken)
    {
        var normalizedBase = ResolveMarketingShopCodeCandidate(shopName);
        for (var attempt = 0; attempt < 20; attempt += 1)
        {
            var suffix = Guid.NewGuid().ToString("N")[..6];
            var candidate = $"{normalizedBase}-{suffix}";
            if (candidate.Length > 64)
            {
                candidate = candidate[..64];
            }

            var exists = await dbContext.Shops
                .AnyAsync(x => x.Code.ToLower() == candidate.ToLower(), cancellationToken);
            if (!exists)
            {
                return candidate;
            }
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "Unable to generate a unique shop code for this request.",
            StatusCodes.Status409Conflict);
    }

    private static string ResolveMarketingShopCodeCandidate(string value)
    {
        var normalized = NormalizeMarketingShopCode(value);
        if (normalized.Length > 48)
        {
            normalized = normalized[..48];
        }

        return $"mkt-{normalized}";
    }

    private static string NormalizeMarketingShopCode(string? input)
    {
        var normalized = NormalizeOptionalValue(input);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "shop_code is invalid.",
                StatusCodes.Status400BadRequest);
        }

        var builder = new StringBuilder();
        foreach (var character in normalized.ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(character))
            {
                builder.Append(character);
                continue;
            }

            if (character is '-' or '_' or ' ')
            {
                if (builder.Length == 0 || builder[^1] == '-')
                {
                    continue;
                }

                builder.Append('-');
            }
        }

        var result = builder.ToString().Trim('-');
        if (string.IsNullOrWhiteSpace(result))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "shop_code is invalid.",
                StatusCodes.Status400BadRequest);
        }

        return result.Length > 64 ? result[..64] : result;
    }

    private static string ResolveMarketingOwnerUsername(string? ownerUsername)
    {
        var normalized = NormalizeOptionalValue(ownerUsername)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length is < 3 or > 64)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username must be between 3 and 64 characters.",
                StatusCodes.Status400BadRequest);
        }

        foreach (var character in normalized)
        {
            if (char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.')
            {
                continue;
            }

            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username contains invalid characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string ResolveMarketingOwnerPassword(string? ownerPassword)
    {
        var normalized = NormalizeOptionalValue(ownerPassword);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_password is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length is < 8 or > 128)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_password must be between 8 and 128 characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string ResolveMarketingOwnerFullName(string? ownerFullName, string fallbackContactName)
    {
        var resolved = NormalizeOptionalValue(ownerFullName) ?? fallbackContactName;
        if (string.IsNullOrWhiteSpace(resolved))
        {
            return "Shop Owner";
        }

        return resolved.Length > 120
            ? resolved[..120]
            : resolved;
    }

    private void EnsureMarketingShopName(Shop shop, string requestedShopName, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(requestedShopName))
        {
            return;
        }

        if (string.Equals(shop.Name, requestedShopName, StringComparison.Ordinal))
        {
            return;
        }

        shop.Name = requestedShopName.Trim();
        shop.UpdatedAtUtc = now;
    }

    private async Task<OwnerAccountProvisioningResult> EnsureMarketingOwnerAccountAsync(
        Shop shop,
        string ownerUsername,
        string ownerPassword,
        string ownerFullName,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var ownerRole = await dbContext.Roles
            .FirstOrDefaultAsync(
                x => x.Code.ToLower() == SmartPosRoles.Owner,
                cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                "Owner role is not configured.",
                StatusCodes.Status500InternalServerError);

        var existingUser = await dbContext.Users
            .Include(x => x.UserRoles)
            .FirstOrDefaultAsync(
                x => x.Username.ToLower() == ownerUsername,
                cancellationToken);

        if (existingUser is null)
        {
            var createdUser = new AppUser
            {
                StoreId = shop.Id,
                Username = ownerUsername,
                FullName = ownerFullName,
                PasswordHash = string.Empty,
                IsActive = true,
                CreatedAtUtc = now,
                LastLoginAtUtc = null
            };
            createdUser.PasswordHash = PasswordHashing.HashPassword(createdUser, ownerPassword);
            dbContext.Users.Add(createdUser);
            dbContext.UserRoles.Add(new UserRole
            {
                UserId = createdUser.Id,
                RoleId = ownerRole.Id,
                AssignedAtUtc = now,
                User = createdUser,
                Role = ownerRole
            });

            return new OwnerAccountProvisioningResult(createdUser, "created");
        }

        if (existingUser.StoreId.HasValue &&
            existingUser.StoreId.Value != Guid.Empty &&
            existingUser.StoreId.Value != shop.Id)
        {
            throw new LicenseException(
                LicenseErrorCodes.DuplicateSubmission,
                "owner_username is already assigned to another shop.",
                StatusCodes.Status409Conflict);
        }

        existingUser.StoreId = shop.Id;
        existingUser.IsActive = true;
        if (!string.IsNullOrWhiteSpace(ownerFullName) &&
            !string.Equals(existingUser.FullName, ownerFullName, StringComparison.Ordinal))
        {
            existingUser.FullName = ownerFullName;
        }

        if (string.IsNullOrWhiteSpace(existingUser.PasswordHash))
        {
            existingUser.PasswordHash = PasswordHashing.HashPassword(existingUser, ownerPassword);
        }

        var hasOwnerRole = existingUser.UserRoles.Any(x => x.RoleId == ownerRole.Id);
        if (!hasOwnerRole)
        {
            dbContext.UserRoles.Add(new UserRole
            {
                UserId = existingUser.Id,
                RoleId = ownerRole.Id,
                AssignedAtUtc = now,
                User = existingUser,
                Role = ownerRole
            });
        }

        return new OwnerAccountProvisioningResult(existingUser, "existing");
    }

    private static string BuildMarketingInvoiceNotes(
        MarketingPlanQuote quote,
        string paymentMethod,
        string? deviceCode,
        string? contactName,
        string? contactEmail,
        string? contactPhone,
        string ownerUsername,
        string source,
        string? campaign,
        string? locale,
        string? customerNotes)
    {
        var metadata = JsonSerializer.Serialize(new
        {
            marketing_plan_code = quote.MarketingPlanCode,
            requested_internal_plan = quote.InternalPlanCode,
            requested_payment_method = paymentMethod,
            device_code = NormalizeDeviceCode(deviceCode),
            contact_name = contactName,
            contact_email = contactEmail,
            contact_phone = contactPhone,
            owner_username = ownerUsername,
            source,
            campaign,
            locale
        });

        var metadataLine = $"{MarketingInvoiceMetadataPrefix}{metadata}";
        if (string.IsNullOrWhiteSpace(customerNotes))
        {
            return metadataLine;
        }

        return $"{metadataLine}\n{customerNotes}";
    }

    private static string BuildMarketingPaymentSubmissionNotes(
        string? deviceCode,
        string? contactName,
        string? contactEmail,
        string? contactPhone,
        string? customerNotes)
    {
        var metadata = JsonSerializer.Serialize(new
        {
            device_code = NormalizeDeviceCode(deviceCode),
            contact_name = contactName,
            contact_email = contactEmail,
            contact_phone = contactPhone,
            submitted_at = DateTimeOffset.UtcNow
        });

        var metadataLine = $"{MarketingPaymentSubmissionMetadataPrefix}{metadata}";
        if (string.IsNullOrWhiteSpace(customerNotes))
        {
            return metadataLine;
        }

        return $"{metadataLine}\n{customerNotes}";
    }

    private static string BuildOwnerAiCreditInvoiceNotes(OwnerAiCreditInvoiceMetadataState metadata)
    {
        var metadataJson = SerializeOwnerAiCreditInvoiceMetadata(metadata);
        var metadataLine = $"{OwnerAiCreditInvoiceMetadataPrefix}{metadataJson}";
        var note = NormalizeOptionalValue(metadata.RequestedNote);
        if (string.IsNullOrWhiteSpace(note))
        {
            return metadataLine;
        }

        return $"{metadataLine}\n{note}";
    }

    private static OwnerAiCreditInvoiceMetadataState ParseOwnerAiCreditInvoiceMetadata(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return new OwnerAiCreditInvoiceMetadataState();
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<OwnerAiCreditInvoiceMetadataState>(metadataJson);
            if (parsed is null)
            {
                return new OwnerAiCreditInvoiceMetadataState();
            }

            parsed.PackCode = NormalizeOptionalValue(parsed.PackCode);
            parsed.RequestedByUserId = NormalizeOptionalValue(parsed.RequestedByUserId);
            parsed.RequestedByUsername = NormalizeOptionalValue(parsed.RequestedByUsername);
            parsed.RequestedByFullName = NormalizeOptionalValue(parsed.RequestedByFullName);
            parsed.RequestedNote = NormalizeOptionalValue(parsed.RequestedNote);
            parsed.ApprovedBy = NormalizeOptionalValue(parsed.ApprovedBy);
            parsed.ApprovedScope = NormalizeOptionalValue(parsed.ApprovedScope);
            parsed.ApprovedActorNote = NormalizeOptionalValue(parsed.ApprovedActorNote);
            parsed.RejectedBy = NormalizeOptionalValue(parsed.RejectedBy);
            parsed.RejectedReasonCode = NormalizeOptionalValue(parsed.RejectedReasonCode);
            parsed.RejectedActorNote = NormalizeOptionalValue(parsed.RejectedActorNote);
            return parsed;
        }
        catch (JsonException)
        {
            return new OwnerAiCreditInvoiceMetadataState();
        }
    }

    private static string SerializeOwnerAiCreditInvoiceMetadata(OwnerAiCreditInvoiceMetadataState metadata)
    {
        var normalized = new OwnerAiCreditInvoiceMetadataState
        {
            PackCode = NormalizeOptionalValue(metadata.PackCode),
            RequestedCredits = metadata.RequestedCredits,
            RequestedByUserId = NormalizeOptionalValue(metadata.RequestedByUserId),
            RequestedByUsername = NormalizeOptionalValue(metadata.RequestedByUsername),
            RequestedByFullName = NormalizeOptionalValue(metadata.RequestedByFullName),
            RequestedNote = NormalizeOptionalValue(metadata.RequestedNote),
            ApprovedBy = NormalizeOptionalValue(metadata.ApprovedBy),
            ApprovedAt = metadata.ApprovedAt,
            ApprovedScope = NormalizeOptionalValue(metadata.ApprovedScope),
            ApprovedActorNote = NormalizeOptionalValue(metadata.ApprovedActorNote),
            RejectedBy = NormalizeOptionalValue(metadata.RejectedBy),
            RejectedAt = metadata.RejectedAt,
            RejectedReasonCode = NormalizeOptionalValue(metadata.RejectedReasonCode),
            RejectedActorNote = NormalizeOptionalValue(metadata.RejectedActorNote)
        };
        return JsonSerializer.Serialize(normalized);
    }

    private static string? ResolveAccessDeliveryCustomerEmailCandidate(
        string? requestCustomerEmail,
        string? invoiceNotes,
        string? paymentNotes)
    {
        var direct = NormalizeOptionalValue(requestCustomerEmail);
        if (!string.IsNullOrWhiteSpace(direct))
        {
            return direct;
        }

        var paymentMetadataEmail = TryResolveContactEmailFromMarketingPaymentMetadata(paymentNotes);
        if (!string.IsNullOrWhiteSpace(paymentMetadataEmail))
        {
            return paymentMetadataEmail;
        }

        return TryResolveContactEmailFromMarketingMetadata(invoiceNotes);
    }

    private static string? TryResolveRequestedPlanFromMarketingMetadata(string? invoiceNotes)
    {
        var metadataJson = TryExtractMarketingInvoiceMetadataJson(invoiceNotes);
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (document.RootElement.TryGetProperty("requested_internal_plan", out var planElement))
            {
                return NormalizeOptionalValue(planElement.GetString());
            }
        }
        catch (JsonException)
        {
            // Ignore malformed metadata.
        }

        return null;
    }

    private static string? TryResolveContactEmailFromMarketingMetadata(string? invoiceNotes)
    {
        var metadataJson = TryExtractMarketingInvoiceMetadataJson(invoiceNotes);
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        return TryResolveJsonStringProperty(metadataJson, "contact_email");
    }

    private static string? TryResolveDeviceCodeFromMarketingMetadata(string? invoiceNotes)
    {
        var metadataJson = TryExtractMarketingInvoiceMetadataJson(invoiceNotes);
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        var parsed = NormalizeDeviceCode(TryResolveJsonStringProperty(metadataJson, "device_code"));
        return string.IsNullOrWhiteSpace(parsed) ? null : parsed;
    }

    private static string? TryExtractMarketingInvoiceMetadataJson(string? invoiceNotes)
    {
        return TryExtractMetadataJsonByPrefix(invoiceNotes, MarketingInvoiceMetadataPrefix);
    }

    private static string? TryResolveContactEmailFromMarketingPaymentMetadata(string? paymentNotes)
    {
        var metadataJson = TryExtractMetadataJsonByPrefix(paymentNotes, MarketingPaymentSubmissionMetadataPrefix);
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        return TryResolveJsonStringProperty(metadataJson, "contact_email");
    }

    private static string? TryResolveJsonStringProperty(string metadataJson, string propertyName)
    {
        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (document.RootElement.TryGetProperty(propertyName, out var valueElement))
            {
                return NormalizeOptionalValue(valueElement.GetString());
            }
        }
        catch (JsonException)
        {
            // Ignore malformed metadata.
        }

        return null;
    }

    private static string? TryExtractMetadataJsonByPrefix(string? notes, string prefix)
    {
        var normalizedNotes = NormalizeOptionalValue(notes);
        if (string.IsNullOrWhiteSpace(normalizedNotes))
        {
            return null;
        }

        foreach (var line in normalizedNotes.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (line.StartsWith(prefix, StringComparison.Ordinal))
            {
                return line[prefix.Length..];
            }
        }

        return null;
    }

    private static string? NormalizeMarketingBankReference(string? bankReference)
    {
        var normalized = NormalizeOptionalValue(bankReference);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length > MarketingBankReferenceMaxLength)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"bank_reference must be {MarketingBankReferenceMaxLength} characters or less.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static void ValidateManualPaymentEvidence(
        ManualBillingPaymentMethod method,
        string? bankReference,
        string operation)
    {
        var normalizedOperation = NormalizeOptionalValue(operation) ?? "process";
        var hasReference = !string.IsNullOrWhiteSpace(NormalizeOptionalValue(bankReference));
        if (hasReference)
        {
            return;
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            $"bank_reference is required for {MapManualBillingPaymentMethodValue(method)} payments during {normalizedOperation}.",
            StatusCodes.Status400BadRequest);
    }

    private async Task<ValidatedMarketingProofFile> ValidateAndReadMarketingProofFileAsync(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "file is required.",
                StatusCodes.Status400BadRequest);
        }

        if (file.Length <= 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Uploaded proof file is empty.",
                StatusCodes.Status400BadRequest);
        }

        var maxFileBytes = Math.Clamp(options.MarketingPaymentProofMaxFileBytes, 1 * 1024 * 1024, 30 * 1024 * 1024);
        if (file.Length > maxFileBytes)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"Proof file exceeds max allowed size of {maxFileBytes} bytes.",
                StatusCodes.Status400BadRequest);
        }

        var extension = Path.GetExtension(file.FileName)?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension) || !AllowedDepositSlipFileExtensions.Contains(extension))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Unsupported proof file extension. Use PDF, PNG, JPG, JPEG, or WEBP.",
                StatusCodes.Status400BadRequest);
        }

        await using var stream = file.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        if (bytes.Length == 0)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Uploaded proof file is empty.",
                StatusCodes.Status400BadRequest);
        }

        var detectedKind = DetectMarketingProofFileKind(bytes);
        if (detectedKind == MarketingProofFileKind.Unknown)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Proof file signature is invalid. Upload a valid PDF/JPG/PNG/WEBP.",
                StatusCodes.Status400BadRequest);
        }

        if (!IsMarketingProofExtensionCompatible(extension, detectedKind))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Proof file extension does not match file content.",
                StatusCodes.Status400BadRequest);
        }

        if (!IsMarketingProofContentTypeCompatible(file.ContentType, detectedKind))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Proof file content type does not match file content.",
                StatusCodes.Status400BadRequest);
        }

        var contentType = detectedKind switch
        {
            MarketingProofFileKind.Pdf => "application/pdf",
            MarketingProofFileKind.Png => "image/png",
            MarketingProofFileKind.Jpeg => "image/jpeg",
            MarketingProofFileKind.Webp => "image/webp",
            _ => "application/octet-stream"
        };

        return new ValidatedMarketingProofFile(
            new BillFileData(NormalizeMarketingProofFileName(file.FileName), contentType, bytes),
            extension,
            bytes.LongLength);
    }

    private static MarketingProofFileKind DetectMarketingProofFileKind(byte[] bytes)
    {
        if (bytes.Length >= 5 &&
            bytes[0] == 0x25 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x44 &&
            bytes[3] == 0x46 &&
            bytes[4] == 0x2D)
        {
            return MarketingProofFileKind.Pdf;
        }

        if (bytes.Length >= 8 &&
            bytes[0] == 0x89 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x4E &&
            bytes[3] == 0x47 &&
            bytes[4] == 0x0D &&
            bytes[5] == 0x0A &&
            bytes[6] == 0x1A &&
            bytes[7] == 0x0A)
        {
            return MarketingProofFileKind.Png;
        }

        if (bytes.Length >= 3 &&
            bytes[0] == 0xFF &&
            bytes[1] == 0xD8 &&
            bytes[2] == 0xFF)
        {
            return MarketingProofFileKind.Jpeg;
        }

        if (bytes.Length >= 12 &&
            bytes[0] == 0x52 &&
            bytes[1] == 0x49 &&
            bytes[2] == 0x46 &&
            bytes[3] == 0x46 &&
            bytes[8] == 0x57 &&
            bytes[9] == 0x45 &&
            bytes[10] == 0x42 &&
            bytes[11] == 0x50)
        {
            return MarketingProofFileKind.Webp;
        }

        return MarketingProofFileKind.Unknown;
    }

    private static bool IsMarketingProofExtensionCompatible(string extension, MarketingProofFileKind kind)
    {
        return kind switch
        {
            MarketingProofFileKind.Pdf => extension == ".pdf",
            MarketingProofFileKind.Png => extension == ".png",
            MarketingProofFileKind.Jpeg => extension is ".jpg" or ".jpeg",
            MarketingProofFileKind.Webp => extension == ".webp",
            _ => false
        };
    }

    private static bool IsMarketingProofContentTypeCompatible(string? contentType, MarketingProofFileKind kind)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return false;
        }

        var normalized = contentType.Split(';', 2, StringSplitOptions.TrimEntries)[0].ToLowerInvariant();
        return kind switch
        {
            MarketingProofFileKind.Pdf => normalized == "application/pdf",
            MarketingProofFileKind.Png => normalized == "image/png",
            MarketingProofFileKind.Jpeg => normalized is "image/jpeg" or "image/jpg",
            MarketingProofFileKind.Webp => normalized == "image/webp",
            _ => false
        };
    }

    private static string NormalizeMarketingProofFileName(string? value)
    {
        var normalized = NormalizeOptionalValue(value) ?? "payment-proof";
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (char.IsLetterOrDigit(character) || character is '.' or '-' or '_')
            {
                builder.Append(character);
            }
            else
            {
                builder.Append('-');
            }
        }

        var result = builder.ToString().Trim('-');
        if (string.IsNullOrWhiteSpace(result))
        {
            return "payment-proof";
        }

        return result.Length > 120 ? result[..120] : result;
    }

    private string EnsureMarketingProofStorageRoot()
    {
        var publicRoot = Path.Combine(webHostEnvironment.ContentRootPath, "wwwroot");
        var proofRoot = Path.Combine(publicRoot, "payment-proofs");
        Directory.CreateDirectory(proofRoot);
        return proofRoot;
    }

    private string BuildPublicAssetUrl(string relativeUrl)
    {
        var normalizedRelative = relativeUrl.StartsWith('/') ? relativeUrl : $"/{relativeUrl}";
        var httpContext = httpContextAccessor.HttpContext;
        if (httpContext is null)
        {
            return normalizedRelative;
        }

        return $"{httpContext.Request.Scheme}://{httpContext.Request.Host}{normalizedRelative}";
    }

    private static ManualBillingPaymentMethod ParseManualBillingPaymentMethod(string? method)
    {
        var normalized = NormalizeOptionalValue(method)?.ToLowerInvariant();
        return normalized switch
        {
            "cash" => ManualBillingPaymentMethod.Cash,
            "bank_deposit" or "bankdeposit" => ManualBillingPaymentMethod.BankDeposit,
            "bank_transfer" or "banktransfer" => ManualBillingPaymentMethod.BankTransfer,
            _ => throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "method must be one of: cash, bank_deposit, bank_transfer.",
                StatusCodes.Status400BadRequest)
        };
    }

    private static ManualBillingInvoiceStatus? ParseManualBillingInvoiceStatus(string? status)
    {
        var normalized = NormalizeOptionalValue(status)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized switch
        {
            "open" => ManualBillingInvoiceStatus.Open,
            "pending_verification" or "pendingverification" => ManualBillingInvoiceStatus.PendingVerification,
            "paid" => ManualBillingInvoiceStatus.Paid,
            "overdue" => ManualBillingInvoiceStatus.Overdue,
            "canceled" => ManualBillingInvoiceStatus.Canceled,
            _ => throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Invalid invoice status filter.",
                StatusCodes.Status400BadRequest)
        };
    }

    private static ManualBillingPaymentStatus? ParseManualBillingPaymentStatus(string? status)
    {
        var normalized = NormalizeOptionalValue(status)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized switch
        {
            "pending_verification" or "pendingverification" => ManualBillingPaymentStatus.PendingVerification,
            "verified" => ManualBillingPaymentStatus.Verified,
            "rejected" => ManualBillingPaymentStatus.Rejected,
            _ => throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Invalid payment status filter.",
                StatusCodes.Status400BadRequest)
        };
    }

    private ManualOverrideContext ResolveManualOverrideContext(
        string? actor,
        string? reasonCode,
        string? actorNote,
        string defaultActor,
        string defaultReasonCode)
    {
        var resolvedActor = string.IsNullOrWhiteSpace(actor) ? defaultActor : actor.Trim();
        var resolvedReasonCode = NormalizeReasonCode(reasonCode);
        if (string.IsNullOrWhiteSpace(resolvedReasonCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reason_code is required for manual override actions.",
                StatusCodes.Status400BadRequest);
        }

        var resolvedActorNote = NormalizeOptionalValue(actorNote);
        if (string.IsNullOrWhiteSpace(resolvedActorNote))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "actor_note is required for manual override actions.",
                StatusCodes.Status400BadRequest);
        }

        var fallbackCode = NormalizeReasonCode(defaultReasonCode) ?? "manual_override";
        return new ManualOverrideContext(
            resolvedActor,
            resolvedReasonCode,
            resolvedActorNote,
            string.IsNullOrWhiteSpace(resolvedReasonCode) ? fallbackCode : resolvedReasonCode);
    }

    private static string? NormalizeReasonCode(string? value)
    {
        var normalized = NormalizeOptionalValue(value)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length is < 3 or > 64)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reason_code must be between 3 and 64 characters.",
                StatusCodes.Status400BadRequest);
        }

        foreach (var character in normalized)
        {
            if (char.IsAsciiLetterOrDigit(character) || character is '_' or '-' or '.')
            {
                continue;
            }

            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reason_code contains invalid characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private StepUpApprovalContext ResolveStepUpApproval(
        bool required,
        string? approvedBy,
        string? approvalNote,
        string actionKey)
    {
        var normalizedApprovedBy = NormalizeOptionalValue(approvedBy);
        var normalizedApprovalNote = NormalizeOptionalValue(approvalNote);
        if (!required)
        {
            return string.IsNullOrWhiteSpace(normalizedApprovedBy) || string.IsNullOrWhiteSpace(normalizedApprovalNote)
                ? new StepUpApprovalContext(string.Empty, string.Empty, false)
                : new StepUpApprovalContext(normalizedApprovedBy, normalizedApprovalNote, true);
        }

        if (string.IsNullOrWhiteSpace(normalizedApprovedBy) || string.IsNullOrWhiteSpace(normalizedApprovalNote))
        {
            licensingAlertMonitor.RecordSecurityAnomaly($"step_up_approval_required:{actionKey}");
            throw new LicenseException(
                LicenseErrorCodes.SecondApprovalRequired,
                "This high-risk action requires step-up approval.",
                StatusCodes.Status409Conflict);
        }

        return new StepUpApprovalContext(normalizedApprovedBy, normalizedApprovalNote, true);
    }

    private static string NormalizeEmergencyAction(string? action)
    {
        var normalized = NormalizeOptionalValue(action)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized) || !EmergencyActions.Contains(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "action must be one of: lock_device, revoke_token, force_reauth.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private string SignEmergencyCommandEnvelope(EmergencyCommandEnvelopePayload payload)
    {
        var payloadSegment = Base64UrlEncode(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
        var secret = ResolveEmergencyCommandSigningSecret();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var signature = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadSegment));
        var signatureSegment = Base64UrlEncode(signature);
        return $"{payloadSegment}.{signatureSegment}";
    }

    private EmergencyCommandEnvelopePayload ParseAndValidateEmergencyCommandEnvelope(string envelopeToken)
    {
        var parts = envelopeToken.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "envelope_token format is invalid.",
                StatusCodes.Status400BadRequest);
        }

        byte[] signatureBytes;
        try
        {
            signatureBytes = Base64UrlDecode(parts[1]);
        }
        catch (FormatException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "envelope_token signature format is invalid.",
                StatusCodes.Status400BadRequest);
        }

        var secret = ResolveEmergencyCommandSigningSecret();
        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
        {
            var expectedSignature = hmac.ComputeHash(Encoding.UTF8.GetBytes(parts[0]));
            if (!CryptographicOperations.FixedTimeEquals(expectedSignature, signatureBytes))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "envelope_token signature is invalid.",
                    StatusCodes.Status403Forbidden);
            }
        }

        try
        {
            var payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]));
            var payload = JsonSerializer.Deserialize<EmergencyCommandEnvelopePayload>(payloadJson);
            if (payload is null ||
                payload.CommandId == Guid.Empty ||
                string.IsNullOrWhiteSpace(payload.DeviceCode) ||
                string.IsNullOrWhiteSpace(payload.Nonce))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "envelope_token payload is incomplete.",
                    StatusCodes.Status400BadRequest);
            }

            payload.Action = NormalizeEmergencyAction(payload.Action);
            payload.ReasonCode = NormalizeReasonCode(payload.ReasonCode) ?? "emergency_command";
            payload.ActorNote = NormalizeOptionalValue(payload.ActorNote) ?? "no_note";
            payload.Actor = NormalizeOptionalValue(payload.Actor) ?? "security-admin";
            return payload;
        }
        catch (JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "envelope_token payload is invalid JSON.",
                StatusCodes.Status400BadRequest);
        }
        catch (FormatException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "envelope_token payload encoding is invalid.",
                StatusCodes.Status400BadRequest);
        }
    }

    private async Task<int> RevokeDeviceTokenSessionsAsAdminAsync(
        string deviceCode,
        string actor,
        string reasonCode,
        string actorNote,
        string manualOverrideAction,
        string auditAction,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        var provisionedDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status404NotFound);

        List<Guid> activeLicenseIds;
        if (dbContext.Database.IsSqlite())
        {
            activeLicenseIds = (await dbContext.Licenses
                    .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                                x.Status == LicenseRecordStatus.Active)
                    .ToListAsync(cancellationToken))
                .Where(x => !x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now)
                .Select(x => x.Id)
                .Distinct()
                .ToList();
        }
        else
        {
            activeLicenseIds = await dbContext.Licenses
                .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id &&
                            x.Status == LicenseRecordStatus.Active &&
                            (!x.RevokedAtUtc.HasValue || x.RevokedAtUtc > now))
                .Select(x => x.Id)
                .Distinct()
                .ToListAsync(cancellationToken);
        }

        List<LicenseTokenSession> sessions;
        if (activeLicenseIds.Count == 0)
        {
            sessions = [];
        }
        else
        {
            sessions = (await dbContext.LicenseTokenSessions
                    .Where(x => activeLicenseIds.Contains(x.LicenseId))
                    .ToListAsync(cancellationToken))
                .Where(x => x.RejectAfterUtc > now)
                .ToList();
        }

        foreach (var session in sessions)
        {
            session.RejectAfterUtc = now;
            session.RevokedAtUtc = now;
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = auditAction,
            Actor = actor,
            Reason = reasonCode,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                revoked_token_sessions = sessions.Count,
                reason_code = reasonCode,
                actor_note = actorNote
            }),
            CreatedAtUtc = now
        });

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            manualOverrideAction,
            actor,
            reasonCode,
            new
            {
                device_code = normalizedDeviceCode,
                revoked_token_sessions = sessions.Count,
                reason_code = reasonCode,
                actor_note = actorNote
            },
            now,
            cancellationToken);

        return sessions.Count;
    }

    private static DateOnly ResolveReconciliationDate(string? dateValue)
    {
        var normalized = NormalizeOptionalValue(dateValue);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return DateOnly.FromDateTime(DateTime.UtcNow);
        }

        if (DateOnly.TryParseExact(
                normalized,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            return parsed;
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "date must be in YYYY-MM-DD format.",
            StatusCodes.Status400BadRequest);
    }

    private string ResolveCurrentAdminActor()
    {
        var user = httpContextAccessor.HttpContext?.User;
        var actor = NormalizeOptionalValue(
            user?.FindFirstValue("username") ??
            user?.FindFirstValue(ClaimTypes.Name) ??
            user?.FindFirstValue(ClaimTypes.NameIdentifier));
        return string.IsNullOrWhiteSpace(actor) ? "super-admin" : actor;
    }

    private string ResolveCurrentAdminScope()
    {
        var scope = NormalizeOptionalValue(httpContextAccessor.HttpContext?.User?.FindFirstValue("super_admin_scope"));
        if (string.IsNullOrWhiteSpace(scope))
        {
            return SmartPosRoles.SuperAdmin;
        }

        return scope.ToLowerInvariant();
    }

    private Guid ResolveCurrentAuthenticatedUserId()
    {
        var principal = httpContextAccessor.HttpContext?.User;
        var value = principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal?.FindFirstValue("sub");
        if (Guid.TryParse(value, out var userId))
        {
            return userId;
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "Authenticated user context is missing.",
            StatusCodes.Status401Unauthorized);
    }

    private async Task<OwnerManagedShopContext> ResolveCurrentOwnerManagedShopContextAsync(
        CancellationToken cancellationToken)
    {
        var userId = ResolveCurrentAuthenticatedUserId();
        var (user, shop, roleCode) = await ResolveManagedShopUserContextAsync(userId, cancellationToken);
        if (!string.Equals(roleCode, SmartPosRoles.Owner, StringComparison.OrdinalIgnoreCase))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Only shop owners can manage AI credit invoices.",
                StatusCodes.Status403Forbidden);
        }

        return new OwnerManagedShopContext(user, shop, roleCode);
    }

    private AiCreditPackOption ResolveConfiguredAiCreditPack(string? packCode)
    {
        var normalizedPackCode = NormalizeOptionalValue(packCode);
        if (string.IsNullOrWhiteSpace(normalizedPackCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "pack_code is required.",
                StatusCodes.Status400BadRequest);
        }

        if (!aiCreditPackCatalog.TryGetValue(normalizedPackCode, out var pack))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "pack_code is not supported.",
                StatusCodes.Status400BadRequest);
        }

        return pack;
    }

    private async Task<AiCreditOrder> ResolveOwnerAiCreditOrderByInvoiceIdAsync(
        Guid invoiceId,
        CancellationToken cancellationToken)
    {
        return await dbContext.AiCreditOrders
            .Include(x => x.Invoice)
            .Include(x => x.Shop)
            .FirstOrDefaultAsync(
                x => x.InvoiceId == invoiceId && x.Source == CloudOwnerAccountAiCreditOrderSource,
                cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "AI credit invoice was not found.",
                StatusCodes.Status404NotFound);
    }

    private async Task<AppUser> ResolveAdminActorUserAsync(
        string actor,
        CancellationToken cancellationToken)
    {
        var principal = httpContextAccessor.HttpContext?.User;
        var actorFromClaim = principal?.FindFirstValue(ClaimTypes.NameIdentifier) ??
                             principal?.FindFirstValue("sub");
        if (Guid.TryParse(actorFromClaim, out var actorUserId))
        {
            var actorUserById = await dbContext.Users
                .FirstOrDefaultAsync(x => x.Id == actorUserId, cancellationToken);
            if (actorUserById is not null)
            {
                return actorUserById;
            }
        }

        var normalizedActor = NormalizeOptionalValue(actor);
        if (!string.IsNullOrWhiteSpace(normalizedActor))
        {
            var actorUserByUsername = await dbContext.Users
                .FirstOrDefaultAsync(
                    x => x.Username.ToLower() == normalizedActor.ToLower(),
                    cancellationToken);
            if (actorUserByUsername is not null)
            {
                return actorUserByUsername;
            }
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "Unable to resolve admin actor user for wallet correction.",
            StatusCodes.Status400BadRequest);
    }

    private async Task<int> CountSelfServiceDeactivationsUsedTodayAsync(
        Guid shopId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var dayStart = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        if (dbContext.Database.IsSqlite())
        {
            return (await dbContext.LicenseAuditLogs
                    .AsNoTracking()
                    .Where(x =>
                        x.ShopId == shopId &&
                        x.Action == "self_service_device_deactivate")
                    .ToListAsync(cancellationToken))
                .Count(x => x.CreatedAtUtc >= dayStart);
        }

        return await dbContext.LicenseAuditLogs
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.Action == "self_service_device_deactivate" &&
                x.CreatedAtUtc >= dayStart)
            .CountAsync(cancellationToken);
    }

    private async Task<ResolvedCurrentShopContext> ResolveCurrentShopContextAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var httpContext = httpContextAccessor.HttpContext;
        var currentDeviceCode = httpContext is null ? string.Empty : ResolveDeviceCode(null, httpContext);

        if (!string.IsNullOrWhiteSpace(currentDeviceCode))
        {
            var provisionedDevice = await dbContext.ProvisionedDevices
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.DeviceCode == currentDeviceCode, cancellationToken);
            if (provisionedDevice is not null)
            {
                var existingShop = await dbContext.Shops
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken);
                if (existingShop is not null)
                {
                    return new ResolvedCurrentShopContext(existingShop, currentDeviceCode);
                }
            }
        }

        var shop = await GetOrCreateDefaultShopAsync(now, cancellationToken);
        if (dbContext.Entry(shop).State == EntityState.Added)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new ResolvedCurrentShopContext(shop, currentDeviceCode);
    }

    private static string ResolveCurrency(string? currency)
    {
        var normalized = NormalizeOptionalValue(currency);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "LKR";
        }

        var upper = normalized.ToUpperInvariant();
        return upper.Length > 8 ? upper[..8] : upper;
    }

    private static AiCreditInvoiceRowResponse MapAiCreditInvoiceRow(
        ManualBillingInvoice invoice,
        AiCreditOrder order,
        string shopCode)
    {
        var metadata = ParseOwnerAiCreditInvoiceMetadata(order.MetadataJson);
        var approvedAt = metadata.ApprovedAt ?? order.VerifiedAtUtc;
        var rejectedAt = metadata.RejectedAt ?? order.RejectedAtUtc;

        return new AiCreditInvoiceRowResponse
        {
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            ShopCode = shopCode,
            PackCode = NormalizeOptionalValue(order.PackageCode) ?? NormalizeOptionalValue(metadata.PackCode) ?? string.Empty,
            RequestedCredits = RoundAiCredits(order.RequestedCredits > 0m
                ? order.RequestedCredits
                : metadata.RequestedCredits ?? 0m),
            AmountDue = decimal.Round(invoice.AmountDue, 2, MidpointRounding.AwayFromZero),
            Currency = ResolveCurrency(invoice.Currency),
            Status = MapOwnerAiCreditInvoiceStatus(order.Status),
            CreatedAt = order.SubmittedAtUtc == default ? invoice.CreatedAtUtc : order.SubmittedAtUtc,
            UpdatedAt = order.UpdatedAtUtc ?? invoice.UpdatedAtUtc,
            ApprovedAt = approvedAt,
            ApprovedBy = metadata.ApprovedBy,
            RejectedAt = rejectedAt,
            RejectedBy = metadata.RejectedBy,
            Reason = metadata.RejectedReasonCode ?? metadata.RejectedActorNote ?? order.SettlementError
        };
    }

    private static string MapOwnerAiCreditInvoiceStatus(AiCreditOrderStatus status)
    {
        return status switch
        {
            AiCreditOrderStatus.Submitted => "pending",
            AiCreditOrderStatus.PendingVerification => "pending",
            AiCreditOrderStatus.Verified => "approved",
            AiCreditOrderStatus.Rejected => "rejected",
            AiCreditOrderStatus.Settled => "settled",
            _ => "pending"
        };
    }

    private static AdminManualBillingInvoiceRow MapManualBillingInvoiceRow(
        ManualBillingInvoice invoice,
        string shopCode)
    {
        return new AdminManualBillingInvoiceRow
        {
            InvoiceId = invoice.Id,
            ShopId = invoice.ShopId,
            ShopCode = shopCode,
            InvoiceNumber = invoice.InvoiceNumber,
            AmountDue = invoice.AmountDue,
            AmountPaid = invoice.AmountPaid,
            Currency = invoice.Currency,
            Status = MapManualBillingInvoiceStatusValue(invoice.Status),
            DueAt = invoice.DueAtUtc,
            Notes = invoice.Notes,
            CreatedBy = invoice.CreatedBy,
            CreatedAt = invoice.CreatedAtUtc,
            UpdatedAt = invoice.UpdatedAtUtc
        };
    }

    private static AdminManualBillingPaymentRow MapManualBillingPaymentRow(
        ManualBillingPayment payment,
        string shopCode,
        string invoiceNumber)
    {
        return new AdminManualBillingPaymentRow
        {
            PaymentId = payment.Id,
            ShopId = payment.ShopId,
            ShopCode = shopCode,
            InvoiceId = payment.InvoiceId,
            InvoiceNumber = invoiceNumber,
            Method = MapManualBillingPaymentMethodValue(payment.Method),
            Amount = payment.Amount,
            Currency = payment.Currency,
            Status = MapManualBillingPaymentStatusValue(payment.Status),
            BankReference = payment.BankReference,
            ReceivedAt = payment.ReceivedAtUtc,
            Notes = payment.Notes,
            RecordedBy = payment.RecordedBy,
            VerifiedBy = payment.VerifiedBy,
            VerifiedAt = payment.VerifiedAtUtc,
            RejectedBy = payment.RejectedBy,
            RejectedAt = payment.RejectedAtUtc,
            RejectionReason = payment.RejectionReason,
            CreatedAt = payment.CreatedAtUtc,
            UpdatedAt = payment.UpdatedAtUtc
        };
    }

    private static string MapManualBillingInvoiceStatusValue(ManualBillingInvoiceStatus status)
    {
        return status switch
        {
            ManualBillingInvoiceStatus.Open => "open",
            ManualBillingInvoiceStatus.PendingVerification => "pending_verification",
            ManualBillingInvoiceStatus.Paid => "paid",
            ManualBillingInvoiceStatus.Overdue => "overdue",
            ManualBillingInvoiceStatus.Canceled => "canceled",
            _ => "open"
        };
    }

    private static string MapManualBillingPaymentStatusValue(ManualBillingPaymentStatus status)
    {
        return status switch
        {
            ManualBillingPaymentStatus.PendingVerification => "pending_verification",
            ManualBillingPaymentStatus.Verified => "verified",
            ManualBillingPaymentStatus.Rejected => "rejected",
            _ => "pending_verification"
        };
    }

    private static string MapManualBillingPaymentMethodValue(ManualBillingPaymentMethod method)
    {
        return method switch
        {
            ManualBillingPaymentMethod.Cash => "cash",
            ManualBillingPaymentMethod.BankDeposit => "bank_deposit",
            ManualBillingPaymentMethod.BankTransfer => "bank_transfer",
            _ => "bank_deposit"
        };
    }

    private static string ResolveManagedShopName(string? shopName, string fieldName)
    {
        var normalized = NormalizeOptionalValue(shopName);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length > 160)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} must be 160 characters or less.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private async Task<Shop> ResolveExistingShopByIdAsync(
        Guid shopId,
        CancellationToken cancellationToken)
    {
        if (shopId == Guid.Empty)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "shop_id is required.",
                StatusCodes.Status400BadRequest);
        }

        return await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == shopId, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Shop was not found.",
                StatusCodes.Status404NotFound);
    }

    private async Task<ShopDeactivationDependencySnapshot> BuildShopDeactivationDependencySnapshotAsync(
        Guid shopId,
        CancellationToken cancellationToken)
    {
        var activeDevices = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     x.Status == ProvisionedDeviceStatus.Active,
                cancellationToken);
        var nonTerminalSubscriptions = await dbContext.Subscriptions
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     x.Status != SubscriptionStatus.Canceled,
                cancellationToken);
        var openOrPendingInvoices = await dbContext.ManualBillingInvoices
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     (x.Status == ManualBillingInvoiceStatus.Open ||
                      x.Status == ManualBillingInvoiceStatus.PendingVerification),
                cancellationToken);
        var pendingManualPayments = await dbContext.ManualBillingPayments
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     x.Status == ManualBillingPaymentStatus.PendingVerification,
                cancellationToken);
        var pendingAiOrders = await dbContext.AiCreditOrders
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     (x.Status == AiCreditOrderStatus.Submitted ||
                      x.Status == AiCreditOrderStatus.PendingVerification ||
                      x.Status == AiCreditOrderStatus.Verified),
                cancellationToken);
        var pendingAiPayments = await dbContext.AiCreditPayments
            .AsNoTracking()
            .CountAsync(
                x => x.ShopId == shopId &&
                     x.Status == AiCreditPaymentStatus.Pending,
                cancellationToken);

        return new ShopDeactivationDependencySnapshot(
            activeDevices,
            nonTerminalSubscriptions,
            openOrPendingInvoices,
            pendingManualPayments,
            pendingAiOrders,
            pendingAiPayments);
    }

    private static AdminShopMutationShopRow MapAdminShopMutationRow(Shop shop)
    {
        return new AdminShopMutationShopRow
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            ShopName = shop.Name,
            IsActive = shop.IsActive,
            CreatedAt = shop.CreatedAtUtc,
            UpdatedAt = shop.UpdatedAtUtc
        };
    }

    private static AdminShopMutationOwnerSummary MapAdminShopOwnerSummary(AppUser user)
    {
        return new AdminShopMutationOwnerSummary
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName
        };
    }

    private static string ResolveManagedRoleCodeFromCandidates(IEnumerable<string> roleCodes)
    {
        var normalizedRoles = roleCodes
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var roleCode in ManagedShopRolePriority)
        {
            if (normalizedRoles.Contains(roleCode))
            {
                return roleCode;
            }
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "User does not have a supported shop role.",
            StatusCodes.Status400BadRequest);
    }

    private static string ResolveManagedShopUsername(string? username, string fieldName)
    {
        var normalized = NormalizeOptionalValue(username)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length is < 3 or > 64)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} must be between 3 and 64 characters.",
                StatusCodes.Status400BadRequest);
        }

        foreach (var character in normalized)
        {
            if (char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.')
            {
                continue;
            }

            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} contains invalid characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string ResolveManagedShopFullName(string? fullName)
    {
        var normalized = NormalizeOptionalValue(fullName);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "full_name is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length > 120)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "full_name must be 120 characters or less.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string ResolveManagedShopPassword(string? password, string fieldName)
    {
        var normalized = NormalizeOptionalValue(password);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length is < 8 or > 128)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                $"{fieldName} must be between 8 and 128 characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string ResolveManagedShopRoleCode(string? roleCode)
    {
        var normalized = NormalizeOptionalValue(roleCode)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "role_code is required.",
                StatusCodes.Status400BadRequest);
        }

        if (!ManagedShopRoleCodes.Contains(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "role_code must be one of: owner, manager, cashier.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private async Task<AppRole> ResolveManagedShopRoleEntityAsync(
        string roleCode,
        CancellationToken cancellationToken)
    {
        var normalized = ResolveManagedShopRoleCode(roleCode);
        return await dbContext.Roles
            .FirstOrDefaultAsync(x => x.Code.ToLower() == normalized, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                $"Role '{normalized}' is not configured.",
                StatusCodes.Status500InternalServerError);
    }

    private static string? ResolveManagedRoleCodeForUser(AppUser user)
    {
        var roleCodes = user.UserRoles
            .Select(x => x.Role.Code?.Trim().ToLowerInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return ManagedShopRolePriority.FirstOrDefault(roleCodes.Contains);
    }

    private async Task<(AppUser User, Shop Shop, string RoleCode)> ResolveManagedShopUserContextAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(
                x => x.Id == userId && x.StoreId.HasValue && x.StoreId.Value != Guid.Empty,
                cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "User was not found.",
                StatusCodes.Status404NotFound);

        var roleCode = ResolveManagedRoleCodeForUser(user);
        if (string.IsNullOrWhiteSpace(roleCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Only owner, manager, or cashier users can be managed from this endpoint.",
                StatusCodes.Status400BadRequest);
        }

        var shop = await dbContext.Shops
            .FirstOrDefaultAsync(x => x.Id == user.StoreId!.Value, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "User is linked to an unknown shop.",
                StatusCodes.Status400BadRequest);

        return (user, shop, roleCode);
    }

    private async Task ReplaceManagedRoleForUserAsync(
        AppUser user,
        string newRoleCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var role = await ResolveManagedShopRoleEntityAsync(newRoleCode, cancellationToken);
        var managedAssignments = user.UserRoles
            .Where(x => ManagedShopRoleCodes.Contains(x.Role.Code))
            .ToList();
        foreach (var assignment in managedAssignments)
        {
            dbContext.UserRoles.Remove(assignment);
        }

        dbContext.UserRoles.Add(new UserRole
        {
            UserId = user.Id,
            RoleId = role.Id,
            AssignedAtUtc = now,
            User = user,
            Role = role
        });
    }

    private async Task EnsureShopHasAnotherActiveOwnerAsync(
        Guid shopId,
        Guid excludedUserId,
        CancellationToken cancellationToken)
    {
        var hasOtherOwner = await (
            from user in dbContext.Users.AsNoTracking()
            join userRole in dbContext.UserRoles.AsNoTracking() on user.Id equals userRole.UserId
            join role in dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where user.StoreId == shopId &&
                  user.IsActive &&
                  user.Id != excludedUserId &&
                  role.Code.ToLower() == SmartPosRoles.Owner
            select user.Id)
            .AnyAsync(cancellationToken);

        if (!hasOtherOwner)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "At least one active owner is required for each shop.",
                StatusCodes.Status409Conflict);
        }
    }

    private async Task<int> RevokeAuthSessionsForUserAsync(
        Guid userId,
        DateTimeOffset now,
        string reason,
        CancellationToken cancellationToken)
    {
        var sessions = await dbContext.Devices
            .Where(x => x.AppUserId == userId)
            .ToListAsync(cancellationToken);
        foreach (var session in sessions)
        {
            session.AuthSessionVersion = Math.Max(1, session.AuthSessionVersion) + 1;
            session.AuthSessionRevokedAtUtc = now;
            session.AuthSessionRevocationReason = reason;
        }

        return sessions.Count;
    }

    private static AdminShopUserRow MapAdminShopUserRow(AppUser user, Shop shop, string roleCode)
    {
        return new AdminShopUserRow
        {
            UserId = user.Id,
            ShopId = shop.Id,
            ShopCode = shop.Code,
            Username = user.Username,
            FullName = user.FullName,
            RoleCode = roleCode,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAtUtc,
            LastLoginAt = user.LastLoginAtUtc
        };
    }

    private static MarketingAiCreditOrderSummaryResponse MapMarketingAiCreditOrderSummary(AiCreditOrder order)
    {
        return new MarketingAiCreditOrderSummaryResponse
        {
            OrderId = order.Id,
            Status = MapAiCreditOrderStatusValue(order.Status),
            RequestedCredits = order.RequestedCredits,
            SettledCredits = order.SettledCredits,
            TargetUsername = order.TargetUsername,
            PackageCode = order.PackageCode,
            WalletLedgerReference = order.WalletLedgerReference,
            SettlementError = order.SettlementError,
            SubmittedAt = order.SubmittedAtUtc,
            VerifiedAt = order.VerifiedAtUtc,
            RejectedAt = order.RejectedAtUtc,
            SettledAt = order.SettledAtUtc
        };
    }

    private static string MapAiCreditOrderStatusValue(AiCreditOrderStatus status)
    {
        return status switch
        {
            AiCreditOrderStatus.Submitted => "submitted",
            AiCreditOrderStatus.PendingVerification => "pending_verification",
            AiCreditOrderStatus.Verified => "verified",
            AiCreditOrderStatus.Rejected => "rejected",
            AiCreditOrderStatus.Settled => "settled",
            _ => "submitted"
        };
    }

    private async Task<AiCreditOrder?> ResolveAiCreditOrderForManualPaymentAsync(
        Guid invoiceId,
        Guid paymentId,
        CancellationToken cancellationToken)
    {
        var query = dbContext.AiCreditOrders
            .Where(x => x.InvoiceId == invoiceId && (x.PaymentId == null || x.PaymentId == paymentId));
        if (dbContext.Database.IsSqlite())
        {
            return (await query.ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();
        }

        return await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<AppUser> ResolveAiCreditOrderTargetUserAsync(
        string username,
        CancellationToken cancellationToken)
    {
        var normalizedUsername = NormalizeOptionalValue(username);
        if (string.IsNullOrWhiteSpace(normalizedUsername))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "target_username is required.",
                StatusCodes.Status400BadRequest);
        }

        var targetUser = await dbContext.Users
            .FirstOrDefaultAsync(
                x => x.Username.ToLower() == normalizedUsername.ToLower(),
                cancellationToken);
        if (targetUser is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "target_username was not found.",
                StatusCodes.Status400BadRequest);
        }

        return targetUser;
    }

    private async Task SettleAiCreditOrderAsync(
        AiCreditOrder order,
        string actor,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var creditsToSettle = RoundAiCredits(order.RequestedCredits);
        if (creditsToSettle <= 0m)
        {
            order.SettledCredits = 0m;
            order.Status = AiCreditOrderStatus.Settled;
            order.SettledAtUtc = now;
            order.UpdatedAtUtc = now;
            order.SettlementError = null;
            return;
        }

        AppUser targetUser;
        if (order.TargetUserId.HasValue)
        {
            targetUser = await dbContext.Users
                .FirstOrDefaultAsync(x => x.Id == order.TargetUserId.Value, cancellationToken)
                ?? throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "AI credit order target user was not found.",
                    StatusCodes.Status400BadRequest);
        }
        else
        {
            targetUser = await ResolveAiCreditOrderTargetUserAsync(
                order.TargetUsername ?? string.Empty,
                cancellationToken);
            order.TargetUserId = targetUser.Id;
            order.TargetUser = targetUser;
        }

        var settlementReference = $"{AiCreditOrderSettlementReferencePrefix}:{order.Id:N}";
        var existingSettlement = await dbContext.AiCreditLedgerEntries
            .FirstOrDefaultAsync(
                x => x.Reference == settlementReference &&
                     x.EntryType == AiCreditLedgerEntryType.Purchase,
                cancellationToken);
        if (existingSettlement is not null)
        {
            order.SettledCredits = Math.Abs(existingSettlement.DeltaCredits);
            order.WalletLedgerReference = settlementReference;
            order.SettledAtUtc ??= now;
            order.Status = AiCreditOrderStatus.Settled;
            order.SettlementError = null;
            order.UpdatedAtUtc = now;
            return;
        }

        if (!targetUser.StoreId.HasValue || targetUser.StoreId == Guid.Empty)
        {
            targetUser.StoreId = order.ShopId;
        }

        var wallet = await GetOrCreateAiWalletForSettlementAsync(
            order.ShopId,
            targetUser,
            now,
            cancellationToken);
        wallet.AvailableCredits = RoundAiCredits(wallet.AvailableCredits + creditsToSettle);
        wallet.UpdatedAtUtc = now;

        dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
        {
            UserId = targetUser.Id,
            ShopId = order.ShopId,
            User = targetUser,
            WalletId = wallet.Id,
            Wallet = wallet,
            EntryType = AiCreditLedgerEntryType.Purchase,
            DeltaCredits = creditsToSettle,
            BalanceAfterCredits = wallet.AvailableCredits,
            Reference = settlementReference,
            Description = "ai_credit_order_settlement",
            MetadataJson = JsonSerializer.Serialize(new
            {
                ai_credit_order_id = order.Id,
                shop_id = order.ShopId,
                invoice_id = order.InvoiceId,
                payment_id = order.PaymentId,
                actor
            }),
            CreatedAtUtc = now
        });

        order.SettledCredits = creditsToSettle;
        order.WalletLedgerReference = settlementReference;
        order.SettledAtUtc = now;
        order.Status = AiCreditOrderStatus.Settled;
        order.SettlementError = null;
        order.UpdatedAtUtc = now;

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = order.ShopId,
            Action = "ai_credit_order_settled",
            Actor = actor,
            Reason = "ai_credit_order_settlement",
            MetadataJson = JsonSerializer.Serialize(new
            {
                ai_credit_order_id = order.Id,
                target_user_id = targetUser.Id,
                target_username = targetUser.Username,
                credits_settled = creditsToSettle,
                wallet_ledger_reference = settlementReference
            })
        });
    }

    private async Task<AiCreditWallet> GetOrCreateAiWalletForSettlementAsync(
        Guid shopId,
        AppUser targetUser,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var wallet = await dbContext.AiCreditWallets
            .FirstOrDefaultAsync(x => x.ShopId == shopId, cancellationToken);
        if (wallet is not null)
        {
            wallet.UserId = targetUser.Id;
            return wallet;
        }

        wallet = new AiCreditWallet
        {
            UserId = targetUser.Id,
            ShopId = shopId,
            User = targetUser,
            AvailableCredits = 0m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        dbContext.AiCreditWallets.Add(wallet);
        return wallet;
    }

    private static decimal? ResolveRequestedAiCredits(decimal? requestedAiCredits, string? packageCode)
    {
        var normalizedPackageCode = NormalizeOptionalValue(packageCode);
        var packageCredits = ResolveAiCreditsFromPackageCode(normalizedPackageCode);
        if (!requestedAiCredits.HasValue)
        {
            return packageCredits;
        }

        var normalizedRequested = RoundAiCredits(requestedAiCredits.Value);
        if (normalizedRequested <= 0m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "ai_credits_requested must be greater than zero.",
                StatusCodes.Status400BadRequest);
        }

        if (normalizedRequested > 100_000m)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "ai_credits_requested is too high for a single order.",
                StatusCodes.Status400BadRequest);
        }

        return normalizedRequested;
    }

    private static decimal? ResolveAiCreditsFromPackageCode(string? packageCode)
    {
        var normalizedPackageCode = NormalizeOptionalValue(packageCode);
        if (string.IsNullOrWhiteSpace(normalizedPackageCode))
        {
            return null;
        }

        if (!MarketingAiCreditPackageCatalog.TryGetValue(normalizedPackageCode, out var credits))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "ai_package_code must be one of: trial_credits, pack_100, pack_500, pack_2000.",
                StatusCodes.Status400BadRequest);
        }

        return RoundAiCredits(credits);
    }

    private static decimal RoundAiCredits(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private LicenseTokenPayload ParseAndValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new LicenseException(LicenseErrorCodes.InvalidToken, "license_token is empty.");
        }

        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new LicenseException(LicenseErrorCodes.InvalidToken, "license_token format is invalid.");
        }

        var payloadSegment = parts[0];
        var signatureSegment = parts[1];
        var payloadBytes = Base64UrlDecode(payloadSegment);
        var payload = JsonSerializer.Deserialize<LicenseTokenPayload>(payloadBytes, TokenSerializerOptions);
        if (payload is null)
        {
            throw new LicenseException(LicenseErrorCodes.InvalidToken, "license_token payload is invalid.");
        }

        var providedSignatureBytes = Base64UrlDecode(signatureSegment);
        if (!VerifySignature(payloadSegment, providedSignatureBytes, payload.KeyId))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "license_token signature validation failed.",
                StatusCodes.Status403Forbidden);
        }

        return payload;
    }

    private OfflineGrantTokenPayload ParseAndValidateOfflineGrantToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new LicenseException(
                LicenseErrorCodes.OfflineGrantRequired,
                "offline_grant_token is empty.",
                StatusCodes.Status403Forbidden);
        }

        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token format is invalid.",
                StatusCodes.Status403Forbidden);
        }

        var payloadSegment = parts[0];
        var signatureSegment = parts[1];
        OfflineGrantTokenPayload? payload;
        byte[] providedSignatureBytes;
        try
        {
            var payloadBytes = Base64UrlDecode(payloadSegment);
            payload = JsonSerializer.Deserialize<OfflineGrantTokenPayload>(payloadBytes, TokenSerializerOptions);
            providedSignatureBytes = Base64UrlDecode(signatureSegment);
        }
        catch (Exception ex) when (ex is FormatException or JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token payload is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (payload is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token payload is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (!VerifySignature(payloadSegment, providedSignatureBytes, payload.KeyId))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "offline_grant_token signature validation failed.",
                StatusCodes.Status403Forbidden);
        }

        return payload;
    }

    private PolicySnapshotTokenPayload ParseAndValidatePolicySnapshotToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new LicenseException(
                LicenseErrorCodes.PolicySnapshotRequired,
                "license_policy_snapshot is empty.",
                StatusCodes.Status403Forbidden);
        }

        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new LicenseException(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot format is invalid.",
                StatusCodes.Status403Forbidden);
        }

        var payloadSegment = parts[0];
        var signatureSegment = parts[1];
        PolicySnapshotTokenPayload? payload;
        byte[] providedSignatureBytes;
        try
        {
            var payloadBytes = Base64UrlDecode(payloadSegment);
            payload = JsonSerializer.Deserialize<PolicySnapshotTokenPayload>(payloadBytes, TokenSerializerOptions);
            providedSignatureBytes = Base64UrlDecode(signatureSegment);
        }
        catch (Exception ex) when (ex is FormatException or JsonException)
        {
            throw new LicenseException(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot payload is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (payload is null)
        {
            throw new LicenseException(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot payload is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (!VerifySignature(payloadSegment, providedSignatureBytes, payload.KeyId))
        {
            throw new LicenseException(
                LicenseErrorCodes.PolicySnapshotInvalid,
                "license_policy_snapshot signature validation failed.",
                StatusCodes.Status403Forbidden);
        }

        return payload;
    }

    private string SignToken(LicenseTokenPayload payload, ResolvedSigningKey signingKey)
    {
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, TokenSerializerOptions);
        var payloadSegment = Base64UrlEncode(payloadBytes);
        var signatureSegment = Base64UrlEncode(SignPayload(payloadSegment, signingKey.PrivateKeyPem));
        return $"{payloadSegment}.{signatureSegment}";
    }

    private byte[] SignPayload(string payloadSegment, string privateKeyPem)
    {
        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem.AsSpan());

        return rsa.SignData(
            Encoding.UTF8.GetBytes(payloadSegment),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
    }

    private bool VerifySignature(string payloadSegment, byte[] signatureBytes, string? keyId)
    {
        var payloadBytes = Encoding.UTF8.GetBytes(payloadSegment);
        var verificationKeys = ResolveVerificationKeysById(keyId);

        foreach (var verificationKey in verificationKeys)
        {
            try
            {
                using var rsa = RSA.Create();
                rsa.ImportFromPem(verificationKey.PublicKeyPem.AsSpan());
                if (rsa.VerifyData(
                        payloadBytes,
                        signatureBytes,
                        HashAlgorithmName.SHA256,
                        RSASignaturePadding.Pkcs1))
                {
                    return true;
                }
            }
            catch (CryptographicException)
            {
                // Try remaining trusted verification keys.
            }
        }

        return false;
    }

    private ResolvedSigningKey ResolveActiveSigningKey()
    {
        var keyRing = options.SigningKeys
            .Where(static key => !string.IsNullOrWhiteSpace(key.KeyId))
            .ToDictionary(key => key.KeyId.Trim(), StringComparer.Ordinal);

        if (keyRing.Count > 0)
        {
            var activeKeyId = NormalizeOptionalValue(options.ActiveSigningKeyId)
                ?? NormalizeOptionalValue(options.SigningKeyId)
                ?? "smartpos-k1";

            if (!keyRing.TryGetValue(activeKeyId, out var configuredKey))
            {
                throw new InvalidOperationException($"Active licensing signing key '{activeKeyId}' was not found in Licensing:SigningKeys.");
            }

            var privateKeyPem = ResolveSigningPrivateKeyPem(configuredKey.PrivateKeyPem, activeKeyId);
            if (string.IsNullOrWhiteSpace(privateKeyPem))
            {
                throw new InvalidOperationException($"Licensing signing key '{activeKeyId}' is missing a private key.");
            }

            var publicKeyPem = NormalizePem(configuredKey.PublicKeyPem);
            if (string.IsNullOrWhiteSpace(publicKeyPem))
            {
                throw new InvalidOperationException($"Licensing signing key '{activeKeyId}' is missing a public key.");
            }

            return new ResolvedSigningKey(activeKeyId, privateKeyPem, publicKeyPem);
        }

        var fallbackKeyId = NormalizeOptionalValue(options.SigningKeyId) ?? "smartpos-k1";
        var fallbackPrivateKeyPem = ResolveSigningPrivateKeyPem(options.SigningPrivateKeyPem, fallbackKeyId);
        var fallbackPublicKeyPem = NormalizePem(options.VerificationPublicKeyPem);

        if (string.IsNullOrWhiteSpace(fallbackPrivateKeyPem))
        {
            throw new InvalidOperationException("Licensing private signing key is not configured.");
        }

        if (string.IsNullOrWhiteSpace(fallbackPublicKeyPem))
        {
            throw new InvalidOperationException("Licensing public verification key is not configured.");
        }

        return new ResolvedSigningKey(fallbackKeyId, fallbackPrivateKeyPem, fallbackPublicKeyPem);
    }

    private IReadOnlyList<ResolvedSigningKey> ResolveVerificationKeysById(string? keyId)
    {
        var keyRing = options.SigningKeys
            .Where(static key => !string.IsNullOrWhiteSpace(key.KeyId))
            .ToDictionary(key => key.KeyId.Trim(), StringComparer.Ordinal);

        if (keyRing.Count > 0)
        {
            var tokenKeyId = NormalizeOptionalValue(keyId);
            if (string.IsNullOrWhiteSpace(tokenKeyId) || !keyRing.TryGetValue(tokenKeyId, out var configuredKey))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidToken,
                    "license_token key id is not trusted.",
                    StatusCodes.Status403Forbidden);
            }

            var candidates = new List<ResolvedSigningKey>();

            var configuredPublicKeyPem = NormalizePem(configuredKey.PublicKeyPem);
            if (!string.IsNullOrWhiteSpace(configuredPublicKeyPem))
            {
                candidates.Add(new ResolvedSigningKey(tokenKeyId, string.Empty, configuredPublicKeyPem));
            }

            var derivedPublicKeyPem = TryDerivePublicKeyPem(configuredKey.PrivateKeyPem);
            if (!string.IsNullOrWhiteSpace(derivedPublicKeyPem) &&
                !candidates.Any(x => string.Equals(x.PublicKeyPem, derivedPublicKeyPem, StringComparison.Ordinal)))
            {
                candidates.Add(new ResolvedSigningKey(tokenKeyId, string.Empty, derivedPublicKeyPem));
            }

            if (candidates.Count == 0)
            {
                throw new InvalidOperationException($"Licensing signing key '{tokenKeyId}' is missing a public key.");
            }

            return candidates;
        }

        var expectedKeyId = NormalizeOptionalValue(options.SigningKeyId) ?? "smartpos-k1";
        var tokenOrExpectedKeyId = NormalizeOptionalValue(keyId) ?? expectedKeyId;
        if (!string.Equals(tokenOrExpectedKeyId, expectedKeyId, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidToken,
                "license_token key id is not trusted.",
                StatusCodes.Status403Forbidden);
        }

        var fallbackCandidates = new List<ResolvedSigningKey>();
        var configuredFallbackPublicKeyPem = NormalizePem(options.VerificationPublicKeyPem);
        if (!string.IsNullOrWhiteSpace(configuredFallbackPublicKeyPem))
        {
            fallbackCandidates.Add(new ResolvedSigningKey(expectedKeyId, string.Empty, configuredFallbackPublicKeyPem));
        }

        var derivedFallbackPublicKeyPem = TryDerivePublicKeyPemForFallbackKey(expectedKeyId);
        if (!string.IsNullOrWhiteSpace(derivedFallbackPublicKeyPem) &&
            !fallbackCandidates.Any(x => string.Equals(x.PublicKeyPem, derivedFallbackPublicKeyPem, StringComparison.Ordinal)))
        {
            // Prefer derived key first so verification matches whichever private key is actively used to sign.
            fallbackCandidates.Insert(0, new ResolvedSigningKey(expectedKeyId, string.Empty, derivedFallbackPublicKeyPem));
        }

        if (fallbackCandidates.Count == 0)
        {
            throw new InvalidOperationException("Licensing public verification key is not configured.");
        }

        return fallbackCandidates;
    }

    private string? TryDerivePublicKeyPemForFallbackKey(string keyId)
    {
        try
        {
            var signingPrivateKeyPem = ResolveSigningPrivateKeyPem(options.SigningPrivateKeyPem, keyId);
            return TryDerivePublicKeyPem(signingPrivateKeyPem);
        }
        catch (Exception ex) when (ex is InvalidOperationException or CryptographicException)
        {
            return null;
        }
    }

    private static string? TryDerivePublicKeyPem(string? privateKeyPem)
    {
        var normalizedPrivateKeyPem = NormalizePrivateKeyPem(privateKeyPem);
        if (string.IsNullOrWhiteSpace(normalizedPrivateKeyPem))
        {
            return null;
        }

        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(normalizedPrivateKeyPem.AsSpan());
            return NormalizePem(rsa.ExportSubjectPublicKeyInfoPem());
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private string ResolveSigningPrivateKeyPem(string? inlinePrivateKeyPem, string keyId)
    {
        var normalizedInline = NormalizePrivateKeyPem(inlinePrivateKeyPem);
        var envVarName = NormalizeOptionalValue(options.SigningPrivateKeyEnvironmentVariable)
                         ?? "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM";

        if (!options.DisallowInlinePrivateKey && !string.IsNullOrWhiteSpace(normalizedInline))
        {
            return normalizedInline;
        }

        var fromEnvironment = NormalizePrivateKeyPem(ResolvePemFromEnvironmentVariable(envVarName, keyId));
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        if (!string.IsNullOrWhiteSpace(normalizedInline) && options.DisallowInlinePrivateKey)
        {
            throw new InvalidOperationException(
                $"Inline licensing private key material is disabled. Configure environment variable '{envVarName}' for key '{keyId}'.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedInline))
        {
            return normalizedInline;
        }

        throw new InvalidOperationException(
            $"Licensing private signing key '{keyId}' is not configured. Set environment variable '{envVarName}'.");
    }

    private static string ResolvePemFromEnvironmentVariable(string envVarName, string keyId)
    {
        var normalizedValue = NormalizePem(Environment.GetEnvironmentVariable(envVarName));
        if (string.IsNullOrWhiteSpace(normalizedValue))
        {
            return string.Empty;
        }

        if (!TryResolvePemFilePath(normalizedValue, out var keyFilePath))
        {
            return normalizedValue;
        }

        if (!File.Exists(keyFilePath))
        {
            throw new InvalidOperationException(
                $"Licensing signing key '{keyId}' environment variable '{envVarName}' points to '{keyFilePath}', but the file was not found.");
        }

        var filePem = NormalizePem(File.ReadAllText(keyFilePath));
        if (string.IsNullOrWhiteSpace(filePem))
        {
            throw new InvalidOperationException(
                $"Licensing signing key '{keyId}' file '{keyFilePath}' is empty.");
        }

        return filePem;
    }

    private static bool TryResolvePemFilePath(string value, out string filePath)
    {
        var normalized = value.Trim();
        filePath = string.Empty;

        if (normalized.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
        {
            if (!Uri.TryCreate(normalized, UriKind.Absolute, out var fileUri) || !fileUri.IsFile)
            {
                throw new InvalidOperationException($"Invalid PEM file URI '{normalized}'.");
            }

            filePath = fileUri.LocalPath;
            return true;
        }

        if (normalized.StartsWith("~/", StringComparison.Ordinal))
        {
            var homeDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrWhiteSpace(homeDirectory))
            {
                filePath = Path.Combine(homeDirectory, normalized[2..]);
                return true;
            }
        }

        if (Path.IsPathRooted(normalized)
            || normalized.StartsWith("./", StringComparison.Ordinal)
            || normalized.StartsWith("../", StringComparison.Ordinal)
            || (normalized.IndexOfAny(new[] { '/', '\\' }) >= 0 && !LooksLikeBase64KeyBody(normalized))
            || normalized.EndsWith(".pem", StringComparison.OrdinalIgnoreCase)
            || normalized.EndsWith(".key", StringComparison.OrdinalIgnoreCase)
            || File.Exists(normalized))
        {
            filePath = normalized;
            return true;
        }

        return false;
    }

    private static string NormalizePrivateKeyPem(string? keyMaterial)
    {
        var normalized = NormalizePem(keyMaterial);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        if (normalized.Contains("-----BEGIN", StringComparison.Ordinal)
            || normalized.Contains("-----END", StringComparison.Ordinal))
        {
            return normalized;
        }

        return LooksLikeBase64KeyBody(normalized)
            ? WrapAsPem(normalized, "PRIVATE KEY")
            : normalized;
    }

    private static bool LooksLikeBase64KeyBody(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var compact = RemoveWhitespace(value);
        if (compact.Length < 128)
        {
            return false;
        }

        return compact.All(static c => char.IsLetterOrDigit(c) || c is '+' or '/' or '=');
    }

    private static string WrapAsPem(string base64Body, string label)
    {
        var compact = RemoveWhitespace(base64Body);
        var builder = new StringBuilder(capacity: compact.Length + 128);
        builder.Append("-----BEGIN ").Append(label).AppendLine("-----");

        const int lineLength = 64;
        for (var index = 0; index < compact.Length; index += lineLength)
        {
            var take = Math.Min(lineLength, compact.Length - index);
            builder.AppendLine(compact.Substring(index, take));
        }

        builder.Append("-----END ").Append(label).Append("-----");
        return builder.ToString();
    }

    private static string RemoveWhitespace(string value)
    {
        return string.Concat(value.Where(static c => !char.IsWhiteSpace(c)));
    }

    private static string NormalizePem(string? keyMaterial)
    {
        if (string.IsNullOrWhiteSpace(keyMaterial))
        {
            return string.Empty;
        }

        var normalized = keyMaterial.Trim();
        if (normalized.Length >= 2 &&
            ((normalized[0] == '"' && normalized[^1] == '"')
             || (normalized[0] == '\'' && normalized[^1] == '\'')))
        {
            normalized = normalized[1..^1].Trim();
        }

        if (normalized.Contains("-----BEGIN", StringComparison.Ordinal)
            || normalized.Contains("-----END", StringComparison.Ordinal))
        {
            normalized = normalized.Replace("\\n", "\n");
        }

        return normalized.Trim();
    }

    private string ProtectSensitiveValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        if (!options.EncryptSensitiveDataAtRest || normalized.StartsWith(EncryptedValuePrefix, StringComparison.Ordinal))
        {
            return normalized;
        }

        var key = ResolveDataEncryptionKey();
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintextBytes = Encoding.UTF8.GetBytes(normalized);
        var ciphertextBytes = new byte[plaintextBytes.Length];
        var tagBytes = new byte[16];

        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plaintextBytes, ciphertextBytes, tagBytes);

        return $"{EncryptedValuePrefix}{Base64UrlEncode(nonce)}.{Base64UrlEncode(ciphertextBytes)}.{Base64UrlEncode(tagBytes)}";
    }

    private string UnprotectSensitiveValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        if (!options.EncryptSensitiveDataAtRest || !normalized.StartsWith(EncryptedValuePrefix, StringComparison.Ordinal))
        {
            return normalized;
        }

        var payload = normalized[EncryptedValuePrefix.Length..];
        var parts = payload.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3)
        {
            throw new InvalidOperationException("Encrypted licensing value has an invalid format.");
        }

        var nonce = Base64UrlDecode(parts[0]);
        var ciphertext = Base64UrlDecode(parts[1]);
        var tag = Base64UrlDecode(parts[2]);
        var plaintext = new byte[ciphertext.Length];
        var key = ResolveDataEncryptionKey();

        using var aes = new AesGcm(key, 16);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }

    private byte[] ResolveDataEncryptionKey()
    {
        var material = ResolveDataEncryptionKeyMaterial();
        if (string.IsNullOrWhiteSpace(material))
        {
            throw new InvalidOperationException("Licensing data encryption key is not configured.");
        }

        return SHA256.HashData(Encoding.UTF8.GetBytes(material));
    }

    private string ResolveDataEncryptionKeyMaterial()
    {
        var fromConfig = NormalizeOptionalValue(options.DataEncryptionKey);
        var envVarName = NormalizeOptionalValue(options.DataEncryptionKeyEnvironmentVariable)
                         ?? "SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY";
        var fromEnvironment = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVarName));
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        return fromConfig ?? string.Empty;
    }

    private string ResolveWebhookSigningSecret()
    {
        var fromConfig = NormalizeOptionalValue(options.WebhookSecurity.SigningSecret);
        var envVarName = NormalizeOptionalValue(options.WebhookSecurity.SigningSecretEnvironmentVariable)
                         ?? "SMARTPOS_BILLING_WEBHOOK_SIGNING_SECRET";
        var fromEnvironment = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVarName));
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        if (!string.IsNullOrWhiteSpace(fromConfig))
        {
            return fromConfig;
        }

        throw new InvalidOperationException(
            $"Licensing webhook signing secret is not configured. Set '{LicenseOptions.SectionName}:WebhookSecurity:SigningSecret' or environment variable '{envVarName}'.");
    }

    private string ResolveEmergencyCommandSigningSecret()
    {
        var fromConfig = NormalizeOptionalValue(options.EmergencyCommandSigningSecret);
        var envVarName = NormalizeOptionalValue(options.EmergencyCommandSigningSecretEnvironmentVariable)
                         ?? "SMARTPOS_EMERGENCY_COMMAND_SIGNING_SECRET";
        var fromEnvironment = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVarName));
        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        if (!string.IsNullOrWhiteSpace(fromConfig))
        {
            return fromConfig;
        }

        throw new InvalidOperationException(
            $"Emergency command signing secret is not configured. Set '{LicenseOptions.SectionName}:EmergencyCommandSigningSecret' or environment variable '{envVarName}'.");
    }

    internal static string BuildActivationChallengePayload(Guid challengeId, string nonce, string deviceCode)
    {
        return $"smartpos.provision.activate|{challengeId:N}|{nonce}|{NormalizeDeviceCode(deviceCode)}";
    }

    private static bool VerifyDeviceKeySignature(byte[] payloadBytes, byte[] signatureBytes, byte[] publicKeySpkiBytes)
    {
        try
        {
            using var ecdsa = ECDsa.Create();
            ecdsa.ImportSubjectPublicKeyInfo(publicKeySpkiBytes, out _);
            return VerifySignatureWithFormat(
                       ecdsa,
                       payloadBytes,
                       signatureBytes,
                       DSASignatureFormat.Rfc3279DerSequence)
                   || VerifySignatureWithFormat(
                       ecdsa,
                       payloadBytes,
                       signatureBytes,
                       DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    private static bool VerifySignatureWithFormat(
        ECDsa ecdsa,
        byte[] payloadBytes,
        byte[] signatureBytes,
        DSASignatureFormat signatureFormat)
    {
        try
        {
            return ecdsa.VerifyData(
                payloadBytes,
                signatureBytes,
                HashAlgorithmName.SHA256,
                signatureFormat);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    private static string ComputeDeviceKeyFingerprint(byte[] publicKeySpkiBytes)
    {
        var digest = SHA256.HashData(publicKeySpkiBytes);
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private static string NormalizeKeyFingerprint(string value)
    {
        return value.Trim().ToLowerInvariant();
    }

    private static string ResolveDeviceKeyAlgorithm(string? requestedAlgorithm)
    {
        var normalized = NormalizeOptionalValue(requestedAlgorithm);
        return string.IsNullOrWhiteSpace(normalized) ? DefaultDeviceKeyAlgorithm : normalized.ToUpperInvariant();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        var padding = 4 - (normalized.Length % 4);
        if (padding is > 0 and < 4)
        {
            normalized = normalized + new string('=', padding);
        }

        return Convert.FromBase64String(normalized);
    }

    private static bool IsLicensingConfigurationException(Exception exception)
    {
        return exception is InvalidOperationException
            or CryptographicException
            or ArgumentException;
    }

    private static LicenseException CreateLicensingConfigurationException(Exception exception)
    {
        return new LicenseException(
            LicenseErrorCodes.LicensingConfigurationError,
            $"Licensing configuration error: {exception.Message}",
            StatusCodes.Status500InternalServerError);
    }

    private static string GetSignaturePart(string token)
    {
        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            return string.Empty;
        }

        return parts[1];
    }

    private static string NormalizeDeviceCode(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim();
    }

    private async Task<ResolvedActivationEntitlement?> ResolveActivationEntitlementForActivationAsync(
        string? activationEntitlementKey,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedInput = NormalizeOptionalValue(activationEntitlementKey);
        if (string.IsNullOrWhiteSpace(normalizedInput))
        {
            if (options.RequireActivationEntitlementKey || IsLocalOfflineMode())
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidActivationEntitlement,
                    "activation_entitlement_key is required.",
                    StatusCodes.Status403Forbidden);
            }

            return null;
        }

        var normalizedKey = NormalizeActivationEntitlementKey(normalizedInput);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key format is invalid.",
                StatusCodes.Status403Forbidden);
        }

        var keyHash = ComputeActivationEntitlementHash(normalizedKey);
        var entitlement = await dbContext.CustomerActivationEntitlements
            .Include(x => x.Shop)
            .FirstOrDefaultAsync(x => x.EntitlementKeyHash == keyHash, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.ActivationEntitlementNotFound,
                "activation_entitlement_key was not found.",
                StatusCodes.Status403Forbidden);

        var storedKey = NormalizeActivationEntitlementKey(UnprotectSensitiveValue(entitlement.EntitlementKey));
        if (!string.Equals(storedKey, normalizedKey, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key is invalid.",
                StatusCodes.Status403Forbidden);
        }

        if (entitlement.Status == ActivationEntitlementStatus.Revoked)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key is revoked.",
                StatusCodes.Status403Forbidden);
        }

        if (entitlement.Status == ActivationEntitlementStatus.Expired || entitlement.ExpiresAtUtc <= now)
        {
            throw new LicenseException(
                LicenseErrorCodes.ActivationEntitlementExpired,
                "activation_entitlement_key has expired.",
                StatusCodes.Status403Forbidden);
        }

        var maxActivations = Math.Max(1, entitlement.MaxActivations);
        if (entitlement.ActivationsUsed >= maxActivations)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key has no remaining activations.",
                StatusCodes.Status403Forbidden);
        }

        return new ResolvedActivationEntitlement(entitlement, entitlement.Shop);
    }

    private async Task<ResolvedActivationEntitlementLookup> ResolveActivationEntitlementByPresentedKeyAsync(
        string activationEntitlementKey,
        CancellationToken cancellationToken)
    {
        var normalizedKey = NormalizeActivationEntitlementKey(activationEntitlementKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key format is invalid.",
                StatusCodes.Status400BadRequest);
        }

        var keyHash = ComputeActivationEntitlementHash(normalizedKey);
        var entitlement = await dbContext.CustomerActivationEntitlements
            .Include(x => x.Shop)
            .FirstOrDefaultAsync(x => x.EntitlementKeyHash == keyHash, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.ActivationEntitlementNotFound,
                "activation_entitlement_key was not found.",
                StatusCodes.Status404NotFound);

        var storedKey = NormalizeActivationEntitlementKey(UnprotectSensitiveValue(entitlement.EntitlementKey));
        if (!string.Equals(storedKey, normalizedKey, StringComparison.Ordinal))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "activation_entitlement_key is invalid.",
                StatusCodes.Status404NotFound);
        }

        return new ResolvedActivationEntitlementLookup(entitlement, entitlement.Shop, normalizedKey);
    }

    private static string DetermineEntitlementState(CustomerActivationEntitlement entitlement, DateTimeOffset now)
    {
        if (entitlement.ExpiresAtUtc <= now || entitlement.Status == ActivationEntitlementStatus.Expired)
        {
            return "expired";
        }

        var maxActivations = Math.Max(1, entitlement.MaxActivations);
        if (entitlement.ActivationsUsed >= maxActivations)
        {
            return "consumed";
        }

        if (entitlement.Status == ActivationEntitlementStatus.Revoked)
        {
            return "revoked";
        }

        return "active";
    }

    private async Task<LicenseAccessDeliveryResponse?> DeliverAccessDetailsAsync(
        Shop shop,
        CustomerActivationEntitlementResponse? activationEntitlement,
        string? requestedRecipientEmail,
        string source,
        string? sourceReference,
        string actor,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (activationEntitlement is null)
        {
            return null;
        }

        var successPageUrl = BuildAccessSuccessPageUrl(activationEntitlement.ActivationEntitlementKey);
        var emailDelivery = await TrySendAccessDeliveryEmailAsync(
            shop,
            activationEntitlement,
            requestedRecipientEmail,
            successPageUrl,
            now,
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "customer_access_delivery_dispatched",
            Actor = NormalizeOptionalValue(actor) ?? "system",
            Reason = NormalizeOptionalValue(source) ?? "payment_success",
            MetadataJson = JsonSerializer.Serialize(new
            {
                source = NormalizeOptionalValue(source) ?? "payment_success",
                source_reference = NormalizeOptionalValue(sourceReference),
                success_page_url = successPageUrl,
                activation_entitlement_id = activationEntitlement.EntitlementId,
                email_recipient = emailDelivery.RecipientEmail,
                email_status = emailDelivery.Status,
                email_reason = emailDelivery.Reason
            }),
            CreatedAtUtc = now
        });

        return new LicenseAccessDeliveryResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            SuccessPageUrl = successPageUrl,
            EmailDelivery = emailDelivery,
            ProcessedAt = now
        };
    }

    private async Task<LicenseAccessEmailDeliveryResult> TrySendAccessDeliveryEmailAsync(
        Shop shop,
        CustomerActivationEntitlementResponse entitlement,
        string? requestedRecipientEmail,
        string successPageUrl,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var recipientEmail = await ResolveAccessDeliveryRecipientEmailAsync(requestedRecipientEmail, cancellationToken);
        if (string.IsNullOrWhiteSpace(recipientEmail))
        {
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = null,
                Status = "skipped",
                Reason = "no_recipient_email",
                ProcessedAt = now
            };
        }

        if (!options.AccessDeliveryEmailEnabled)
        {
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = recipientEmail,
                Status = "skipped",
                Reason = "email_delivery_disabled",
                ProcessedAt = now
            };
        }

        var smtpHost = NormalizeOptionalValue(options.AccessDeliverySmtpHost);
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = recipientEmail,
                Status = "skipped",
                Reason = "smtp_not_configured",
                ProcessedAt = now
            };
        }

        var senderEmail = NormalizeOptionalValue(options.AccessDeliveryFromEmail);
        if (string.IsNullOrWhiteSpace(senderEmail))
        {
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = recipientEmail,
                Status = "skipped",
                Reason = "sender_email_missing",
                ProcessedAt = now
            };
        }

        try
        {
            using var message = new MailMessage
            {
                From = new MailAddress(
                    senderEmail,
                    NormalizeOptionalValue(options.AccessDeliveryFromName) ?? "SmartPOS Licensing"),
                Subject = $"SmartPOS access details for {shop.Name}",
                Body = BuildAccessDeliveryEmailBody(shop, entitlement, successPageUrl),
                IsBodyHtml = false
            };
            message.To.Add(new MailAddress(recipientEmail));

            using var smtpClient = new SmtpClient(smtpHost, options.AccessDeliverySmtpPort <= 0 ? 587 : options.AccessDeliverySmtpPort)
            {
                EnableSsl = options.AccessDeliverySmtpEnableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            var smtpUsername = NormalizeOptionalValue(options.AccessDeliverySmtpUsername);
            if (!string.IsNullOrWhiteSpace(smtpUsername))
            {
                smtpClient.Credentials = new NetworkCredential(smtpUsername, ResolveAccessDeliverySmtpPassword() ?? string.Empty);
            }

            await smtpClient.SendMailAsync(message, cancellationToken);
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = recipientEmail,
                Status = "sent",
                Reason = "ok",
                ProcessedAt = now
            };
        }
        catch (Exception ex)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("license_access_email_delivery_failed");
            return new LicenseAccessEmailDeliveryResult
            {
                RecipientEmail = recipientEmail,
                Status = "failed",
                Reason = TruncateAccessDeliveryReason(ex.Message),
                ProcessedAt = now
            };
        }
    }

    private async Task<string?> ResolveAccessDeliveryRecipientEmailAsync(
        string? requestedRecipientEmail,
        CancellationToken cancellationToken)
    {
        var direct = NormalizeOptionalValue(requestedRecipientEmail);
        if (!string.IsNullOrWhiteSpace(direct))
        {
            return direct;
        }

        return await ResolveLatestShopProfileEmailAsync(cancellationToken);
    }

    private async Task<string?> ResolveLatestShopProfileEmailAsync(CancellationToken cancellationToken)
    {
        var profiles = await dbContext.ShopProfiles
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return profiles
            .OrderByDescending(profile => profile.UpdatedAtUtc ?? profile.CreatedAtUtc)
            .Select(profile => NormalizeOptionalValue(profile.Email))
            .FirstOrDefault(email => !string.IsNullOrWhiteSpace(email));
    }

    private string BuildAccessSuccessPageUrl(string activationEntitlementKey)
    {
        var baseUrl = NormalizeOptionalValue(options.AccessSuccessPageBaseUrl);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            var httpContext = httpContextAccessor.HttpContext;
            if (httpContext is not null)
            {
                baseUrl = $"{httpContext.Request.Scheme}://{httpContext.Request.Host}/license/success";
            }
            else
            {
                baseUrl = "/license/success";
            }
        }

        var separator = baseUrl.Contains('?') ? "&" : "?";
        return $"{baseUrl}{separator}activation_entitlement_key={Uri.EscapeDataString(activationEntitlementKey)}";
    }

    private InstallerDownloadAccess BuildInstallerDownloadAccessForSuccess(
        ResolvedActivationEntitlementLookup resolved,
        DateTimeOffset now)
    {
        var baseUrl = ResolveInstallerDownloadBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return new InstallerDownloadAccess(null, null, false);
        }

        if (!options.InstallerDownloadProtectedEnabled)
        {
            return new InstallerDownloadAccess(baseUrl, null, false);
        }

        try
        {
            var expiresAt = now.AddMinutes(Math.Clamp(options.InstallerDownloadTokenTtlMinutes, 1, 240));
            var token = CreateInstallerDownloadToken(
                resolved.Entitlement.Id,
                resolved.Entitlement.ShopId,
                expiresAt);
            var gatewayUrl = BuildProtectedInstallerDownloadGatewayUrl(token);
            return new InstallerDownloadAccess(gatewayUrl, expiresAt, true);
        }
        catch (InvalidOperationException)
        {
            licensingAlertMonitor.RecordSecurityAnomaly("installer_download_protected_link_not_configured");
            return new InstallerDownloadAccess(null, null, false);
        }
    }

    private string? ResolveInstallerDownloadBaseUrl()
    {
        var configured = NormalizeOptionalValue(options.InstallerDownloadBaseUrl);
        if (string.IsNullOrWhiteSpace(configured))
        {
            return null;
        }

        if (Uri.TryCreate(configured, UriKind.Absolute, out var absoluteUri) &&
            (absoluteUri.Scheme == Uri.UriSchemeHttp || absoluteUri.Scheme == Uri.UriSchemeHttps))
        {
            return absoluteUri.ToString();
        }

        if (configured.StartsWith('/'))
        {
            return configured;
        }

        throw new InvalidOperationException("InstallerDownloadBaseUrl must be absolute http(s) URL or root-relative path.");
    }

    private string BuildProtectedInstallerDownloadGatewayUrl(string token)
    {
        var encodedToken = Uri.EscapeDataString(token);
        const string downloadPath = "/api/license/public/installer-download";
        var httpContext = httpContextAccessor.HttpContext;
        if (httpContext is not null)
        {
            return $"{httpContext.Request.Scheme}://{httpContext.Request.Host}{downloadPath}?token={encodedToken}";
        }

        return $"{downloadPath}?token={encodedToken}";
    }

    private string CreateInstallerDownloadToken(
        Guid entitlementId,
        Guid shopId,
        DateTimeOffset expiresAt)
    {
        var secret = ResolveInstallerDownloadSigningSecret();
        var payload = $"{entitlementId:N}.{shopId:N}.{expiresAt.ToUnixTimeSeconds()}";
        var payloadBytes = Encoding.UTF8.GetBytes(payload);

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var signatureBytes = hmac.ComputeHash(payloadBytes);
        var payloadSegment = Base64UrlEncode(payloadBytes);
        var signatureSegment = Base64UrlEncode(signatureBytes);
        return $"{payloadSegment}.{signatureSegment}";
    }

    private InstallerDownloadTokenPayload ParseAndValidateInstallerDownloadToken(string? token)
    {
        var normalizedToken = NormalizeOptionalValue(token);
        if (string.IsNullOrWhiteSpace(normalizedToken))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download token is required.",
                StatusCodes.Status400BadRequest);
        }

        var segments = normalizedToken.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (segments.Length != 2)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download token is invalid.",
                StatusCodes.Status404NotFound);
        }

        byte[] payloadBytes;
        byte[] providedSignatureBytes;
        try
        {
            payloadBytes = Base64UrlDecode(segments[0]);
            providedSignatureBytes = Base64UrlDecode(segments[1]);
        }
        catch (FormatException)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download token is invalid.",
                StatusCodes.Status404NotFound);
        }

        var secret = ResolveInstallerDownloadSigningSecret();
        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
        {
            var expectedSignatureBytes = hmac.ComputeHash(payloadBytes);
            if (!CryptographicOperations.FixedTimeEquals(expectedSignatureBytes, providedSignatureBytes))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidActivationEntitlement,
                    "Installer download token is invalid.",
                    StatusCodes.Status404NotFound);
            }
        }

        var payloadText = Encoding.UTF8.GetString(payloadBytes);
        var payloadParts = payloadText.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (payloadParts.Length != 3 ||
            !Guid.TryParse(payloadParts[0], out var entitlementId) ||
            !Guid.TryParse(payloadParts[1], out var shopId) ||
            !long.TryParse(payloadParts[2], out var expiresAtUnix))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidActivationEntitlement,
                "Installer download token is invalid.",
                StatusCodes.Status404NotFound);
        }

        return new InstallerDownloadTokenPayload(
            entitlementId,
            shopId,
            DateTimeOffset.FromUnixTimeSeconds(expiresAtUnix));
    }

    private string ResolveInstallerDownloadSigningSecret()
    {
        var fromConfig = NormalizeOptionalValue(options.InstallerDownloadSigningSecret);
        if (!string.IsNullOrWhiteSpace(fromConfig))
        {
            return fromConfig;
        }

        var envVar = NormalizeOptionalValue(options.InstallerDownloadSigningSecretEnvironmentVariable)
            ?? "SMARTPOS_INSTALLER_DOWNLOAD_SIGNING_SECRET";
        var fromEnv = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVar));
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        throw new InvalidOperationException(
            $"Installer download signing secret is not configured. Set '{LicenseOptions.SectionName}:InstallerDownloadSigningSecret' or environment variable '{envVar}'.");
    }

    private string? ResolveAccessDeliverySmtpPassword()
    {
        var configuredPassword = NormalizeOptionalValue(options.AccessDeliverySmtpPassword);
        if (!string.IsNullOrWhiteSpace(configuredPassword))
        {
            return configuredPassword;
        }

        var envVar = NormalizeOptionalValue(options.AccessDeliverySmtpPasswordEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(envVar))
        {
            return null;
        }

        return NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVar));
    }

    private static string BuildAccessDeliveryEmailBody(
        Shop shop,
        CustomerActivationEntitlementResponse entitlement,
        string successPageUrl)
    {
        return $"""
                Hello,

                Your SmartPOS payment is verified and your access is ready.

                Shop: {shop.Name} ({shop.Code})
                Activation key: {entitlement.ActivationEntitlementKey}
                Key expires at (UTC): {entitlement.ExpiresAt:O}
                Success page: {successPageUrl}

                To activate:
                1. Open your SmartPOS app.
                2. Enter the activation key on the activation screen.
                3. Click Activate.

                If you need help, contact SmartPOS support.
                """;
    }

    private static string TruncateAccessDeliveryReason(string? value)
    {
        var normalized = NormalizeOptionalValue(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "delivery_failed";
        }

        return normalized.Length > 120 ? normalized[..120] : normalized;
    }

    private async Task<CustomerActivationEntitlementResponse?> IssueActivationEntitlementAsync(
        Shop shop,
        int maxActivations,
        string source,
        string? sourceReference,
        string actor,
        DateTimeOffset now,
        CancellationToken cancellationToken,
        int? ttlDaysOverride = null)
    {
        var normalizedSource = NormalizeOptionalValue(source) ?? "payment_success";
        var normalizedActor = NormalizeOptionalValue(actor) ?? "system";
        var normalizedSourceReference = NormalizeOptionalValue(sourceReference);
        var normalizedMaxActivations = Math.Clamp(maxActivations <= 0 ? 1 : maxActivations, 1, OfflineLocalManualBatchMaxActivations);
        var configuredTtlDays = ttlDaysOverride ?? options.ActivationEntitlementTtlDays;
        configuredTtlDays = configuredTtlDays <= 0 ? 90 : configuredTtlDays;
        var ttlDays = Math.Clamp(configuredTtlDays, 1, 3650);
        var keyPrefix = NormalizeOptionalValue(options.ActivationEntitlementKeyPrefix)?.ToUpperInvariant() ?? "SPK";

        for (var attempt = 0; attempt < 8; attempt++)
        {
            var key = GenerateActivationEntitlementKey(keyPrefix);
            var keyHash = ComputeActivationEntitlementHash(key);
            var exists = await dbContext.CustomerActivationEntitlements
                .AsNoTracking()
                .AnyAsync(x => x.EntitlementKeyHash == keyHash, cancellationToken);
            if (exists)
            {
                continue;
            }

            var entitlement = new CustomerActivationEntitlement
            {
                ShopId = shop.Id,
                Shop = shop,
                EntitlementKeyHash = keyHash,
                EntitlementKey = ProtectSensitiveValue(key),
                Source = normalizedSource,
                SourceReference = normalizedSourceReference,
                Status = ActivationEntitlementStatus.Active,
                MaxActivations = normalizedMaxActivations,
                ActivationsUsed = 0,
                IssuedBy = normalizedActor,
                IssuedAtUtc = now,
                ExpiresAtUtc = now.AddDays(ttlDays),
                LastUsedAtUtc = null,
                RevokedAtUtc = null
            };

            dbContext.CustomerActivationEntitlements.Add(entitlement);
            return MapActivationEntitlementResponse(entitlement, shop.Code, key);
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "Unable to issue activation entitlement key at this time.",
            StatusCodes.Status503ServiceUnavailable);
    }

    private CustomerActivationEntitlementResponse MapActivationEntitlementResponse(
        CustomerActivationEntitlement entitlement,
        string shopCode,
        string? plainKeyOverride = null)
    {
        return new CustomerActivationEntitlementResponse
        {
            EntitlementId = entitlement.Id,
            ShopId = entitlement.ShopId,
            ShopCode = shopCode,
            ActivationEntitlementKey = string.IsNullOrWhiteSpace(plainKeyOverride)
                ? UnprotectSensitiveValue(entitlement.EntitlementKey)
                : plainKeyOverride,
            Source = entitlement.Source,
            SourceReference = entitlement.SourceReference,
            Status = entitlement.Status.ToString().ToLowerInvariant(),
            MaxActivations = Math.Max(1, entitlement.MaxActivations),
            ActivationsUsed = Math.Max(0, entitlement.ActivationsUsed),
            IssuedBy = entitlement.IssuedBy,
            IssuedAt = entitlement.IssuedAtUtc,
            ExpiresAt = entitlement.ExpiresAtUtc,
            LastUsedAt = entitlement.LastUsedAtUtc,
            RevokedAt = entitlement.RevokedAtUtc
        };
    }

    private static void ConsumeActivationEntitlement(CustomerActivationEntitlement entitlement, DateTimeOffset now)
    {
        var maxActivations = Math.Max(1, entitlement.MaxActivations);
        entitlement.ActivationsUsed = Math.Min(maxActivations, Math.Max(0, entitlement.ActivationsUsed) + 1);
        entitlement.LastUsedAtUtc = now;
        if (entitlement.ActivationsUsed >= maxActivations)
        {
            entitlement.Status = ActivationEntitlementStatus.Revoked;
            entitlement.RevokedAtUtc ??= now;
        }
    }

    private static string GenerateActivationEntitlementKey(string prefix)
    {
        var normalizedPrefix = new string((prefix ?? "SPK")
            .Where(char.IsLetterOrDigit)
            .Select(char.ToUpperInvariant)
            .ToArray());
        if (string.IsNullOrWhiteSpace(normalizedPrefix))
        {
            normalizedPrefix = "SPK";
        }

        var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(12));
        var segments = Enumerable.Range(0, raw.Length / 4)
            .Select(index => raw.Substring(index * 4, 4))
            .ToArray();
        return $"{normalizedPrefix}-{string.Join("-", segments)}";
    }

    private static string NormalizeActivationEntitlementKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return new string(value
            .Where(char.IsLetterOrDigit)
            .Select(char.ToUpperInvariant)
            .ToArray());
    }

    private static string ComputeActivationEntitlementHash(string entitlementKey)
    {
        var normalized = NormalizeActivationEntitlementKey(entitlementKey);
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private async Task<Subscription?> ResolveSubscriptionForWebhookAsync(
        BillingWebhookEventRequest request,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return await ResolveSubscriptionByIdentifiersAsync(
            request.SubscriptionId,
            request.CustomerId,
            request.ShopCode,
            now,
            cancellationToken);
    }

    private async Task<Subscription?> ResolveSubscriptionByIdentifiersAsync(
        string? subscriptionId,
        string? customerId,
        string? shopCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var normalizedSubscriptionId = NormalizeOptionalValue(subscriptionId);
        if (!string.IsNullOrWhiteSpace(normalizedSubscriptionId))
        {
            var bySubscriptionId = await dbContext.Subscriptions
                .FirstOrDefaultAsync(x => x.BillingSubscriptionId == normalizedSubscriptionId, cancellationToken);
            if (bySubscriptionId is not null)
            {
                return bySubscriptionId;
            }
        }

        var normalizedCustomerId = NormalizeOptionalValue(customerId);
        if (!string.IsNullOrWhiteSpace(normalizedCustomerId))
        {
            var byCustomerId = await dbContext.Subscriptions
                .FirstOrDefaultAsync(x => x.BillingCustomerId == normalizedCustomerId, cancellationToken);
            if (byCustomerId is not null)
            {
                return byCustomerId;
            }
        }

        var normalizedShopCode = NormalizeOptionalValue(shopCode);
        if (!string.IsNullOrWhiteSpace(normalizedShopCode))
        {
            var shop = await GetOrCreateShopAsync(normalizedShopCode, now, cancellationToken);
            return await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        }

        return null;
    }

    private static void ApplyWebhookPeriodBounds(
        Subscription subscription,
        DateTimeOffset? periodStart,
        DateTimeOffset? periodEnd)
    {
        if (periodStart.HasValue)
        {
            subscription.PeriodStartUtc = periodStart.Value;
        }

        if (periodEnd.HasValue)
        {
            subscription.PeriodEndUtc = periodEnd.Value;
        }
    }

    private static SubscriptionStatus? MapWebhookSubscriptionStatus(string? providerStatus)
    {
        var normalized = NormalizeOptionalValue(providerStatus)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized switch
        {
            "trialing" => SubscriptionStatus.Trialing,
            "active" => SubscriptionStatus.Active,
            "past_due" => SubscriptionStatus.PastDue,
            "unpaid" => SubscriptionStatus.PastDue,
            "incomplete" => SubscriptionStatus.PastDue,
            "incomplete_expired" => SubscriptionStatus.PastDue,
            "canceled" => SubscriptionStatus.Canceled,
            _ => null
        };
    }

    private string ResolveShopCode(string? shopCode)
    {
        var requestedCode = NormalizeOptionalValue(shopCode);
        if (!string.IsNullOrWhiteSpace(requestedCode))
        {
            return requestedCode;
        }

        var defaultCode = NormalizeOptionalValue(options.DefaultShopCode);
        return string.IsNullOrWhiteSpace(defaultCode) ? "default" : defaultCode;
    }

    private string ResolveBranchCode(string? branchCode, string? fallbackBranchCode = null)
    {
        var requested = NormalizeOptionalValue(branchCode);
        var fallback = NormalizeOptionalValue(fallbackBranchCode);
        var configuredDefault = NormalizeOptionalValue(options.DefaultBranchCode);

        var resolved = requested ??
                       fallback ??
                       configuredDefault ??
                       "main";
        var normalized = resolved.Trim().ToLowerInvariant();
        if (normalized.Length is < 1 or > 64)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "branch_code must be between 1 and 64 characters.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Any(ch => !AllowedBranchCodeCharacters.Contains(ch)))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "branch_code may only contain lowercase letters, numbers, '-' or '_'.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string? ExtractStripeErrorMessage(string? payload)
    {
        var raw = NormalizeOptionalValue(payload);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            if (!TryGetObject(document.RootElement, "error", out var errorObject))
            {
                return null;
            }

            return TryGetString(errorObject, "message");
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGetObject(JsonElement source, string propertyName, out JsonElement value)
    {
        if (source.ValueKind == JsonValueKind.Object &&
            source.TryGetProperty(propertyName, out var candidate) &&
            candidate.ValueKind == JsonValueKind.Object)
        {
            value = candidate;
            return true;
        }

        value = default;
        return false;
    }

    private static string? TryGetString(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object ||
            !source.TryGetProperty(propertyName, out var candidate))
        {
            return null;
        }

        return candidate.ValueKind switch
        {
            JsonValueKind.String => NormalizeOptionalValue(candidate.GetString()),
            JsonValueKind.Number => candidate.ToString(),
            _ => null
        };
    }

    private static DateTimeOffset? TryGetUnixTimestamp(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object ||
            !source.TryGetProperty(propertyName, out var candidate))
        {
            return null;
        }

        long unixSeconds;
        if (candidate.ValueKind == JsonValueKind.Number && candidate.TryGetInt64(out unixSeconds))
        {
            return SafeFromUnixTimeSeconds(unixSeconds);
        }

        if (candidate.ValueKind == JsonValueKind.String &&
            long.TryParse(candidate.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out unixSeconds))
        {
            return SafeFromUnixTimeSeconds(unixSeconds);
        }

        return null;
    }

    private static DateTimeOffset? SafeFromUnixTimeSeconds(long unixSeconds)
    {
        try
        {
            return DateTimeOffset.FromUnixTimeSeconds(unixSeconds);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
    }

    private static Guid? TryParseGuid(string? value)
    {
        var normalized = NormalizeOptionalValue(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return Guid.TryParse(normalized, out var parsed) ? parsed : null;
    }

    private static string? TryGetNestedString(
        JsonElement source,
        string parentPropertyName,
        string leafPropertyName)
    {
        return TryGetObject(source, parentPropertyName, out var parentObject)
            ? TryGetString(parentObject, leafPropertyName)
            : null;
    }

    private static string? TryGetNestedString(
        JsonElement source,
        string parentPropertyName,
        string arrayPropertyName,
        string nestedPropertyName,
        string leafPropertyName)
    {
        if (!TryGetObject(source, parentPropertyName, out var parentObject) ||
            parentObject.ValueKind != JsonValueKind.Object ||
            !parentObject.TryGetProperty(arrayPropertyName, out var arrayElement) ||
            arrayElement.ValueKind != JsonValueKind.Array ||
            arrayElement.GetArrayLength() == 0)
        {
            return null;
        }

        var firstItem = arrayElement[0];
        if (firstItem.ValueKind != JsonValueKind.Object ||
            !firstItem.TryGetProperty(nestedPropertyName, out var nestedElement))
        {
            return null;
        }

        return nestedElement.ValueKind == JsonValueKind.Object
            ? TryGetString(nestedElement, leafPropertyName)
            : null;
    }

    private static DateTimeOffset? TryGetNestedUnixTimestamp(
        JsonElement source,
        string parentPropertyName,
        string arrayPropertyName,
        string nestedPropertyName,
        string leafPropertyName)
    {
        if (!TryGetObject(source, parentPropertyName, out var parentObject) ||
            parentObject.ValueKind != JsonValueKind.Object ||
            !parentObject.TryGetProperty(arrayPropertyName, out var arrayElement) ||
            arrayElement.ValueKind != JsonValueKind.Array ||
            arrayElement.GetArrayLength() == 0)
        {
            return null;
        }

        var firstItem = arrayElement[0];
        if (firstItem.ValueKind != JsonValueKind.Object ||
            !firstItem.TryGetProperty(nestedPropertyName, out var nestedElement) ||
            nestedElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return TryGetUnixTimestamp(nestedElement, leafPropertyName);
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Replace("\"", "\"\"", StringComparison.Ordinal);
        if (normalized.Contains(',') ||
            normalized.Contains('"') ||
            normalized.Contains('\n') ||
            normalized.Contains('\r'))
        {
            return $"\"{normalized}\"";
        }

        return normalized;
    }

    private RequestSourceContext ResolveRequestSourceContext()
    {
        return RequestSourceContext.FromHttpContext(httpContextAccessor.HttpContext);
    }

    private static string ResolveDeviceName(string? requestName, string? fallbackName = null)
    {
        if (!string.IsNullOrWhiteSpace(requestName))
        {
            return requestName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(fallbackName))
        {
            return fallbackName;
        }

        return "POS Device";
    }

    private LicenseStatusResponse CreateResponse(LicenseStatusSnapshot snapshot)
    {
        var response = new LicenseStatusResponse
        {
            State = snapshot.State.ToString().ToLowerInvariant(),
            ShopId = snapshot.ShopId,
            TerminalId = snapshot.DeviceCode,
            DeviceCode = snapshot.DeviceCode,
            BranchCode = snapshot.BranchCode,
            SubscriptionStatus = snapshot.SubscriptionStatus?.ToString().ToLowerInvariant(),
            Plan = snapshot.Plan,
            SeatLimit = snapshot.SeatLimit,
            ActiveSeats = snapshot.ActiveSeats,
            ValidUntil = snapshot.ValidUntil,
            GraceUntil = snapshot.GraceUntil,
            LicenseToken = snapshot.LicenseToken,
            DeviceKeyFingerprint = snapshot.DeviceKeyFingerprint,
            BlockedActions = snapshot.BlockedActions,
            ServerTime = snapshot.ServerTime
        };

        var offlineGrant = CreateOfflineGrant(response, snapshot.ServerTime);
        if (offlineGrant is not null)
        {
            response.OfflineGrantToken = offlineGrant.Token;
            response.OfflineGrantExpiresAt = offlineGrant.ExpiresAt;
            response.OfflineMaxCheckoutOperations = offlineGrant.MaxCheckoutOperations;
            response.OfflineMaxRefundOperations = offlineGrant.MaxRefundOperations;
        }

        var policySnapshot = CreatePolicySnapshot(response, snapshot.ServerTime);
        if (policySnapshot is not null)
        {
            response.PolicySnapshotToken = policySnapshot.Token;
            response.PolicySnapshotExpiresAt = policySnapshot.ExpiresAt;
        }

        return response;
    }

    private OfflineGrantResult? CreateOfflineGrant(LicenseStatusResponse response, DateTimeOffset now)
    {
        if (response.State is not "active" and not "grace")
        {
            return null;
        }

        if (!response.ShopId.HasValue || string.IsNullOrWhiteSpace(response.DeviceCode))
        {
            return null;
        }

        var configuredMaxHours = options.OfflineGrantMaxHours <= 0 ? 72 : options.OfflineGrantMaxHours;
        var maxHours = Math.Clamp(configuredMaxHours, 24, 72);
        var configuredTtlHours = options.OfflineGrantTtlHours <= 0 ? maxHours : options.OfflineGrantTtlHours;
        var ttlHours = Math.Clamp(configuredTtlHours, 24, maxHours);
        var expiresAt = now.AddHours(ttlHours);
        var key = ResolveActiveSigningKey();
        var payload = new OfflineGrantTokenPayload
        {
            Type = "offline_grant",
            GrantId = Guid.NewGuid(),
            ShopId = response.ShopId.Value,
            DeviceCode = response.DeviceCode,
            DeviceKeyFingerprint = response.DeviceKeyFingerprint,
            IssuedAt = now,
            ExpiresAt = expiresAt,
            KeyId = key.KeyId,
            MaxCheckoutOperations = Math.Max(0, options.OfflineMaxCheckoutOperations),
            MaxRefundOperations = Math.Max(0, options.OfflineMaxRefundOperations)
        };

        return new OfflineGrantResult(SignOfflineGrantToken(payload, key), expiresAt, payload.MaxCheckoutOperations, payload.MaxRefundOperations);
    }

    private PolicySnapshotResult? CreatePolicySnapshot(LicenseStatusResponse response, DateTimeOffset now)
    {
        if (!response.ShopId.HasValue || string.IsNullOrWhiteSpace(response.DeviceCode))
        {
            return null;
        }

        var configuredTtlMinutes = options.OfflinePolicySnapshotTtlMinutes;
        var ttlMinutes = Math.Clamp(configuredTtlMinutes, 0, 1440);
        var expiresAt = now.AddMinutes(ttlMinutes);
        var key = ResolveActiveSigningKey();
        var payload = new PolicySnapshotTokenPayload
        {
            Type = "policy_snapshot",
            ShopId = response.ShopId.Value,
            DeviceCode = response.DeviceCode,
            BranchCode = response.BranchCode,
            State = response.State,
            BlockedActions = response.BlockedActions
                .Where(action => !string.IsNullOrWhiteSpace(action))
                .Select(action => action.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            IssuedAt = now,
            ExpiresAt = expiresAt,
            KeyId = key.KeyId
        };

        return new PolicySnapshotResult(SignPolicySnapshotToken(payload, key), expiresAt);
    }

    private string SignOfflineGrantToken(OfflineGrantTokenPayload payload, ResolvedSigningKey signingKey)
    {
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, TokenSerializerOptions);
        var payloadSegment = Base64UrlEncode(payloadBytes);
        var signatureSegment = Base64UrlEncode(SignPayload(payloadSegment, signingKey.PrivateKeyPem));
        return $"{payloadSegment}.{signatureSegment}";
    }

    private string SignPolicySnapshotToken(PolicySnapshotTokenPayload payload, ResolvedSigningKey signingKey)
    {
        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, TokenSerializerOptions);
        var payloadSegment = Base64UrlEncode(payloadBytes);
        var signatureSegment = Base64UrlEncode(SignPayload(payloadSegment, signingKey.PrivateKeyPem));
        return $"{payloadSegment}.{signatureSegment}";
    }

    private sealed class LicenseTokenPayload
    {
        public Guid LicenseId { get; set; }
        public Guid ShopId { get; set; }
        public string DeviceCode { get; set; } = string.Empty;
        public DateTimeOffset ValidUntil { get; set; }
        public DateTimeOffset IssuedAt { get; set; }
        public string KeyId { get; set; } = string.Empty;
        public string SubscriptionStatus { get; set; } = string.Empty;
        public string Plan { get; set; } = string.Empty;
        public int SeatLimit { get; set; }
        public string? DeviceKeyFingerprint { get; set; }
        public string? Jti { get; set; }
    }

    private sealed class OfflineGrantTokenPayload
    {
        public string Type { get; set; } = "offline_grant";
        public Guid GrantId { get; set; }
        public Guid ShopId { get; set; }
        public string DeviceCode { get; set; } = string.Empty;
        public string? DeviceKeyFingerprint { get; set; }
        public DateTimeOffset IssuedAt { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
        public string KeyId { get; set; } = string.Empty;
        public int MaxCheckoutOperations { get; set; }
        public int MaxRefundOperations { get; set; }
    }

    private sealed class PolicySnapshotTokenPayload
    {
        public string Type { get; set; } = "policy_snapshot";
        public Guid ShopId { get; set; }
        public string DeviceCode { get; set; } = string.Empty;
        public string? BranchCode { get; set; }
        public string State { get; set; } = string.Empty;
        public List<string> BlockedActions { get; set; } = [];
        public DateTimeOffset IssuedAt { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
        public string KeyId { get; set; } = string.Empty;
    }

    private sealed class EmergencyCommandEnvelopePayload
    {
        public Guid CommandId { get; set; }
        public string DeviceCode { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string Nonce { get; set; } = string.Empty;
        public string Actor { get; set; } = string.Empty;
        public string ReasonCode { get; set; } = string.Empty;
        public string ActorNote { get; set; } = string.Empty;
        public long IssuedAtUnix { get; set; }
        public long ExpiresAtUnix { get; set; }
    }

    private sealed record DeviceKeyBindingProof(
        string Fingerprint,
        string PublicKeySpki,
        string KeyAlgorithm,
        Guid ChallengeId);
    private sealed record OfflineGrantResult(
        string Token,
        DateTimeOffset ExpiresAt,
        int MaxCheckoutOperations,
        int MaxRefundOperations);
    private sealed record PolicySnapshotResult(
        string Token,
        DateTimeOffset ExpiresAt);
    private sealed record ResolvedCurrentShopContext(
        Shop Shop,
        string CurrentDeviceCode);
    private sealed record ResolvedActivationEntitlement(
        CustomerActivationEntitlement Entitlement,
        Shop Shop);
    private sealed record ResolvedActivationEntitlementLookup(
        CustomerActivationEntitlement Entitlement,
        Shop Shop,
        string NormalizedKeyForDisplay);
    private sealed record ValidatedMarketingProofFile(
        BillFileData FileData,
        string Extension,
        long SizeBytes);
    private sealed record InstallerDownloadTokenPayload(
        Guid EntitlementId,
        Guid ShopId,
        DateTimeOffset ExpiresAt);
    private sealed record BillingReconciliationDriftCandidate(
        Guid ShopId,
        string? BillingSubscriptionId,
        string? BillingCustomerId,
        DateTimeOffset PeriodEndUtc,
        SubscriptionStatus Status,
        DateTimeOffset CreatedAtUtc);
    private sealed record IssuedLicenseResult(LicenseRecord Record, string PlainToken);
    private sealed record LicenseReissueOutcome(int ReissuedCount, int RevokedCount, int ActiveDeviceCount);
    private sealed record ResolvedSigningKey(string KeyId, string PrivateKeyPem, string PublicKeyPem);
}

public sealed record LicenseGuardDecision(
    bool AllowRequest,
    string? ErrorCode,
    string? Message,
    int StatusCode,
    LicenseState? State)
{
    public static LicenseGuardDecision Allow(LicenseState? state = null)
        => new(true, null, null, StatusCodes.Status200OK, state);

    public static LicenseGuardDecision Deny(string errorCode, string message, int statusCode, LicenseState? state = null)
        => new(false, errorCode, message, statusCode, state);
}

internal sealed record LicenseStatusSnapshot
{
    public LicenseState State { get; init; } = LicenseState.Unprovisioned;
    public Guid? ShopId { get; init; }
    public string DeviceCode { get; init; } = string.Empty;
    public string? BranchCode { get; init; }
    public SubscriptionStatus? SubscriptionStatus { get; init; }
    public string? Plan { get; init; }
    public int? SeatLimit { get; init; }
    public int? ActiveSeats { get; init; }
    public DateTimeOffset? ValidUntil { get; init; }
    public DateTimeOffset? GraceUntil { get; init; }
    public string? LicenseToken { get; init; }
    public string? DeviceKeyFingerprint { get; init; }
    public List<string> BlockedActions { get; init; } = [];
    public DateTimeOffset ServerTime { get; init; }

    public static LicenseStatusSnapshot Unprovisioned(string deviceCode, DateTimeOffset now)
        => new()
        {
            State = LicenseState.Unprovisioned,
            DeviceCode = deviceCode,
            ServerTime = now
        };
}

public sealed record OfflineGrantValidationSnapshot(
    Guid GrantId,
    Guid ShopId,
    string DeviceCode,
    string? DeviceKeyFingerprint,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt,
    int MaxCheckoutOperations,
    int MaxRefundOperations,
    int UsedCheckoutOperations,
    int UsedRefundOperations);
