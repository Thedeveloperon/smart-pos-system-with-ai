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

public sealed class SupportTriageReportResponse
{
    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; }

    [JsonPropertyName("window_minutes")]
    public int WindowMinutes { get; set; }

    [JsonPropertyName("devices")]
    public SupportDeviceStateSummary Devices { get; set; } = new();

    [JsonPropertyName("shops")]
    public SupportShopStateSummary Shops { get; set; } = new();

    [JsonPropertyName("activity")]
    public SupportLicenseActivitySummary Activity { get; set; } = new();

    [JsonPropertyName("alerts")]
    public SupportLicenseAlertSummary Alerts { get; set; } = new();

    [JsonPropertyName("recent_audit_events")]
    public List<SupportLicenseAuditEventRow> RecentAuditEvents { get; set; } = [];
}

public sealed class SupportDeviceStateSummary
{
    [JsonPropertyName("active_devices")]
    public int ActiveDevices { get; set; }

    [JsonPropertyName("grace_devices")]
    public int GraceDevices { get; set; }

    [JsonPropertyName("suspended_devices")]
    public int SuspendedDevices { get; set; }

    [JsonPropertyName("revoked_devices")]
    public int RevokedDevices { get; set; }

    [JsonPropertyName("devices_without_license")]
    public int DevicesWithoutLicense { get; set; }
}

public sealed class SupportShopStateSummary
{
    [JsonPropertyName("active_shops")]
    public int ActiveShops { get; set; }

    [JsonPropertyName("grace_shops")]
    public int GraceShops { get; set; }

    [JsonPropertyName("suspended_shops")]
    public int SuspendedShops { get; set; }

    [JsonPropertyName("revoked_shops")]
    public int RevokedShops { get; set; }

    [JsonPropertyName("shops_with_missing_license")]
    public int ShopsWithMissingLicense { get; set; }
}

public sealed class SupportLicenseActivitySummary
{
    [JsonPropertyName("activations_in_window")]
    public int ActivationsInWindow { get; set; }

    [JsonPropertyName("deactivations_in_window")]
    public int DeactivationsInWindow { get; set; }

    [JsonPropertyName("heartbeats_in_window")]
    public int HeartbeatsInWindow { get; set; }
}

public sealed class SupportLicenseAlertSummary
{
    [JsonPropertyName("validation_failures_in_window")]
    public int ValidationFailuresInWindow { get; set; }

    [JsonPropertyName("webhook_failures_in_window")]
    public int WebhookFailuresInWindow { get; set; }

    [JsonPropertyName("security_anomalies_in_window")]
    public int SecurityAnomaliesInWindow { get; set; }

    [JsonPropertyName("auth_impossible_travel_signals_in_window")]
    public int AuthImpossibleTravelSignalsInWindow { get; set; }

    [JsonPropertyName("auth_concurrent_device_signals_in_window")]
    public int AuthConcurrentDeviceSignalsInWindow { get; set; }

    [JsonPropertyName("sensitive_action_proof_failures_in_window")]
    public int SensitiveActionProofFailuresInWindow { get; set; }

    [JsonPropertyName("devices_with_unusual_source_changes_in_window")]
    public int DevicesWithUnusualSourceChangesInWindow { get; set; }

    [JsonPropertyName("top_validation_failures")]
    public List<SupportAlertBreakdownRow> TopValidationFailures { get; set; } = [];

    [JsonPropertyName("top_webhook_failures")]
    public List<SupportAlertBreakdownRow> TopWebhookFailures { get; set; } = [];

    [JsonPropertyName("top_security_anomalies")]
    public List<SupportAlertBreakdownRow> TopSecurityAnomalies { get; set; } = [];

    [JsonPropertyName("top_sensitive_action_failure_sources")]
    public List<SupportAlertBreakdownRow> TopSensitiveActionFailureSources { get; set; } = [];

    [JsonPropertyName("last_validation_alert_at")]
    public DateTimeOffset? LastValidationAlertAt { get; set; }

    [JsonPropertyName("last_webhook_alert_at")]
    public DateTimeOffset? LastWebhookAlertAt { get; set; }

    [JsonPropertyName("last_security_alert_at")]
    public DateTimeOffset? LastSecurityAlertAt { get; set; }
}

public sealed class SupportAlertBreakdownRow
{
    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public sealed class SupportLicenseAuditEventRow
{
    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("actor")]
    public string Actor { get; set; } = string.Empty;

    [JsonPropertyName("device_code")]
    public string? DeviceCode { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("source_ip")]
    public string? SourceIp { get; set; }

    [JsonPropertyName("source_ip_prefix")]
    public string? SourceIpPrefix { get; set; }

    [JsonPropertyName("source_user_agent_family")]
    public string? SourceUserAgentFamily { get; set; }

    [JsonPropertyName("source_fingerprint")]
    public string? SourceFingerprint { get; set; }
}
