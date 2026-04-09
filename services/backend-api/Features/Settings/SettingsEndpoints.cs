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

        group.MapGet("/stock-settings", async (
            ShopStockSettingsService shopStockSettingsService,
            CancellationToken cancellationToken) =>
        {
            var settings = await shopStockSettingsService.GetAsync(cancellationToken);
            return Results.Ok(settings);
        })
        .WithName("GetShopStockSettings")
        .WithOpenApi();

        group.MapPut("/stock-settings", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            UpdateShopStockSettingsRequest request,
            ShopStockSettingsService shopStockSettingsService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var settings = await shopStockSettingsService.UpdateAsync(request, cancellationToken);
                return Results.Ok(settings);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("UpdateShopStockSettings")
        .WithOpenApi();

        return app;
    }
}
