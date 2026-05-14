using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Purchases;

public static class CloudPurchaseRelayEndpoints
{
    public static IEndpointRouteBuilder MapCloudPurchaseRelayEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/cloud/v1/purchases")
            .WithTags("Cloud v1 Purchases");

        group.MapPost("/ocr/extract", async (
            HttpRequest request,
            IOcrProvider ocrProvider,
            CancellationToken cancellationToken) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { message = "Use multipart/form-data with a 'file' field." });
            }

            var form = await request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("file");
            if (file is null || file.Length <= 0)
            {
                return Results.BadRequest(new { message = "A supplier bill file is required." });
            }

            await using var stream = file.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);

            var payload = new BillFileData(
                file.FileName,
                string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                memory.ToArray());

            try
            {
                var extraction = await ocrProvider.ExtractAsync(payload, cancellationToken);
                return Results.Ok(extraction);
            }
            catch (OcrProviderUnavailableException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .DisableAntiforgery()
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CloudPurchaseRelayExtractOcr")
        .WithOpenApi();

        return app;
    }
}
