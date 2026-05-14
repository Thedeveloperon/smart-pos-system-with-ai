using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Auth;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/account")
            .WithTags("Account");

        group.MapPost("/login", async (
            AccountLoginRequest request,
            AuthService authService,
            JwtCookieOptions jwtOptions,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var (token, session) = await authService.LoginAccountAsync(request, cancellationToken);
                AppendAuthCookie(httpContext, jwtOptions, token, session.ExpiresAt);
                return Results.Ok(session);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .AllowAnonymous()
        .WithName("AccountLogin")
        .WithOpenApi();

        group.MapGet("/me", [Authorize] async (
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            var session = await authService.GetCurrentAccountSessionAsync(
                httpContext.User,
                cancellationToken);
            return session is null ? Results.Unauthorized() : Results.Ok(session);
        })
        .WithName("GetAccountSession")
        .WithOpenApi();

        group.MapGet("/tenant-context", [Authorize] async (
            HttpContext httpContext,
            AuthService authService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await authService.GetTenantContextAsync(httpContext.User, cancellationToken);
                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetAccountTenantContext")
        .WithOpenApi();

        group.MapGet("/ai/wallet", [Authorize(Policy = SmartPosPolicies.ManagerOrOwner)] async (
            ClaimsPrincipal user,
            AiCreditBillingService creditBillingService,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            var wallet = await creditBillingService.GetWalletAsync(userId.Value, cancellationToken);
            return Results.Ok(wallet);
        })
        .WithName("GetAccountAiWallet")
        .WithOpenApi();

        group.MapGet("/ai/ledger", [Authorize(Policy = SmartPosPolicies.ManagerOrOwner)] async (
            ClaimsPrincipal user,
            AiCreditBillingService creditBillingService,
            int? take,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            var ledger = await creditBillingService.GetLedgerAsync(userId.Value, take.GetValueOrDefault(50), cancellationToken);
            return Results.Ok(ledger);
        })
        .WithName("GetAccountAiLedger")
        .WithOpenApi();

        group.MapGet("/ai/payments", [Authorize(Policy = SmartPosPolicies.ManagerOrOwner)] async (
            ClaimsPrincipal user,
            AiCreditPaymentService paymentService,
            int? take,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            var payments = await paymentService.GetPaymentHistoryAsync(userId.Value, take.GetValueOrDefault(20), cancellationToken);
            return Results.Ok(payments);
        })
        .WithName("GetAccountAiPayments")
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

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }
}
