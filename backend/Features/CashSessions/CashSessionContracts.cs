using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.CashSessions;

public sealed class CashCountItem
{
    [JsonPropertyName("denomination")]
    public decimal Denomination { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }
}

public sealed class OpenCashSessionRequest
{
    [JsonPropertyName("counts")]
    public List<CashCountItem> Counts { get; set; } = [];

    [JsonPropertyName("total")]
    public decimal Total { get; set; }

    [JsonPropertyName("cashier_name")]
    public string? CashierName { get; set; }
}

public sealed class CloseCashSessionRequest
{
    [JsonPropertyName("counts")]
    public List<CashCountItem> Counts { get; set; } = [];

    [JsonPropertyName("total")]
    public decimal Total { get; set; }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class UpdateCashDrawerRequest
{
    [JsonPropertyName("counts")]
    public List<CashCountItem> Counts { get; set; } = [];

    [JsonPropertyName("total")]
    public decimal Total { get; set; }
}

public sealed class CashSessionAuditEntryResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("action")]
    public string Action { get; set; } = string.Empty;

    [JsonPropertyName("performed_by")]
    public string PerformedBy { get; set; } = string.Empty;

    [JsonPropertyName("performed_at")]
    public DateTimeOffset PerformedAt { get; set; }

    [JsonPropertyName("details")]
    public string Details { get; set; } = string.Empty;

    [JsonPropertyName("amount")]
    public decimal? Amount { get; set; }
}

public sealed class CashSessionEntryResponse
{
    [JsonPropertyName("counts")]
    public List<CashCountItem> Counts { get; set; } = [];

    [JsonPropertyName("total")]
    public decimal Total { get; set; }

    [JsonPropertyName("submitted_by")]
    public string SubmittedBy { get; set; } = string.Empty;

    [JsonPropertyName("submitted_at")]
    public DateTimeOffset SubmittedAt { get; set; }

    [JsonPropertyName("approved_by")]
    public string? ApprovedBy { get; set; }

    [JsonPropertyName("approved_at")]
    public DateTimeOffset? ApprovedAt { get; set; }
}

public sealed class CashDrawerResponse
{
    [JsonPropertyName("counts")]
    public List<CashCountItem> Counts { get; set; } = [];

    [JsonPropertyName("total")]
    public decimal Total { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class CashSessionResponse
{
    [JsonPropertyName("cash_session_id")]
    public Guid CashSessionId { get; set; }

    [JsonPropertyName("device_id")]
    public Guid? DeviceId { get; set; }

    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [JsonPropertyName("cashier_name")]
    public string CashierName { get; set; } = string.Empty;

    [JsonPropertyName("shift_number")]
    public int ShiftNumber { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("opened_at")]
    public DateTimeOffset OpenedAt { get; set; }

    [JsonPropertyName("closed_at")]
    public DateTimeOffset? ClosedAt { get; set; }

    [JsonPropertyName("opening")]
    public CashSessionEntryResponse Opening { get; set; } = new();

    [JsonPropertyName("drawer")]
    public CashDrawerResponse Drawer { get; set; } = new();

    [JsonPropertyName("closing")]
    public CashSessionEntryResponse? Closing { get; set; }

    [JsonPropertyName("expected_cash")]
    public decimal? ExpectedCash { get; set; }

    [JsonPropertyName("difference")]
    public decimal? Difference { get; set; }

    [JsonPropertyName("difference_reason")]
    public string? DifferenceReason { get; set; }

    [JsonPropertyName("cash_sales_total")]
    public decimal CashSalesTotal { get; set; }

    [JsonPropertyName("audit_log")]
    public List<CashSessionAuditEntryResponse> AuditLog { get; set; } = [];
}

public sealed class CashSessionHistoryItemResponse
{
    [JsonPropertyName("cash_session_id")]
    public Guid CashSessionId { get; set; }

    [JsonPropertyName("shift_number")]
    public int ShiftNumber { get; set; }

    [JsonPropertyName("cashier_name")]
    public string CashierName { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("opened_at")]
    public DateTimeOffset OpenedAt { get; set; }

    [JsonPropertyName("closed_at")]
    public DateTimeOffset? ClosedAt { get; set; }

    [JsonPropertyName("opening_total")]
    public decimal OpeningTotal { get; set; }

    [JsonPropertyName("closing_total")]
    public decimal? ClosingTotal { get; set; }

    [JsonPropertyName("expected_cash")]
    public decimal? ExpectedCash { get; set; }

    [JsonPropertyName("difference")]
    public decimal? Difference { get; set; }

    [JsonPropertyName("cash_sales_total")]
    public decimal CashSalesTotal { get; set; }
}

public sealed class CashSessionHistoryResponse
{
    [JsonPropertyName("items")]
    public List<CashSessionHistoryItemResponse> Items { get; set; } = [];
}
