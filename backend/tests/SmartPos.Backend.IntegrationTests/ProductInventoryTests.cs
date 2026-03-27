using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ProductInventoryTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ProductInventoryLifecycle_ShouldSupportCategoryBarcodeAdjustmentsAndLowStock()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var categoryName = $"Integration Category {runId}";

        var createCategory = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/categories", new
            {
                name = categoryName,
                description = "Integration category",
                is_active = true
            }));

        var categoryId = Guid.Parse(TestJson.GetString(createCategory, "category_id"));
        Assert.Equal(categoryName, TestJson.GetString(createCategory, "name"));

        var barcode = $"IT{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{Random.Shared.Next(100, 999)}";
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Integration Product {runId}",
                sku = $"IT-SKU-{runId}",
                barcode,
                category_id = categoryId,
                unit_price = 125m,
                cost_price = 80m,
                initial_stock_quantity = 10m,
                reorder_level = 6m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));
        Assert.Equal(10m, TestJson.GetDecimal(createProduct, "stock_quantity"));
        Assert.Equal(barcode, TestJson.GetString(createProduct, "barcode"));

        var barcodeSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString(barcode)}"));
        var barcodeHit = FirstObjectFromArray(barcodeSearch, "items");
        Assert.Equal(
            productId.ToString(),
            TestJson.GetString(barcodeHit, "id"),
            ignoreCase: true,
            ignoreLineEndingDifferences: false,
            ignoreWhiteSpaceDifferences: false);

        var updateProduct = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}", new
            {
                name = $"Integration Product Updated {runId}",
                sku = $"IT-SKU-{runId}",
                barcode,
                category_id = categoryId,
                unit_price = 130m,
                cost_price = 82m,
                reorder_level = 6m,
                allow_negative_stock = false,
                is_active = true
            }));
        Assert.Equal(130m, TestJson.GetDecimal(updateProduct, "unit_price"));

        var stockAdjust = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/stock-adjustments", new
            {
                delta_quantity = -3m,
                reason = "manual_count_correction"
            }));
        Assert.Equal(10m, TestJson.GetDecimal(stockAdjust, "previous_quantity"));
        Assert.Equal(7m, TestJson.GetDecimal(stockAdjust, "new_quantity"));

        var completeSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 2m
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = 1000m,
                        reference_number = (string?)null
                    }
                }
            }));
        Assert.Equal("completed", TestJson.GetString(completeSale, "status"));

        var productCatalog = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/catalog?q={Uri.EscapeDataString(barcode)}&take=20"));
        var catalogItem = FindObjectInArray(productCatalog, "items", "product_id", productId.ToString());
        Assert.Equal(5m, TestJson.GetDecimal(catalogItem, "stock_quantity"));
        Assert.True(catalogItem["is_low_stock"]?.GetValue<bool>() ?? false);

        var lowStock = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/low-stock?take=200&threshold=5"));
        var lowStockItem = FindObjectInArray(lowStock, "items", "product_id", productId.ToString());
        Assert.Equal(5m, TestJson.GetDecimal(lowStockItem, "quantity_on_hand"));
    }

    private static JsonObject FirstObjectFromArray(JsonNode root, string propertyName)
    {
        var array = root[propertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{propertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault()
               ?? throw new InvalidOperationException($"Array '{propertyName}' was empty.");
    }

    private static JsonObject FindObjectInArray(
        JsonNode root,
        string arrayPropertyName,
        string keyPropertyName,
        string expectedValue)
    {
        var array = root[arrayPropertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{arrayPropertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault(item =>
                       string.Equals(
                           item[keyPropertyName]?.GetValue<string>(),
                           expectedValue,
                           StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException(
                   $"Value '{expectedValue}' was not found in '{arrayPropertyName}'.");
    }
}
