using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class CloudLicensingSurfaceGuardMiddleware(
    RequestDelegate next,
    IOptions<LicenseOptions> optionsAccessor)
{
    private readonly LicenseOptions options = optionsAccessor.Value;

    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (options.CloudLicensingEndpointsEnabled ||
            !IsCloudLicensingSurfacePath(httpContext.Request.Path))
        {
            await next(httpContext);
            return;
        }

        httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = LicenseErrorCodes.CloudLicensingDisabled,
                Message = "Cloud licensing endpoints are disabled for this environment."
            }
        });
    }

    private static bool IsCloudLicensingSurfacePath(PathString path)
    {
        return path.StartsWithSegments("/api/license/public", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/webhooks", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/subscription/billing-provider", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/subscription/reconcile", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/admin/licensing/billing/reconciliation", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/cloud/v1", StringComparison.OrdinalIgnoreCase);
    }
}
