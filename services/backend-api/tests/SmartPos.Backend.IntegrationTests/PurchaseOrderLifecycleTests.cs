using System.Net.Http.Json;
using System.Net;
using System.Text.Json.Nodes;

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
                phone = "0712345678",
                company_name = $"PO Supplier Co {runId}",
                company_phone = "0112345678",
                address = "Integration Test Road",
                is_active = true,
                brand_ids = Array.Empty<Guid>()
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
                is_active = true,
                brand_ids = Array.Empty<Guid>()
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

    [Fact]
    public async Task UpdatePurchaseOrder_ShouldAllowReplacingLines()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"PO Update Supplier {runId}",
                is_active = true,
                brand_ids = Array.Empty<Guid>()
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var firstProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Update Product A {runId}",
                sku = $"PO-UPD-A-{runId}",
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));
        var firstProductId = Guid.Parse(TestJson.GetString(firstProduct, "product_id"));

        var secondProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Update Product B {runId}",
                sku = $"PO-UPD-B-{runId}",
                unit_price = 220m,
                cost_price = 180m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));
        var secondProductId = Guid.Parse(TestJson.GetString(secondProduct, "product_id"));

        var createdOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-UPD-{runId}",
                lines = new[]
                {
                    new
                    {
                        product_id = firstProductId,
                        quantity_ordered = 2m,
                        unit_cost_estimate = 95m
                    }
                }
            }));

        var purchaseOrderId = Guid.Parse(TestJson.GetString(createdOrder, "id"));

        var updateResponse = await client.PatchAsJsonAsync($"/api/purchase-orders/{purchaseOrderId}", new
        {
            po_number = $"PO-UPD-{runId}-REV",
            notes = "Updated draft order",
            lines = new[]
            {
                new
                {
                    product_id = firstProductId,
                    quantity_ordered = 3m,
                    unit_cost_estimate = 102.5m
                },
                new
                {
                    product_id = secondProductId,
                    quantity_ordered = 1m,
                    unit_cost_estimate = 175m
                }
            }
        });

        var updatedOrder = await TestJson.ReadObjectAsync(updateResponse);
        var updatedLines = updatedOrder["lines"]!.AsArray().OfType<JsonObject>().ToArray();

        Assert.Equal($"PO-UPD-{runId}-REV", TestJson.GetString(updatedOrder, "po_number"));
        Assert.Equal("Updated draft order", TestJson.GetString(updatedOrder, "notes"));
        Assert.Equal(2, updatedLines.Length);
        var firstLine = updatedLines.Single(line => TestJson.GetString(line, "product_id") == firstProductId.ToString());
        var secondLine = updatedLines.Single(line => TestJson.GetString(line, "product_id") == secondProductId.ToString());
        Assert.Equal(3m, TestJson.GetDecimal(firstLine, "quantity_ordered"));
        Assert.Equal(102.5m, TestJson.GetDecimal(firstLine, "unit_cost_estimate"));
        Assert.Equal(1m, TestJson.GetDecimal(secondLine, "quantity_ordered"));
        Assert.Equal(175m, TestJson.GetDecimal(secondLine, "unit_cost_estimate"));
    }

    [Fact]
    public async Task ListPurchaseOrders_ShouldReturnSuccess()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/purchase-orders");
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(response.IsSuccessStatusCode, $"Expected success but got {(int)response.StatusCode} {response.StatusCode}: {body}");
    }

    [Fact]
    public async Task ListPurchaseOrders_ShouldFilterByStatus()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"PO Filter Supplier {runId}",
                is_active = true,
                brand_ids = Array.Empty<Guid>()
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Filter Product {runId}",
                sku = $"PO-FLT-{runId}",
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var draftOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-FLT-DRAFT-{runId}",
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_ordered = 1m,
                        unit_cost_estimate = 25m
                    }
                }
            }));

        var sentOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-FLT-SENT-{runId}",
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_ordered = 2m,
                        unit_cost_estimate = 30m
                    }
                }
            }));

        var sentOrderId = Guid.Parse(TestJson.GetString(sentOrder, "id"));
        await TestJson.ReadObjectAsync(
            await client.PostAsync($"/api/purchase-orders/{sentOrderId}/send", null));

        var allBody = await (await client.GetAsync("/api/purchase-orders")).Content.ReadAsStringAsync();
        var allItems = JsonNode.Parse(allBody)?.AsArray()
                      ?? throw new InvalidOperationException("Missing purchase order list.");
        Assert.True(allItems.Count >= 2);

        var sentBody = await (await client.GetAsync("/api/purchase-orders?status=Sent")).Content.ReadAsStringAsync();
        var sentItems = JsonNode.Parse(sentBody)?.AsArray().OfType<JsonObject>().ToArray()
                        ?? throw new InvalidOperationException("Missing filtered purchase order list.");

        Assert.Single(sentItems);
        Assert.Equal("Sent", TestJson.GetString(sentItems[0], "status"));
        Assert.Contains(TestJson.GetString(sentItems[0], "po_number"), sentItems[0].ToJsonString());
        Assert.Contains(TestJson.GetString(draftOrder, "po_number"), allBody);
    }

    [Fact]
    public async Task ReceivePurchaseOrder_ShouldCreateAvailableSerialNumbersForSerialTrackedProducts()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialOne = $"PO-SER-{runId}-001";
        var serialTwo = $"PO-SER-{runId}-002";

        var supplier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/suppliers", new
            {
                name = $"PO Serial Supplier {runId}",
                is_active = true,
                brand_ids = Array.Empty<Guid>()
            }));
        var supplierId = Guid.Parse(TestJson.GetString(supplier, "supplier_id"));

        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"PO Serial Product {runId}",
                sku = $"PO-SER-PROD-{runId}",
                unit_price = 400m,
                cost_price = 300m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var purchaseOrder = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchase-orders", new
            {
                supplier_id = supplierId,
                po_number = $"PO-SER-{runId}",
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_ordered = 2m,
                        unit_cost_estimate = 275m
                    }
                }
            }));
        var purchaseOrderId = Guid.Parse(TestJson.GetString(purchaseOrder, "id"));

        var receiveResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/purchase-orders/{purchaseOrderId}/receive", new
            {
                invoice_number = $"INV-SER-{runId}",
                invoice_date = DateTimeOffset.UtcNow,
                update_cost_price = true,
                lines = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity_received = 2m,
                        unit_cost = 275m,
                        serials = new[] { serialOne, serialTwo }
                    }
                }
            }));

        Assert.Equal("Received", TestJson.GetString(receiveResponse["purchase_order"]!, "status"));

        var serialReload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/serials"));
        var serialItems = serialReload["items"]?.AsArray().OfType<JsonObject>().ToArray()
                          ?? throw new InvalidOperationException("Missing serials after purchase receipt.");

        Assert.Equal(2, serialItems.Length);
        Assert.Contains(serialItems, item => string.Equals(TestJson.GetString(item, "serial_value"), serialOne, StringComparison.Ordinal));
        Assert.Contains(serialItems, item => string.Equals(TestJson.GetString(item, "serial_value"), serialTwo, StringComparison.Ordinal));
        Assert.All(serialItems, item => Assert.Equal("Available", TestJson.GetString(item, "status")));

        var catalog = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/catalog?q={Uri.EscapeDataString($"PO-SER-PROD-{runId}")}&take=20"));
        var catalogItem = catalog["items"]?.AsArray().OfType<JsonObject>()
            .FirstOrDefault(item => TestJson.GetString(item, "product_id") == productId.ToString())
            ?? throw new InvalidOperationException("Received product was not returned in the product catalog.");

        Assert.Equal(2m, TestJson.GetDecimal(catalogItem, "stock_quantity"));
    }
}
