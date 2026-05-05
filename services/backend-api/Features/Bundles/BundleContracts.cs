using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Bundles;

public sealed class BundleCatalogResponse
{
    [JsonPropertyName("items")]
    public List<BundleResponse> Items { get; set; } = [];
}

public sealed class BundleSearchResponse
{
    [JsonPropertyName("items")]
    public List<BundleSearchItem> Items { get; set; } = [];
}

public sealed class BundleItemRequest
{
    [JsonPropertyName("product_id")]
    public Guid? ProductId { get; set; }

    [JsonPropertyName("item_name")]
    public string ItemName { get; set; } = string.Empty;

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}

public sealed class CreateBundleRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("initial_stock")]
    public decimal InitialStock { get; set; }

    [JsonPropertyName("items")]
    public List<BundleItemRequest> Items { get; set; } = [];
}

public sealed class UpdateBundleRequest
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("price")]
    public decimal? Price { get; set; }

    [JsonPropertyName("is_active")]
    public bool? IsActive { get; set; }

    [JsonPropertyName("items")]
    public List<BundleItemRequest>? Items { get; set; }
}

public sealed class BundleResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("stock_quantity")]
    public decimal StockQuantity { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; }

    [JsonPropertyName("items")]
    public List<BundleItemResponse> Items { get; set; } = [];
}

public sealed class BundleItemResponse
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("product_id")]
    public Guid? ProductId { get; set; }

    [JsonPropertyName("item_name")]
    public string ItemName { get; set; } = string.Empty;

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}

public sealed class BundleSearchItem
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("stock_quantity")]
    public decimal StockQuantity { get; set; }
}

public sealed class BundleStockQuantityRequest
{
    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }
}
