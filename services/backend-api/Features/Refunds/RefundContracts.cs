using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Refunds;

public sealed class CreateRefundRequest
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = "customer_request";

    [JsonPropertyName("items")]
    public List<CreateRefundItemRequest> Items { get; set; } = [];
}

public sealed class CreateRefundItemRequest
{
    [JsonPropertyName("sale_item_id")]
    public Guid SaleItemId { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }
}

public sealed class RefundResponse
{
    [JsonPropertyName("refund_id")]
    public Guid RefundId { get; set; }

    [JsonPropertyName("refund_number")]
    public string RefundNumber { get; set; } = string.Empty;

    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_status")]
    public string SaleStatus { get; set; } = string.Empty;

    [JsonPropertyName("subtotal_amount")]
    public decimal SubtotalAmount { get; set; }

    [JsonPropertyName("discount_amount")]
    public decimal DiscountAmount { get; set; }

    [JsonPropertyName("tax_amount")]
    public decimal TaxAmount { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("items")]
    public List<RefundItemResponse> Items { get; set; } = [];

    [JsonPropertyName("payment_reversals")]
    public List<RefundPaymentReversalResponse> PaymentReversals { get; set; } = [];
}

public sealed class RefundItemResponse
{
    [JsonPropertyName("sale_item_id")]
    public Guid SaleItemId { get; set; }

    [JsonPropertyName("item_type")]
    public string ItemType { get; set; } = "product";

    [JsonPropertyName("product_id")]
    public Guid? ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("bundle_id")]
    public Guid? BundleId { get; set; }

    [JsonPropertyName("bundle_name")]
    public string? BundleName { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("subtotal_amount")]
    public decimal SubtotalAmount { get; set; }

    [JsonPropertyName("discount_amount")]
    public decimal DiscountAmount { get; set; }

    [JsonPropertyName("tax_amount")]
    public decimal TaxAmount { get; set; }

    [JsonPropertyName("total_amount")]
    public decimal TotalAmount { get; set; }
}

public sealed class RefundPaymentReversalResponse
{
    [JsonPropertyName("method")]
    public string Method { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }
}

public sealed class SaleRefundSummaryResponse
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("sale_status")]
    public string SaleStatus { get; set; } = string.Empty;

    [JsonPropertyName("refunded_total")]
    public decimal RefundedTotal { get; set; }

    [JsonPropertyName("refunded_tax_total")]
    public decimal RefundedTaxTotal { get; set; }

    [JsonPropertyName("remaining_refundable_total")]
    public decimal RemainingRefundableTotal { get; set; }

    [JsonPropertyName("items")]
    public List<SaleRefundItemStatus> Items { get; set; } = [];

    [JsonPropertyName("refunds")]
    public List<SaleRefundListItem> Refunds { get; set; } = [];
}

public sealed class SaleRefundItemStatus
{
    [JsonPropertyName("sale_item_id")]
    public Guid SaleItemId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("sold_quantity")]
    public decimal SoldQuantity { get; set; }

    [JsonPropertyName("refunded_quantity")]
    public decimal RefundedQuantity { get; set; }

    [JsonPropertyName("refundable_quantity")]
    public decimal RefundableQuantity { get; set; }
}

public sealed class SaleRefundListItem
{
    [JsonPropertyName("refund_id")]
    public Guid RefundId { get; set; }

    [JsonPropertyName("refund_number")]
    public string RefundNumber { get; set; } = string.Empty;

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("tax_amount")]
    public decimal TaxAmount { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}
