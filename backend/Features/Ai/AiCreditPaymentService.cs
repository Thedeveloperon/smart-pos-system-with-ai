using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiCreditPaymentService(
    SmartPosDbContext dbContext,
    AiCreditBillingService creditBillingService,
    IOptions<AiInsightOptions> options,
    ILogger<AiCreditPaymentService> logger,
    AuditLogService auditLogService,
    ILicensingAlertMonitor licensingAlertMonitor)
{
    private const string WebhookStatusProcessing = "processing";
    private const string WebhookStatusProcessed = "processed";
    private const string WebhookStatusFailed = "failed";
    private const string PaymentMethodCard = "card";
    private const string PaymentMethodCash = "cash";
    private const string PaymentMethodBankDeposit = "bank_deposit";
    private const string ManualPaymentProvider = "manual";
    private static readonly HashSet<string> AllowedDepositSlipFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".pdf"
    };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> SupportedWebhookEvents = new(StringComparer.OrdinalIgnoreCase)
    {
        "payment.succeeded",
        "payment.failed",
        "payment.refunded"
    };

    public AiCreditPackListResponse GetCreditPacks()
    {
        var packs = options.Value.CreditPacks
            .Where(x => !string.IsNullOrWhiteSpace(x.PackCode))
            .Where(x => x.Credits > 0m && x.Price >= 0m)
            .Select(x => new AiCreditPackResponse
            {
                PackCode = x.PackCode.Trim(),
                Credits = RoundCredits(x.Credits),
                Price = RoundCredits(x.Price),
                Currency = string.IsNullOrWhiteSpace(x.Currency) ? "USD" : x.Currency.Trim().ToUpperInvariant()
            })
            .OrderBy(x => x.Credits)
            .ToList();

        return new AiCreditPackListResponse
        {
            Items = packs
        };
    }

    public async Task<AiCheckoutSessionResponse> CreateCheckoutSessionAsync(
        Guid userId,
        string packCode,
        string idempotencyKey,
        string? paymentMethod,
        string? bankReference,
        string? depositSlipUrl,
        CancellationToken cancellationToken)
    {
        var aiOptions = options.Value;
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var pack = ResolvePack(aiOptions, packCode);
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var normalizedPaymentMethod = NormalizePaymentMethod(
            paymentMethod,
            aiOptions.EnableManualPaymentFallback);
        var normalizedBankReference = NormalizeBankReference(bankReference);
        var normalizedDepositSlipUrl = ValidateDepositSlipUrl(depositSlipUrl);
        ValidateManualPaymentEvidence(
            normalizedPaymentMethod,
            normalizedBankReference,
            normalizedDepositSlipUrl);
        var externalReference = BuildExternalReference(context.ShopId, normalizedIdempotencyKey);

        var existingPayment = await dbContext.AiCreditPayments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ExternalReference == externalReference, cancellationToken);

        if (existingPayment is not null)
        {
            var existingPackCode = ResolvePackCodeForPayment(existingPayment, pack.PackCode);
            var existingPaymentMethod = ResolvePaymentMethodForPayment(existingPayment, PaymentMethodCard);
            ValidateIdempotentConsistency(
                pack.PackCode,
                existingPackCode,
                normalizedPaymentMethod,
                existingPaymentMethod);
            auditLogService.Queue(
                action: "ai_payment_checkout_replayed",
                entityName: nameof(AiCreditPayment),
                entityId: existingPayment.Id.ToString(),
                before: new
                {
                    payment_status = MapPaymentStatus(existingPayment.Status, existingPaymentMethod),
                    payment_method = existingPaymentMethod
                },
                after: new
                {
                    requested_pack_code = pack.PackCode,
                    external_reference = existingPayment.ExternalReference
                });
            return MapCheckoutSessionResponse(
                existingPayment,
                existingPackCode,
                existingPaymentMethod,
                BuildCheckoutUrl(aiOptions, externalReference, existingPackCode, existingPaymentMethod));
        }

        var now = DateTimeOffset.UtcNow;
        var shopNameSnapshot = await ResolveCurrentShopNameAsync(context.ShopId, cancellationToken);
        var payment = new AiCreditPayment
        {
            UserId = context.User.Id,
            ShopId = context.ShopId,
            Status = AiCreditPaymentStatus.Pending,
            Provider = normalizedPaymentMethod == PaymentMethodCard
                ? NormalizeProvider(aiOptions.PaymentProvider)
                : ManualPaymentProvider,
            ProviderPaymentId = null,
            ProviderCheckoutSessionId = null,
            ExternalReference = externalReference,
            CreditsPurchased = RoundCredits(pack.Credits),
            Amount = RoundCredits(pack.Price),
            Currency = NormalizeCurrency(pack.Currency),
            PurchaseReference = null,
            LastWebhookEventId = null,
            LastWebhookEventType = null,
            FailureReason = null,
            MetadataJson = JsonSerializer.Serialize(new
            {
                pack_code = pack.PackCode,
                idempotency_key_hash = ComputeSha256Hex(normalizedIdempotencyKey),
                payment_method = normalizedPaymentMethod,
                bank_reference = normalizedBankReference,
                deposit_slip_url = normalizedDepositSlipUrl,
                shop_id = context.ShopId,
                shop_name = shopNameSnapshot
            }, JsonOptions),
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            CompletedAtUtc = null,
            User = context.User
        };

        dbContext.AiCreditPayments.Add(payment);
        auditLogService.Queue(
            action: "ai_payment_checkout_created",
            entityName: nameof(AiCreditPayment),
            entityId: payment.Id.ToString(),
            before: null,
            after: new
            {
                user_id = payment.UserId,
                shop_id = payment.ShopId,
                payment_status = MapPaymentStatus(payment.Status, normalizedPaymentMethod),
                payment_method = normalizedPaymentMethod,
                pack_code = pack.PackCode,
                credits = payment.CreditsPurchased,
                amount = payment.Amount,
                currency = payment.Currency,
                external_reference = payment.ExternalReference
            });
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            dbContext.Entry(payment).State = EntityState.Detached;
            var conflictedPayment = await dbContext.AiCreditPayments
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.ExternalReference == externalReference, cancellationToken);

            if (conflictedPayment is null)
            {
                logger.LogWarning(
                    exception,
                    "AI checkout insert failed for reference {ExternalReference}.",
                    externalReference);
                throw;
            }

            var conflictedPackCode = ResolvePackCodeForPayment(conflictedPayment, pack.PackCode);
            var conflictedPaymentMethod = ResolvePaymentMethodForPayment(conflictedPayment, PaymentMethodCard);
            ValidateIdempotentConsistency(
                pack.PackCode,
                conflictedPackCode,
                normalizedPaymentMethod,
                conflictedPaymentMethod);
            auditLogService.Queue(
                action: "ai_payment_checkout_replayed",
                entityName: nameof(AiCreditPayment),
                entityId: conflictedPayment.Id.ToString(),
                before: new
                {
                    payment_status = MapPaymentStatus(conflictedPayment.Status, conflictedPaymentMethod),
                    payment_method = conflictedPaymentMethod
                },
                after: new
                {
                    requested_pack_code = pack.PackCode,
                    external_reference = conflictedPayment.ExternalReference
                });
            return MapCheckoutSessionResponse(
                conflictedPayment,
                conflictedPackCode,
                conflictedPaymentMethod,
                BuildCheckoutUrl(aiOptions, conflictedPayment.ExternalReference, conflictedPackCode, conflictedPaymentMethod));
        }

        return MapCheckoutSessionResponse(
            payment,
            pack.PackCode,
            normalizedPaymentMethod,
            BuildCheckoutUrl(aiOptions, payment.ExternalReference, pack.PackCode, normalizedPaymentMethod));
    }

    public async Task<AiPaymentHistoryResponse> GetPaymentHistoryAsync(
        Guid userId,
        int take,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 100);
        List<AiCreditPayment> payments;
        if (dbContext.Database.IsSqlite())
        {
            payments = (await dbContext.AiCreditPayments
                    .AsNoTracking()
                    .Where(x => x.ShopId == context.ShopId)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            payments = await dbContext.AiCreditPayments
                .AsNoTracking()
                .Where(x => x.ShopId == context.ShopId)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        var items = payments
            .Select(payment =>
            {
                var method = ResolvePaymentMethodForPayment(payment, PaymentMethodCard);
                return new AiPaymentHistoryItemResponse
                {
                    PaymentId = payment.Id,
                    PaymentStatus = MapPaymentStatus(payment.Status, method),
                    PaymentMethod = method,
                    Provider = payment.Provider,
                    Credits = payment.CreditsPurchased,
                    Amount = payment.Amount,
                    Currency = payment.Currency,
                    ExternalReference = payment.ExternalReference,
                    CreatedAt = payment.CreatedAtUtc,
                    CompletedAt = payment.CompletedAtUtc
                };
            })
            .ToList();

        return new AiPaymentHistoryResponse
        {
            Items = items
        };
    }

    public async Task<AiPendingManualPaymentsResponse> GetPendingManualPaymentsAsync(
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var candidateTake = Math.Clamp(normalizedTake * 6, normalizedTake, 500);

        List<AiCreditPayment> pendingPayments;
        if (dbContext.Database.IsSqlite())
        {
            pendingPayments = (await dbContext.AiCreditPayments
                    .AsNoTracking()
                    .Include(x => x.User)
                    .Include(x => x.Shop)
                    .Where(x => x.Status == AiCreditPaymentStatus.Pending)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(candidateTake)
                .ToList();
        }
        else
        {
            pendingPayments = await dbContext.AiCreditPayments
                .AsNoTracking()
                .Include(x => x.User)
                .Include(x => x.Shop)
                .Where(x => x.Status == AiCreditPaymentStatus.Pending)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(candidateTake)
                .ToListAsync(cancellationToken);
        }

        var fallbackShopName = await ResolveCurrentShopNameAsync(cancellationToken);
        var items = pendingPayments
            .Select(payment =>
            {
                var paymentMethod = ResolvePaymentMethodForPayment(payment, PaymentMethodCard);
                if (!IsManualPaymentMethod(paymentMethod))
                {
                    return null;
                }

                var submittedReference = TryReadMetadataString(payment.MetadataJson, "bank_reference");
                var metadataShopName = TryReadMetadataString(payment.MetadataJson, "shop_name");
                return new AiPendingManualPaymentItemResponse
                {
                    PaymentId = payment.Id,
                    TargetUsername = payment.User.Username,
                    TargetFullName = NormalizeOptional(payment.User.FullName),
                    ShopName = !string.IsNullOrWhiteSpace(metadataShopName)
                        ? metadataShopName
                        : NormalizeOptional(payment.Shop?.Name) ?? fallbackShopName,
                    PaymentStatus = MapPaymentStatus(payment.Status, paymentMethod),
                    PaymentMethod = paymentMethod,
                    Credits = payment.CreditsPurchased,
                    Amount = payment.Amount,
                    Currency = payment.Currency,
                    ExternalReference = payment.ExternalReference,
                    SubmittedReference = submittedReference,
                    CreatedAt = payment.CreatedAtUtc
                };
            })
            .Where(item => item is not null)
            .Take(normalizedTake)
            .Select(item => item!)
            .ToList();

        return new AiPendingManualPaymentsResponse
        {
            Items = items
        };
    }

    public async Task<AiCheckoutSessionResponse> VerifyManualPaymentAsync(
        Guid? paymentId,
        string? externalReference,
        CancellationToken cancellationToken)
    {
        var normalizedExternalReference = NormalizeOptional(externalReference);
        if (!paymentId.HasValue && string.IsNullOrWhiteSpace(normalizedExternalReference))
        {
            throw new InvalidOperationException("payment_id or external_reference is required.");
        }

        AiCreditPayment? payment;
        if (paymentId.HasValue)
        {
            payment = await dbContext.AiCreditPayments
                .FirstOrDefaultAsync(x => x.Id == paymentId.Value, cancellationToken);
        }
        else
        {
            payment = await dbContext.AiCreditPayments
                .FirstOrDefaultAsync(x => x.ExternalReference == normalizedExternalReference, cancellationToken);
        }

        if (payment is null)
        {
            throw new InvalidOperationException("AI credit payment was not found.");
        }

        var paymentMethod = ResolvePaymentMethodForPayment(payment, PaymentMethodCard);
        if (!IsManualPaymentMethod(paymentMethod))
        {
            throw new InvalidOperationException("Only cash or bank_deposit payments can be manually verified.");
        }

        var packCode = ResolvePackCodeForPayment(payment, "manual_payment");
        if (payment.Status == AiCreditPaymentStatus.Succeeded)
        {
            return MapCheckoutSessionResponse(payment, packCode, paymentMethod, null);
        }

        if (payment.Status is AiCreditPaymentStatus.Refunded or AiCreditPaymentStatus.Canceled)
        {
            throw new InvalidOperationException("Payment cannot be verified in its current status.");
        }

        var now = DateTimeOffset.UtcNow;
        var purchaseReference = string.IsNullOrWhiteSpace(payment.PurchaseReference)
            ? $"ai-payment-manual-{payment.Id:N}"
            : payment.PurchaseReference.Trim();
        var paymentShopId = await ResolvePaymentShopIdAsync(payment, cancellationToken);

        await creditBillingService.AddCreditsToShopAsync(
            paymentShopId,
            payment.UserId,
            payment.CreditsPurchased,
            purchaseReference,
            "ai_manual_payment_verified",
            cancellationToken);

        payment.Status = AiCreditPaymentStatus.Succeeded;
        payment.PurchaseReference = purchaseReference;
        payment.FailureReason = null;
        payment.UpdatedAtUtc = now;
        payment.CompletedAtUtc ??= now;
        auditLogService.Queue(
            action: "ai_payment_manual_verified",
            entityName: nameof(AiCreditPayment),
            entityId: payment.Id.ToString(),
            before: new
            {
                payment_status = "pending_verification",
                payment_method = paymentMethod
            },
            after: new
            {
                payment_status = "succeeded",
                payment_method = paymentMethod,
                purchase_reference = purchaseReference,
                external_reference = payment.ExternalReference
            });

        await dbContext.SaveChangesAsync(cancellationToken);

        return MapCheckoutSessionResponse(payment, packCode, paymentMethod, null);
    }

    public void VerifyWebhookSignature(string rawBody, IHeaderDictionary headers)
    {
        var webhookOptions = options.Value.PaymentWebhook;
        if (!webhookOptions.RequireSignature)
        {
            return;
        }

        var headerName = string.IsNullOrWhiteSpace(webhookOptions.SignatureHeaderName)
            ? "X-AI-Payment-Signature"
            : webhookOptions.SignatureHeaderName.Trim();
        var signatureHeader = headers[headerName].ToString();
        if (string.IsNullOrWhiteSpace(signatureHeader))
        {
            throw new InvalidOperationException("Missing AI payment webhook signature header.");
        }

        var parts = ParseSignatureHeader(signatureHeader);
        if (!parts.TryGetValue("t", out var timestampRaw) ||
            !long.TryParse(timestampRaw, out var timestampUnix))
        {
            throw new InvalidOperationException("Invalid AI payment webhook timestamp.");
        }

        var scheme = string.IsNullOrWhiteSpace(webhookOptions.SignatureScheme)
            ? "v1"
            : webhookOptions.SignatureScheme.Trim();
        if (!parts.TryGetValue(scheme, out var providedSignature) ||
            string.IsNullOrWhiteSpace(providedSignature))
        {
            throw new InvalidOperationException("Invalid AI payment webhook signature payload.");
        }

        var toleranceSeconds = Math.Clamp(webhookOptions.TimestampToleranceSeconds, 0, 3600);
        if (toleranceSeconds > 0)
        {
            var eventTime = DateTimeOffset.FromUnixTimeSeconds(timestampUnix);
            var age = Math.Abs((DateTimeOffset.UtcNow - eventTime).TotalSeconds);
            if (age > toleranceSeconds)
            {
                throw new InvalidOperationException("AI payment webhook timestamp is outside tolerance.");
            }
        }

        var signingSecret = ResolveWebhookSigningSecret();
        var payload = $"{timestampUnix}.{rawBody}";
        var expectedSignature = ComputeHmacHex(signingSecret, payload);
        if (!FixedTimeEqualsHex(expectedSignature, providedSignature))
        {
            throw new InvalidOperationException("Invalid AI payment webhook signature.");
        }
    }

    public async Task<AiPaymentWebhookResponse> HandlePaymentWebhookAsync(
        AiPaymentWebhookRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = DateTimeOffset.UtcNow;
        var eventType = NormalizeEventType(request.EventType);
        if (!SupportedWebhookEvents.Contains(eventType))
        {
            return new AiPaymentWebhookResponse
            {
                EventType = eventType,
                Handled = false,
                Reason = "unsupported_event",
                ProcessedAt = now
            };
        }

        var providerEventId = NormalizeRequired(request.EventId, "event_id");
        var provider = NormalizeProvider(request.Provider);

        var webhookEvent = await ReserveWebhookEventAsync(
            providerEventId,
            provider,
            eventType,
            now,
            cancellationToken);

        if (webhookEvent is null)
        {
            var existing = await dbContext.AiCreditPaymentWebhookEvents
                .AsNoTracking()
                .FirstAsync(x => x.ProviderEventId == providerEventId, cancellationToken);

            return new AiPaymentWebhookResponse
            {
                EventType = eventType,
                Handled = false,
                Reason = "duplicate_event",
                PaymentId = existing.PaymentId,
                ProcessedAt = now
            };
        }

        try
        {
            var payment = await ResolvePaymentForWebhookAsync(request, cancellationToken);
            if (payment is null)
            {
                await MarkWebhookEventFailedAsync(
                    webhookEvent,
                    "payment_not_found",
                    "Payment was not found for this webhook.",
                    now,
                    cancellationToken);
                licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_webhook_payment_not_found");
                throw new InvalidOperationException("Payment was not found for this webhook.");
            }

            webhookEvent.PaymentId = payment.Id;
            payment.Provider = provider;

            var normalizedProviderPaymentId = NormalizeOptional(request.ProviderPaymentId);
            if (!string.IsNullOrWhiteSpace(normalizedProviderPaymentId))
            {
                payment.ProviderPaymentId = normalizedProviderPaymentId;
            }

            var normalizedCheckoutSessionId = NormalizeOptional(request.ProviderCheckoutSessionId);
            if (!string.IsNullOrWhiteSpace(normalizedCheckoutSessionId))
            {
                payment.ProviderCheckoutSessionId = normalizedCheckoutSessionId;
            }

            payment.LastWebhookEventId = providerEventId;
            payment.LastWebhookEventType = eventType;
            payment.UpdatedAtUtc = now;

            var response = await ProcessPaymentWebhookEventAsync(
                payment,
                request,
                eventType,
                now,
                cancellationToken);

            webhookEvent.Status = WebhookStatusProcessed;
            webhookEvent.ErrorCode = null;
            webhookEvent.ErrorMessage = null;
            webhookEvent.ProcessedAtUtc = now;
            webhookEvent.UpdatedAtUtc = now;

            await dbContext.SaveChangesAsync(cancellationToken);
            response.ProcessedAt = now;
            response.PaymentId = payment.Id;
            var paymentMethod = ResolvePaymentMethodForPayment(payment, PaymentMethodCard);
            response.PaymentStatus = MapPaymentStatus(payment.Status, paymentMethod);
            return response;
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning(exception, "AI payment webhook {EventId} failed with invalid operation.", providerEventId);
            await MarkWebhookEventFailedAsync(
                webhookEvent,
                "invalid_operation",
                "Webhook processing failed.",
                now,
                cancellationToken);
            licensingAlertMonitor.RecordWebhookFailure(eventType, "invalid_operation");
            licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_webhook_processing_failed");
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "AI payment webhook {EventId} failed unexpectedly.", providerEventId);
            await MarkWebhookEventFailedAsync(
                webhookEvent,
                "unexpected_error",
                "Webhook processing failed unexpectedly.",
                now,
                cancellationToken);
            licensingAlertMonitor.RecordWebhookFailure(eventType, "unexpected_error");
            licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_webhook_processing_failed");
            throw;
        }
    }

    private async Task<AiPaymentWebhookResponse> ProcessPaymentWebhookEventAsync(
        AiCreditPayment payment,
        AiPaymentWebhookRequest request,
        string eventType,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        switch (eventType)
        {
            case "payment.succeeded":
                if (payment.Status == AiCreditPaymentStatus.Succeeded)
                {
                    return new AiPaymentWebhookResponse
                    {
                        EventType = eventType,
                        Handled = false,
                        Reason = "already_succeeded"
                    };
                }

                if (payment.Status == AiCreditPaymentStatus.Refunded)
                {
                    return new AiPaymentWebhookResponse
                    {
                        EventType = eventType,
                        Handled = false,
                        Reason = "already_refunded"
                    };
                }

                var purchaseReference = string.IsNullOrWhiteSpace(payment.PurchaseReference)
                    ? $"ai-payment-{payment.Id:N}"
                    : payment.PurchaseReference.Trim();
                var paymentShopId = await ResolvePaymentShopIdAsync(payment, cancellationToken);

                await creditBillingService.AddCreditsToShopAsync(
                    paymentShopId,
                    payment.UserId,
                    payment.CreditsPurchased,
                    purchaseReference,
                    "ai_payment_purchase",
                    cancellationToken);

                payment.Status = AiCreditPaymentStatus.Succeeded;
                payment.PurchaseReference = purchaseReference;
                payment.FailureReason = null;
                payment.CompletedAtUtc = now;
                auditLogService.Queue(
                    action: "ai_payment_settled",
                    entityName: nameof(AiCreditPayment),
                    entityId: payment.Id.ToString(),
                    before: new
                    {
                        payment_status = "pending",
                        payment_method = ResolvePaymentMethodForPayment(payment, PaymentMethodCard)
                    },
                    after: new
                    {
                        payment_status = "succeeded",
                        purchase_reference = purchaseReference,
                        external_reference = payment.ExternalReference
                    });
                break;

            case "payment.failed":
                payment.Status = AiCreditPaymentStatus.Failed;
                payment.FailureReason = "payment_failed";
                payment.CompletedAtUtc = now;
                licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_failed");
                auditLogService.Queue(
                    action: "ai_payment_failed",
                    entityName: nameof(AiCreditPayment),
                    entityId: payment.Id.ToString(),
                    before: new
                    {
                        payment_status = "pending",
                        payment_method = ResolvePaymentMethodForPayment(payment, PaymentMethodCard)
                    },
                    after: new
                    {
                        payment_status = "failed",
                        failure_reason = payment.FailureReason,
                        external_reference = payment.ExternalReference
                    });
                break;

            case "payment.refunded":
                if (payment.Status != AiCreditPaymentStatus.Refunded)
                {
                    if (payment.Status == AiCreditPaymentStatus.Succeeded)
                    {
                        var refundReference = $"ai-payment-refund-{payment.Id:N}";
                        var refundShopId = await ResolvePaymentShopIdAsync(payment, cancellationToken);
                        await creditBillingService.AdjustCreditsForShopAsync(
                            refundShopId,
                            payment.UserId,
                            -payment.CreditsPurchased,
                            refundReference,
                            "ai_payment_refund",
                            cancellationToken);
                    }

                    payment.Status = AiCreditPaymentStatus.Refunded;
                    payment.FailureReason = "payment_refunded";
                    payment.CompletedAtUtc = now;
                    auditLogService.Queue(
                        action: "ai_payment_refunded",
                        entityName: nameof(AiCreditPayment),
                        entityId: payment.Id.ToString(),
                        before: new
                        {
                            payment_status = "succeeded",
                            payment_method = ResolvePaymentMethodForPayment(payment, PaymentMethodCard)
                        },
                        after: new
                        {
                            payment_status = "refunded",
                            failure_reason = payment.FailureReason,
                            external_reference = payment.ExternalReference
                        });
                }
                break;
        }

        if (request.Credits.HasValue && request.Credits.Value > 0m)
        {
            payment.CreditsPurchased = RoundCredits(request.Credits.Value);
        }

        if (request.Amount.HasValue && request.Amount.Value >= 0m)
        {
            payment.Amount = RoundCredits(request.Amount.Value);
        }

        var currency = NormalizeOptional(request.Currency);
        if (!string.IsNullOrWhiteSpace(currency))
        {
            payment.Currency = NormalizeCurrency(currency);
        }

        return new AiPaymentWebhookResponse
        {
            EventType = eventType,
            Handled = true
        };
    }

    private async Task<AiCreditPaymentWebhookEvent?> ReserveWebhookEventAsync(
        string providerEventId,
        string provider,
        string eventType,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var webhookEvent = new AiCreditPaymentWebhookEvent
        {
            Provider = provider,
            ProviderEventId = providerEventId,
            EventType = eventType,
            Status = WebhookStatusProcessing,
            PaymentId = null,
            ErrorCode = null,
            ErrorMessage = null,
            ReceivedAtUtc = now,
            ProcessedAtUtc = null,
            UpdatedAtUtc = now
        };

        dbContext.AiCreditPaymentWebhookEvents.Add(webhookEvent);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return webhookEvent;
        }
        catch (DbUpdateException)
        {
            dbContext.Entry(webhookEvent).State = EntityState.Detached;
            return null;
        }
    }

    private async Task MarkWebhookEventFailedAsync(
        AiCreditPaymentWebhookEvent webhookEvent,
        string errorCode,
        string? errorMessage,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        webhookEvent.Status = WebhookStatusFailed;
        webhookEvent.ErrorCode = NormalizeOptional(errorCode);
        webhookEvent.ErrorMessage = string.IsNullOrWhiteSpace(errorMessage)
            ? null
            : errorMessage.Trim();
        webhookEvent.ProcessedAtUtc = now;
        webhookEvent.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<AiCreditPayment?> ResolvePaymentForWebhookAsync(
        AiPaymentWebhookRequest request,
        CancellationToken cancellationToken)
    {
        var externalReference = NormalizeOptional(request.ExternalReference);
        if (!string.IsNullOrWhiteSpace(externalReference))
        {
            return await dbContext.AiCreditPayments
                .FirstOrDefaultAsync(x => x.ExternalReference == externalReference, cancellationToken);
        }

        var providerPaymentId = NormalizeOptional(request.ProviderPaymentId);
        if (!string.IsNullOrWhiteSpace(providerPaymentId))
        {
            return await dbContext.AiCreditPayments
                .FirstOrDefaultAsync(x => x.ProviderPaymentId == providerPaymentId, cancellationToken);
        }

        var checkoutSessionId = NormalizeOptional(request.ProviderCheckoutSessionId);
        if (!string.IsNullOrWhiteSpace(checkoutSessionId))
        {
            return await dbContext.AiCreditPayments
                .FirstOrDefaultAsync(x => x.ProviderCheckoutSessionId == checkoutSessionId, cancellationToken);
        }

        return null;
    }

    private static AiCheckoutSessionResponse MapCheckoutSessionResponse(
        AiCreditPayment payment,
        string packCode,
        string paymentMethod,
        string? checkoutUrl)
    {
        return new AiCheckoutSessionResponse
        {
            PaymentId = payment.Id,
            PaymentStatus = MapPaymentStatus(payment.Status, paymentMethod),
            PaymentMethod = paymentMethod,
            Provider = payment.Provider,
            PackCode = packCode,
            Credits = payment.CreditsPurchased,
            Amount = payment.Amount,
            Currency = payment.Currency,
            ExternalReference = payment.ExternalReference,
            CheckoutUrl = checkoutUrl,
            CreatedAt = payment.CreatedAtUtc
        };
    }

    private static string MapPaymentStatus(AiCreditPaymentStatus status, string paymentMethod)
    {
        if (status == AiCreditPaymentStatus.Pending && IsManualPaymentMethod(paymentMethod))
        {
            return "pending_verification";
        }

        return status switch
        {
            AiCreditPaymentStatus.Pending => "pending",
            AiCreditPaymentStatus.Succeeded => "succeeded",
            AiCreditPaymentStatus.Failed => "failed",
            AiCreditPaymentStatus.Refunded => "refunded",
            AiCreditPaymentStatus.Canceled => "canceled",
            _ => "unknown"
        };
    }

    private async Task<string?> ResolveCurrentShopNameAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var shop = await dbContext.Shops
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == shopId, cancellationToken);
        var normalizedShopName = NormalizeOptional(shop?.Name);
        if (!string.IsNullOrWhiteSpace(normalizedShopName))
        {
            return normalizedShopName;
        }

        var profiles = await dbContext.ShopProfiles
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return profiles
            .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
            .Select(x => NormalizeOptional(x.ShopName))
            .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
    }

    private async Task<string?> ResolveCurrentShopNameAsync(CancellationToken cancellationToken)
    {
        var profiles = await dbContext.ShopProfiles
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return profiles
            .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
            .Select(x => NormalizeOptional(x.ShopName))
            .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
    }

    private static AiCreditPackOption ResolvePack(AiInsightOptions aiOptions, string packCode)
    {
        var normalizedPackCode = NormalizeRequired(packCode, "pack_code");
        var pack = aiOptions.CreditPacks
            .FirstOrDefault(x =>
                string.Equals(x.PackCode?.Trim(), normalizedPackCode, StringComparison.OrdinalIgnoreCase));

        if (pack is null || pack.Credits <= 0m || pack.Price < 0m)
        {
            throw new InvalidOperationException("Invalid credit pack.");
        }

        return new AiCreditPackOption
        {
            PackCode = normalizedPackCode,
            Credits = pack.Credits,
            Price = pack.Price,
            Currency = NormalizeCurrency(pack.Currency)
        };
    }

    private static string NormalizePaymentMethod(string? paymentMethod, bool manualFallbackEnabled)
    {
        var normalized = NormalizeOptional(paymentMethod)?.ToLowerInvariant();
        var resolved = normalized switch
        {
            null or "" or "card" => PaymentMethodCard,
            "cash" => PaymentMethodCash,
            "bank_deposit" or "bankdeposit" => PaymentMethodBankDeposit,
            _ => throw new InvalidOperationException("payment_method must be one of: card, cash, bank_deposit.")
        };

        if (resolved != PaymentMethodCard && !manualFallbackEnabled)
        {
            throw new InvalidOperationException("Manual payment fallback is disabled.");
        }

        return resolved;
    }

    private static bool IsManualPaymentMethod(string paymentMethod)
    {
        return string.Equals(paymentMethod, PaymentMethodCash, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(paymentMethod, PaymentMethodBankDeposit, StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeBankReference(string? bankReference)
    {
        var normalized = NormalizeOptional(bankReference);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length > 160)
        {
            throw new InvalidOperationException("bank_reference must be 160 characters or less.");
        }

        return normalized;
    }

    private static string? ValidateDepositSlipUrl(string? depositSlipUrl)
    {
        var normalized = NormalizeOptional(depositSlipUrl);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length > 500)
        {
            throw new InvalidOperationException("deposit_slip_url must be 500 characters or less.");
        }

        if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri) ||
            !(uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("deposit_slip_url must be a valid absolute HTTP/HTTPS URL.");
        }

        var extension = Path.GetExtension(uri.AbsolutePath);
        if (!string.IsNullOrWhiteSpace(extension) && !AllowedDepositSlipFileExtensions.Contains(extension))
        {
            throw new InvalidOperationException("deposit_slip_url file type must be one of: .jpg, .jpeg, .png, .webp, .pdf.");
        }

        return normalized;
    }

    private static void ValidateManualPaymentEvidence(
        string paymentMethod,
        string? bankReference,
        string? depositSlipUrl)
    {
        if (!IsManualPaymentMethod(paymentMethod))
        {
            return;
        }

        var hasReference = !string.IsNullOrWhiteSpace(bankReference);
        var hasDepositSlipUrl = !string.IsNullOrWhiteSpace(depositSlipUrl);

        if (string.Equals(paymentMethod, PaymentMethodCash, StringComparison.OrdinalIgnoreCase))
        {
            if (hasReference)
            {
                return;
            }

            throw new InvalidOperationException("bank_reference is required for cash payments.");
        }

        if (hasReference && hasDepositSlipUrl)
        {
            return;
        }

        throw new InvalidOperationException("bank_reference and deposit_slip_url are required for bank_deposit payments.");
    }

    private static string ResolvePaymentMethodForPayment(AiCreditPayment payment, string fallbackPaymentMethod)
    {
        var metadataPaymentMethod = TryReadMetadataString(payment.MetadataJson, "payment_method");
        if (!string.IsNullOrWhiteSpace(metadataPaymentMethod))
        {
            try
            {
                return NormalizePaymentMethod(metadataPaymentMethod, manualFallbackEnabled: true);
            }
            catch (InvalidOperationException)
            {
                // Ignore malformed historical values and fallback safely.
            }
        }

        if (string.Equals(payment.Provider, PaymentMethodCash, StringComparison.OrdinalIgnoreCase))
        {
            return PaymentMethodCash;
        }

        if (string.Equals(payment.Provider, PaymentMethodBankDeposit, StringComparison.OrdinalIgnoreCase))
        {
            return PaymentMethodBankDeposit;
        }

        return fallbackPaymentMethod;
    }

    private string ResolveWebhookSigningSecret()
    {
        var webhookOptions = options.Value.PaymentWebhook;
        var fromConfig = NormalizeOptional(webhookOptions.SigningSecret);
        var envVarName = NormalizeOptional(webhookOptions.SigningSecretEnvironmentVariable)
                         ?? "SMARTPOS_AI_WEBHOOK_SIGNING_SECRET";
        var fromEnvironment = NormalizeOptional(Environment.GetEnvironmentVariable(envVarName));

        if (!string.IsNullOrWhiteSpace(fromEnvironment))
        {
            return fromEnvironment;
        }

        if (!string.IsNullOrWhiteSpace(fromConfig))
        {
            return fromConfig;
        }

        throw new InvalidOperationException(
            $"AI payment webhook signing secret is not configured. Set '{AiInsightOptions.SectionName}:PaymentWebhook:SigningSecret' or environment variable '{envVarName}'.");
    }

    private static string ComputeHmacHex(string secret, string payload)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        using var hmac = new HMACSHA256(keyBytes);
        var digest = hmac.ComputeHash(payloadBytes);
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private static bool FixedTimeEqualsHex(string expectedHex, string providedHex)
    {
        var left = Encoding.UTF8.GetBytes(expectedHex.Trim().ToLowerInvariant());
        var right = Encoding.UTF8.GetBytes(providedHex.Trim().ToLowerInvariant());

        if (left.Length != right.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(left, right);
    }

    private static Dictionary<string, string> ParseSignatureHeader(string signatureHeader)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var segments = signatureHeader.Split(
            ',',
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var segment in segments)
        {
            var separatorIndex = segment.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = segment[..separatorIndex].Trim();
            var value = segment[(separatorIndex + 1)..].Trim();
            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            result[key] = value;
        }

        return result;
    }

    private static string BuildExternalReference(Guid shopId, string idempotencyKey)
    {
        var hash = ComputeSha256Hex(idempotencyKey);
        return $"aicpay_{shopId:N}_{hash[..20]}";
    }

    private static string NormalizeIdempotencyKey(string idempotencyKey)
    {
        var normalized = NormalizeRequired(idempotencyKey, "idempotency_key");
        if (normalized.Length > 120)
        {
            throw new InvalidOperationException("Idempotency key is too long.");
        }

        return normalized;
    }

    private static string NormalizeEventType(string eventType)
    {
        return NormalizeRequired(eventType, "event_type").ToLowerInvariant();
    }

    private static string NormalizeProvider(string provider)
    {
        var normalized = NormalizeOptional(provider);
        return string.IsNullOrWhiteSpace(normalized)
            ? "mockpay"
            : normalized.ToLowerInvariant();
    }

    private static string NormalizeCurrency(string? currency)
    {
        var normalized = NormalizeOptional(currency);
        return string.IsNullOrWhiteSpace(normalized)
            ? "USD"
            : normalized.ToUpperInvariant();
    }

    private static string NormalizeRequired(string? value, string fieldName)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException($"{fieldName} is required.");
        }

        return normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim();
    }

    private static string ComputeSha256Hex(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string? TryReadMetadataString(string? metadataJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(metadataJson) || string.IsNullOrWhiteSpace(propertyName))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            if (root.TryGetProperty(propertyName, out var propertyElement) &&
                propertyElement.ValueKind == JsonValueKind.String)
            {
                return NormalizeOptional(propertyElement.GetString());
            }
        }
        catch (JsonException)
        {
            // Best-effort fallback when historical metadata is malformed.
        }

        return null;
    }

    private static string ResolvePackCodeForPayment(AiCreditPayment payment, string fallbackPackCode)
    {
        var parsed = TryReadMetadataString(payment.MetadataJson, "pack_code");
        if (!string.IsNullOrWhiteSpace(parsed))
        {
            return parsed;
        }

        return fallbackPackCode;
    }

    private void ValidateIdempotentConsistency(
        string requestedPackCode,
        string existingPackCode,
        string requestedPaymentMethod,
        string existingPaymentMethod)
    {
        if (!string.Equals(requestedPackCode, existingPackCode, StringComparison.OrdinalIgnoreCase))
        {
            licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_checkout_idempotency_conflict");
            throw new InvalidOperationException(
                "Idempotency key already exists for a different pack_code.");
        }

        if (!string.Equals(requestedPaymentMethod, existingPaymentMethod, StringComparison.OrdinalIgnoreCase))
        {
            licensingAlertMonitor.RecordSecurityAnomaly("ai_payment_checkout_idempotency_conflict");
            throw new InvalidOperationException(
                "Idempotency key already exists for a different payment_method.");
        }
    }

    private static string? BuildCheckoutUrl(
        AiInsightOptions aiOptions,
        string externalReference,
        string packCode,
        string paymentMethod)
    {
        if (!string.Equals(paymentMethod, PaymentMethodCard, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var baseUrl = NormalizeOptional(aiOptions.CheckoutBaseUrl);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return null;
        }

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out _))
        {
            return null;
        }

        var separator = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
        return $"{baseUrl}{separator}reference={Uri.EscapeDataString(externalReference)}&pack={Uri.EscapeDataString(packCode)}";
    }

    private static decimal RoundCredits(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private async Task<ShopActorContext> ResolveUserShopContextAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");

        if (!user.StoreId.HasValue || user.StoreId == Guid.Empty)
        {
            throw new InvalidOperationException(
                "AI billing is unavailable because this account is not mapped to a shop. Contact support.");
        }

        return new ShopActorContext(user, user.StoreId.Value);
    }

    private async Task<Guid> ResolvePaymentShopIdAsync(
        AiCreditPayment payment,
        CancellationToken cancellationToken)
    {
        if (payment.ShopId.HasValue && payment.ShopId.Value != Guid.Empty)
        {
            return payment.ShopId.Value;
        }

        var userStoreId = await dbContext.Users
            .Where(x => x.Id == payment.UserId)
            .Select(x => x.StoreId)
            .FirstOrDefaultAsync(cancellationToken);

        if (!userStoreId.HasValue || userStoreId.Value == Guid.Empty)
        {
            throw new InvalidOperationException(
                "AI billing is unavailable because this payment is not mapped to a shop.");
        }

        payment.ShopId = userStoreId.Value;
        return userStoreId.Value;
    }

    private readonly record struct ShopActorContext(
        AppUser User,
        Guid ShopId);
}
