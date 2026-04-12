using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.CloudAccount;

public static class CloudAccountEndpoints
{
    public static IEndpointRouteBuilder MapCloudAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cloud-account")
            .WithTags("Cloud Account")
            .RequireAuthorization();

        group.MapGet("/status", [Authorize(Roles = SmartPosRoles.Owner)] async (
            CloudAccountService cloudAccountService,
            CancellationToken cancellationToken) =>
        {
            var response = await cloudAccountService.GetStatusAsync(cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetCloudAccountStatus")
        .WithOpenApi();

        group.MapPost("/link", [Authorize(Roles = SmartPosRoles.Owner)] async (
            CloudAccountLinkRequest request,
            CloudAccountService cloudAccountService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await cloudAccountService.LinkAsync(
                    request.Username,
                    request.Password,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("LinkCloudAccount")
        .WithOpenApi();

        group.MapDelete("/unlink", [Authorize(Roles = SmartPosRoles.Owner)] async (
            CloudAccountService cloudAccountService,
            CancellationToken cancellationToken) =>
        {
            await cloudAccountService.UnlinkAsync(cancellationToken);
            return Results.Ok(new { message = "Cloud account unlinked." });
        })
        .WithName("UnlinkCloudAccount")
        .WithOpenApi();

        return app;
    }
}
