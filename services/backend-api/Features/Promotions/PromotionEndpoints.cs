using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Promotions;

public static class PromotionEndpoints
{
    public static IEndpointRouteBuilder MapPromotionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/promotions")
            .WithTags("Promotions")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("", async (
            PromotionService service,
            CancellationToken cancellationToken) =>
        {
            var items = await service.ListPromotionsAsync(cancellationToken);
            return Results.Ok(new { items });
        })
        .WithName("ListPromotions")
        .WithOpenApi();

        group.MapGet("/{promotionId:guid}", async (
            Guid promotionId,
            PromotionService service,
            CancellationToken cancellationToken) =>
        {
            var item = await service.GetPromotionAsync(promotionId, cancellationToken);
            return item is null ? Results.NotFound() : Results.Ok(item);
        })
        .WithName("GetPromotion")
        .WithOpenApi();

        group.MapPost("", async (
            UpsertPromotionRequest request,
            PromotionService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.CreatePromotionAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CreatePromotion")
        .WithOpenApi();

        group.MapPut("/{promotionId:guid}", async (
            Guid promotionId,
            UpsertPromotionRequest request,
            PromotionService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.UpdatePromotionAsync(promotionId, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("UpdatePromotion")
        .WithOpenApi();

        group.MapDelete("/{promotionId:guid}", async (
            Guid promotionId,
            PromotionService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await service.DeactivatePromotionAsync(promotionId, cancellationToken);
                return Results.NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .WithName("DeletePromotion")
        .WithOpenApi();

        return app;
    }
}
