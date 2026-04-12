using Microsoft.AspNetCore.Authorization;

namespace SmartPos.Backend.Features.Auth;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/account")
            .WithTags("Account")
            .RequireAuthorization();

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

        return app;
    }
}
