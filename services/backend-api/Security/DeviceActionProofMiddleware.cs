using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class DeviceActionProofMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext httpContext,
        DeviceActionProofService deviceActionProofService,
        LicenseService licenseService)
    {
        if (ShouldSkipPath(httpContext.Request.Path))
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
        if (!hasAuthorizeMetadata || !(httpContext.User.Identity?.IsAuthenticated ?? false))
        {
            await next(httpContext);
            return;
        }

        if (IsSuperAdminPrincipal(httpContext.User))
        {
            await next(httpContext);
            return;
        }

        if (!deviceActionProofService.ShouldProtectRequest(httpContext.Request.Path, httpContext.Request.Method))
        {
            await next(httpContext);
            return;
        }

        var hasProofHeaders = deviceActionProofService.HasAnyProofHeaders(httpContext.Request.Headers);
        if (!hasProofHeaders && !deviceActionProofService.RequiresProofForSensitiveActions)
        {
            await next(httpContext);
            return;
        }

        if (!hasProofHeaders && deviceActionProofService.RequiresProofForSensitiveActions)
        {
            await WriteDeniedAsync(
                httpContext,
                LicenseErrorCodes.DeviceProofRequired,
                "Device proof headers are required for this action.",
                StatusCodes.Status403Forbidden);
            return;
        }

        var deviceCode = licenseService.ResolveDeviceCode(null, httpContext);
        var validation = await deviceActionProofService.ValidateRequestAsync(
            httpContext,
            deviceCode,
            httpContext.RequestAborted);

        if (!validation.Success)
        {
            await WriteDeniedAsync(
                httpContext,
                validation.ErrorCode ?? LicenseErrorCodes.InvalidDeviceProof,
                validation.Message ?? "Device proof validation failed.",
                validation.StatusCode);
            return;
        }

        httpContext.Response.Headers["X-Device-Proof"] = "verified";
        await next(httpContext);
    }

    private static async Task WriteDeniedAsync(
        HttpContext httpContext,
        string errorCode,
        string message,
        int statusCode)
    {
        httpContext.Response.StatusCode = statusCode;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = errorCode,
                Message = message
            }
        });
    }

    private static bool ShouldSkipPath(PathString path)
    {
        return path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/security/challenge", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSuperAdminPrincipal(ClaimsPrincipal principal)
    {
        return principal.IsInRole(SmartPosRoles.SuperAdmin) ||
               principal.IsInRole(SmartPosRoles.Support) ||
               principal.IsInRole(SmartPosRoles.BillingAdmin) ||
               principal.IsInRole(SmartPosRoles.SecurityAdmin);
    }
}
