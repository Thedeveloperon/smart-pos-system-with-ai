using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Settings;

public static class SettingsEndpoints
{
    public static IEndpointRouteBuilder MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/settings")
            .WithTags("Settings")
            .RequireAuthorization();

        group.MapGet("/shop-profile", async (
            ShopProfileService shopProfileService,
            CancellationToken cancellationToken) =>
        {
            var profile = await shopProfileService.GetAsync(cancellationToken);
            return Results.Ok(profile);
        })
        .WithName("GetShopProfile")
        .WithOpenApi();

        group.MapPut("/shop-profile", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            UpdateShopProfileRequest request,
            ShopProfileService shopProfileService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var profile = await shopProfileService.UpdateAsync(request, cancellationToken);
                return Results.Ok(profile);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("UpdateShopProfile")
        .WithOpenApi();

        return app;
    }
}
