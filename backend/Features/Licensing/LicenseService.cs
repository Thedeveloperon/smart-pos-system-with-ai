using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicenseService(
    SmartPosDbContext dbContext,
    IOptions<LicenseOptions> optionsAccessor,
    LicensingMetrics metrics)
{
    private static readonly HashSet<string> SupportedBillingWebhookEvents = new(StringComparer.OrdinalIgnoreCase)
    {
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted"
    };
    private const string WebhookEventStatusProcessing = "processing";
    private const string WebhookEventStatusProcessed = "processed";
    private const string WebhookEventStatusFailed = "failed";
    private const string EncryptedValuePrefix = "enc:v1:";

    private static readonly JsonSerializerOptions TokenSerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly LicenseOptions options = optionsAccessor.Value;
    private readonly Dictionary<string, LicensePlanDefinition> planCatalog = BuildPlanCatalog(optionsAccessor.Value);

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
        var shop = await GetOrCreateDefaultShopAsync(now, cancellationToken);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        if (subscription.Status == SubscriptionStatus.Canceled)
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "Subscription is canceled. Device activation is blocked.",
                StatusCodes.Status403Forbidden);
        }

        var existingDevice = await dbContext.ProvisionedDevices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken);

        var seatLimit = ResolveSeatLimit(subscription);
        var activeSeats = await dbContext.ProvisionedDevices
            .CountAsync(
                x => x.ShopId == shop.Id && x.Status == ProvisionedDeviceStatus.Active &&
                     (existingDevice == null || x.Id != existingDevice.Id),
                cancellationToken);

        var requiresSeat = existingDevice is null || existingDevice.Status != ProvisionedDeviceStatus.Active;
        if (requiresSeat && activeSeats >= seatLimit)
        {
            throw new LicenseException(
                LicenseErrorCodes.SeatLimitExceeded,
                "Device activation failed because seat limit has been reached.",
                StatusCodes.Status409Conflict);
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
                Status = ProvisionedDeviceStatus.Active,
                AssignedAtUtc = now,
                LastHeartbeatAtUtc = now,
                Shop = shop
            };
            dbContext.ProvisionedDevices.Add(existingDevice);
        }
        else
        {
            existingDevice.Name = ResolveDeviceName(request.DeviceName, existingDevice.Name);
            existingDevice.DeviceId = appDevice?.Id ?? existingDevice.DeviceId;
            existingDevice.Status = ProvisionedDeviceStatus.Active;
            existingDevice.AssignedAtUtc = now;
            existingDevice.RevokedAtUtc = null;
            existingDevice.LastHeartbeatAtUtc = now;
        }

        var issuedLicense = await IssueLicenseAsync(shop, existingDevice, subscription, now, cancellationToken);
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
                seat_limit = seatLimit,
                active_seats = activeSeats + (requiresSeat ? 1 : 0),
                subscription_status = subscription.Status.ToString().ToLowerInvariant()
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        metrics.RecordActivation();

        var status = await ResolveStatusSnapshotAsync(deviceCode, issuedLicense.PlainToken, strictTokenValidation: true, cancellationToken);
        return ToResponse(status with { LicenseToken = issuedLicense.PlainToken });
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

        var activeLicenses = await dbContext.Licenses
            .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == LicenseRecordStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var activeLicense in activeLicenses)
        {
            activeLicense.Status = LicenseRecordStatus.Revoked;
            activeLicense.RevokedAtUtc = now;
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "provision_deactivate",
            Actor = string.IsNullOrWhiteSpace(request.Actor) ? "system" : request.Actor.Trim(),
            Reason = request.Reason,
            MetadataJson = JsonSerializer.Serialize(new { device_code = deviceCode })
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
        return ToResponse(status);
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

        var snapshot = await ResolveStatusSnapshotAsync(
            normalizedDeviceCode,
            licenseToken,
            strictTokenValidation: !string.IsNullOrWhiteSpace(licenseToken),
            cancellationToken);

        return ToResponse(snapshot);
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
        var currentStatus = await ResolveStatusSnapshotAsync(
            deviceCode,
            request.LicenseToken,
            strictTokenValidation: true,
            cancellationToken);

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

        var refreshedLicense = await IssueLicenseAsync(
            (await dbContext.Shops.FirstAsync(x => x.Id == provisionedDevice.ShopId, cancellationToken)),
            provisionedDevice,
            subscription,
            now,
            cancellationToken);

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "license_heartbeat",
            Actor = "device",
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = deviceCode,
                issued_license_id = refreshedLicense.Record.Id
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        var status = await ResolveStatusSnapshotAsync(deviceCode, refreshedLicense.PlainToken, strictTokenValidation: true, cancellationToken);
        return ToResponse(status with { LicenseToken = refreshedLicense.PlainToken });
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

            return new BillingWebhookEventResponse
            {
                EventType = eventType,
                Handled = false,
                Reason = "duplicate_event",
                ShopId = existingEvent.ShopId,
                SubscriptionId = existingEvent.BillingSubscriptionId,
                ProcessedAt = now
            };
        }

        var subscription = await ResolveSubscriptionForWebhookAsync(request, now, cancellationToken);
        if (subscription is null)
        {
            await MarkWebhookEventFailedAsync(eventLog, LicenseErrorCodes.InvalidWebhook, now, cancellationToken);
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

            var shopCode = await dbContext.Shops
                .Where(x => x.Id == subscription.ShopId)
                .Select(x => x.Code)
                .FirstOrDefaultAsync(cancellationToken);

            dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
            {
                ShopId = subscription.ShopId,
                Action = "billing_webhook_processed",
                Actor = string.IsNullOrWhiteSpace(request.Actor) ? "billing-webhook" : request.Actor.Trim(),
                MetadataJson = JsonSerializer.Serialize(new
                {
                    event_id = providerEventId,
                    event_type = eventType,
                    occurred_at = request.OccurredAt,
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
                    string.IsNullOrWhiteSpace(request.Actor) ? "billing-webhook" : request.Actor.Trim(),
                    "subscription_status_or_plan_changed",
                    excludedProvisionedDeviceId: null,
                    cancellationToken);
            }

            eventLog.Status = WebhookEventStatusProcessed;
            eventLog.ShopId = subscription.ShopId;
            eventLog.BillingSubscriptionId = subscription.BillingSubscriptionId;
            eventLog.LastErrorCode = null;
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
                ProcessedAt = now
            };
        }
        catch (LicenseException ex)
        {
            await MarkWebhookEventFailedAsync(eventLog, ex.Code, now, cancellationToken);
            throw;
        }
        catch (Exception ex)
        {
            await MarkWebhookEventFailedAsync(eventLog, ex.GetType().Name, now, cancellationToken);
            throw;
        }
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

    public async Task<AdminShopsLicensingSnapshotResponse> GetAdminShopsSnapshotAsync(
        string? search,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedSearch = NormalizeOptionalValue(search)?.ToLowerInvariant();

        var shopsQuery = dbContext.Shops.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            shopsQuery = shopsQuery.Where(x =>
                x.Code.ToLower().Contains(normalizedSearch) ||
                x.Name.ToLower().Contains(normalizedSearch));
        }

        var shops = await shopsQuery
            .OrderBy(x => x.Code)
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

        var rows = new List<AdminShopLicensingSnapshotRow>(shops.Count);

        foreach (var shop in shops)
        {
            latestSubscriptionByShop.TryGetValue(shop.Id, out var subscription);
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
                SubscriptionStatus = (subscription?.Status ?? SubscriptionStatus.Trialing).ToString().ToLowerInvariant(),
                Plan = subscription?.Plan ?? ResolvePlanCode(options.DefaultPlan),
                SeatLimit = seatLimit,
                ActiveSeats = shopDevices.Count(x => x.Status == ProvisionedDeviceStatus.Active),
                TotalDevices = shopDevices.Count,
                Devices = deviceRows
            });
        }

        return new AdminShopsLicensingSnapshotResponse
        {
            GeneratedAt = now,
            Items = rows
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

        var actor = string.IsNullOrWhiteSpace(request.Actor) ? "support-admin" : request.Actor.Trim();
        var reason = NormalizeOptionalValue(request.Reason) ?? "manual_device_revoke";
        var status = await DeactivateAsync(new ProvisionDeactivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = actor,
            Reason = reason
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_revoke",
            actor,
            reason,
            new { device_code = normalizedDeviceCode },
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

        var actor = string.IsNullOrWhiteSpace(request.Actor) ? "support-admin" : request.Actor.Trim();
        var reason = NormalizeOptionalValue(request.Reason) ?? "manual_device_reactivate";
        var status = await ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = normalizedDeviceCode,
            Actor = actor,
            Reason = reason
        }, cancellationToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_device_reactivate",
            actor,
            reason,
            new { device_code = normalizedDeviceCode },
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

        var reason = NormalizeOptionalValue(request.Reason);
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reason is required when extending grace.",
                StatusCodes.Status400BadRequest);
        }

        var extendDays = Math.Clamp(request.ExtendDays, 1, 30);
        var actor = string.IsNullOrWhiteSpace(request.Actor) ? "support-admin" : request.Actor.Trim();
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

        var activeLicenses = await dbContext.Licenses
            .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == LicenseRecordStatus.Active)
            .ToListAsync(cancellationToken);

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
            Actor = actor,
            Reason = reason,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                extend_days = extendDays,
                previous_grace_until = previousGraceUntil,
                updated_grace_until = updatedGraceUntil
            })
        });

        await AddManualOverrideAuditLogAsync(
            provisionedDevice.ShopId,
            provisionedDevice.Id,
            "manual_override_extend_grace",
            actor,
            reason,
            new
            {
                device_code = normalizedDeviceCode,
                extend_days = extendDays,
                previous_grace_until = previousGraceUntil,
                updated_grace_until = updatedGraceUntil
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
        var actor = string.IsNullOrWhiteSpace(request.Actor) ? "security-admin" : request.Actor.Trim();
        var reason = NormalizeOptionalValue(request.Reason) ?? "manual_license_resync";

        var shop = await GetOrCreateShopAsync(request.ShopCode, now, cancellationToken);
        var subscription = await GetOrCreateSubscriptionAsync(shop, now, cancellationToken);
        var outcome = await ForceReissueLicensesForShopAsync(
            shop,
            subscription,
            now,
            actor,
            "manual_resync",
            excludedProvisionedDeviceId: null,
            cancellationToken);

        await AddManualOverrideAuditLogAsync(
            shop.Id,
            null,
            "manual_override_force_resync",
            actor,
            reason,
            new
            {
                shop_code = shop.Code,
                reissued_devices = outcome.ReissuedCount,
                revoked_licenses = outcome.RevokedCount,
                active_devices = outcome.ActiveDeviceCount
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

        var signingSecret = options.WebhookSecurity.SigningSecret;
        if (string.IsNullOrWhiteSpace(signingSecret))
        {
            throw new InvalidOperationException("Licensing webhook signing secret is not configured.");
        }

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
        CancellationToken cancellationToken)
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

        return LicenseGuardDecision.Allow(status.State);
    }

    public string ResolveDeviceCode(string? explicitDeviceCode, HttpContext httpContext)
    {
        if (!string.IsNullOrWhiteSpace(explicitDeviceCode))
        {
            return NormalizeDeviceCode(explicitDeviceCode);
        }

        if (httpContext.Request.Headers.TryGetValue("X-Device-Code", out var headerDeviceCode))
        {
            var fromHeader = NormalizeDeviceCode(headerDeviceCode.FirstOrDefault());
            if (!string.IsNullOrWhiteSpace(fromHeader))
            {
                return fromHeader;
            }
        }

        var claimValue = httpContext.User.FindFirstValue("device_code");
        return NormalizeDeviceCode(claimValue);
    }

    public string? ResolveLicenseToken(HttpContext httpContext)
    {
        if (httpContext.Request.Headers.TryGetValue("X-License-Token", out var headerToken))
        {
            var token = headerToken.FirstOrDefault()?.Trim();
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }

        return null;
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

    public bool IsEnforcementEnabled() => options.EnforceProtectedRoutes;

    private async Task<LicenseStatusSnapshot> ResolveStatusSnapshotAsync(
        string deviceCode,
        string? licenseToken,
        bool strictTokenValidation,
        CancellationToken cancellationToken)
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
            cancellationToken);

        if (licenseRecord is null)
        {
            return LicenseStatusSnapshot.Unprovisioned(normalizedDeviceCode, now) with
            {
                ShopId = provisionedDevice.ShopId,
                SubscriptionStatus = subscription?.Status,
                Plan = subscription?.Plan,
                SeatLimit = subscription is null ? null : ResolveSeatLimit(subscription),
                ActiveSeats = await CountActiveSeatsAsync(provisionedDevice.ShopId, cancellationToken)
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
            SubscriptionStatus = subscription?.Status,
            Plan = subscription?.Plan,
            SeatLimit = subscription is null ? null : ResolveSeatLimit(subscription),
            ActiveSeats = await CountActiveSeatsAsync(provisionedDevice.ShopId, cancellationToken),
            ValidUntil = licenseRecord.ValidUntil,
            GraceUntil = licenseRecord.GraceUntil,
            LicenseToken = UnprotectSensitiveValue(licenseRecord.Token),
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
        CancellationToken cancellationToken)
    {
        var activeSigningKey = ResolveActiveSigningKey();
        var validUntil = now.AddHours(Math.Max(1, options.TokenTtlHours));
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
            SeatLimit = ResolveSeatLimit(subscription)
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

        foreach (var staleLicense in staleActiveLicenses)
        {
            staleLicense.Status = LicenseRecordStatus.Revoked;
            staleLicense.RevokedAtUtc = now;
        }

        return new IssuedLicenseResult(record, token);
    }

    private LicenseState DetermineState(
        ProvisionedDevice device,
        Subscription? subscription,
        LicenseRecord license,
        DateTimeOffset now)
    {
        if (device.Status == ProvisionedDeviceStatus.Revoked || license.Status == LicenseRecordStatus.Revoked)
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

    private async Task<BillingWebhookEvent?> ReserveWebhookEventAsync(
        string providerEventId,
        string eventType,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.BillingWebhookEvents
            .FirstOrDefaultAsync(x => x.ProviderEventId == providerEventId, cancellationToken);

        if (existing is null)
        {
            var newEvent = new BillingWebhookEvent
            {
                ProviderEventId = providerEventId,
                EventType = eventType,
                Status = WebhookEventStatusProcessing,
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
                    ? await ResetFailedWebhookEventAsync(raceWinner, now, cancellationToken)
                    : null;
            }
        }

        return string.Equals(existing.Status, WebhookEventStatusFailed, StringComparison.OrdinalIgnoreCase)
            ? await ResetFailedWebhookEventAsync(existing, now, cancellationToken)
            : null;
    }

    private async Task<BillingWebhookEvent> ResetFailedWebhookEventAsync(
        BillingWebhookEvent existing,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        existing.Status = WebhookEventStatusProcessing;
        existing.LastErrorCode = null;
        existing.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        return existing;
    }

    private async Task MarkWebhookEventFailedAsync(
        BillingWebhookEvent eventLog,
        string errorCode,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        eventLog.Status = WebhookEventStatusFailed;
        eventLog.LastErrorCode = NormalizeOptionalValue(errorCode) ?? "UNKNOWN";
        eventLog.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
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
        }
        else
        {
            foreach (var device in activeDevices)
            {
                await IssueLicenseAsync(shop, device, subscription, now, cancellationToken);
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
        var verificationKey = ResolveVerificationKeyById(keyId);

        using var rsa = RSA.Create();
        rsa.ImportFromPem(verificationKey.PublicKeyPem.AsSpan());

        return rsa.VerifyData(
            Encoding.UTF8.GetBytes(payloadSegment),
            signatureBytes,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
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

    private ResolvedSigningKey ResolveVerificationKeyById(string? keyId)
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

            var publicKeyPem = NormalizePem(configuredKey.PublicKeyPem);
            if (string.IsNullOrWhiteSpace(publicKeyPem))
            {
                throw new InvalidOperationException($"Licensing signing key '{tokenKeyId}' is missing a public key.");
            }

            return new ResolvedSigningKey(tokenKeyId, string.Empty, publicKeyPem);
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

        var publicKeyPemFallback = NormalizePem(options.VerificationPublicKeyPem);
        if (string.IsNullOrWhiteSpace(publicKeyPemFallback))
        {
            throw new InvalidOperationException("Licensing public verification key is not configured.");
        }

        return new ResolvedSigningKey(expectedKeyId, string.Empty, publicKeyPemFallback);
    }

    private string ResolveSigningPrivateKeyPem(string? inlinePrivateKeyPem, string keyId)
    {
        var normalizedInline = NormalizePem(inlinePrivateKeyPem);
        var envVarName = NormalizeOptionalValue(options.SigningPrivateKeyEnvironmentVariable)
                         ?? "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM";

        if (!options.DisallowInlinePrivateKey && !string.IsNullOrWhiteSpace(normalizedInline))
        {
            return normalizedInline;
        }

        var fromEnvironment = NormalizePem(Environment.GetEnvironmentVariable(envVarName));
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

    private static string NormalizePem(string? keyMaterial)
    {
        return string.IsNullOrWhiteSpace(keyMaterial)
            ? string.Empty
            : keyMaterial.Replace("\\n", "\n").Trim();
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
        var material = NormalizeOptionalValue(options.DataEncryptionKey);
        if (string.IsNullOrWhiteSpace(material))
        {
            throw new InvalidOperationException("Licensing data encryption key is not configured.");
        }

        return SHA256.HashData(Encoding.UTF8.GetBytes(material));
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

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
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

    private static LicenseStatusResponse ToResponse(LicenseStatusSnapshot snapshot)
    {
        return new LicenseStatusResponse
        {
            State = snapshot.State.ToString().ToLowerInvariant(),
            ShopId = snapshot.ShopId,
            DeviceCode = snapshot.DeviceCode,
            SubscriptionStatus = snapshot.SubscriptionStatus?.ToString().ToLowerInvariant(),
            Plan = snapshot.Plan,
            SeatLimit = snapshot.SeatLimit,
            ActiveSeats = snapshot.ActiveSeats,
            ValidUntil = snapshot.ValidUntil,
            GraceUntil = snapshot.GraceUntil,
            LicenseToken = snapshot.LicenseToken,
            BlockedActions = snapshot.BlockedActions,
            ServerTime = snapshot.ServerTime
        };
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
    }

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
    public SubscriptionStatus? SubscriptionStatus { get; init; }
    public string? Plan { get; init; }
    public int? SeatLimit { get; init; }
    public int? ActiveSeats { get; init; }
    public DateTimeOffset? ValidUntil { get; init; }
    public DateTimeOffset? GraceUntil { get; init; }
    public string? LicenseToken { get; init; }
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
