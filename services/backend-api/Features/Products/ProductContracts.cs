using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Products;

public sealed class ProductSearchResponse
{
    public List<ProductSearchItem> Items { get; set; } = [];
}

public sealed class ProductSearchItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Sku { get; set; }
    public string? Barcode { get; set; }
    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }
    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("category_name")]
    public string? CategoryName { get; set; }
    [JsonPropertyName("brand_id")]
    public Guid? BrandId { get; set; }

    [JsonPropertyName("brand_name")]
    public string? BrandName { get; set; }

    public decimal UnitPrice { get; set; }
    public decimal CostPrice { get; set; }
    [JsonPropertyName("permanent_discount_percent")]
    public decimal? PermanentDiscountPercent { get; set; }
    [JsonPropertyName("permanent_discount_fixed")]
    public decimal? PermanentDiscountFixed { get; set; }
    public decimal StockQuantity { get; set; }
    [JsonPropertyName("is_low_stock")]
    public bool IsLowStock { get; set; }
    [JsonPropertyName("is_serial_tracked")]
    public bool IsSerialTracked { get; set; }
    [JsonPropertyName("has_pack_option")]
    public bool HasPackOption { get; set; }
    [JsonPropertyName("pack_size")]
    public int PackSize { get; set; }
    [JsonPropertyName("pack_price")]
    public decimal? PackPrice { get; set; }
    [JsonPropertyName("pack_label")]
    public string? PackLabel { get; set; }
}

public sealed class BrandListResponse
{
    [JsonPropertyName("items")]
    public List<BrandItemResponse> Items { get; set; } = [];
}

public sealed class BrandItemResponse
{
    [JsonPropertyName("brand_id")]
    public Guid BrandId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("product_count")]
    public int ProductCount { get; set; }

    [JsonPropertyName("can_delete")]
    public bool CanDelete { get; set; }

    [JsonPropertyName("delete_block_reason")]
    public string? DeleteBlockReason { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertBrandRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class SupplierListResponse
{
    [JsonPropertyName("items")]
    public List<SupplierItemResponse> Items { get; set; } = [];
}

public sealed class SupplierItemResponse
{
    [JsonPropertyName("supplier_id")]
    public Guid SupplierId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("company_phone")]
    public string? CompanyPhone { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("brands")]
    public List<SupplierBrandItem> Brands { get; set; } = [];

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("linked_product_count")]
    public int LinkedProductCount { get; set; }

    [JsonPropertyName("can_delete")]
    public bool CanDelete { get; set; }

    [JsonPropertyName("delete_block_reason")]
    public string? DeleteBlockReason { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class SupplierBrandItem
{
    [JsonPropertyName("brand_id")]
    public Guid BrandId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public sealed class UpsertSupplierRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("company_name")]
    public string? CompanyName { get; set; }

    [JsonPropertyName("company_phone")]
    public string? CompanyPhone { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("brand_ids")]
    public List<Guid> BrandIds { get; set; } = [];
}

public sealed class ProductSupplierListResponse
{
    [JsonPropertyName("items")]
    public List<ProductSupplierItemResponse> Items { get; set; } = [];
}

public sealed class ProductSupplierItemResponse
{
    [JsonPropertyName("product_supplier_id")]
    public Guid ProductSupplierId { get; set; }

    [JsonPropertyName("supplier_id")]
    public Guid SupplierId { get; set; }

    [JsonPropertyName("supplier_name")]
    public string SupplierName { get; set; } = string.Empty;

    [JsonPropertyName("supplier_sku")]
    public string? SupplierSku { get; set; }

    [JsonPropertyName("supplier_item_name")]
    public string? SupplierItemName { get; set; }

    [JsonPropertyName("is_preferred")]
    public bool IsPreferred { get; set; }

    [JsonPropertyName("lead_time_days")]
    public int? LeadTimeDays { get; set; }

    [JsonPropertyName("min_order_qty")]
    public decimal? MinOrderQty { get; set; }

    [JsonPropertyName("pack_size")]
    public decimal? PackSize { get; set; }

