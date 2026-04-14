using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Features.AiChat.IntentPipeline;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.AiChat;

public sealed record AiChatStructuredResponseBuildResult(
    List<AiChatMessageBlockResponse> Blocks,
    string? CompanionContent);

public sealed class AiChatStructuredResponseBuilder(
    AiChatIntentClassifier intentClassifier,
    AiChatEntityResolver entityResolver,
    ReportService reportService,
    SmartPosDbContext dbContext)
{
    private const string OutputLanguageEnglish = "english";
    private const string OutputLanguageSinhala = "sinhala";
    private const string OutputLanguageTamil = "tamil";

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
        var outputLanguage = await ResolveOutputLanguageAsync(cancellationToken);

        if (ShouldRenderProductStockSnapshot(normalized, classification.Intents, entities))
        {
            return await BuildProductStockSnapshotAsync(entities.Product!, outputLanguage, cancellationToken);
        }

        if (ShouldRenderStockTable(normalized, classification.Intents))
        {
            return await BuildStockTableAsync(outputLanguage, cancellationToken);
        }

        if (ShouldRenderSalesKpi(normalized, classification.Intents))
        {
            return await BuildSalesKpiAsync(entities.DateRange, outputLanguage, cancellationToken);
        }

        if (ShouldRenderSummaryList(normalized, classification.Intents))
        {
            return await BuildSummaryListAsync(entities.DateRange, outputLanguage, cancellationToken);
        }

        return Empty();
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildStockTableAsync(
        string outputLanguage,
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
            ? Localize(
                "No low-stock items found at or below the current threshold.",
                "වත්මන් සීමාවට සමාන හෝ ඊට අඩු තොග සහිත භාණ්ඩ හමු නොවීය.",
                outputLanguage)
            : fallbackMode
                ? Localize(
                    "No rows matched threshold 10. Showing nearest stock rows for quick review.",
                    "10 සීමාවට ගැළපෙන පේළි නොමැත. ඉක්මන් සමාලෝචනය සඳහා ආසන්නතම තොග පේළි පෙන්වයි.",
                    outputLanguage)
                : Localize(
                    $"{attentionCount} item(s) need attention.",
                    $"භාණ්ඩ {attentionCount}ක් සඳහා අවධානය අවශ්‍යයි.",
                    outputLanguage);

        var block = new AiChatMessageBlockResponse
        {
            Type = "stock_table",
            StockTable = new AiChatStockTableBlockResponse
            {
                Title = Localize("Stock & Inventory Update", "තොග සහ ඉන්වෙන්ටරි යාවත්කාලීන කිරීම", outputLanguage),
                Rows = rows,
                FooterNote = footer
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent: rows.Count == 0
                ? Localize(
                    "All tracked items are currently above the low-stock threshold.",
                    "නිරීක්ෂණය වන සියලු භාණ්ඩ මේ මොහොතේ අඩු තොග සීමාවට ඉහළින් ඇත.",
                    outputLanguage)
                : Localize(
                    "Structured stock snapshot generated from the latest low-stock report.",
                    "නවතම අඩු තොග වාර්තාවෙන් ව්‍යුහගත තොග සංක්ෂිප්තයක් නිර්මාණය කර ඇත.",
                    outputLanguage));
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildProductStockSnapshotAsync(
        AiChatEntityMatch product,
        string outputLanguage,
        CancellationToken cancellationToken)
    {
        var stockItem = await reportService.GetStockItemSnapshotAsync(product.Id, cancellationToken);
        if (stockItem is null)
        {
            return await BuildStockTableAsync(outputLanguage, cancellationToken);
        }

        var row = new AiChatStockTableRowResponse
        {
            Item = stockItem.ProductName,
            CurrentStock = stockItem.QuantityOnHand,
            ReorderLevel = stockItem.ReorderLevel,
            Status = ResolveStockStatus(stockItem.QuantityOnHand, stockItem.ReorderLevel)
        };

        var block = new AiChatMessageBlockResponse
        {
            Type = "stock_table",
            StockTable = new AiChatStockTableBlockResponse
            {
                Title = "Product Stock Snapshot",
                Rows = [row],
                FooterNote = $"Stock value: {stockItem.StockValue:0.##}"
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent:
            $"{stockItem.ProductName} currently has {stockItem.QuantityOnHand:0.###} units on hand (reorder level {stockItem.ReorderLevel:0.###}).");
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildSalesKpiAsync(
        AiChatDateRange? dateRange,
        string outputLanguage,
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
                Title = Localize("Today's Sales Summary", "අද විකුණුම් සාරාංශය", outputLanguage),
                FromDate = daily.FromDate,
                ToDate = daily.ToDate,
                Revenue = daily.NetSalesTotal,
                Transactions = daily.SalesCount,
                AverageBasket = avgBasket,
                TopSeller = topSeller is null
                    ? null
                    : Localize(
                        $"{topSeller.ProductName} ({topSeller.NetQuantity:0.###} units)",
                        $"{topSeller.ProductName} ({topSeller.NetQuantity:0.###} ඒකක)",
                        outputLanguage),
                TrendPercent = comparison.DeltaPercent,
                TrendLabel = trendLabel
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent:
            Localize(
                $"Sales snapshot for {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}.",
                $"{daily.FromDate:yyyy-MM-dd} සිට {daily.ToDate:yyyy-MM-dd} දක්වා විකුණුම් සංක්ෂිප්තය.",
                outputLanguage));
    }

    private async Task<AiChatStructuredResponseBuildResult> BuildSummaryListAsync(
        AiChatDateRange? dateRange,
        string outputLanguage,
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
            Localize(
                $"Net sales: {daily.NetSalesTotal:0.##} from {daily.FromDate:yyyy-MM-dd} to {daily.ToDate:yyyy-MM-dd}.",
                $"ශුද්ධ විකුණුම්: {daily.FromDate:yyyy-MM-dd} සිට {daily.ToDate:yyyy-MM-dd} දක්වා {daily.NetSalesTotal:0.##}.",
                outputLanguage),
            Localize(
                $"Transactions: {daily.SalesCount} (refunds: {daily.RefundCount}).",
                $"ගනුදෙනු: {daily.SalesCount} (ආපසු ගෙවීම්: {daily.RefundCount}).",
                outputLanguage),
            Localize(
                $"Low-stock items (threshold 10): {lowStock.Items.Count}.",
                $"අඩු තොග භාණ්ඩ (සීමාව 10): {lowStock.Items.Count}.",
                outputLanguage),
            Localize(
                $"Period trend vs previous window: {comparison.DeltaPercent:0.##}%.",
                $"පෙර කාලය සමඟ සැසඳූ ප්‍රවණතාව: {comparison.DeltaPercent:0.##}%.",
                outputLanguage),
            Localize(
                $"Next-month forecast: {forecast.ForecastNextMonthNetSales:0.##} ({forecast.Confidence} confidence).",
                $"ඊළඟ මාස අනාවැකිය: {forecast.ForecastNextMonthNetSales:0.##} ({forecast.Confidence} විශ්වාස මට්ටම).",
                outputLanguage)
        };

        var block = new AiChatMessageBlockResponse
        {
            Type = "summary_list",
            SummaryList = new AiChatSummaryListBlockResponse
            {
                Title = Localize("Business Summary", "ව්‍යාපාර සාරාංශය", outputLanguage),
                Items = items
            }
        };

        return new AiChatStructuredResponseBuildResult(
            Blocks: [block],
            CompanionContent: Localize(
                "Structured business summary generated from current report buckets.",
                "වත්මන් වාර්තා දත්ත මත ව්‍යුහගත ව්‍යාපාර සාරාංශයක් නිර්මාණය කර ඇත.",
                outputLanguage));
    }

    private static bool ShouldRenderStockTable(string normalizedMessage, IReadOnlyCollection<AiChatIntentType> intents)
    {
        if (ContainsAny(
            normalizedMessage,
            "low stock",
            "stock items",
            "out of stock",
            "reorder",
            "තොග අඩු",
            "තොග භාණ්ඩ",
            "තොග අවසන්",
            "නැවත ඇණවුම්"))
        {
            return true;
        }

        return intents.Count == 1 &&
               intents.Contains(AiChatIntentType.Stock) &&
               ContainsAny(
                   normalizedMessage,
                   "stock",
                   "inventory",
                   "තොග",
                   "ඉන්වෙන්ටරි");
    }

    private static bool ShouldRenderProductStockSnapshot(
        string normalizedMessage,
        IReadOnlyCollection<AiChatIntentType> intents,
        AiChatResolvedEntities entities)
    {
        if (entities.Product is null || !intents.Contains(AiChatIntentType.Stock))
        {
            return false;
        }

        if (ContainsAny(
            normalizedMessage,
            "stock movement",
            "movement",
            "stock trend",
            "item stock",
            "stock status",
            "movement of"))
        {
            return true;
        }

        return ContainsAny(
            normalizedMessage,
            "current stock",
            "stock count",
            "current stock count",
            "how many",
            "available",
            "on hand",
            "quantity",
            "qty",
            "in stock",
            "stock of");
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
            "sales summary",
            "වැඩිපුරම විකුණුම්",
            "අද විකුණුම් සාරාංශ",
            "විකුණුම් සාරාංශ"))
        {
            return true;
        }

        return intents.Contains(AiChatIntentType.Sales) &&
               ContainsAny(normalizedMessage, "sales", "විකුණුම්") &&
               ContainsAny(normalizedMessage, "summary", "සාරාංශ");
    }

    private static bool ShouldRenderSummaryList(string normalizedMessage, IReadOnlyCollection<AiChatIntentType> intents)
    {
        if (ContainsAny(
            normalizedMessage,
            "business summary",
            "performance summary",
            "summary report",
            "report summary",
            "key summary",
            "ව්‍යාපාර සාරාංශ",
            "කාර්යසාධන සාරාංශ",
            "වාර්තා සාරාංශ",
            "ප්‍රධාන සාරාංශ"))
        {
            return true;
        }

        return intents.Contains(AiChatIntentType.Reports) &&
               ContainsAny(normalizedMessage, "summary", "සාරාංශ") &&
               !ContainsAny(normalizedMessage, "sales summary", "විකුණුම් සාරාංශ");
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

    private async Task<string> ResolveOutputLanguageAsync(CancellationToken cancellationToken)
    {
        string? value;
        if (dbContext.Database.IsSqlite())
        {
            value = (await dbContext.ShopProfiles
                    .AsNoTracking()
                    .Select(x => x.Language)
                    .ToListAsync(cancellationToken))
                .FirstOrDefault();
        }
        else
        {
            value = await dbContext.ShopProfiles
                .AsNoTracking()
                .Select(x => x.Language)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return NormalizeOutputLanguage(value);
    }

    private static string NormalizeOutputLanguage(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            OutputLanguageSinhala => OutputLanguageSinhala,
            OutputLanguageTamil => OutputLanguageTamil,
            _ => OutputLanguageEnglish
        };
    }

    private static string Localize(string english, string sinhala, string outputLanguage)
    {
        return outputLanguage switch
        {
            OutputLanguageSinhala => sinhala,
            _ => english
        };
    }

    private static AiChatStructuredResponseBuildResult Empty()
    {
        return new AiChatStructuredResponseBuildResult([], null);
    }
}
