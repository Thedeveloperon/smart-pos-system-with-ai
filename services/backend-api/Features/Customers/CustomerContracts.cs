using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Customers;

public sealed class PriceTierResponse
{
    [JsonPropertyName("price_tier_id")]
    public Guid PriceTierId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("discount_percent")]
    public decimal DiscountPercent { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("customer_count")]
    public int CustomerCount { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertPriceTierRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("discount_percent")]
    public decimal DiscountPercent { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class CustomerListResponse
{
    [JsonPropertyName("items")]
    public List<CustomerListItem> Items { get; set; } = [];

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("take")]
    public int Take { get; set; }
}

public sealed class CustomerListItem
{
    [JsonPropertyName("customer_id")]
    public Guid CustomerId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("id_number")]
    public string? IdNumber { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("price_tier")]
    public PriceTierResponse? PriceTier { get; set; }

    [JsonPropertyName("fixed_discount_percent")]
    public decimal? FixedDiscountPercent { get; set; }

    [JsonPropertyName("credit_limit")]
    public decimal CreditLimit { get; set; }

    [JsonPropertyName("outstanding_balance")]
    public decimal OutstandingBalance { get; set; }

    [JsonPropertyName("loyalty_points")]
    public decimal LoyaltyPoints { get; set; }

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("can_delete")]
    public bool CanDelete { get; set; }

    [JsonPropertyName("delete_block_reason")]
    public string? DeleteBlockReason { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class CustomerDetail
{
    [JsonPropertyName("customer_id")]
    public Guid CustomerId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("id_number")]
    public string? IdNumber { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("date_of_birth")]
    public DateOnly? DateOfBirth { get; set; }

    [JsonPropertyName("price_tier")]
    public PriceTierResponse? PriceTier { get; set; }

    [JsonPropertyName("fixed_discount_percent")]
    public decimal? FixedDiscountPercent { get; set; }

    [JsonPropertyName("credit_limit")]
    public decimal CreditLimit { get; set; }

    [JsonPropertyName("outstanding_balance")]
    public decimal OutstandingBalance { get; set; }

    [JsonPropertyName("loyalty_points")]
    public decimal LoyaltyPoints { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertCustomerRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("id_number")]
    public string? IdNumber { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("date_of_birth")]
    public DateOnly? DateOfBirth { get; set; }

    [JsonPropertyName("price_tier_id")]
    public Guid? PriceTierId { get; set; }

    [JsonPropertyName("fixed_discount_percent")]
    public decimal? FixedDiscountPercent { get; set; }

    [JsonPropertyName("credit_limit")]
    public decimal CreditLimit { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class CustomerCreditLedgerResponse
{
    [JsonPropertyName("items")]
    public List<CreditLedgerEntry> Items { get; set; } = [];

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("take")]
    public int Take { get; set; }
}

public sealed class CreditLedgerEntry
{
    [JsonPropertyName("ledger_entry_id")]
    public Guid LedgerEntryId { get; set; }

    [JsonPropertyName("customer_id")]
    public Guid CustomerId { get; set; }

    [JsonPropertyName("sale_id")]
    public Guid? SaleId { get; set; }

    [JsonPropertyName("entry_type")]
    public string EntryType { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("balance_after")]
    public decimal BalanceAfter { get; set; }

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("reference")]
    public string? Reference { get; set; }

    [JsonPropertyName("recorded_by_user_id")]
    public Guid? RecordedByUserId { get; set; }

    [JsonPropertyName("occurred_at")]
    public DateTimeOffset OccurredAt { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class RecordCreditPaymentRequest
{
    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("reference")]
    public string? Reference { get; set; }
}

public sealed class ManualCreditAdjustmentRequest
{
    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("reference")]
    public string? Reference { get; set; }
}

public sealed class CustomerSaleSummaryItem
{
    [JsonPropertyName("sale_id")]
    public Guid SaleId { get; set; }

    [JsonPropertyName("sale_number")]
    public string SaleNumber { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("payment_method")]
    public string? PaymentMethod { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("loyalty_points_earned")]
    public decimal LoyaltyPointsEarned { get; set; }

    [JsonPropertyName("loyalty_points_redeemed")]
    public decimal LoyaltyPointsRedeemed { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("completed_at")]
    public DateTimeOffset? CompletedAt { get; set; }
}
