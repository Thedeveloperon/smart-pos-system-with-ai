using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class ReportsGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.Reports];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var fromDate = context.Entities.DateRange?.FromDate;
        var toDate = context.Entities.DateRange?.ToDate;

        var daily = await reportService.GetDailySalesReportAsync(fromDate, toDate, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.summary.sales.{daily.FromDate:yyyyMMdd}.{daily.ToDate:yyyyMMdd}",
            Title = "Sales summary",
            Summary = $"Net sales {daily.NetSalesTotal:0.##} from {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}."
        });

        var forecast = await reportService.GetMonthlySalesForecastReportAsync(6, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = "reports.monthly_forecast.6_months",
            Title = "Monthly forecast",
            Summary = $"Forecast next month net sales {forecast.ForecastNextMonthNetSales:0.##}, confidence={forecast.Confidence}."
        });

        var comparison = await reportService.GetSalesComparisonSnapshotAsync(fromDate, toDate, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.summary.compare.{comparison.FromDate:yyyyMMdd}.{comparison.ToDate:yyyyMMdd}",
            Title = "Period comparison",
            Summary = $"Current net sales {comparison.CurrentNetSales:0.##} vs prior period {comparison.PreviousNetSales:0.##}, delta {comparison.DeltaPercent:0.##}%."
        });

        var lowStock = await reportService.GetLowStockReportAsync(5, 10m, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = "reports.summary.low_stock.threshold_10",
            Title = "Low stock summary",
            Summary = $"Low-stock items at threshold 10: {lowStock.Items.Count}."
        });

        content.AppendLine("Business summary snapshot:");
        content.AppendLine($"- Sales window: {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}, net sales={daily.NetSalesTotal:0.##}");
        content.AppendLine($"- Forecast next month: {forecast.ForecastNextMonthNetSales:0.##} (confidence={forecast.Confidence})");
        content.AppendLine($"- Comparison delta: {comparison.DeltaPercent:0.##}%");
        content.AppendLine($"- Low-stock item count (threshold=10): {lowStock.Items.Count}");

        return new AiChatGroundingResult(
            ContextText: content.ToString().Trim(),
            Citations: citations,
            MissingData: missingData,
            Confidence: "high",
            IsUnsupported: false);
    }
}
