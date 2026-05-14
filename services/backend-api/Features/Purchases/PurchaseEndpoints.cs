using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Purchases;

public static class PurchaseEndpoints
{
    public static IEndpointRouteBuilder MapPurchaseEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/purchases").WithTags("Purchases");

        group.MapPost("/imports/ocr-draft", async (
            HttpRequest request,
            PurchaseService purchaseService,
            CancellationToken cancellationToken) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { message = "Use multipart/form-data with a 'file' field." });
            }

            var form = await request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("file");
            var supplierHint = form["supplier_hint"].FirstOrDefault();

            try
            {
                var result = await purchaseService.CreateOcrDraftAsync(
                    file,
                    supplierHint,
                    request.HttpContext.TraceIdentifier,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .DisableAntiforgery()
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreatePurchaseOcrDraft")
        .WithOpenApi();

        group.MapPost("/imports/confirm", async (
            PurchaseImportConfirmRequest request,
            PurchaseService purchaseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseService.ConfirmImportAsync(request, cancellationToken);
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
        .WithName("ConfirmPurchaseImport")
        .WithOpenApi();

        group.MapGet("/bills", async (
            Guid? supplier_id,
            Guid? po_id,
            DateTimeOffset? from_date,
            DateTimeOffset? to_date,
            int? page,
            int? take,
            PurchaseService purchaseService,
            CancellationToken cancellationToken) =>
        {
            var result = await purchaseService.ListBillsAsync(
                supplier_id,
                po_id,
                from_date,
                to_date,
                page,
                take,
                cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ListPurchaseBills")
        .WithOpenApi();

        group.MapGet("/bills/{id:guid}", async (
            Guid id,
            PurchaseService purchaseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseService.GetBillAsync(id, cancellationToken);
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
        .WithName("GetPurchaseBill")
        .WithOpenApi();

        group.MapPost("/bills/manual", async (
            CreateManualBillRequest request,
            PurchaseService purchaseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await purchaseService.CreateManualBillAsync(request, cancellationToken);
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
        .WithName("CreateManualPurchaseBill")
        .WithOpenApi();

        return app;
    }
}
