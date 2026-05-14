using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Security;

public sealed class AuthSessionRevocationMiddleware(RequestDelegate next)
{
    private const string CloudCommerceAuthModeVariable = "CloudCommerceAuthMode";

    public async Task InvokeAsync(
        HttpContext httpContext,
        SmartPosDbContext dbContext,
        IOptions<AuthSecurityOptions> authSecurityOptionsAccessor,
        JwtCookieOptions jwtCookieOptions)
    {
        var options = authSecurityOptionsAccessor.Value;
        if (!options.EnforceSessionRevocation)
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

        var userId = ParseGuid(
            httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier) ??
            httpContext.User.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var sessionId = ParseGuid(httpContext.User.FindFirstValue("session_id"));
        var sessionVersion = ParseSessionVersion(httpContext.User.FindFirstValue("auth_session_version"));

        if (!userId.HasValue || !sessionId.HasValue || sessionVersion <= 0)
        {
            await RejectAsync(
                httpContext,
                jwtCookieOptions,
                "AUTH_SESSION_INVALID",
                "Authenticated session is invalid.");
            return;
        }

        if (RequiresCredentialsOnlyCloudSession(httpContext.Request.Path) &&
            sessionVersion < 2)
        {
            await RejectAsync(
                httpContext,
                jwtCookieOptions,
                "AUTH_SESSION_UPGRADE_REQUIRED",
                "Cloud commerce session expired. Please sign in again.");
            return;
        }

        var user = await dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId.Value && x.IsActive, httpContext.RequestAborted);
        if (user is null)
        {
            await RejectAsync(
                httpContext,
                jwtCookieOptions,
                "AUTH_SESSION_REVOKED",
                "Authenticated session has been revoked.");
            return;
        }

        var session = await dbContext.Devices
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == sessionId.Value &&
                     x.AppUserId == userId.Value,
                httpContext.RequestAborted);
        if (session is null)
        {
            await RejectAsync(
                httpContext,
                jwtCookieOptions,
                "AUTH_SESSION_REVOKED",
                "Authenticated session has been revoked.");
            return;
        }

        var expectedVersion = Math.Max(1, session.AuthSessionVersion);
        if (session.AuthSessionRevokedAtUtc.HasValue || sessionVersion != expectedVersion)
        {
            await RejectAsync(
                httpContext,
                jwtCookieOptions,
                "AUTH_SESSION_REVOKED",
                "Authenticated session has been revoked.");
            return;
        }

        await next(httpContext);
    }

    private static int ParseSessionVersion(string? claimValue)
    {
        if (!int.TryParse(claimValue, out var parsed))
        {
            return 0;
        }

        return Math.Max(0, parsed);
    }

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }

    private static bool RequiresCredentialsOnlyCloudSession(PathString path)
    {
        if (path.StartsWithSegments("/api/account", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWithSegments("/api/license/account", StringComparison.OrdinalIgnoreCase))
        {
            return IsCredentialsOnlyCloudModeEnabled();
        }

        return false;
    }

    private static bool IsCredentialsOnlyCloudModeEnabled()
    {
        var configured = Environment.GetEnvironmentVariable(CloudCommerceAuthModeVariable);
        if (string.IsNullOrWhiteSpace(configured))
        {
            return true;
        }

        return !string.Equals(
            configured.Trim(),
            "legacy",
            StringComparison.OrdinalIgnoreCase);
    }

    private static async Task RejectAsync(
        HttpContext httpContext,
        JwtCookieOptions jwtCookieOptions,
        string code,
        string message)
    {
        httpContext.Response.Cookies.Delete(jwtCookieOptions.CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = jwtCookieOptions.SecureCookie,
            SameSite = SameSiteMode.Lax,
            IsEssential = true,
            Path = "/"
        });
        httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await httpContext.Response.WriteAsJsonAsync(new
        {
            error = new
            {
                code,
                message
            }
        });
    }
}
