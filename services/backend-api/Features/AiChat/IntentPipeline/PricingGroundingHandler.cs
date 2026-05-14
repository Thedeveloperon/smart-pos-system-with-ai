using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class PricingGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.Pricing];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var fromDate = context.Entities.DateRange?.FromDate;
        var toDate = context.Entities.DateRange?.ToDate;

        content.AppendLine("Pricing and profit snapshot:");

        if (context.Entities.Product is not null)
        {
            var stockItem = await reportService.GetStockItemSnapshotAsync(
                context.Entities.Product.Id,
                cancellationToken);

            if (stockItem is null)
            {
                missingData.Add($"Could not load pricing details for product '{context.Entities.Product.Name}'.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.pricing.item.{stockItem.ProductId:N}",
                    Title = "Item price detail",
                    Summary = $"{stockItem.ProductName}: unit price {stockItem.UnitPrice:0.##}, cost price {stockItem.CostPrice:0.##}."
                });

                content.AppendLine($"- Product price: {stockItem.ProductName}, unit={stockItem.UnitPrice:0.##}, cost={stockItem.CostPrice:0.##}");
            }
        }
        else if (context.Entities.MentionsProduct)
        {
            missingData.Add("Product was mentioned but could not be matched. Provide an exact product name.");
        }

        var marginSnapshot = await reportService.GetMarginSummarySnapshotAsync(
            context.Entities.Product?.Id,
            fromDate,
            toDate,
            5,
            cancellationToken);

        if (marginSnapshot.Rows.Count == 0)
        {
            missingData.Add("No margin/profit rows found for the requested range.");
        }
        else
        {
            var first = marginSnapshot.Rows.First();
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = $"reports.margin.{marginSnapshot.FromDate:yyyyMMdd}.{marginSnapshot.ToDate:yyyyMMdd}",
                Title = "Margin summary",
                Summary = $"Top profit item: {first.ProductName} with gross profit {first.GrossProfit:0.##} and margin {first.MarginPercent:0.##}%."
            });

            content.AppendLine($"- Margin range: {marginSnapshot.FromDate:yyyy-MM-dd} to {marginSnapshot.ToDate:yyyy-MM-dd}");
            content.AppendLine($"- Estimated gross profit total: {marginSnapshot.TotalGrossProfit:0.##}");
            foreach (var row in marginSnapshot.Rows.Take(3))
            {
                content.AppendLine($"- {row.ProductName}: net_sales={row.NetSales:0.##}, gross_profit={row.GrossProfit:0.##}, margin={row.MarginPercent:0.##}%");
            }
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
        if (citationCount >= 2 && missingDataCount == 0)
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
