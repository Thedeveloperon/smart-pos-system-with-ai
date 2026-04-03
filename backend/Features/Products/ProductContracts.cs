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
    public decimal UnitPrice { get; set; }
    public decimal StockQuantity { get; set; }
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

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class UpsertCategoryRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
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

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }

    [JsonPropertyName("stock_quantity")]
    public decimal StockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("alert_level")]
    public decimal AlertLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("is_low_stock")]
    public bool IsLowStock { get; set; }

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

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }

    [JsonPropertyName("initial_stock_quantity")]
    public decimal InitialStockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = true;

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

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = true;

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

    [JsonPropertyName("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}
