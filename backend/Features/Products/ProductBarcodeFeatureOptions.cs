namespace SmartPos.Backend.Features.Products;

public sealed class ProductBarcodeFeatureOptions
{
    public const string SectionName = "ProductBarcodes";

    public bool Enabled { get; set; } = true;
}
