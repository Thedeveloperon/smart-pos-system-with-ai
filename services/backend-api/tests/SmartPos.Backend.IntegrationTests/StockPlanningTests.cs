using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class StockPlanningTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task StockPlanningEndpoints_ShouldSupportBrandsSuppliersSettingsAndLowStockGrouping()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];

        var brand = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/brands", new
            {
                name = $"Brand {runId}",
                code = $"B-{runId}",
                description = "Integration brand",
                is_active = true
            }));
        var brandId = Guid.Parse(TestJson.GetString(brand, "brand_id"));

        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"Supplier {runId}",
                code = $"S-{runId}",
                contact_name = "Integration Contact",
                phone = "+94-000-0000",
                email = "supplier@example.test",
                address = "Integration Address",
                is_active = true
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Stock Product {runId}",
                sku = $"STK-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                brand_id = brandId,
                unit_price = 150m,
                cost_price = 90m,
                initial_stock_quantity = 4m,
                reorder_level = 5m,
                safety_stock = 1m,
                target_stock_level = 8m,
                allow_negative_stock = false,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));
        Assert.Equal(brandId.ToString(), TestJson.GetString(product, "brand_id"), ignoreCase: true, ignoreLineEndingDifferences: false, ignoreWhiteSpaceDifferences: false);
        Assert.Equal("Brand " + runId, TestJson.GetString(product, "brand_name"));

        var mapping = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}/suppliers", new
            {
                supplier_id = supplierId,
                supplier_sku = $"SUP-{runId}",
                supplier_item_name = "Integration Supplier Item",
                is_preferred = true,
                lead_time_days = 3,
                min_order_qty = 12m,
                pack_size = 6m,
                last_purchase_price = 85m,
                is_active = true
            }));
        Assert.True(mapping["is_preferred"]?.GetValue<bool>() ?? false);

        var productSuppliers = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/suppliers"));
        var productSupplierRow = FirstObjectFromArray(productSuppliers, "items");
        Assert.Equal(supplierId.ToString(), TestJson.GetString(productSupplierRow, "supplier_id"), ignoreCase: true, ignoreLineEndingDifferences: false, ignoreWhiteSpaceDifferences: false);
        Assert.True(productSupplierRow["is_preferred"]?.GetValue<bool>() ?? false);

        var lowStock = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/low-stock?take=20&threshold=5"));
        var lowStockItem = FindObjectInArray(lowStock, "items", "product_id", productId.ToString());
        Assert.Equal(brandId.ToString(), TestJson.GetString(lowStockItem, "brand_id"), ignoreCase: true, ignoreLineEndingDifferences: false, ignoreWhiteSpaceDifferences: false);
        Assert.Equal("Brand " + runId, TestJson.GetString(lowStockItem, "brand_name"));
        Assert.Equal(supplierId.ToString(), TestJson.GetString(lowStockItem, "preferred_supplier_id"), ignoreCase: true, ignoreLineEndingDifferences: false, ignoreWhiteSpaceDifferences: false);
        Assert.Equal("Supplier " + runId, TestJson.GetString(lowStockItem, "preferred_supplier_name"));

        var lowStockByBrand = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/low-stock/by-brand?take=20&threshold=5"));
        var brandRow = FindObjectInArray(lowStockByBrand, "items", "brand_id", brandId.ToString());
        Assert.Equal(1, TestJson.GetInt32(brandRow, "low_stock_count"));

        var lowStockBySupplier = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/low-stock/by-supplier?take=20&threshold=5"));
        var supplierRow = FindObjectInArray(lowStockBySupplier, "items", "supplier_id", supplierId.ToString());
        Assert.Equal(1, TestJson.GetInt32(supplierRow, "low_stock_count"));

        var stockSettings = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/settings/stock-settings"));
        Assert.True(TestJson.GetDecimal(stockSettings, "threshold_multiplier") > 0m);

        var updatedSettings = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync("/api/settings/stock-settings", new
            {
                default_low_stock_threshold = 6m,
                threshold_multiplier = 1.25m,
                default_safety_stock = 2m,
                default_lead_time_days = 4,
                default_target_days_of_cover = 12m
            }));
        Assert.Equal(1.25m, TestJson.GetDecimal(updatedSettings, "threshold_multiplier"));

        var refreshedSettings = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/settings/stock-settings"));
        Assert.Equal(6m, TestJson.GetDecimal(refreshedSettings, "default_low_stock_threshold"));
        Assert.Equal(1.25m, TestJson.GetDecimal(refreshedSettings, "threshold_multiplier"));
        Assert.Equal(2m, TestJson.GetDecimal(refreshedSettings, "default_safety_stock"));
        Assert.Equal(4, TestJson.GetInt32(refreshedSettings, "default_lead_time_days"));
        Assert.Equal(12m, TestJson.GetDecimal(refreshedSettings, "default_target_days_of_cover"));
    }

    [Fact]
    public async Task SupplierHardDelete_ShouldRemoveInactiveSupplierWithoutHistory()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];

        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"Delete Supplier {runId}",
                code = $"DS-{runId}",
                is_active = true
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var activeDeleteResponse = await client.DeleteAsync($"/api/suppliers/{supplierId}/hard-delete");
        Assert.Equal(HttpStatusCode.BadRequest, activeDeleteResponse.StatusCode);
        var activeDeletePayload = JsonNode.Parse(await activeDeleteResponse.Content.ReadAsStringAsync())?.AsObject()
                                  ?? throw new InvalidOperationException("Response body was empty.");
        Assert.Equal(
            "Only inactive suppliers can be permanently deleted.",
            TestJson.GetString(activeDeletePayload, "message"));

        var deactivatedSupplier = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/suppliers/{supplierId}", new
            {
                name = $"Delete Supplier {runId}",
                code = $"DS-{runId}",
                is_active = false
            }));
        Assert.False(deactivatedSupplier["is_active"]?.GetValue<bool>() ?? true);

        var hardDeleteResponse = await client.DeleteAsync($"/api/suppliers/{supplierId}/hard-delete");
        Assert.Equal(HttpStatusCode.NoContent, hardDeleteResponse.StatusCode);

        var supplierList = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/suppliers?include_inactive=true"));
        var items = supplierList["items"]?.AsArray()
                    ?? throw new InvalidOperationException("Missing array 'items'.");

        Assert.DoesNotContain(
            items.OfType<JsonObject>(),
            item => string.Equals(
                item["supplier_id"]?.GetValue<string>(),
                supplierId.ToString(),
                StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SupplierHardDelete_ShouldRejectSupplierWithProductLinks()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];

        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"Linked Supplier {runId}",
                code = $"LS-{runId}",
                is_active = true
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Linked Product {runId}",
                sku = $"LP-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                brand_id = (Guid?)null,
                unit_price = 100m,
                cost_price = 60m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                safety_stock = 0m,
                target_stock_level = 4m,
                allow_negative_stock = false,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var mappingResponse = await client.PutAsJsonAsync($"/api/products/{productId}/suppliers", new
        {
            supplier_id = supplierId,
            is_preferred = true,
            is_active = true
        });
        Assert.Equal(HttpStatusCode.OK, mappingResponse.StatusCode);

        var deactivateResponse = await client.PutAsJsonAsync($"/api/suppliers/{supplierId}", new
        {
            name = $"Linked Supplier {runId}",
            code = $"LS-{runId}",
            is_active = false
        });
        Assert.Equal(HttpStatusCode.OK, deactivateResponse.StatusCode);

        var hardDeleteResponse = await client.DeleteAsync($"/api/suppliers/{supplierId}/hard-delete");
        Assert.Equal(HttpStatusCode.BadRequest, hardDeleteResponse.StatusCode);

        var errorPayload = JsonNode.Parse(await hardDeleteResponse.Content.ReadAsStringAsync())?.AsObject()
                           ?? throw new InvalidOperationException("Response body was empty.");
        Assert.Equal(
            "This supplier has product links and cannot be permanently deleted.",
            TestJson.GetString(errorPayload, "message"));
    }

    [Fact]
    public async Task BrandHardDelete_ShouldRemoveInactiveBrandWithoutLinkedProducts()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];

        var brand = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/brands", new
            {
                name = $"Delete Brand {runId}",
                code = $"DB-{runId}",
                is_active = true
            }));
        var brandId = Guid.Parse(TestJson.GetString(brand, "brand_id"));

        var activeDeleteResponse = await client.DeleteAsync($"/api/brands/{brandId}/hard-delete");
        Assert.Equal(HttpStatusCode.BadRequest, activeDeleteResponse.StatusCode);
        var activeDeletePayload = JsonNode.Parse(await activeDeleteResponse.Content.ReadAsStringAsync())?.AsObject()
                                  ?? throw new InvalidOperationException("Response body was empty.");
        Assert.Equal(
            "Only inactive brands can be permanently deleted.",
            TestJson.GetString(activeDeletePayload, "message"));

        var deactivatedBrand = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/brands/{brandId}", new
            {
                name = $"Delete Brand {runId}",
                code = $"DB-{runId}",
                is_active = false
            }));
        Assert.False(deactivatedBrand["is_active"]?.GetValue<bool>() ?? true);

        var brandList = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/brands?include_inactive=true"));
        var listItem = FindObjectInArray(brandList, "items", "brand_id", brandId.ToString());
        Assert.True(listItem["can_delete"]?.GetValue<bool>() ?? false);

        var hardDeleteResponse = await client.DeleteAsync($"/api/brands/{brandId}/hard-delete");
        Assert.Equal(HttpStatusCode.NoContent, hardDeleteResponse.StatusCode);

        var refreshedList = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/brands?include_inactive=true"));
        var items = refreshedList["items"]?.AsArray()
                    ?? throw new InvalidOperationException("Missing array 'items'.");

        Assert.DoesNotContain(
            items.OfType<JsonObject>(),
            item => string.Equals(
                item["brand_id"]?.GetValue<string>(),
                brandId.ToString(),
                StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task BrandHardDelete_ShouldRejectBrandWithLinkedProducts()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];

        var brand = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/brands", new
            {
                name = $"Linked Brand {runId}",
                code = $"LB-{runId}",
                is_active = true
            }));
        var brandId = Guid.Parse(TestJson.GetString(brand, "brand_id"));

        var productResponse = await client.PostAsJsonAsync("/api/products", new
        {
            name = $"Brand Linked Product {runId}",
            sku = $"BLP-{runId}",
            barcode = (string?)null,
            category_id = (Guid?)null,
            brand_id = brandId,
            unit_price = 100m,
            cost_price = 60m,
            initial_stock_quantity = 2m,
            reorder_level = 1m,
            safety_stock = 0m,
            target_stock_level = 4m,
            allow_negative_stock = false,
            is_active = true
        });
        Assert.Equal(HttpStatusCode.OK, productResponse.StatusCode);

        var deactivateResponse = await client.PutAsJsonAsync($"/api/brands/{brandId}", new
        {
            name = $"Linked Brand {runId}",
            code = $"LB-{runId}",
            is_active = false
        });
        Assert.Equal(HttpStatusCode.OK, deactivateResponse.StatusCode);

        var brandList = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/brands?include_inactive=true"));
        var listItem = FindObjectInArray(brandList, "items", "brand_id", brandId.ToString());
        Assert.False(listItem["can_delete"]?.GetValue<bool>() ?? true);
        Assert.Equal(
            "This brand is linked to products and cannot be permanently deleted.",
            TestJson.GetString(listItem, "delete_block_reason"));

        var hardDeleteResponse = await client.DeleteAsync($"/api/brands/{brandId}/hard-delete");
        Assert.Equal(HttpStatusCode.BadRequest, hardDeleteResponse.StatusCode);

        var errorPayload = JsonNode.Parse(await hardDeleteResponse.Content.ReadAsStringAsync())?.AsObject()
                           ?? throw new InvalidOperationException("Response body was empty.");
        Assert.Equal(
            "This brand is linked to products and cannot be permanently deleted.",
            TestJson.GetString(errorPayload, "message"));
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