    [JsonPropertyName("last_purchase_price")]
    public decimal? LastPurchasePrice { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertProductSupplierRequest
{
    [JsonPropertyName("supplier_id")]
    public Guid SupplierId { get; set; }

    [JsonPropertyName("supplier_sku")]
    public string? SupplierSku { get; set; }

    [JsonPropertyName("supplier_item_name")]
    public string? SupplierItemName { get; set; }

    [JsonPropertyName("is_preferred")]
    public bool IsPreferred { get; set; }

    [JsonPropertyName("lead_time_days")]
    public int? LeadTimeDays { get; set; }

    [JsonPropertyName("min_order_qty")]
    public decimal? MinOrderQty { get; set; }

    [JsonPropertyName("pack_size")]
    public decimal? PackSize { get; set; }

    [JsonPropertyName("last_purchase_price")]
    public decimal? LastPurchasePrice { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class SetPreferredProductSupplierRequest
{
    [JsonPropertyName("supplier_id")]
    public Guid SupplierId { get; set; }
}

public sealed class CategoryListResponse
{
    [JsonPropertyName("items")]
    public List<CategoryItemResponse> Items { get; set; } = [];
}

public sealed class CategoryItemResponse
{
    [JsonPropertyName("category_id")]
    public Guid CategoryId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("product_count")]
    public int ProductCount { get; set; }

    [JsonPropertyName("can_delete")]
    public bool CanDelete { get; set; }

    [JsonPropertyName("delete_block_reason")]
    public string? DeleteBlockReason { get; set; }

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertCategoryRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("category_name")]
    public string? LegacyCategoryName { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;

    public string ResolveName()
    {
        return string.IsNullOrWhiteSpace(Name)
            ? LegacyCategoryName ?? string.Empty
            : Name;
    }
}

public sealed class ProductCatalogResponse
{
    [JsonPropertyName("items")]
    public List<ProductCatalogItemResponse> Items { get; set; } = [];
}

public sealed class ProductCatalogItemResponse
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("category_name")]
    public string? CategoryName { get; set; }

    [JsonPropertyName("brand_id")]
    public Guid? BrandId { get; set; }

    [JsonPropertyName("brand_name")]
    public string? BrandName { get; set; }

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }
    [JsonPropertyName("permanent_discount_percent")]
    public decimal? PermanentDiscountPercent { get; set; }
    [JsonPropertyName("permanent_discount_fixed")]
    public decimal? PermanentDiscountFixed { get; set; }

    [JsonPropertyName("stock_quantity")]
    public decimal StockQuantity { get; set; }

    [JsonPropertyName("initial_stock_quantity")]
    public decimal InitialStockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("alert_level")]
    public decimal AlertLevel { get; set; }

    [JsonPropertyName("safety_stock")]
    public decimal SafetyStock { get; set; }

    [JsonPropertyName("target_stock_level")]
    public decimal TargetStockLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("is_low_stock")]
    public bool IsLowStock { get; set; }

    [JsonPropertyName("is_serial_tracked")]
    public bool IsSerialTracked { get; set; }

    [JsonPropertyName("warranty_months")]
    public int WarrantyMonths { get; set; }

    [JsonPropertyName("is_batch_tracked")]
    public bool IsBatchTracked { get; set; }

    [JsonPropertyName("expiry_alert_days")]
    public int ExpiryAlertDays { get; set; }
    [JsonPropertyName("has_pack_option")]
    public bool HasPackOption { get; set; }
    [JsonPropertyName("pack_size")]
    public int PackSize { get; set; }
    [JsonPropertyName("pack_price")]
    public decimal? PackPrice { get; set; }
    [JsonPropertyName("pack_label")]
    public string? PackLabel { get; set; }

    [JsonPropertyName("product_suppliers")]
    public List<ProductSupplierItemResponse> ProductSuppliers { get; set; } = [];

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class CreateProductRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("brand_id")]
    public Guid? BrandId { get; set; }

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }
    [JsonPropertyName("permanent_discount_percent")]
    public decimal? PermanentDiscountPercent { get; set; }
    [JsonPropertyName("permanent_discount_fixed")]
    public decimal? PermanentDiscountFixed { get; set; }

    [JsonPropertyName("initial_stock_quantity")]
    public decimal InitialStockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("safety_stock")]
    public decimal SafetyStock { get; set; }

    [JsonPropertyName("target_stock_level")]
    public decimal TargetStockLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = true;

    [JsonPropertyName("is_serial_tracked")]
    public bool IsSerialTracked { get; set; }

    [JsonPropertyName("warranty_months")]
    public int WarrantyMonths { get; set; }

    [JsonPropertyName("is_batch_tracked")]
    public bool IsBatchTracked { get; set; }

    [JsonPropertyName("expiry_alert_days")]
    public int ExpiryAlertDays { get; set; } = 30;
    [JsonPropertyName("has_pack_option")]
    public bool HasPackOption { get; set; }
    [JsonPropertyName("pack_size")]
    public int PackSize { get; set; }
    [JsonPropertyName("pack_price")]
    public decimal? PackPrice { get; set; }
    [JsonPropertyName("pack_label")]
    public string? PackLabel { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class UpdateProductRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("category_id")]
    public Guid? CategoryId { get; set; }

    [JsonPropertyName("brand_id")]
    public Guid? BrandId { get; set; }

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }
    [JsonPropertyName("permanent_discount_percent")]
    public decimal? PermanentDiscountPercent { get; set; }
    [JsonPropertyName("permanent_discount_fixed")]
    public decimal? PermanentDiscountFixed { get; set; }

    [JsonPropertyName("initial_stock_quantity")]
    public decimal? InitialStockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("safety_stock")]
    public decimal SafetyStock { get; set; }

    [JsonPropertyName("target_stock_level")]
    public decimal TargetStockLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = true;

    [JsonPropertyName("is_serial_tracked")]
    public bool IsSerialTracked { get; set; }

    [JsonPropertyName("warranty_months")]
    public int WarrantyMonths { get; set; }

    [JsonPropertyName("is_batch_tracked")]
    public bool IsBatchTracked { get; set; }

    [JsonPropertyName("expiry_alert_days")]
    public int ExpiryAlertDays { get; set; } = 30;
    [JsonPropertyName("has_pack_option")]
    public bool HasPackOption { get; set; }
    [JsonPropertyName("pack_size")]
    public int PackSize { get; set; }
    [JsonPropertyName("pack_price")]
    public decimal? PackPrice { get; set; }
    [JsonPropertyName("pack_label")]
    public string? PackLabel { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class GenerateBarcodeRequest
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("seed")]
    public string? Seed { get; set; }
}

