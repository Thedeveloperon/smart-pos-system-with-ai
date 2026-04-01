using System.Collections.Concurrent;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class ProvisioningRateLimitMiddleware(RequestDelegate next)
{
    private static readonly ConcurrentDictionary<string, ConcurrentQueue<DateTimeOffset>> RequestTimesByKey = new();
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private const int PermitLimit = 20;

    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (!IsProvisioningMutation(httpContext.Request.Path, httpContext.Request.Method))
        {
            await next(httpContext);
            return;
        }

        var key = ResolveRateLimitKey(httpContext);
        var queue = RequestTimesByKey.GetOrAdd(key, static _ => new ConcurrentQueue<DateTimeOffset>());
        var now = DateTimeOffset.UtcNow;
        var windowStart = now - Window;

        while (queue.TryPeek(out var timestamp) && timestamp < windowStart)
        {
            queue.TryDequeue(out _);
        }

        if (queue.Count >= PermitLimit)
        {
            httpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
            {
                Error = new LicenseErrorItem
                {
                    Code = "RATE_LIMIT_EXCEEDED",
                    Message = "Too many provisioning requests. Please retry shortly."
                }
            });
            return;
        }

        queue.Enqueue(now);
        await next(httpContext);
    }

    private static bool IsProvisioningMutation(PathString path, string method)
    {
        return HttpMethods.IsPost(method) &&
               (path.StartsWithSegments("/api/provision/activate", StringComparison.OrdinalIgnoreCase)
                || path.StartsWithSegments("/api/provision/deactivate", StringComparison.OrdinalIgnoreCase));
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
