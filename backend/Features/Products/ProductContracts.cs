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
