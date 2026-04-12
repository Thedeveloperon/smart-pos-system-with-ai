using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (
            LoginRequest request,
            AuthService authService,
            JwtCookieOptions jwtOptions,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var (token, session) = await authService.LoginAsync(request, cancellationToken);
                AppendAuthCookie(httpContext, jwtOptions, token, session.ExpiresAt);
                return Results.Ok(session);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .AllowAnonymous()
        .WithName("Login")
        .WithOpenApi();

        group.MapPost("/logout", [Authorize] async (
            HttpContext httpContext,
            AuthService authService,
            JwtCookieOptions jwtOptions,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var revokeRequest = new AuthSessionRevokeRequest
                {
                    Reason = "logout"
                };
                _ = authService.RevokeSessionAsync(
                    httpContext.User,
                    httpContext.User.FindFirst("terminal_id")?.Value ??
                    httpContext.User.FindFirst("device_code")?.Value ??
                    string.Empty,
                    revokeRequest,
                    cancellationToken);
            }
            catch
            {
                // Logout should still clear local auth cookie even if revocation persistence fails.
            }

            DeleteAuthCookie(httpContext, jwtOptions);
            return Results.Ok(new { message = "Logged out." });
        })
        .WithName("Logout")
        .WithOpenApi();

        group.MapGet("/me", [Authorize] async (
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            var session = await authService.GetCurrentSessionAsync(
                httpContext.User,
                cancellationToken);
            return session is null ? Results.Unauthorized() : Results.Ok(session);
        })
        .WithName("GetSession")
        .WithOpenApi();

        group.MapGet("/sessions", [Authorize] async (
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await authService.GetSessionDevicesAsync(httpContext.User, cancellationToken);
                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetAuthSessions")
        .WithOpenApi();

        group.MapPost("/sessions/{device_code}/revoke", [Authorize] async (
            string device_code,
            AuthSessionRevokeRequest request,
            HttpContext httpContext,
            AuthService authService,
            JwtCookieOptions jwtOptions,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await authService.RevokeSessionAsync(
                    httpContext.User,
                    device_code,
                    request,
                    cancellationToken);
                if (response.CurrentSessionRevoked)
                {
                    DeleteAuthCookie(httpContext, jwtOptions);
                }

                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("RevokeAuthSession")
        .WithOpenApi();

        group.MapPost("/sessions/by-id/{session_id:guid}/revoke", [Authorize] async (
            Guid session_id,
            AuthSessionRevokeRequest request,
            HttpContext httpContext,
            AuthService authService,
            JwtCookieOptions jwtOptions,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await authService.RevokeSessionByIdAsync(
                    httpContext.User,
                    session_id,
                    request,
                    cancellationToken);
                if (response.CurrentSessionRevoked)
                {
                    DeleteAuthCookie(httpContext, jwtOptions);
                }

                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("RevokeAuthSessionById")
        .WithOpenApi();

        group.MapPost("/sessions/revoke-others", [Authorize] async (
            AuthSessionRevokeRequest request,
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await authService.RevokeOtherSessionsAsync(
                    httpContext.User,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("RevokeOtherAuthSessions")
        .WithOpenApi();

        return app;
    }

    private static void AppendAuthCookie(
        HttpContext httpContext,
        JwtCookieOptions jwtOptions,
        string token,
        DateTimeOffset expiresAt)
    {
        httpContext.Response.Cookies.Append(jwtOptions.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = jwtOptions.SecureCookie,
            SameSite = SameSiteMode.Lax,
            IsEssential = true,
            Expires = expiresAt.UtcDateTime,
            Path = "/"
        });
    }

    private static void DeleteAuthCookie(HttpContext httpContext, JwtCookieOptions jwtOptions)
    {
        httpContext.Response.Cookies.Delete(jwtOptions.CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = jwtOptions.SecureCookie,
            SameSite = SameSiteMode.Lax,
            IsEssential = true,
            Path = "/"
        });
    }
}
