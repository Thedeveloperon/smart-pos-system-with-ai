using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class ProvisioningRateLimitMiddleware(
    RequestDelegate next,
    IOptions<LicenseOptions> optionsAccessor,
    IOptions<AiInsightOptions> aiOptionsAccessor,
    ILicensingAlertMonitor licensingAlertMonitor)
{
    private static readonly ConcurrentDictionary<string, ConcurrentQueue<DateTimeOffset>> RequestTimesByKey = new();
    private static readonly ConcurrentDictionary<string, DateTimeOffset> MarketingSubmitIdempotencyKeys = new();
    private static readonly TimeSpan RequestWindow = TimeSpan.FromMinutes(1);
    private readonly int provisioningPermitLimit = Math.Clamp(
        optionsAccessor.Value.ProvisioningRateLimitPerMinute,
        1,
        500);

    private readonly int marketingPaymentRequestPermitLimit = Math.Clamp(
        optionsAccessor.Value.MarketingPaymentRequestRateLimitPerMinute,
        1,
        120);
    private readonly int marketingPaymentSubmitPermitLimit = Math.Clamp(
        optionsAccessor.Value.MarketingPaymentSubmitRateLimitPerMinute,
        1,
        120);
    private readonly int marketingDownloadTrackPermitLimit = Math.Clamp(
        optionsAccessor.Value.MarketingDownloadTrackRateLimitPerMinute,
        1,
        240);
    private readonly int licenseAccessLookupPermitLimit = Math.Clamp(
        optionsAccessor.Value.LicenseAccessLookupRateLimitPerMinute,
        1,
        240);
    private readonly int accountPortalPermitLimit = Math.Clamp(
        optionsAccessor.Value.AccountPortalRateLimitPerMinute,
        1,
        240);
    private readonly int accountDeviceDeactivatePermitLimit = Math.Clamp(
        optionsAccessor.Value.AccountDeviceDeactivationRateLimitPerMinute,
        1,
        240);
    private readonly int aiPaymentCheckoutPermitLimit = Math.Clamp(
        aiOptionsAccessor.Value.PaymentCheckoutRateLimitPerMinute,
        1,
        240);
    private readonly int aiPaymentStatusPermitLimit = Math.Clamp(
        aiOptionsAccessor.Value.PaymentStatusRateLimitPerMinute,
        1,
        240);
    private readonly TimeSpan marketingReplayGuardWindow = TimeSpan.FromMinutes(Math.Clamp(
        optionsAccessor.Value.MarketingPaymentReplayGuardWindowMinutes,
        1,
        1440));

    public async Task InvokeAsync(HttpContext httpContext)
    {
        var request = httpContext.Request;
        if (IsProvisioningMutation(request.Path, request.Method))
        {
            if (!TryConsumePermit($"provisioning:{ResolveRateLimitKey(httpContext)}", provisioningPermitLimit))
            {
                licensingAlertMonitor.RecordSecurityAnomaly("provisioning_rate_limit_exceeded");
                await WriteRateLimitExceededAsync(httpContext, "Too many provisioning requests. Please retry shortly.");
                return;
            }

            await next(httpContext);
            return;
        }

        if (TryResolveSensitiveScope(request.Path, request.Method, out var sensitiveScope))
        {
            var (limit, message, anomalyCode) = ResolveSensitiveScopePolicy(sensitiveScope);
            if (!TryConsumePermit($"sensitive:{sensitiveScope}:{ResolveRateLimitKey(httpContext)}", limit))
            {
                licensingAlertMonitor.RecordSecurityAnomaly(anomalyCode);
                await WriteRateLimitExceededAsync(httpContext, message);
                return;
            }

            await next(httpContext);
            return;
        }

        if (!TryResolveMarketingScope(request.Path, request.Method, out var marketingScope))
        {
            await next(httpContext);
            return;
        }

        var permitLimit = marketingScope switch
        {
            MarketingPaymentRequestScope => marketingPaymentRequestPermitLimit,
            MarketingPaymentSubmitScope => marketingPaymentSubmitPermitLimit,
            MarketingDownloadTrackScope => marketingDownloadTrackPermitLimit,
            _ => marketingPaymentSubmitPermitLimit
        };
        if (!TryConsumePermit($"marketing:{marketingScope}:{ResolveRateLimitKey(httpContext)}", permitLimit))
        {
            licensingAlertMonitor.RecordSecurityAnomaly($"marketing_{marketingScope}_rate_limit_exceeded");
            await WriteRateLimitExceededAsync(httpContext, "Too many payment requests. Please retry shortly.");
            return;
        }

        if (marketingScope == MarketingPaymentSubmitScope &&
            !TryRegisterMarketingSubmitIdempotency(httpContext))
        {
            licensingAlertMonitor.RecordSecurityAnomaly("marketing_payment_submit_replay_detected");
            httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
            await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
            {
                Error = new LicenseErrorItem
                {
                    Code = LicenseErrorCodes.DuplicateSubmission,
                    Message = "Duplicate payment submission detected. Please wait for verification."
                }
            });
            return;
        }

        await next(httpContext);
    }

    private static async Task WriteRateLimitExceededAsync(HttpContext httpContext, string message)
    {
        httpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = LicenseErrorCodes.RateLimitExceeded,
                Message = message
            }
        });
    }

    private static bool TryConsumePermit(string key, int permitLimit)
    {
        var queue = RequestTimesByKey.GetOrAdd(key, static _ => new ConcurrentQueue<DateTimeOffset>());
        var now = DateTimeOffset.UtcNow;
        var windowStart = now - RequestWindow;

        while (queue.TryPeek(out var timestamp) && timestamp < windowStart)
        {
            queue.TryDequeue(out _);
        }

        if (queue.Count >= permitLimit)
        {
            return false;
        }

        queue.Enqueue(now);
        return true;
    }

    private bool TryRegisterMarketingSubmitIdempotency(HttpContext httpContext)
    {
        var idempotencyKey = httpContext.Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            return true;
        }

        var now = DateTimeOffset.UtcNow;
        var threshold = now - marketingReplayGuardWindow;
        foreach (var candidate in MarketingSubmitIdempotencyKeys)
        {
            if (candidate.Value < threshold)
            {
                MarketingSubmitIdempotencyKeys.TryRemove(candidate.Key, out _);
            }
        }

        var cacheKey = $"submit:{idempotencyKey}";
        if (MarketingSubmitIdempotencyKeys.TryGetValue(cacheKey, out var firstSeenAt) &&
            firstSeenAt >= threshold)
        {
            return false;
        }

        MarketingSubmitIdempotencyKeys[cacheKey] = now;
        return true;
    }

    private static bool IsProvisioningMutation(PathString path, string method)
    {
        return HttpMethods.IsPost(method) &&
               (path.StartsWithSegments("/api/provision/activate", StringComparison.OrdinalIgnoreCase)
                || path.StartsWithSegments("/api/provision/deactivate", StringComparison.OrdinalIgnoreCase));
    }

    private const string MarketingPaymentRequestScope = "payment_request";
    private const string MarketingPaymentSubmitScope = "payment_submit";
    private const string MarketingDownloadTrackScope = "download_track";
    private const string SensitiveScopeLicenseAccessLookup = "license_access_lookup";
    private const string SensitiveScopeAccountPortalRead = "account_portal_read";
    private const string SensitiveScopeAccountDeviceDeactivate = "account_device_deactivate";
    private const string SensitiveScopeAiPaymentCheckout = "ai_payment_checkout";
    private const string SensitiveScopeAiPaymentStatusRead = "ai_payment_status_read";

    private static bool TryResolveMarketingScope(PathString path, string method, out string scope)
    {
        scope = string.Empty;
        if (!HttpMethods.IsPost(method) ||
            !path.StartsWithSegments("/api/license/public", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (path.StartsWithSegments("/api/license/public/payment-request", StringComparison.OrdinalIgnoreCase))
        {
            scope = MarketingPaymentRequestScope;
            return true;
        }

        if (path.StartsWithSegments("/api/license/public/payment-submit", StringComparison.OrdinalIgnoreCase))
        {
            scope = MarketingPaymentSubmitScope;
            return true;
        }

        if (path.StartsWithSegments("/api/license/public/download-track", StringComparison.OrdinalIgnoreCase))
        {
            scope = MarketingDownloadTrackScope;
            return true;
        }

        return false;
    }

    private static bool TryResolveSensitiveScope(PathString path, string method, out string scope)
    {
        scope = string.Empty;
        if (HttpMethods.IsGet(method) &&
            path.StartsWithSegments("/api/license/access/success", StringComparison.OrdinalIgnoreCase))
        {
            scope = SensitiveScopeLicenseAccessLookup;
            return true;
        }

        if (HttpMethods.IsGet(method) &&
            path.StartsWithSegments("/api/license/account/licenses", StringComparison.OrdinalIgnoreCase))
        {
            scope = SensitiveScopeAccountPortalRead;
            return true;
        }

        if (HttpMethods.IsPost(method) &&
            path.StartsWithSegments("/api/license/account/licenses/devices", StringComparison.OrdinalIgnoreCase) &&
            path.Value?.EndsWith("/deactivate", StringComparison.OrdinalIgnoreCase) == true)
        {
            scope = SensitiveScopeAccountDeviceDeactivate;
            return true;
        }

        if (HttpMethods.IsPost(method) &&
            path.StartsWithSegments("/api/ai/payments/checkout", StringComparison.OrdinalIgnoreCase))
        {
            scope = SensitiveScopeAiPaymentCheckout;
            return true;
        }

        if (HttpMethods.IsGet(method) &&
            (path.StartsWithSegments("/api/ai/payments", StringComparison.OrdinalIgnoreCase) ||
             path.StartsWithSegments("/api/ai/wallet", StringComparison.OrdinalIgnoreCase)))
        {
            scope = SensitiveScopeAiPaymentStatusRead;
            return true;
        }

        return false;
    }

    private (int Limit, string Message, string AnomalyCode) ResolveSensitiveScopePolicy(string scope)
    {
        return scope switch
        {
            SensitiveScopeLicenseAccessLookup => (
                licenseAccessLookupPermitLimit,
                "Too many license key lookup requests. Please retry shortly.",
                "license_access_lookup_rate_limit_exceeded"),
            SensitiveScopeAccountPortalRead => (
                accountPortalPermitLimit,
                "Too many account portal requests. Please retry shortly.",
                "account_portal_rate_limit_exceeded"),
            SensitiveScopeAccountDeviceDeactivate => (
                accountDeviceDeactivatePermitLimit,
                "Too many device deactivation requests. Please retry shortly.",
                "account_device_deactivation_rate_limit_exceeded"),
            SensitiveScopeAiPaymentCheckout => (
                aiPaymentCheckoutPermitLimit,
                "Too many AI top-up checkout requests. Please retry shortly.",
                "ai_payment_checkout_rate_limit_exceeded"),
            SensitiveScopeAiPaymentStatusRead => (
                aiPaymentStatusPermitLimit,
                "Too many AI payment status requests. Please retry shortly.",
                "ai_payment_status_rate_limit_exceeded"),
            _ => (
                accountPortalPermitLimit,
                "Too many requests. Please retry shortly.",
                "license_sensitive_rate_limit_exceeded")
        };
    }

    private static string ResolveRateLimitKey(HttpContext httpContext)
    {
        var deviceCode = httpContext.Request.Headers["X-Device-Code"].FirstOrDefault()?.Trim();
        if (!string.IsNullOrWhiteSpace(deviceCode))
        {
            return $"device:{deviceCode}";
        }

        var ip = httpContext.Connection.RemoteIpAddress?.ToString();
        return $"ip:{ip ?? "unknown"}";
    }
}
