using System.Net.Http.Json;
using System.Net;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PurchaseOrderLifecycleTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task CreatePurchaseOrder_ShouldReturnCreatedOrder()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"PO Supplier {runId}",
                code = $"SUP-{runId}",
                contact_name = "Procurement",
                phone = "0712345678",
                email = $"supplier-{runId}@example.com",
                address = "Integration Test Road",
                is_active = true
            }));

        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Product {runId}",
                sku = $"PO-SKU-{runId}",
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var createdOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-{runId}",
                po_date = DateTimeOffset.UtcNow,
                expected_delivery_date = DateTimeOffset.UtcNow.AddDays(7),
                notes = "Integration test purchase order",
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_ordered = 5m,
                        unit_cost_estimate = 72.5m
                    }
                }
            }));

        Assert.Equal(supplierId.ToString(), TestJson.GetString(createdOrder, "supplier_id"));
        Assert.Equal($"PO-{runId}", TestJson.GetString(createdOrder, "po_number"));
        Assert.Equal("Draft", TestJson.GetString(createdOrder, "status"));
        Assert.Single(createdOrder["lines"]!.AsArray());
        Assert.Equal(productId.ToString(), TestJson.GetString(createdOrder["lines"]![0]!, "product_id"));
    }

    [Fact]
    public async Task CreatePurchaseOrder_ShouldAcceptDateOnlyValues()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"PO Date Supplier {runId}",
                code = $"POD-{runId}",
                is_active = true
            }));

        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Date Product {runId}",
                sku = $"PO-DATE-{runId}",
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var createdOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-DATE-{runId}",
                po_date = "2026-05-01",
                expected_delivery_date = "2026-05-08",
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_ordered = 5m,
                        unit_cost_estimate = 72.5m
                    }
                }
            }));

        Assert.StartsWith("2026-05-01", TestJson.GetString(createdOrder, "po_date"));
        Assert.StartsWith("2026-05-08", TestJson.GetString(createdOrder, "expected_delivery_date"));
    }
}
