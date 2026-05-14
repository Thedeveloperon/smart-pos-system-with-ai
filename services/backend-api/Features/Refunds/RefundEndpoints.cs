using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Refunds;

public static class RefundEndpoints
{
    public static IEndpointRouteBuilder MapRefundEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/refunds")
            .WithTags("Refunds")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("/", async (
            CreateRefundRequest request,
            RefundService refundService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await refundService.CreateRefundAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CreateRefund")
        .WithOpenApi();

        group.MapGet("/sale/{saleId:guid}", async (
            Guid saleId,
            RefundService refundService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await refundService.GetSaleRefundSummaryAsync(saleId, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .WithName("GetSaleRefundSummary")
        .WithOpenApi();

        return app;
    }
}
