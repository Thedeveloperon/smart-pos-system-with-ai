using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

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
        var productStoreId = await GetProductStoreIdAsync(productId);

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
        await AssertSaleStoreScopeAsync(saleId, productId, productStoreId);

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
        await AssertRefundStoreScopeAsync(saleId, productId, productStoreId);

        var finalReceipt = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/receipts/{saleId}"));
        Assert.Equal("refundedfully", TestJson.GetString(finalReceipt, "status"));

        var paymentBreakdown = FirstObjectFromArray(finalReceipt, "payment_breakdown");
        var reversedAmount = TestJson.GetDecimal(paymentBreakdown, "reversed_amount");
        Assert.Equal(saleGrandTotal, reversedAmount);

        var transactionsReport = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/transactions"));
        var reportSale = transactionsReport["items"]!
            .AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => Guid.Parse(TestJson.GetString(item, "sale_id")) == saleId)
            ?? throw new InvalidOperationException("Completed sale was not found in the transactions report.");
        var reportLineItem = FirstObjectFromArray(reportSale, "line_items");

        Assert.Equal(productId, Guid.Parse(TestJson.GetString(reportLineItem, "product_id")));
        Assert.Equal(2m, TestJson.GetDecimal(reportLineItem, "quantity"));

        var paymentBreakdownReport = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/payment-breakdown"));
        var cashMethod = paymentBreakdownReport["items"]!
            .AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(item => string.Equals(
                item["method"]?.GetValue<string>(),
                "cash",
                StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Cash payment method was not found in payment breakdown report.");
        Assert.True(TestJson.GetInt32(cashMethod, "count") >= 1);
    }

    [Fact]
    public async Task HoldAndCompleteSale_ShouldPersistStoreScopeOnSaleAndInventory()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));

        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var productStoreId = await GetProductStoreIdAsync(productId);

        var holdSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/hold", new
            {
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 1m
                    }
                },
                discount_percent = 0m,
                role = "cashier"
            }));

        var saleId = Guid.Parse(TestJson.GetString(holdSale, "sale_id"));
        var grandTotal = TestJson.GetDecimal(holdSale, "grand_total");

        Assert.Equal("held", TestJson.GetString(holdSale, "status"));
        await AssertSaleStoreScopeAsync(saleId, productId, productStoreId);

        var completeSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = saleId,
                items = Array.Empty<object>(),
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = grandTotal,
                        reference_number = (string?)null
                    }
                }
            }));

        Assert.Equal("completed", TestJson.GetString(completeSale, "status"));
        await AssertSaleStoreScopeAsync(saleId, productId, productStoreId);
    }

    [Fact]
    public async Task CompleteHeldSale_WithEditedItems_ShouldPersistCartChanges()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));
        var availableProducts = productSearch["items"]?
            .AsArray()
            .OfType<JsonObject>()
            .Where(item => !(item["is_serial_tracked"]?.GetValue<bool>() ?? false))
            .Take(2)
            .ToArray()
            ?? throw new InvalidOperationException("Product search items were missing.");

        Assert.True(availableProducts.Length >= 2, "Expected at least two non-serial products for the held-bill edit test.");

        var firstProduct = availableProducts[0];
        var secondProduct = availableProducts[1];
        var firstProductId = Guid.Parse(TestJson.GetString(firstProduct, "id"));
        var secondProductId = Guid.Parse(TestJson.GetString(secondProduct, "id"));
        var secondProductUnitPrice = TestJson.GetDecimal(secondProduct, "unitPrice");

        var holdSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/hold", new
            {
                items = new[]
                {
                    new
                    {
                        product_id = firstProductId,
                        quantity = 1m
                    }
                },
                discount_percent = 0m,
                role = "cashier"
            }));

        var saleId = Guid.Parse(TestJson.GetString(holdSale, "sale_id"));
        var heldLine = FirstObjectFromArray(holdSale, "items");
        var heldSaleItemId = Guid.Parse(TestJson.GetString(heldLine, "sale_item_id"));
        var heldUnitPrice = TestJson.GetDecimal(heldLine, "unit_price");
        var expectedGrandTotal = (heldUnitPrice * 3m) + secondProductUnitPrice;

        var completeSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = saleId,
                items = new object[]
                {
                    new
                    {
                        sale_item_id = heldSaleItemId,
                        product_id = firstProductId,
                        quantity = 3m
                    },
                    new
                    {
                        product_id = secondProductId,
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
                        amount = expectedGrandTotal,
                        reference_number = (string?)null
                    }
                }
            }));

        Assert.Equal("completed", TestJson.GetString(completeSale, "status"));
        Assert.Equal(expectedGrandTotal, TestJson.GetDecimal(completeSale, "grand_total"));

        var completedItems = completeSale["items"]?
            .AsArray()
            .OfType<JsonObject>()
            .ToArray()
            ?? throw new InvalidOperationException("Completed sale items were missing.");
        Assert.Equal(2, completedItems.Length);

        var editedHeldLine = completedItems.Single(item => Guid.Parse(TestJson.GetString(item, "product_id")) == firstProductId);
        Assert.Equal(heldSaleItemId, Guid.Parse(TestJson.GetString(editedHeldLine, "sale_item_id")));
        Assert.Equal(3m, TestJson.GetDecimal(editedHeldLine, "quantity"));
        Assert.Equal(heldUnitPrice, TestJson.GetDecimal(editedHeldLine, "unit_price"));

        var addedLine = completedItems.Single(item => Guid.Parse(TestJson.GetString(item, "product_id")) == secondProductId);
        Assert.Equal(1m, TestJson.GetDecimal(addedLine, "quantity"));
        Assert.Equal(secondProductUnitPrice, TestJson.GetDecimal(addedLine, "unit_price"));
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

    private async Task<Guid?> GetProductStoreIdAsync(Guid productId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        return await dbContext.Products
            .Where(x => x.Id == productId)
            .Select(x => x.StoreId)
            .SingleAsync();
    }

    private async Task AssertSaleStoreScopeAsync(Guid saleId, Guid productId, Guid? expectedStoreId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var sale = await dbContext.Sales
            .SingleAsync(x => x.Id == saleId);
        var inventory = await dbContext.Inventory
            .SingleAsync(x => x.ProductId == productId);
        var ledgerEntries = await dbContext.Ledger
            .Where(x => x.SaleId == saleId)
            .ToListAsync();

        Assert.Equal(expectedStoreId, sale.StoreId);
        Assert.Equal(expectedStoreId, inventory.StoreId);
        Assert.All(ledgerEntries, entry => Assert.Equal(expectedStoreId, entry.StoreId));
    }

    private async Task AssertRefundStoreScopeAsync(Guid saleId, Guid productId, Guid? expectedStoreId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var inventory = await dbContext.Inventory
            .SingleAsync(x => x.ProductId == productId);
        var refunds = await dbContext.Refunds
            .Where(x => x.SaleId == saleId)
            .ToListAsync();
        var refundLedgerEntries = await dbContext.Ledger
            .Where(x => x.SaleId == saleId && (x.EntryType == LedgerEntryType.Refund || x.EntryType == LedgerEntryType.Reversal))
            .ToListAsync();

        Assert.Equal(expectedStoreId, inventory.StoreId);
        Assert.All(refunds, refund => Assert.Equal(expectedStoreId, refund.StoreId));
        Assert.All(refundLedgerEntries, entry => Assert.Equal(expectedStoreId, entry.StoreId));
    }
}
