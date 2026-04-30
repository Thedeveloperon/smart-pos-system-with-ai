using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Purchases;

public static class PurchaseOrderEndpoints
{
    public static IEndpointRouteBuilder MapPurchaseOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/purchase-orders").WithTags("Purchase Orders");

        group.MapGet("", async (
            Guid? supplier_id,
            string? status,
            DateTimeOffset? from_date,
            DateTimeOffset? to_date,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            var result = await purchaseOrderService.ListPurchaseOrdersAsync(
                supplier_id,
                status,
                from_date,
                to_date,
                cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ListPurchaseOrders")
        .WithOpenApi();

        group.MapPost("", async (
            CreatePurchaseOrderRequest request,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.CreatePurchaseOrderAsync(request, cancellationToken);
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
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreatePurchaseOrder")
        .WithOpenApi();

        group.MapGet("/{id:guid}", async (
            Guid id,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.GetPurchaseOrderAsync(id, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetPurchaseOrder")
        .WithOpenApi();

        group.MapPatch("/{id:guid}", async (
            Guid id,
            UpdatePurchaseOrderRequest request,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.UpdatePurchaseOrderAsync(id, request, cancellationToken);
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
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("UpdatePurchaseOrder")
        .WithOpenApi();

        group.MapPost("/{id:guid}/send", async (
            Guid id,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.SendPurchaseOrderAsync(id, cancellationToken);
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
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("SendPurchaseOrder")
        .WithOpenApi();

        group.MapPost("/{id:guid}/receive", async (
            Guid id,
            ReceivePurchaseOrderRequest request,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.ReceivePurchaseOrderAsync(id, request, cancellationToken);
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
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ReceivePurchaseOrder")
        .WithOpenApi();

        group.MapPost("/{id:guid}/cancel", async (
            Guid id,
            PurchaseOrderService purchaseOrderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseOrderService.CancelPurchaseOrderAsync(id, cancellationToken);
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
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CancelPurchaseOrder")
        .WithOpenApi();

        return app;
    }
}
