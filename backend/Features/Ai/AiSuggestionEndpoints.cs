using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public static class AiSuggestionEndpoints
{
    public static IEndpointRouteBuilder MapAiSuggestionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai")
            .WithTags("AI")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("/product-suggestions", async (
            ProductSuggestionRequest request,
            AiSuggestionService aiSuggestionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await aiSuggestionService.GenerateProductSuggestionAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetProductSuggestion")
        .WithOpenApi();

        group.MapPost("/product-from-image", async (
            ProductFromImageRequest request,
            AiSuggestionService aiSuggestionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await aiSuggestionService.GenerateProductFromImageAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetProductFromImage")
        .WithOpenApi();

        return app;
    }
}
