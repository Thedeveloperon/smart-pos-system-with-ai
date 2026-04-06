using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class StockGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.Stock];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var lowStock = await reportService.GetLowStockReportAsync(10, 10m, cancellationToken);
        var outOfStockCount = lowStock.Items.Count(x => x.QuantityOnHand <= 0m);
        var firstLow = lowStock.Items.FirstOrDefault();
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = "reports.low_stock.threshold_10",
            Title = "Low stock items",
            Summary = lowStock.Items.Count == 0
                ? "No low-stock items found at threshold 10."
                : $"{lowStock.Items.Count} low-stock items. Lowest item: {firstLow?.ProductName} ({firstLow?.QuantityOnHand:0.###}). Out-of-stock items: {outOfStockCount}."
        });

        content.AppendLine("Stock and inventory snapshot:");
        content.AppendLine($"- Low-stock count (threshold=10): {lowStock.Items.Count}");
        content.AppendLine($"- Out-of-stock count: {outOfStockCount}");
        foreach (var item in lowStock.Items.Take(5))
        {
            content.AppendLine($"- {item.ProductName}: qty={item.QuantityOnHand:0.###}, reorder={item.ReorderLevel:0.###}, deficit={item.Deficit:0.###}");
        }

        if (context.Entities.Product is not null)
        {
            var stockItem = await reportService.GetStockItemSnapshotAsync(
                context.Entities.Product.Id,
                cancellationToken);
            if (stockItem is null)
            {
                missingData.Add($"Could not load stock details for product '{context.Entities.Product.Name}'.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.stock.item.{stockItem.ProductId:N}",
                    Title = "Item stock detail",
                    Summary = $"{stockItem.ProductName} has {stockItem.QuantityOnHand:0.###} on hand (reorder={stockItem.ReorderLevel:0.###})."
                });

                content.AppendLine($"- Requested product: {stockItem.ProductName}, qty={stockItem.QuantityOnHand:0.###}, reorder={stockItem.ReorderLevel:0.###}, value={stockItem.StockValue:0.##}");
            }
        }
        else if (context.Entities.MentionsProduct)
        {
            missingData.Add("Product name was mentioned but could not be matched. Provide an exact product name.");
        }

        if (context.Entities.Brand is not null)
        {
            var byBrand = await reportService.GetLowStockByBrandReportAsync(25, 10m, cancellationToken);
            var brandRow = byBrand.Items.FirstOrDefault(x => x.BrandId == context.Entities.Brand.Id);
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = $"reports.low_stock.brand.{context.Entities.Brand.Id:N}",
                Title = "Low stock by brand",
                Summary = brandRow is null
                    ? $"No low-stock rows found for brand '{context.Entities.Brand.Name}'."
                    : $"{context.Entities.Brand.Name}: {brandRow.LowStockCount} low-stock items, deficit {brandRow.TotalDeficit:0.###}."
            });
        }
        else if (context.Entities.MentionsBrand)
        {
            missingData.Add("Brand was mentioned but could not be matched. Provide an exact brand name.");
        }

        if (context.Entities.Supplier is not null)
        {
            var bySupplier = await reportService.GetLowStockBySupplierReportAsync(25, 10m, cancellationToken);
            var supplierRow = bySupplier.Items.FirstOrDefault(x => x.SupplierId == context.Entities.Supplier.Id);
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = $"reports.low_stock.supplier.{context.Entities.Supplier.Id:N}",
                Title = "Low stock by supplier",
                Summary = supplierRow is null
                    ? $"No low-stock rows found for supplier '{context.Entities.Supplier.Name}'."
                    : $"{context.Entities.Supplier.Name}: {supplierRow.LowStockCount} low-stock items, deficit {supplierRow.TotalDeficit:0.###}."
            });
        }
        else if (context.Entities.MentionsSupplier)
        {
            missingData.Add("Supplier was mentioned but could not be matched. Provide an exact supplier name.");
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
        if (citationCount >= 3 && missingDataCount == 0)
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
