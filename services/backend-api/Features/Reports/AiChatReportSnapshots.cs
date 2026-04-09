namespace SmartPos.Backend.Features.Reports;

public sealed record AiChatStockItemSnapshot(
    Guid ProductId,
    string ProductName,
    decimal UnitPrice,
    decimal CostPrice,
    decimal QuantityOnHand,
    decimal ReorderLevel,
    decimal StockValue);

public sealed record AiChatItemSalesSnapshot(
    Guid ProductId,
    string ProductName,
    DateOnly FromDate,
    DateOnly ToDate,
    decimal SoldQuantity,
    decimal RefundedQuantity,
    decimal NetQuantity,
    decimal NetSales);

public sealed record AiChatSupplierPurchaseSnapshot(
    Guid SupplierId,
    string SupplierName,
    DateOnly FromDate,
    DateOnly ToDate,
    int PurchaseCount,
    decimal TotalSpend,
    DateTimeOffset? LastPurchaseAt,
    List<AiChatSupplierPurchaseItemRow> TopItems);

public sealed record AiChatSupplierPurchaseItemRow(
    Guid ProductId,
    string ProductName,
    decimal QuantityPurchased,
    decimal TotalSpend);

public sealed record AiChatProductPurchaseSnapshot(
    Guid ProductId,
    string ProductName,
    DateOnly FromDate,
    DateOnly ToDate,
    int PurchaseCount,
    decimal QuantityPurchased,
    decimal TotalSpend,
    DateTimeOffset LastPurchaseAt,
    decimal LastUnitCost);

public sealed record AiChatMarginSummarySnapshot(
    DateOnly FromDate,
    DateOnly ToDate,
    decimal TotalGrossProfit,
    List<AiChatMarginRow> Rows);

public sealed record AiChatMarginRow(
    Guid ProductId,
    string ProductName,
    decimal NetQuantity,
    decimal NetSales,
    decimal EstimatedCost,
    decimal GrossProfit,
    decimal MarginPercent);

public sealed record AiChatCashierLeaderboardSnapshot(
    DateOnly FromDate,
    DateOnly ToDate,
    List<AiChatCashierLeaderboardRow> Rows);

public sealed record AiChatCashierLeaderboardRow(
    Guid CashierId,
    string CashierLabel,
    int TransactionCount,
    decimal NetSales);

public sealed record AiChatSalesComparisonSnapshot(
    DateOnly FromDate,
    DateOnly ToDate,
    DateOnly PreviousFromDate,
    DateOnly PreviousToDate,
    decimal CurrentNetSales,
    decimal PreviousNetSales,
    decimal DeltaPercent);
