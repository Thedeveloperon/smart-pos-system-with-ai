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

        return app;
    }
}
