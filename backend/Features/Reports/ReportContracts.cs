using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Reports;

public sealed class DailySalesReportResponse
{
    [JsonPropertyName("from_date")]
    public DateOnly FromDate { get; set; }

    [JsonPropertyName("to_date")]
    public DateOnly ToDate { get; set; }

    [JsonPropertyName("sales_count")]
    public int SalesCount { get; set; }

    [JsonPropertyName("refund_count")]
    public int RefundCount { get; set; }

    [JsonPropertyName("gross_sales_total")]
    public decimal GrossSalesTotal { get; set; }

    [JsonPropertyName("refunded_total")]
    public decimal RefundedTotal { get; set; }

    [JsonPropertyName("net_sales_total")]
    public decimal NetSalesTotal { get; set; }

    [JsonPropertyName("items")]
    public List<DailySalesReportRow> Items { get; set; } = [];
}

public sealed class DailySalesReportRow
{
    [JsonPropertyName("date")]
    public DateOnly Date { get; set; }

    [JsonPropertyName("sales_count")]
    public int SalesCount { get; set; }

    [JsonPropertyName("refund_count")]
    public int RefundCount { get; set; }

    [JsonPropertyName("gross_sales")]
    public decimal GrossSales { get; set; }

    [JsonPropertyName("refunded_total")]
    public decimal RefundedTotal { get; set; }

    [JsonPropertyName("net_sales")]
    public decimal NetSales { get; set; }
}

public sealed class TransactionsReportResponse
{
    [JsonPropertyName("from_date")]
    public DateOnly FromDate { get; set; }

    [JsonPropertyName("to_date")]
    public DateOnly ToDate { get; set; }

    [JsonPropertyName("take")]
    public int Take { get; set; }

    [JsonPropertyName("transaction_count")]
    public int TransactionCount { get; set; }

    [JsonPropertyName("gross_total")]
    public decimal GrossTotal { get; set; }

    [JsonPropertyName("reversed_total")]
    public decimal ReversedTotal { get; set; }

    [JsonPropertyName("net_collected_total")]
    public decimal NetCollectedTotal { get; set; }

    [JsonPropertyName("items")]
    public List<TransactionReportRow> Items { get; set; } = [];
}

public sealed class TransactionReportRow
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; set; }

    [JsonPropertyName("created_by_user_id")]
    public Guid? CreatedByUserId { get; set; }

    [JsonPropertyName("cashier_username")]
    public string? CashierUsername { get; set; }

    [JsonPropertyName("cashier_full_name")]
    public string? CashierFullName { get; set; }

    [JsonPropertyName("items_count")]
    public int ItemsCount { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("paid_total")]
    public decimal PaidTotal { get; set; }

    [JsonPropertyName("reversed_total")]
    public decimal ReversedTotal { get; set; }

    [JsonPropertyName("net_collected")]
    public decimal NetCollected { get; set; }

    [JsonPropertyName("payment_breakdown")]
    public List<ReportPaymentBreakdownRow> PaymentBreakdown { get; set; } = [];
}

public sealed class PaymentBreakdownReportResponse
{
    [JsonPropertyName("from_date")]
    public DateOnly FromDate { get; set; }

    [JsonPropertyName("to_date")]
    public DateOnly ToDate { get; set; }

    [JsonPropertyName("paid_total")]
    public decimal PaidTotal { get; set; }

    [JsonPropertyName("reversed_total")]
    public decimal ReversedTotal { get; set; }

    [JsonPropertyName("net_total")]
    public decimal NetTotal { get; set; }

    [JsonPropertyName("items")]
    public List<ReportPaymentBreakdownRow> Items { get; set; } = [];
}

public sealed class ReportPaymentBreakdownRow
{
    [JsonPropertyName("method")]
    public string Method { get; set; } = string.Empty;

    [JsonPropertyName("paid_amount")]
    public decimal PaidAmount { get; set; }

    [JsonPropertyName("reversed_amount")]
    public decimal ReversedAmount { get; set; }

    [JsonPropertyName("net_amount")]
    public decimal NetAmount { get; set; }
}

public sealed class TopItemsReportResponse
{
    [JsonPropertyName("from_date")]
    public DateOnly FromDate { get; set; }

    [JsonPropertyName("to_date")]
    public DateOnly ToDate { get; set; }

    [JsonPropertyName("take")]
    public int Take { get; set; }

    [JsonPropertyName("items")]
    public List<TopItemReportRow> Items { get; set; } = [];
}

public sealed class TopItemReportRow
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("sold_quantity")]
    public decimal SoldQuantity { get; set; }

    [JsonPropertyName("refunded_quantity")]
    public decimal RefundedQuantity { get; set; }

    [JsonPropertyName("net_quantity")]
    public decimal NetQuantity { get; set; }

    [JsonPropertyName("net_sales")]
    public decimal NetSales { get; set; }
}

public sealed class LowStockReportResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; }

    [JsonPropertyName("threshold")]
    public decimal Threshold { get; set; }

    [JsonPropertyName("take")]
    public int Take { get; set; }

    [JsonPropertyName("items")]
    public List<LowStockReportRow> Items { get; set; } = [];
}

public sealed class LowStockReportRow
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("quantity_on_hand")]
    public decimal QuantityOnHand { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("alert_level")]
    public decimal AlertLevel { get; set; }

    [JsonPropertyName("deficit")]
    public decimal Deficit { get; set; }
}
