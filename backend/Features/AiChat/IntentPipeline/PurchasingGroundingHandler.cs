using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class PurchasingGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.Purchasing];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var fromDate = context.Entities.DateRange?.FromDate;
        var toDate = context.Entities.DateRange?.ToDate;

        content.AppendLine("Purchasing and supplier snapshot:");

        if (context.Entities.Supplier is not null)
        {
            var supplierSnapshot = await reportService.GetSupplierPurchaseSnapshotAsync(
                context.Entities.Supplier.Id,
                fromDate,
                toDate,
                cancellationToken);
            if (supplierSnapshot is null)
            {
                missingData.Add($"Could not load purchase history for supplier '{context.Entities.Supplier.Name}'.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.purchase.supplier.{supplierSnapshot.SupplierId:N}",
                    Title = "Supplier purchases",
                    Summary = $"{supplierSnapshot.SupplierName}: {supplierSnapshot.PurchaseCount} bills, spend {supplierSnapshot.TotalSpend:0.##} from {supplierSnapshot.FromDate:yyyy-MM-dd} to {supplierSnapshot.ToDate:yyyy-MM-dd}."
                });

                content.AppendLine($"- Supplier {supplierSnapshot.SupplierName}: bills={supplierSnapshot.PurchaseCount}, spend={supplierSnapshot.TotalSpend:0.##}");
                foreach (var item in supplierSnapshot.TopItems.Take(3))
                {
                    content.AppendLine($"- {item.ProductName}: qty={item.QuantityPurchased:0.###}, spend={item.TotalSpend:0.##}");
                }
            }
        }
        else
        {
            var lowStockBySupplier = await reportService.GetLowStockBySupplierReportAsync(5, 10m, cancellationToken);
            var topSupplier = lowStockBySupplier.Items.FirstOrDefault();
            citations.Add(new AiChatCitationResponse
            {
                BucketKey = "reports.low_stock.by_supplier.threshold_10",
                Title = "Low stock by supplier",
                Summary = topSupplier is null
                    ? "No low-stock-by-supplier rows found."
                    : $"Highest low-stock supplier bucket: {topSupplier.SupplierName} ({topSupplier.LowStockCount} items)."
            });

            content.AppendLine("- Low-stock supplier buckets (threshold=10):");
            foreach (var supplier in lowStockBySupplier.Items.Take(3))
            {
                content.AppendLine($"- {supplier.SupplierName ?? "Unknown supplier"}: low_stock={supplier.LowStockCount}, deficit={supplier.TotalDeficit:0.###}");
            }
        }

        if (context.Entities.Product is not null)
        {
            var productPurchase = await reportService.GetProductPurchaseSnapshotAsync(
                context.Entities.Product.Id,
                fromDate,
                toDate,
                cancellationToken);
            if (productPurchase is null)
            {
                missingData.Add($"Could not load purchase details for product '{context.Entities.Product.Name}'.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.purchase.product.{productPurchase.ProductId:N}",
                    Title = "Product purchases",
                    Summary = $"{productPurchase.ProductName}: last purchase {productPurchase.LastPurchaseAt:yyyy-MM-dd}, last unit cost {productPurchase.LastUnitCost:0.##}."
                });

                content.AppendLine($"- Product purchase detail: {productPurchase.ProductName}, last_purchase={productPurchase.LastPurchaseAt:yyyy-MM-dd}, unit_cost={productPurchase.LastUnitCost:0.##}");
            }
        }
        else if (context.Entities.MentionsProduct)
        {
            missingData.Add("Product was mentioned but could not be matched. Provide an exact product name.");
        }

        if (context.Entities.MentionsSupplier && context.Entities.Supplier is null)
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
