using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Ai;

public static class AiSuggestionTargets
{
    public const string Name = "name";
    public const string Sku = "sku";
    public const string Barcode = "barcode";
    public const string ImageUrl = "image_url";
    public const string Category = "category";

    public static readonly HashSet<string> All = new(StringComparer.OrdinalIgnoreCase)
    {
        Name,
        Sku,
        Barcode,
        ImageUrl,
        Category
    };
}

public sealed class ProductSuggestionRequest
{
    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("image_hint")]
    public string? ImageHint { get; set; }

    [JsonPropertyName("category_name")]
    public string? CategoryName { get; set; }

    [JsonPropertyName("category_options")]
    public List<string> CategoryOptions { get; set; } = [];

    [JsonPropertyName("unit_price")]
    public decimal? UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal? CostPrice { get; set; }
}

public sealed class ProductSuggestionResponse
{
    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("suggestion")]
    public string Suggestion { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("source")]
    public string Source { get; set; } = "openai";
}

public sealed class ProductFromImageRequest
{
    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("image_hint")]
    public string? ImageHint { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("category_name")]
    public string? CategoryName { get; set; }

    [JsonPropertyName("category_options")]
    public List<string> CategoryOptions { get; set; } = [];

    [JsonPropertyName("unit_price")]
    public decimal? UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal? CostPrice { get; set; }
}

public sealed class ProductFromImageResponse
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; } = "mixed";

    [JsonPropertyName("model")]
    public string Model { get; set; } = "mixed";

    [JsonPropertyName("details")]
    public List<ProductSuggestionResponse> Details { get; set; } = [];
}
