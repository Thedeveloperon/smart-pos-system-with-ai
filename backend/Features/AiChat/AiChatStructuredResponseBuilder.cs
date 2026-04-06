using SmartPos.Backend.Features.AiChat.IntentPipeline;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat;

public sealed record AiChatStructuredResponseBuildResult(
    List<AiChatMessageBlockResponse> Blocks,
    string? CompanionContent);

public sealed class AiChatStructuredResponseBuilder(
    AiChatIntentClassifier intentClassifier,
    AiChatEntityResolver entityResolver,
    ReportService reportService)
{
    public async Task<AiChatStructuredResponseBuildResult> BuildAsync(
        string message,
        AiChatGroundingResult grounding,
        CancellationToken cancellationToken)
    {
        if (grounding.IsUnsupported)
        {
            return Empty();
        }

        var classification = intentClassifier.Classify(message);
        var entities = await entityResolver.ResolveAsync(message, cancellationToken);
        var normalized = entities.NormalizedMessage;

        if (ShouldRenderStockTable(normalized, classification.Intents))
        {
            return await BuildStockTableAsync(cancellationToken);
        }

        if (ShouldRenderSalesKpi(normalized, classification.Intents))
        {
            return await BuildSalesKpiAsync(entities.DateRange, cancellationToken);
        }

        if (ShouldRenderSummaryList(normalized, classification.Intents))
        {
            return await BuildSummaryListAsync(entities.DateRange, cancellationToken);
        }

        return Empty();
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildStockTableAsync(
        CancellationToken cancellationToken)
    {
        var lowStock = await reportService.GetLowStockReportAsync(8, 10m, cancellationToken);
        var sourceItems = lowStock.Items;
        var fallbackMode = false;
        if (sourceItems.Count == 0)
        {
            // Keep the card usable even when no rows meet threshold 10.
            var fallback = await reportService.GetLowStockReportAsync(8, 1000m, cancellationToken);
            sourceItems = fallback.Items;
            fallbackMode = sourceItems.Count > 0;
        }

        var rows = sourceItems
            .Select(item => new AiChatStockTableRowResponse
            {
                Item = item.ProductName,
                CurrentStock = item.QuantityOnHand,
                ReorderLevel = item.ReorderLevel,
                Status = ResolveStockStatus(item.QuantityOnHand, item.ReorderLevel)
            })
            .ToList();

        var attentionCount = rows.Count(x => x.Status is "low" or "out");
        var footer = rows.Count == 0
            ? "No low-stock items found at or below the current threshold."
            : fallbackMode
                ? "No rows matched threshold 10. Showing nearest stock rows for quick review."
            : $"{attentionCount} item(s) need attention.";

        var block = new AiChatMessageBlockResponse
        {
            Type = "stock_table",
            StockTable = new AiChatStockTableBlockResponse
            {
                Title = "Stock & Inventory Update",
                Rows = rows,
                FooterNote = footer
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent: rows.Count == 0
                ? "All tracked items are currently above the low-stock threshold."
                : "Structured stock snapshot generated from the latest low-stock report.");
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildSalesKpiAsync(
        AiChatDateRange? dateRange,
        CancellationToken cancellationToken)
    {
        var fromDate = dateRange?.FromDate;
        var toDate = dateRange?.ToDate;

        var daily = await reportService.GetDailySalesReportAsync(fromDate, toDate, cancellationToken);
        var topItems = await reportService.GetTopItemsReportAsync(daily.FromDate, daily.ToDate, 1, cancellationToken);
        var comparison = await reportService.GetSalesComparisonSnapshotAsync(daily.FromDate, daily.ToDate, cancellationToken);

        var topSeller = topItems.Items.FirstOrDefault();
        var avgBasket = daily.SalesCount == 0
            ? 0m
            : decimal.Round(daily.NetSalesTotal / daily.SalesCount, 2, MidpointRounding.AwayFromZero);
        var trendLabel = comparison.DeltaPercent switch
        {
            > 0m => "up",
            < 0m => "down",
            _ => "flat"
        };

        var block = new AiChatMessageBlockResponse
        {
            Type = "sales_kpi",
            SalesKpi = new AiChatSalesKpiBlockResponse
            {
                Title = "Today's Sales Summary",
                FromDate = daily.FromDate,
                ToDate = daily.ToDate,
                Revenue = daily.NetSalesTotal,
                Transactions = daily.SalesCount,
                AverageBasket = avgBasket,
                TopSeller = topSeller is null
                    ? null
                    : $"{topSeller.ProductName} ({topSeller.NetQuantity:0.###} units)",
                TrendPercent = comparison.DeltaPercent,
                TrendLabel = trendLabel
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent:
            $"Sales snapshot for {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}.");
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildSummaryListAsync(
        AiChatDateRange? dateRange,
        CancellationToken cancellationToken)
    {
        var fromDate = dateRange?.FromDate;
        var toDate = dateRange?.ToDate;

        var daily = await reportService.GetDailySalesReportAsync(fromDate, toDate, cancellationToken);
        var comparison = await reportService.GetSalesComparisonSnapshotAsync(fromDate, toDate, cancellationToken);
        var lowStock = await reportService.GetLowStockReportAsync(5, 10m, cancellationToken);
        var forecast = await reportService.GetMonthlySalesForecastReportAsync(6, cancellationToken);

        var items = new List<string>
        {
            $"Net sales: {daily.NetSalesTotal:0.##} from {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}.",
            $"Transactions: {daily.SalesCount} (refunds: {daily.RefundCount}).",
            $"Low-stock items (threshold 10): {lowStock.Items.Count}.",
            $"Period trend vs previous window: {comparison.DeltaPercent:0.##}%.",
            $"Next-month forecast: {forecast.ForecastNextMonthNetSales:0.##} ({forecast.Confidence} confidence)."
        };

        var block = new AiChatMessageBlockResponse
        {
            Type = "summary_list",
            SummaryList = new AiChatSummaryListBlockResponse
            {
                Title = "Business Summary",
                Items = items
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent: "Structured business summary generated from current report buckets.");
    }

    private static bool ShouldRenderStockTable(string normalizedMessage, IReadOnlyCollection<AiChatIntentType> intents)
    {
        if (ContainsAny(
            normalizedMessage,
            "low stock",
            "stock items",
            "out of stock",
            "reorder"))
        {
            return true;
        }

        return intents.Count == 1 &&
               intents.Contains(AiChatIntentType.Stock) &&
               normalizedMessage.Contains("stock", StringComparison.Ordinal);
    }

    private static bool ShouldRenderSalesKpi(string normalizedMessage, IReadOnlyCollection<AiChatIntentType> intents)
    {
        if (ContainsAny(
            normalizedMessage,
            "top selling",
            "best selling",
            "top sales",
            "today sales summary",
            "daily sales summary",
            "sales summary"))
        {
            return true;
        }

        return intents.Contains(AiChatIntentType.Sales) &&
               normalizedMessage.Contains("sales", StringComparison.Ordinal) &&
               normalizedMessage.Contains("summary", StringComparison.Ordinal);
    }

    private static bool ShouldRenderSummaryList(string normalizedMessage, IReadOnlyCollection<AiChatIntentType> intents)
    {
        if (ContainsAny(
            normalizedMessage,
            "business summary",
            "performance summary",
            "summary report",
            "report summary",
            "key summary"))
        {
            return true;
        }

        return intents.Contains(AiChatIntentType.Reports) &&
               normalizedMessage.Contains("summary", StringComparison.Ordinal) &&
               !normalizedMessage.Contains("sales summary", StringComparison.Ordinal);
    }

    private static string ResolveStockStatus(decimal currentStock, decimal reorderLevel)
    {
        if (currentStock <= 0m)
        {
            return "out";
        }

        if (currentStock <= reorderLevel)
        {
            return "low";
        }

        return "ok";
    }

    private static bool ContainsAny(string value, params string[] tokens)
    {
        return tokens.Any(token => value.Contains(token, StringComparison.Ordinal));
    }

    private static AiChatStructuredResponseBuildResult Empty()
    {
        return new AiChatStructuredResponseBuildResult([], null);
    }
}
