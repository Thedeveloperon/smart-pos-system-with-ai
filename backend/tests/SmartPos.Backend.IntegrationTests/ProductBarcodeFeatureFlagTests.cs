using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class BarcodeFeatureDisabledWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["ProductBarcodes:Enabled"] = "false"
        };
    }
}

public sealed class ProductBarcodeFeatureFlagTests(BarcodeFeatureDisabledWebApplicationFactory factory)
    : IClassFixture<BarcodeFeatureDisabledWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task BarcodeEndpoints_ShouldReturnNotFound_WhenFeatureDisabled()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Feature Flag Product {Guid.NewGuid():N}"[..30],
                sku = $"FF-{Guid.NewGuid():N}"[..12],
                barcode = (string?)null,
                category_id = (Guid?)null,
                unit_price = 100m,
                cost_price = 60m,
                initial_stock_quantity = 1m,
                reorder_level = 1m,
                allow_negative_stock = true,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var generateResponse = await client.PostAsJsonAsync("/api/products/barcodes/generate", new
        {
            name = "Feature flag barcode",
            sku = "FF-BAR-001"
        });
        await AssertBarcodeFeatureDisabledAsync(generateResponse);

        var validateResponse = await client.PostAsJsonAsync("/api/products/barcodes/validate", new
        {
            barcode = "4006381333931"
        });
        await AssertBarcodeFeatureDisabledAsync(validateResponse);

        var assignResponse = await client.PostAsJsonAsync($"/api/products/{productId}/barcode/generate", new
        {
            force_replace = true
        });
        await AssertBarcodeFeatureDisabledAsync(assignResponse);

        var bulkResponse = await client.PostAsJsonAsync("/api/products/barcodes/bulk-generate-missing", new
        {
            take = 20,
            include_inactive = true,
            dry_run = true
        });
        await AssertBarcodeFeatureDisabledAsync(bulkResponse);
    }

    private static async Task AssertBarcodeFeatureDisabledAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.NotNull(payload);
        Assert.Equal("Barcode feature is disabled.", TestJson.GetString(payload!, "message"));
    }
}
