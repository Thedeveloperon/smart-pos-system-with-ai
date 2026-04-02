using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class ProvisioningRateLimitMiddleware(
    RequestDelegate next,
    IOptions<LicenseOptions> optionsAccessor,
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

        if (!TryResolveMarketingScope(request.Path, request.Method, out var marketingScope))
        {
            await next(httpContext);
            return;
        }

        var permitLimit = marketingScope == MarketingPaymentRequestScope
            ? marketingPaymentRequestPermitLimit
            : marketingPaymentSubmitPermitLimit;
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

        return false;
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
