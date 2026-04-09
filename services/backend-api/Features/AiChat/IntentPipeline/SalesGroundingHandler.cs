using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class SalesGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.Sales];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var fromDate = context.Entities.DateRange?.FromDate;
        var toDate = context.Entities.DateRange?.ToDate;
        var dateLabel = context.Entities.DateRange?.Label ?? "last 7 days";

        var daily = await reportService.GetDailySalesReportAsync(fromDate, toDate, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.sales.summary.{daily.FromDate:yyyyMMdd}.{daily.ToDate:yyyyMMdd}",
            Title = "Sales summary",
            Summary = $"Net sales {daily.NetSalesTotal:0.##} across {daily.SalesCount} sales and {daily.RefundCount} refunds for {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}."
        });

        content.AppendLine($"Sales snapshot ({dateLabel}):");
        content.AppendLine($"- Date range: {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}");
        content.AppendLine($"- Gross sales: {daily.GrossSalesTotal:0.##}");
        content.AppendLine($"- Refunded: {daily.RefundedTotal:0.##}");
        content.AppendLine($"- Net sales: {daily.NetSalesTotal:0.##}");
        content.AppendLine($"- Sales count: {daily.SalesCount}, refunds: {daily.RefundCount}");

        var topItems = await reportService.GetTopItemsReportAsync(fromDate, toDate, 5, cancellationToken);
        var topItem = topItems.Items.FirstOrDefault();
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.top_items.{topItems.FromDate:yyyyMMdd}.{topItems.ToDate:yyyyMMdd}",
            Title = "Top-selling items",
            Summary = topItem is null
                ? "No top-selling item rows found for the selected date range."
                : $"Top item is {topItem.ProductName} with net quantity {topItem.NetQuantity:0.###}."
        });

        var worstItems = await reportService.GetWorstItemsReportAsync(fromDate, toDate, 5, cancellationToken);
        var worstItem = worstItems.Items.FirstOrDefault();
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.worst_items.{worstItems.FromDate:yyyyMMdd}.{worstItems.ToDate:yyyyMMdd}",
            Title = "Worst-selling items",
            Summary = worstItem is null
                ? "No worst-selling item rows found for the selected date range."
                : $"Lowest item is {worstItem.ProductName} with net quantity {worstItem.NetQuantity:0.###}."
        });

        var comparison = await reportService.GetSalesComparisonSnapshotAsync(fromDate, toDate, cancellationToken);
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.sales.compare.{comparison.FromDate:yyyyMMdd}.{comparison.ToDate:yyyyMMdd}",
            Title = "Sales comparison",
            Summary = $"Current period net sales {comparison.CurrentNetSales:0.##} vs prior period {comparison.PreviousNetSales:0.##}, delta {comparison.DeltaPercent:0.##}%."
        });

        content.AppendLine($"- Comparison vs prior range: {comparison.DeltaPercent:0.##}%");

        if (context.Entities.Product is not null)
        {
            var productSales = await reportService.GetItemSalesSnapshotAsync(
                context.Entities.Product.Id,
                fromDate,
                toDate,
                cancellationToken);
            if (productSales is null)
            {
                missingData.Add($"Could not load item-level sales for product '{context.Entities.Product.Name}'.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.sales.item.{productSales.ProductId:N}",
                    Title = "Item sales detail",
                    Summary = $"{productSales.ProductName}: sold {productSales.SoldQuantity:0.###}, refunded {productSales.RefundedQuantity:0.###}, net sales {productSales.NetSales:0.##}."
                });

                content.AppendLine($"- Requested product sales: {productSales.ProductName}, sold={productSales.SoldQuantity:0.###}, net_sales={productSales.NetSales:0.##}");
            }
        }
        else if (context.Entities.MentionsProduct)
        {
            missingData.Add("Product was mentioned but could not be matched. Provide an exact product name.");
        }

        if (context.Entities.MentionsBrand && context.Entities.Brand is null)
        {
            missingData.Add("Brand was mentioned but could not be matched. Provide an exact brand name.");
        }

        if (context.Entities.MentionsCategory && context.Entities.Category is null)
        {
            missingData.Add("Category was mentioned but could not be matched. Provide an exact category name.");
        }

        return new AiChatGroundingResult(
            ContextText: content.ToString().Trim(),
            Citations: citations,
            MissingData: missingData,
            Confidence: ResolveConfidence(citations.Count, missingData.Count),
            IsUnsupported: false);
    }

    private static string ResolveConfidence(int citationCount, int missingDataCount)
    {
        if (citationCount >= 4 && missingDataCount == 0)
        {
            return "high";
        }

        if (citationCount >= 1)
        {
            return "medium";
        }

        return "low";
    }
}
