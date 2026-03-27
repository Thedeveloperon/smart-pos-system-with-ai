namespace SmartPos.Backend.Features.Receipts;

public static class ReceiptEndpoints
{
    public static IEndpointRouteBuilder MapReceiptEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/receipts")
            .WithTags("Receipts")
            .RequireAuthorization();

        group.MapGet("/{saleId:guid}", async (
            Guid saleId,
            ReceiptService receiptService,
            CancellationToken cancellationToken) =>
        {
            var sale = await receiptService.GetReceiptAsync(saleId, cancellationToken);
            return sale is null ? Results.NotFound() : Results.Ok(sale);
        })
        .WithName("GetReceipt")
        .WithOpenApi();

        group.MapGet("/{saleId:guid}/thermal", async (
            Guid saleId,
            ReceiptService receiptService,
            CancellationToken cancellationToken) =>
        {
            var sale = await receiptService.GetReceiptAsync(saleId, cancellationToken);
            if (sale is null)
            {
                return Results.NotFound();
            }

            if (!ReceiptService.IsReceiptAvailable(sale))
            {
                return Results.BadRequest(new { message = "Receipt is available only after payment." });
            }

            var receiptText = ReceiptService.BuildThermalText(sale);
            return Results.Text(receiptText, "text/plain; charset=utf-8");
        })
        .WithName("GetThermalReceipt")
        .WithOpenApi();

        group.MapGet("/{saleId:guid}/whatsapp", async (
            Guid saleId,
            string? phone,
            ReceiptService receiptService,
            CancellationToken cancellationToken) =>
        {
            var sale = await receiptService.GetReceiptAsync(saleId, cancellationToken);
            if (sale is null)
            {
                return Results.NotFound();
            }

            if (!ReceiptService.IsReceiptAvailable(sale))
            {
                return Results.BadRequest(new { message = "Digital receipt is available only after payment." });
            }

            var message = ReceiptService.BuildWhatsappMessage(sale);
            var url = ReceiptService.BuildWhatsappUrl(message, phone);
            return Results.Ok(new { message, url });
        })
        .WithName("GetWhatsappReceipt")
        .WithOpenApi();

        return app;
    }
}
