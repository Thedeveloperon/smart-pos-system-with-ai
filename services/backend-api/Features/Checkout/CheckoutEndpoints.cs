using System.Security.Claims;

namespace SmartPos.Backend.Features.Checkout;

public static class CheckoutEndpoints
{
    public static IEndpointRouteBuilder MapCheckoutEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/checkout")
            .WithTags("Checkout")
            .RequireAuthorization();

        group.MapGet("/held", async (
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            var items = await service.GetHeldSalesAsync(cancellationToken);
            return Results.Ok(new { items });
        })
        .WithName("ListHeldSales")
        .WithOpenApi();

        group.MapGet("/history", async (
            int? take,
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            var items = await service.GetRecentSalesAsync(take ?? 20, cancellationToken);
            return Results.Ok(new { items });
        })
        .WithName("ListRecentSales")
        .WithOpenApi();

        group.MapGet("/held/{saleId:guid}", async (
            Guid saleId,
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            var sale = await service.GetSaleAsync(saleId, cancellationToken);
            return sale is null ? Results.NotFound() : Results.Ok(sale);
        })
        .WithName("GetHeldSale")
        .WithOpenApi();

        group.MapPost("/hold", async (
            HoldSaleRequest request,
            ClaimsPrincipal user,
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                request.Role = ResolveRole(user);
                var result = await service.HoldAsync(request, ResolveUserId(user), cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("HoldSale")
        .WithOpenApi();

        group.MapPost("/complete", async (
            CompleteSaleRequest request,
            ClaimsPrincipal user,
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                request.Role = ResolveRole(user);
                var result = await service.CompleteAsync(request, ResolveUserId(user), cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CompleteSale")
        .WithOpenApi();

        group.MapPost("/{saleId:guid}/void", async (
            Guid saleId,
            CheckoutService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.VoidAsync(saleId, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("VoidSale")
        .WithOpenApi();

        return app;
    }

    private static string ResolveRole(ClaimsPrincipal user)
    {
        return user.FindFirstValue(ClaimTypes.Role) ?? "cashier";
    }

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }
}
