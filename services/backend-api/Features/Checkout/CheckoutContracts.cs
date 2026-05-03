using System.Text.Json.Serialization;
using SmartPos.Backend.Features.CashSessions;

namespace SmartPos.Backend.Features.Checkout;

public sealed class CartItemRequest
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("serial_number_id")]
    public Guid? SerialNumberId { get; set; }
}

public sealed class PaymentRequest
{
    [JsonPropertyName("method")]
    public string Method { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("reference_number")]
    public string? ReferenceNumber { get; set; }
}

public sealed class HoldSaleRequest
{
    [JsonPropertyName("items")]
    public List<CartItemRequest> Items { get; set; } = [];

    [JsonPropertyName("discount_percent")]
    public decimal DiscountPercent { get; set; }

    [JsonPropertyName("customer_id")]
    public Guid? CustomerId { get; set; }

    [JsonPropertyName("loyalty_points_to_redeem")]
    public decimal LoyaltyPointsToRedeem { get; set; }

    [JsonPropertyName("role")]
    public string Role { get; set; } = "cashier";
}

public sealed class CompleteSaleRequest
{
    [JsonPropertyName("sale_id")]
    public Guid? SaleId { get; set; }

    [JsonPropertyName("items")]
    public List<CartItemRequest> Items { get; set; } = [];

    [JsonPropertyName("discount_percent")]
    public decimal DiscountPercent { get; set; }

    [JsonPropertyName("customer_id")]
    public Guid? CustomerId { get; set; }

    [JsonPropertyName("loyalty_points_to_redeem")]
    public decimal LoyaltyPointsToRedeem { get; set; }

    [JsonPropertyName("role")]
    public string Role { get; set; } = "cashier";

    [JsonPropertyName("payments")]
    public List<PaymentRequest> Payments { get; set; } = [];

    [JsonPropertyName("cash_received_counts")]
    public List<CashCountItem> CashReceivedCounts { get; set; } = [];

    [JsonPropertyName("cash_change_counts")]
    public List<CashCountItem> CashChangeCounts { get; set; } = [];

    [JsonPropertyName("custom_payout_used")]
    public bool CustomPayoutUsed { get; set; }

    [JsonPropertyName("cash_short_amount")]
    public decimal CashShortAmount { get; set; }
}

public sealed class HeldSaleListItem
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("item_count")]
    public int ItemCount { get; set; }
}

public sealed class SaleHistoryListItem
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }

    [JsonPropertyName("payment_breakdown")]
    public List<SalePaymentBreakdownResponse> PaymentBreakdown { get; set; } = [];

    [JsonPropertyName("custom_payout_used")]
    public bool CustomPayoutUsed { get; set; }

    [JsonPropertyName("cash_short_amount")]
    public decimal CashShortAmount { get; set; }
}

public sealed class SaleResponse
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("subtotal")]
    public decimal Subtotal { get; set; }

    [JsonPropertyName("discount_total")]
    public decimal DiscountTotal { get; set; }

    [JsonPropertyName("discount_percent")]
    public decimal DiscountPercent { get; set; }

    [JsonPropertyName("tax_total")]
    public decimal TaxTotal { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("paid_total")]
    public decimal PaidTotal { get; set; }

    [JsonPropertyName("change")]
    public decimal Change { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }

    [JsonPropertyName("custom_payout_used")]
    public bool CustomPayoutUsed { get; set; }

    [JsonPropertyName("cash_short_amount")]
    public decimal CashShortAmount { get; set; }

    [JsonPropertyName("customer_id")]
    public Guid? CustomerId { get; set; }

    [JsonPropertyName("customer_name")]
    public string? CustomerName { get; set; }

    [JsonPropertyName("loyalty_points_earned")]
    public decimal LoyaltyPointsEarned { get; set; }

    [JsonPropertyName("loyalty_points_redeemed")]
    public decimal LoyaltyPointsRedeemed { get; set; }

    [JsonPropertyName("items")]
    public List<SaleItemResponse> Items { get; set; } = [];

    [JsonPropertyName("payments")]
    public List<SalePaymentResponse> Payments { get; set; } = [];

    [JsonPropertyName("payment_breakdown")]
    public List<SalePaymentBreakdownResponse> PaymentBreakdown { get; set; } = [];
}

public sealed class SaleItemResponse
{
    [JsonPropertyName("sale_item_id")]
    public Guid SaleItemId { get; set; }

    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("line_total")]
    public decimal LineTotal { get; set; }
}

public sealed class SalePaymentResponse
{
    [JsonPropertyName("method")]
    public string Method { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("reference_number")]
    public string? ReferenceNumber { get; set; }
}

public sealed class SalePaymentBreakdownResponse
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
