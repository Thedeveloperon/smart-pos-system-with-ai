using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class LicenseEnforcementMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext httpContext,
        LicenseService licenseService,
        ILicensingAlertMonitor alertMonitor)
    {
        if (!licenseService.IsEnforcementEnabled() || ShouldSkipPath(httpContext.Request.Path))
        {
            await next(httpContext);
            return;
        }

        var endpoint = httpContext.GetEndpoint();
        if (endpoint is null || endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null)
        {
            await next(httpContext);
            return;
        }

        var hasAuthorizeMetadata = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Count > 0;
        if (!hasAuthorizeMetadata)
        {
            await next(httpContext);
            return;
        }

        if (IsSuperAdminPrincipal(httpContext.User))
        {
            await next(httpContext);
            return;
        }

        var deviceCode = licenseService.ResolveDeviceCode(null, httpContext);
        var licenseToken = licenseService.ResolveLicenseToken(httpContext);

        var decision = await licenseService.EvaluateRequestAsync(
            deviceCode,
            licenseToken,
            httpContext.Request.Path,
            httpContext.Request.Method,
            httpContext.RequestAborted);

        if (decision.AllowRequest)
        {
            if (decision.State.HasValue)
            {
                httpContext.Response.Headers["X-License-State"] = decision.State.Value.ToString().ToLowerInvariant();
            }

            await next(httpContext);
            return;
        }

        var code = decision.ErrorCode ?? LicenseErrorCodes.LicenseExpired;
        var message = decision.Message ?? "License validation failed.";
        alertMonitor.RecordLicenseValidationFailure(code);

        httpContext.Response.StatusCode = decision.StatusCode;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = code,
                Message = message
            }
        });
    }

    private static bool ShouldSkipPath(PathString path)
    {
        return path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/security/challenge", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/admin", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/status", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/heartbeat", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/provision/activate", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSuperAdminPrincipal(ClaimsPrincipal principal)
    {
        return principal.IsInRole(SmartPosRoles.SuperAdmin) ||
               principal.IsInRole(SmartPosRoles.Support) ||
               principal.IsInRole(SmartPosRoles.BillingAdmin) ||
               principal.IsInRole(SmartPosRoles.SecurityAdmin);
    }
}
