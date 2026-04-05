using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Settings;

public sealed class ShopProfileResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("shop_name")]
    public string ShopName { get; set; } = string.Empty;

    [JsonPropertyName("address_line1")]
    public string? AddressLine1 { get; set; }

    [JsonPropertyName("address_line2")]
    public string? AddressLine2 { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("website")]
    public string? Website { get; set; }

    [JsonPropertyName("logo_url")]
    public string? LogoUrl { get; set; }

    [JsonPropertyName("receipt_footer")]
    public string? ReceiptFooter { get; set; }

    [JsonPropertyName("show_new_item_for_cashier")]
    public bool ShowNewItemForCashier { get; set; }

    [JsonPropertyName("show_manage_for_cashier")]
    public bool ShowManageForCashier { get; set; }

    [JsonPropertyName("show_reports_for_cashier")]
    public bool ShowReportsForCashier { get; set; }

    [JsonPropertyName("show_ai_insights_for_cashier")]
    public bool ShowAiInsightsForCashier { get; set; }

    [JsonPropertyName("show_held_bills_for_cashier")]
    public bool ShowHeldBillsForCashier { get; set; }

    [JsonPropertyName("show_reminders_for_cashier")]
    public bool ShowRemindersForCashier { get; set; }

    [JsonPropertyName("show_audit_trail_for_cashier")]
    public bool ShowAuditTrailForCashier { get; set; }

    [JsonPropertyName("show_end_shift_for_cashier")]
    public bool ShowEndShiftForCashier { get; set; }

    [JsonPropertyName("show_today_sales_for_cashier")]
    public bool ShowTodaySalesForCashier { get; set; }

    [JsonPropertyName("show_import_bill_for_cashier")]
    public bool ShowImportBillForCashier { get; set; }

    [JsonPropertyName("show_shop_settings_for_cashier")]
    public bool ShowShopSettingsForCashier { get; set; }

    [JsonPropertyName("show_my_licenses_for_cashier")]
    public bool ShowMyLicensesForCashier { get; set; }

    [JsonPropertyName("show_offline_sync_for_cashier")]
    public bool ShowOfflineSyncForCashier { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpdateShopProfileRequest
{
    [JsonPropertyName("shop_name")]
    public string ShopName { get; set; } = string.Empty;

    [JsonPropertyName("address_line1")]
    public string? AddressLine1 { get; set; }

    [JsonPropertyName("address_line2")]
    public string? AddressLine2 { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("website")]
    public string? Website { get; set; }

    [JsonPropertyName("logo_url")]
    public string? LogoUrl { get; set; }

    [JsonPropertyName("receipt_footer")]
    public string? ReceiptFooter { get; set; }

    [JsonPropertyName("show_new_item_for_cashier")]
    public bool ShowNewItemForCashier { get; set; }

    [JsonPropertyName("show_manage_for_cashier")]
    public bool ShowManageForCashier { get; set; }

    [JsonPropertyName("show_reports_for_cashier")]
    public bool ShowReportsForCashier { get; set; }

    [JsonPropertyName("show_ai_insights_for_cashier")]
    public bool ShowAiInsightsForCashier { get; set; }

    [JsonPropertyName("show_held_bills_for_cashier")]
    public bool ShowHeldBillsForCashier { get; set; }

    [JsonPropertyName("show_reminders_for_cashier")]
    public bool ShowRemindersForCashier { get; set; }

    [JsonPropertyName("show_audit_trail_for_cashier")]
    public bool ShowAuditTrailForCashier { get; set; }

    [JsonPropertyName("show_end_shift_for_cashier")]
    public bool ShowEndShiftForCashier { get; set; }

    [JsonPropertyName("show_today_sales_for_cashier")]
    public bool ShowTodaySalesForCashier { get; set; }

    [JsonPropertyName("show_import_bill_for_cashier")]
    public bool ShowImportBillForCashier { get; set; }

    [JsonPropertyName("show_shop_settings_for_cashier")]
    public bool ShowShopSettingsForCashier { get; set; }

    [JsonPropertyName("show_my_licenses_for_cashier")]
    public bool ShowMyLicensesForCashier { get; set; }

    [JsonPropertyName("show_offline_sync_for_cashier")]
    public bool ShowOfflineSyncForCashier { get; set; }
}
