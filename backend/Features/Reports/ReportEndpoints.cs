using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Reports;

public static class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reports")
            .WithTags("Reports")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("/daily", async (
            DateOnly? from,
            DateOnly? to,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetDailySalesReportAsync(from, to, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetDailySalesReport")
        .WithOpenApi();

        group.MapGet("/transactions", async (
            DateOnly? from,
            DateOnly? to,
            int? take,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetTransactionsReportAsync(from, to, take ?? 50, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetTransactionsReport")
        .WithOpenApi();

        group.MapGet("/payment-breakdown", async (
            DateOnly? from,
            DateOnly? to,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetPaymentBreakdownReportAsync(from, to, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetPaymentBreakdownReport")
        .WithOpenApi();

        group.MapGet("/top-items", async (
            DateOnly? from,
            DateOnly? to,
            int? take,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetTopItemsReportAsync(from, to, take ?? 10, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetTopItemsReport")
        .WithOpenApi();

        group.MapGet("/worst-items", async (
            DateOnly? from,
            DateOnly? to,
            int? take,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetWorstItemsReportAsync(from, to, take ?? 10, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetWorstItemsReport")
        .WithOpenApi();

        group.MapGet("/monthly-forecast", async (
            int? months,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await reportService.GetMonthlySalesForecastReportAsync(months ?? 6, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetMonthlySalesForecastReport")
        .WithOpenApi();

        group.MapGet("/low-stock", async (
            int? take,
            decimal? threshold,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var result = await reportService.GetLowStockReportAsync(
                take ?? 20,
                threshold ?? 5m,
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetLowStockReport")
        .WithOpenApi();

        group.MapGet("/support-triage", async (
            int? window_minutes,
            ReportService reportService,
            CancellationToken cancellationToken) =>
        {
            var result = await reportService.GetSupportTriageReportAsync(
                window_minutes ?? 30,
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetSupportTriageReport")
        .WithOpenApi();

        return app;
    }
}