public sealed class GenerateProductBarcodeRequest
{
    [JsonPropertyName("force_replace")]
    public bool ForceReplace { get; set; }

    [JsonPropertyName("seed")]
    public string? Seed { get; set; }
}

public sealed class GenerateBarcodeResponse
{
    [JsonPropertyName("barcode")]
    public string Barcode { get; set; } = string.Empty;

    [JsonPropertyName("format")]
    public string Format { get; set; } = "ean-13";

    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; }
}

public sealed class ValidateBarcodeRequest
{
    [JsonPropertyName("barcode")]
    public string Barcode { get; set; } = string.Empty;

    [JsonPropertyName("exclude_product_id")]
    public Guid? ExcludeProductId { get; set; }

    [JsonPropertyName("check_existing")]
    public bool CheckExisting { get; set; } = true;
}

public sealed class ValidateBarcodeResponse
{
    [JsonPropertyName("barcode")]
    public string Barcode { get; set; } = string.Empty;

    [JsonPropertyName("normalized_barcode")]
    public string NormalizedBarcode { get; set; } = string.Empty;

    [JsonPropertyName("is_valid")]
    public bool IsValid { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; } = "unknown";

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("exists")]
    public bool Exists { get; set; }
}

public sealed class BulkGenerateMissingProductBarcodesRequest
{
    [JsonPropertyName("take")]
    public int Take { get; set; } = 200;

    [JsonPropertyName("include_inactive")]
    public bool IncludeInactive { get; set; }

    [JsonPropertyName("dry_run")]
    public bool DryRun { get; set; }
}

public sealed class BulkGenerateMissingProductBarcodesResponse
{
    [JsonPropertyName("dry_run")]
    public bool DryRun { get; set; }

    [JsonPropertyName("scanned")]
    public int Scanned { get; set; }

    [JsonPropertyName("generated")]
    public int Generated { get; set; }

    [JsonPropertyName("would_generate")]
    public int WouldGenerate { get; set; }

    [JsonPropertyName("skipped_existing")]
    public int SkippedExisting { get; set; }

    [JsonPropertyName("failed")]
    public int Failed { get; set; }

    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; }

    [JsonPropertyName("items")]
    public List<BulkGenerateMissingProductBarcodeItemResponse> Items { get; set; } = [];
}

public sealed class BulkGenerateMissingProductBarcodeItemResponse
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public sealed class StockAdjustmentRequest
{
    [JsonPropertyName("delta_quantity")]
    public decimal DeltaQuantity { get; set; }

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = "manual_adjustment";

    [JsonPropertyName("batch_id")]
    public Guid? BatchId { get; set; }
}

public sealed class StockAdjustmentResponse
{
    [JsonPropertyName("product_id")]
    public Guid ProductId { get; set; }

    [JsonPropertyName("delta_quantity")]
    public decimal DeltaQuantity { get; set; }

    [JsonPropertyName("previous_quantity")]
    public decimal PreviousQuantity { get; set; }

    [JsonPropertyName("new_quantity")]
    public decimal NewQuantity { get; set; }

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("is_low_stock")]
    public bool IsLowStock { get; set; }

    [JsonPropertyName("alert_level")]
    public decimal AlertLevel { get; set; }

    [JsonPropertyName("safety_stock")]
    public decimal SafetyStock { get; set; }

    [JsonPropertyName("target_stock_level")]
    public decimal TargetStockLevel { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}
