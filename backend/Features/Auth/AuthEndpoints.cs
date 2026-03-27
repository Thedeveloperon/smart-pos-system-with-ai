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

        group.MapPost("/logout", [Authorize] (
            HttpContext httpContext,
            JwtCookieOptions jwtOptions) =>
        {
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
