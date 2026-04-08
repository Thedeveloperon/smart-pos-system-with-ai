using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Security;

public sealed class CloudLegacyApiDeprecationMiddleware(
    RequestDelegate next,
    IOptions<CloudApiCompatibilityOptions> optionsAccessor)
{
    private readonly CloudApiCompatibilityOptions options = optionsAccessor.Value;

    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (!options.LegacyApiDeprecationEnabled ||
            !TryResolveLegacyRoute(httpContext.Request.Path, out var successorRoute))
        {
            await next(httpContext);
            return;
        }

        httpContext.Response.OnStarting(() =>
        {
            if (TryParseDate(options.LegacyApiDeprecationDateUtc, out var deprecationDate))
            {
                httpContext.Response.Headers["Deprecation"] = deprecationDate.ToString("R");
            }
            else
            {
                httpContext.Response.Headers["Deprecation"] = "true";
            }

            if (TryParseDate(options.LegacyApiSunsetDateUtc, out var sunsetDate))
            {
                httpContext.Response.Headers["Sunset"] = sunsetDate.ToString("R");
            }

            var migrationGuideUrl = string.IsNullOrWhiteSpace(options.LegacyApiMigrationGuideUrl)
                ? "/cloud/v1/meta/contracts"
                : options.LegacyApiMigrationGuideUrl.Trim();
            httpContext.Response.Headers["Link"] = $"<{successorRoute}>; rel=\"successor-version\", <{migrationGuideUrl}>; rel=\"deprecation\"";
            httpContext.Response.Headers["X-Legacy-Api-Route"] = "true";
            return Task.CompletedTask;
        });

        await next(httpContext);
    }

    private static bool TryResolveLegacyRoute(PathString path, out string successorRoute)
    {
        successorRoute = string.Empty;
        if (path.StartsWithSegments("/api/provision/challenge", StringComparison.OrdinalIgnoreCase))
        {
            successorRoute = "/cloud/v1/device/challenge";
            return true;
        }

        if (path.StartsWithSegments("/api/provision/activate", StringComparison.OrdinalIgnoreCase))
        {
            successorRoute = "/cloud/v1/device/activate";
            return true;
        }

        if (path.StartsWithSegments("/api/provision/deactivate", StringComparison.OrdinalIgnoreCase))
        {
            successorRoute = "/cloud/v1/device/deactivate";
            return true;
        }

        if (path.StartsWithSegments("/api/license/status", StringComparison.OrdinalIgnoreCase))
        {
            successorRoute = "/cloud/v1/license/status";
            return true;
        }

        if (path.StartsWithSegments("/api/license/heartbeat", StringComparison.OrdinalIgnoreCase))
        {
            successorRoute = "/cloud/v1/license/heartbeat";
            return true;
        }

        return false;
    }

    private static bool TryParseDate(string? raw, out DateTimeOffset value)
    {
        return DateTimeOffset.TryParse(raw, out value);
    }
}
