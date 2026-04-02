using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CashSessionFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task CashSession_ShouldPersist_OnOpenSaleRefundAndClose()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var unitPrice = TestJson.GetDecimal(firstProduct, "unitPrice");

        var openedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m
            }));

        Assert.Equal("active", TestJson.GetString(openedSession, "status"));
        Assert.Equal(1000m, TestJson.GetDecimal(openedSession["opening"]!, "total"));
        Assert.Equal(1000m, TestJson.GetDecimal(openedSession["drawer"]!, "total"));

        var currentAfterOpen = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/cash-sessions/current"));
        Assert.Equal(0m, TestJson.GetDecimal(currentAfterOpen, "cash_sales_total"));
        Assert.Contains(
            currentAfterOpen["audit_log"]!.AsArray().OfType<JsonObject>(),
            entry => TestJson.GetString(entry, "action") == "cash_session_opened");

        var updatedDrawer = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync("/api/cash-sessions/current/drawer", new
            {
                counts = new[]
                {
                    new { denomination = 500m, quantity = 1m },
                    new { denomination = 100m, quantity = 5m }
                },
                total = 1000m
            }));

        Assert.Equal(1000m, TestJson.GetDecimal(updatedDrawer["drawer"]!, "total"));
        Assert.Contains(
            updatedDrawer["audit_log"]!.AsArray().OfType<JsonObject>(),
            entry => TestJson.GetString(entry, "action") == "cash_drawer_updated");

        var saleResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 1m
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = unitPrice,
                        reference_number = (string?)null
                    }
                },
                cash_received_counts = Array.Empty<object>(),
                cash_change_counts = Array.Empty<object>()
            }));

        Assert.Equal("completed", TestJson.GetString(saleResponse, "status"));

        var currentAfterSale = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/cash-sessions/current"));
        Assert.Equal(unitPrice, TestJson.GetDecimal(currentAfterSale, "cash_sales_total"));
        Assert.Contains(
            currentAfterSale["audit_log"]!.AsArray().OfType<JsonObject>(),
            entry => TestJson.GetString(entry, "action") == "cash_session_sale_recorded");

        var saleId = Guid.Parse(TestJson.GetString(saleResponse, "sale_id"));
        var saleItemId = Guid.Parse(TestJson.GetString(FirstObjectFromArray(saleResponse, "items"), "sale_item_id"));

        var refundResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/refunds", new
            {
                sale_id = saleId,
                reason = "customer_request",
                items = new[]
                {
                    new
                    {
                        sale_item_id = saleItemId,
                        quantity = 1m
                    }
                }
            }));

        Assert.Equal("refundedfully", TestJson.GetString(refundResponse, "sale_status"));

        var currentAfterRefund = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/cash-sessions/current"));
        Assert.Equal(0m, TestJson.GetDecimal(currentAfterRefund, "cash_sales_total"));
        Assert.Contains(
            currentAfterRefund["audit_log"]!.AsArray().OfType<JsonObject>(),
            entry => TestJson.GetString(entry, "action") == "cash_session_refund_recorded");

        var sessionId = Guid.Parse(TestJson.GetString(openedSession, "cash_session_id"));
        var closedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m
            }));

        Assert.Equal("closed", TestJson.GetString(closedSession, "status"));
        Assert.Equal(1000m, TestJson.GetDecimal(closedSession, "expected_cash"));
        Assert.Equal(0m, TestJson.GetDecimal(closedSession, "difference"));
    }

    [Fact]
    public async Task CashSale_WithDenominationCounts_ShouldUpdateDrawerTotal()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var unitPrice = TestJson.GetDecimal(firstProduct, "unitPrice");

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m
            }));

        var saleResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 1m
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = unitPrice + 100m,
                        reference_number = (string?)null
                    }
                },
                cash_received_counts = BuildCounts(unitPrice + 100m),
                cash_change_counts = BuildCounts(100m)
            }));

        Assert.Equal("completed", TestJson.GetString(saleResponse, "status"));

        var currentAfterSale = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/cash-sessions/current"));
        Assert.Equal(unitPrice + 100m, TestJson.GetDecimal(currentAfterSale, "cash_sales_total"));
        Assert.Equal(1000m + unitPrice, TestJson.GetDecimal(currentAfterSale["drawer"]!, "total"));
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

    private static object[] BuildCounts(decimal total)
    {
        if (total != decimal.Truncate(total))
        {
            throw new InvalidOperationException("Test amount must be a whole number.");
        }

        var remaining = (int)total;
        var denominations = new[] { 5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1 };
        var counts = new List<object>();

        foreach (var denomination in denominations)
        {
            var quantity = remaining / denomination;
            if (quantity > 0)
            {
                counts.Add(new { denomination = (decimal)denomination, quantity = (decimal)quantity });
                remaining -= quantity * denomination;
            }
        }

        if (remaining != 0)
        {
            throw new InvalidOperationException("Test amount cannot be represented by available denominations.");
        }

        return counts.ToArray();
    }
}
