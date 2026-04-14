using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class LicenseEnforcementMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext httpContext,
        LicenseService licenseService,
        LicenseCloudRelayService cloudRelayService,
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
        var policySnapshotToken = licenseService.ResolvePolicySnapshotToken(httpContext);
        var policySnapshotClientTime = licenseService.ResolvePolicySnapshotClientTime(httpContext);

        var decision = cloudRelayService.IsEnabled
            ? await EvaluateRequestWithRelayAsync(
                httpContext,
                licenseService,
                cloudRelayService,
                deviceCode,
                licenseToken)
            : await licenseService.EvaluateRequestAsync(
                deviceCode,
                licenseToken,
                httpContext.Request.Path,
                httpContext.Request.Method,
                httpContext.RequestAborted,
                policySnapshotToken,
                policySnapshotClientTime);

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

    private static async Task<LicenseGuardDecision> EvaluateRequestWithRelayAsync(
        HttpContext httpContext,
        LicenseService licenseService,
        LicenseCloudRelayService cloudRelayService,
        string deviceCode,
        string? licenseToken)
    {
        try
        {
            var status = await cloudRelayService.GetStatusAsync(
                deviceCode,
                licenseToken,
                httpContext,
                httpContext.RequestAborted);

            var state = ParseLicenseState(status.State);
            if (state == LicenseState.Unprovisioned)
            {
                return LicenseGuardDecision.Deny(
                    LicenseErrorCodes.Unprovisioned,
                    "Device is not provisioned.",
                    StatusCodes.Status403Forbidden,
                    state);
            }

            if (state == LicenseState.Revoked)
            {
                return LicenseGuardDecision.Deny(
                    LicenseErrorCodes.Revoked,
                    "License is revoked.",
                    StatusCodes.Status403Forbidden,
                    state);
            }

            if (state == LicenseState.Suspended &&
                licenseService.IsBlockedWhenSuspended(httpContext.Request.Path, httpContext.Request.Method))
            {
                return LicenseGuardDecision.Deny(
                    LicenseErrorCodes.LicenseExpired,
                    "License is suspended for checkout/refund operations.",
                    StatusCodes.Status403Forbidden,
                    state);
            }

            return LicenseGuardDecision.Allow(state);
        }
        catch (LicenseException ex)
        {
            return LicenseGuardDecision.Deny(ex.Code, ex.Message, ex.StatusCode);
        }
    }

    private static LicenseState ParseLicenseState(string? state)
    {
        return Enum.TryParse<LicenseState>(state, ignoreCase: true, out var parsed)
            ? parsed
            : LicenseState.Unprovisioned;
    }

    private static bool ShouldSkipPath(PathString path)
    {
        return path.StartsWithSegments("/health", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/account", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/cloud-account", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/account", StringComparison.OrdinalIgnoreCase)
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
