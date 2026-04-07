using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Purchases;

public sealed class PurchaseOcrDraftResponse
{
    [JsonPropertyName("draft_id")]
    public Guid DraftId { get; set; }

    [JsonPropertyName("correlation_id")]
    public string CorrelationId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("scan_status")]
    public string ScanStatus { get; set; } = string.Empty;

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("content_type")]
    public string ContentType { get; set; } = string.Empty;

    [JsonPropertyName("file_size")]
    public long FileSize { get; set; }

    [JsonPropertyName("supplier_name")]
    public string? SupplierName { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("invoice_date")]
    public DateTimeOffset? InvoiceDate { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("subtotal")]
    public decimal? Subtotal { get; set; }

    [JsonPropertyName("tax_total")]
    public decimal? TaxTotal { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal? GrandTotal { get; set; }

    [JsonPropertyName("ocr_confidence")]
    public decimal? OcrConfidence { get; set; }

    [JsonPropertyName("extraction_provider")]
    public string? ExtractionProvider { get; set; }

    [JsonPropertyName("extraction_model")]
    public string? ExtractionModel { get; set; }

    [JsonPropertyName("review_required")]
    public bool ReviewRequired { get; set; }

    [JsonPropertyName("can_auto_commit")]
    public bool CanAutoCommit { get; set; }

    [JsonPropertyName("blocked_reasons")]
    public List<string> BlockedReasons { get; set; } = [];

    [JsonPropertyName("totals")]
    public PurchaseOcrTotalsValidationResponse Totals { get; set; } = new();

    [JsonPropertyName("line_items")]
    public List<PurchaseOcrDraftLineItemResponse> LineItems { get; set; } = [];

    [JsonPropertyName("warnings")]
    public List<string> Warnings { get; set; } = [];

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PurchaseOcrDraftLineItemResponse
{
    [JsonPropertyName("line_no")]
    public int LineNumber { get; set; }

    [JsonPropertyName("raw_text")]
    public string? RawText { get; set; }

    [JsonPropertyName("item_name")]
    public string? ItemName { get; set; }

    [JsonPropertyName("quantity")]
    public decimal? Quantity { get; set; }

    [JsonPropertyName("unit_cost")]
    public decimal? UnitCost { get; set; }

    [JsonPropertyName("line_total")]
    public decimal? LineTotal { get; set; }

    [JsonPropertyName("confidence")]
    public decimal? Confidence { get; set; }

    [JsonPropertyName("review_status")]
    public string ReviewStatus { get; set; } = "needs_review";

    [JsonPropertyName("match_status")]
    public string MatchStatus { get; set; } = "unmatched";

    [JsonPropertyName("match_method")]
    public string? MatchMethod { get; set; }

    [JsonPropertyName("match_score")]
    public decimal? MatchScore { get; set; }

    [JsonPropertyName("matched_product_id")]
    public Guid? MatchedProductId { get; set; }

    [JsonPropertyName("matched_product_name")]
    public string? MatchedProductName { get; set; }

    [JsonPropertyName("matched_product_sku")]
    public string? MatchedProductSku { get; set; }

    [JsonPropertyName("matched_product_barcode")]
    public string? MatchedProductBarcode { get; set; }
}

public sealed class PurchaseOcrTotalsValidationResponse
{
    [JsonPropertyName("line_total_sum")]
    public decimal LineTotalSum { get; set; }

    [JsonPropertyName("extracted_subtotal")]
    public decimal? ExtractedSubtotal { get; set; }

    [JsonPropertyName("extracted_tax_total")]
    public decimal? ExtractedTaxTotal { get; set; }

    [JsonPropertyName("extracted_grand_total")]
    public decimal? ExtractedGrandTotal { get; set; }

    [JsonPropertyName("expected_grand_total")]
    public decimal? ExpectedGrandTotal { get; set; }

    [JsonPropertyName("difference")]
    public decimal Difference { get; set; }

    [JsonPropertyName("tolerance")]
    public decimal Tolerance { get; set; }

    [JsonPropertyName("within_tolerance")]
    public bool WithinTolerance { get; set; }

    [JsonPropertyName("requires_approval_reason")]
    public bool RequiresApprovalReason { get; set; }
}

public sealed class PurchaseImportConfirmRequest
{
    [JsonPropertyName("import_request_id")]
    public string ImportRequestId { get; set; } = string.Empty;

    [JsonPropertyName("draft_id")]
    public Guid DraftId { get; set; }

    [JsonPropertyName("supplier_id")]
    public Guid? SupplierId { get; set; }

    [JsonPropertyName("supplier_name")]
    public string? SupplierName { get; set; }

    [JsonPropertyName("invoice_number")]
    public string? InvoiceNumber { get; set; }

    [JsonPropertyName("invoice_date")]
    public DateTimeOffset? InvoiceDate { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("approval_reason")]
    public string? ApprovalReason { get; set; }

    [JsonPropertyName("update_cost_price")]
    public bool? UpdateCostPrice { get; set; }

    [JsonPropertyName("tax_total")]
    public decimal? TaxTotal { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal? GrandTotal { get; set; }

    [JsonPropertyName("items")]
    public List<PurchaseImportConfirmLineRequest> Items { get; set; } = [];
}

public sealed class PurchaseImportConfirmLineRequest
{
    [JsonPropertyName("line_no")]
    public int? LineNumber { get; set; }

    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("supplier_item_name")]
    public string? SupplierItemName { get; set; }

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("unit_cost")]
    public decimal UnitCost { get; set; }

    [JsonPropertyName("line_total")]
    public decimal? LineTotal { get; set; }
}

public sealed class PurchaseImportConfirmResponse
{
    [JsonPropertyName("purchase_bill_id")]
    public Guid PurchaseBillId { get; set; }

    [JsonPropertyName("import_request_id")]
    public string ImportRequestId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("idempotent_replay")]
    public bool IdempotentReplay { get; set; }

    [JsonPropertyName("supplier_id")]
    public Guid SupplierId { get; set; }

    [JsonPropertyName("supplier_name")]
    public string SupplierName { get; set; } = string.Empty;

    [JsonPropertyName("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [JsonPropertyName("invoice_date")]
    public DateTimeOffset InvoiceDate { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = "LKR";

    [JsonPropertyName("subtotal")]
    public decimal Subtotal { get; set; }

    [JsonPropertyName("tax_total")]
    public decimal TaxTotal { get; set; }

    [JsonPropertyName("grand_total")]
    public decimal GrandTotal { get; set; }

    [JsonPropertyName("items")]
    public List<PurchaseImportConfirmedItemResponse> Items { get; set; } = [];

    [JsonPropertyName("inventory_updates")]
    public List<PurchaseInventoryUpdateResponse> InventoryUpdates { get; set; } = [];

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PurchaseImportConfirmedItemResponse
{
    [JsonPropertyName("purchase_bill_item_id")]
    public Guid PurchaseBillItemId { get; set; }

    [JsonPropertyName("line_no")]
    public int? LineNumber { get; set; }

    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("unit_cost")]
    public decimal UnitCost { get; set; }

    [JsonPropertyName("line_total")]
    public decimal LineTotal { get; set; }
}

public sealed class PurchaseInventoryUpdateResponse
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("previous_quantity")]
    public decimal PreviousQuantity { get; set; }

    [JsonPropertyName("delta_quantity")]
    public decimal DeltaQuantity { get; set; }

    [JsonPropertyName("new_quantity")]
    public decimal NewQuantity { get; set; }
}
