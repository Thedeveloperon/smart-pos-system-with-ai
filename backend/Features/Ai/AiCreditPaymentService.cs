using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiCreditPaymentService(
    SmartPosDbContext dbContext,
    AiCreditBillingService creditBillingService,
    IOptions<AiInsightOptions> options,
    ILogger<AiCreditPaymentService> logger)
{
    private const string WebhookStatusProcessing = "processing";
    private const string WebhookStatusProcessed = "processed";
    private const string WebhookStatusFailed = "failed";
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
        CancellationToken cancellationToken)
    {
        var aiOptions = options.Value;
        var pack = ResolvePack(aiOptions, packCode);
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var externalReference = BuildExternalReference(userId, normalizedIdempotencyKey);

        var existingPayment = await dbContext.AiCreditPayments
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ExternalReference == externalReference, cancellationToken);

        if (existingPayment is not null)
        {
            var existingPackCode = ResolvePackCodeForPayment(existingPayment, pack.PackCode);
            EnsureIdempotentPackConsistency(pack.PackCode, existingPackCode);
            return MapCheckoutSessionResponse(
                existingPayment,
                existingPackCode,
                BuildCheckoutUrl(aiOptions, externalReference, existingPackCode));
        }

        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");

        var now = DateTimeOffset.UtcNow;
        var payment = new AiCreditPayment
        {
            UserId = userId,
            Status = AiCreditPaymentStatus.Pending,
            Provider = NormalizeProvider(aiOptions.PaymentProvider),
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
                idempotency_key_hash = ComputeSha256Hex(normalizedIdempotencyKey)
            }, JsonOptions),
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            CompletedAtUtc = null,
            User = user
        };

        dbContext.AiCreditPayments.Add(payment);
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
            EnsureIdempotentPackConsistency(pack.PackCode, conflictedPackCode);
            return MapCheckoutSessionResponse(
                conflictedPayment,
                conflictedPackCode,
                BuildCheckoutUrl(aiOptions, conflictedPayment.ExternalReference, conflictedPackCode));
        }

        return MapCheckoutSessionResponse(
            payment,
            pack.PackCode,
            BuildCheckoutUrl(aiOptions, payment.ExternalReference, pack.PackCode));
    }

    public async Task<AiPaymentHistoryResponse> GetPaymentHistoryAsync(
        Guid userId,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 100);
        List<AiPaymentHistoryItemResponse> items;
        if (dbContext.Database.IsSqlite())
        {
            items = (await dbContext.AiCreditPayments
                    .AsNoTracking()
                    .Where(x => x.UserId == userId)
                    .Select(x => new AiPaymentHistoryItemResponse
                    {
                        PaymentId = x.Id,
                        PaymentStatus = MapPaymentStatus(x.Status),
                        Provider = x.Provider,
                        Credits = x.CreditsPurchased,
                        Amount = x.Amount,
                        Currency = x.Currency,
                        ExternalReference = x.ExternalReference,
                        CreatedAt = x.CreatedAtUtc,
                        CompletedAt = x.CompletedAtUtc
                    })
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAt)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            items = await dbContext.AiCreditPayments
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .Select(x => new AiPaymentHistoryItemResponse
                {
                    PaymentId = x.Id,
                    PaymentStatus = MapPaymentStatus(x.Status),
                    Provider = x.Provider,
                    Credits = x.CreditsPurchased,
                    Amount = x.Amount,
                    Currency = x.Currency,
                    ExternalReference = x.ExternalReference,
                    CreatedAt = x.CreatedAtUtc,
                    CompletedAt = x.CompletedAtUtc
                })
                .ToListAsync(cancellationToken);
        }

        return new AiPaymentHistoryResponse
        {
            Items = items
        };
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
            response.PaymentStatus = MapPaymentStatus(payment.Status);
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

                await creditBillingService.AddCreditsAsync(
                    payment.UserId,
                    payment.CreditsPurchased,
                    purchaseReference,
                    "ai_payment_purchase",
                    cancellationToken);

                payment.Status = AiCreditPaymentStatus.Succeeded;
                payment.PurchaseReference = purchaseReference;
                payment.FailureReason = null;
                payment.CompletedAtUtc = now;
                break;

            case "payment.failed":
                payment.Status = AiCreditPaymentStatus.Failed;
                payment.FailureReason = "payment_failed";
                payment.CompletedAtUtc = now;
                break;

            case "payment.refunded":
                if (payment.Status != AiCreditPaymentStatus.Refunded)
                {
                    if (payment.Status == AiCreditPaymentStatus.Succeeded)
                    {
                        var refundReference = $"ai-payment-refund-{payment.Id:N}";
                        await creditBillingService.AdjustCreditsAsync(
                            payment.UserId,
                            -payment.CreditsPurchased,
                            refundReference,
                            "ai_payment_refund",
                            cancellationToken);
                    }

                    payment.Status = AiCreditPaymentStatus.Refunded;
                    payment.FailureReason = "payment_refunded";
                    payment.CompletedAtUtc = now;
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
        string? checkoutUrl)
    {
        return new AiCheckoutSessionResponse
        {
            PaymentId = payment.Id,
            PaymentStatus = MapPaymentStatus(payment.Status),
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

    private static string MapPaymentStatus(AiCreditPaymentStatus status)
    {
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

    private static string BuildExternalReference(Guid userId, string idempotencyKey)
    {
        var hash = ComputeSha256Hex(idempotencyKey);
        return $"aicpay_{userId:N}_{hash[..20]}";
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

    private static string ResolvePackCodeForPayment(AiCreditPayment payment, string fallbackPackCode)
    {
        if (string.IsNullOrWhiteSpace(payment.MetadataJson))
        {
            return fallbackPackCode;
        }

        try
        {
            using var document = JsonDocument.Parse(payment.MetadataJson);
            var root = document.RootElement;
            if (root.TryGetProperty("pack_code", out var packCodeElement) &&
                packCodeElement.ValueKind == JsonValueKind.String)
            {
                var parsed = NormalizeOptional(packCodeElement.GetString());
                if (!string.IsNullOrWhiteSpace(parsed))
                {
                    return parsed;
                }
            }
        }
        catch (JsonException)
        {
            // Best-effort fallback when historical metadata is malformed.
        }

        return fallbackPackCode;
    }

    private static void EnsureIdempotentPackConsistency(string requestedPackCode, string existingPackCode)
    {
        if (!string.Equals(requestedPackCode, existingPackCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Idempotency key already exists for a different pack_code.");
        }
    }

    private static string? BuildCheckoutUrl(AiInsightOptions aiOptions, string externalReference, string packCode)
    {
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
}
