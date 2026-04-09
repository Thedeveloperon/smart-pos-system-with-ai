using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CheckoutRefundFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task CompleteSale_ThenRefunds_ShouldUpdateFinancialState()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));

        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));

        var completePayload = new
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
                    amount = 5000m,
                    reference_number = (string?)null
                }
            }
        };

        var completeSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", completePayload));

        var saleId = Guid.Parse(TestJson.GetString(completeSale, "sale_id"));
        var saleGrandTotal = TestJson.GetDecimal(completeSale, "grand_total");
        var firstSaleItem = FirstObjectFromArray(completeSale, "items");
        var saleItemId = Guid.Parse(TestJson.GetString(firstSaleItem, "sale_item_id"));

        Assert.Equal("completed", TestJson.GetString(completeSale, "status"));

        var summaryBefore = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/refunds/sale/{saleId}"));

        Assert.Equal("completed", TestJson.GetString(summaryBefore, "sale_status"));
        Assert.Equal(0m, TestJson.GetDecimal(summaryBefore, "refunded_total"));

        var firstRefund = await TestJson.ReadObjectAsync(
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

        Assert.Equal("refundedpartially", TestJson.GetString(firstRefund, "sale_status"));
        Assert.True(TestJson.GetDecimal(firstRefund, "grand_total") > 0m);

        var secondRefund = await TestJson.ReadObjectAsync(
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

        Assert.Equal("refundedfully", TestJson.GetString(secondRefund, "sale_status"));

        var finalReceipt = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/receipts/{saleId}"));
        Assert.Equal("refundedfully", TestJson.GetString(finalReceipt, "status"));

        var paymentBreakdown = FirstObjectFromArray(finalReceipt, "payment_breakdown");
        var reversedAmount = TestJson.GetDecimal(paymentBreakdown, "reversed_amount");
        Assert.Equal(saleGrandTotal, reversedAmount);
    }

    [Fact]
    public async Task CompleteSale_WithCustomPayoutShouldPersistCashChangeDifference()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));

        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var unitPrice = TestJson.GetDecimal(firstProduct, "unitPrice");

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
                        amount = unitPrice + 820m,
                        reference_number = (string?)null
                    }
                },
                cash_received_counts = BuildCounts(unitPrice + 820m),
                cash_change_counts = BuildCounts(780m),
                custom_payout_used = true,
                cash_short_amount = 0m
            }));

        Assert.Equal("completed", TestJson.GetString(saleResponse, "status"));
        Assert.Equal(40m, TestJson.GetDecimal(saleResponse, "cash_short_amount"));
        Assert.True(saleResponse["custom_payout_used"]?.GetValue<bool>());

        var saleId = Guid.Parse(TestJson.GetString(saleResponse, "sale_id"));
        var transactions = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/transactions"));

        var matchedSale = transactions["items"]!
            .AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => Guid.Parse(TestJson.GetString(item, "sale_id")) == saleId)
            ?? throw new InvalidOperationException("Completed sale was not found in the transactions report.");

        Assert.Equal(40m, TestJson.GetDecimal(matchedSale, "cash_short_amount"));
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
            throw new InvalidOperationException("Unable to build exact cash counts for the requested total.");
        }

        return counts.ToArray();
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
}
