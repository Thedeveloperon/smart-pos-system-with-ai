using System.Net;
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
        await CloseActiveSessionIfPresentAsync();

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
                total = 1000m,
                cashier_name = "Night Cashier"
            }));

        Assert.Equal("active", TestJson.GetString(openedSession, "status"));
        Assert.Equal(1, TestJson.GetInt32(openedSession, "shift_number"));
        Assert.Equal("Night Cashier", TestJson.GetString(openedSession, "cashier_name"));
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
                total = 1000m,
                reason = "Adjusted to match counted cash float."
            }));

        Assert.Equal(1000m, TestJson.GetDecimal(updatedDrawer["drawer"]!, "total"));
        Assert.Contains(
            updatedDrawer["audit_log"]!.AsArray().OfType<JsonObject>(),
            entry => TestJson.GetString(entry, "action") == "cash_drawer_updated" &&
                     TestJson.GetString(entry, "details").Contains("Adjusted to match counted cash float.", StringComparison.Ordinal));

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
        Assert.Equal(1, TestJson.GetInt32(closedSession, "shift_number"));
        Assert.Equal(1000m, TestJson.GetDecimal(closedSession, "expected_cash"));
        Assert.Equal(0m, TestJson.GetDecimal(closedSession, "difference"));

        var history = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/cash-sessions?from={DateOnly.FromDateTime(DateTime.UtcNow):yyyy-MM-dd}&to={DateOnly.FromDateTime(DateTime.UtcNow):yyyy-MM-dd}"));
        Assert.NotEmpty(history["items"]!.AsArray());
        Assert.Equal(1, TestJson.GetInt32(FirstObjectFromArray(history, "items"), "shift_number"));

        var reopenedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m,
                cashier_name = "Night Cashier"
            }));

        Assert.Equal(2, TestJson.GetInt32(reopenedSession, "shift_number"));

        var reopenedSessionId = Guid.Parse(TestJson.GetString(reopenedSession, "cash_session_id"));
        var reopenedClosedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/cash-sessions/{reopenedSessionId}/close", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m
            }));

        Assert.Equal("closed", TestJson.GetString(reopenedClosedSession, "status"));
    }

    [Fact]
    public async Task DrawerUpdate_ShouldAppearAsNonSaleTransaction()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await CloseActiveSessionIfPresentAsync();

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
                total = 1000m,
                cashier_name = "Drawer Cashier"
            }));

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var baselineReport = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/reports/transactions?from={today:yyyy-MM-dd}&to={today:yyyy-MM-dd}&take=50"));
        var baselineGrossTotal = TestJson.GetDecimal(baselineReport, "gross_total");
        var baselineNetCollectedTotal = TestJson.GetDecimal(baselineReport, "net_collected_total");

        await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync("/api/cash-sessions/current/drawer", new
            {
                counts = new[]
                {
                    new { denomination = 500m, quantity = 1m },
                    new { denomination = 100m, quantity = 6m }
                },
                total = 1100m,
                reason = "Added petty cash for the shift."
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
                        amount = unitPrice,
                        reference_number = (string?)null
                    }
                },
                cash_received_counts = Array.Empty<object>(),
                cash_change_counts = Array.Empty<object>()
            }));

        Assert.Equal("completed", TestJson.GetString(saleResponse, "status"));

        var report = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/reports/transactions?from={today:yyyy-MM-dd}&to={today:yyyy-MM-dd}&take=50"));

        Assert.Equal(baselineGrossTotal + unitPrice, TestJson.GetDecimal(report, "gross_total"));
        Assert.Equal(baselineNetCollectedTotal + unitPrice, TestJson.GetDecimal(report, "net_collected_total"));

        var items = report["items"]!.AsArray().OfType<JsonObject>().ToList();
        Assert.Contains(items, item =>
            TestJson.GetString(item, "transaction_type") == "cash_drawer_adjustment" &&
            TestJson.GetDecimal(item, "cash_movement_amount") == 100m &&
            TestJson.GetString(item, "status") == "cash_added");
    }

    [Fact]
    public async Task DrawerUpdate_WithoutReason_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await CloseActiveSessionIfPresentAsync();

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                counts = new[]
                {
                    new { denomination = 1000m, quantity = 1m }
                },
                total = 1000m,
                cashier_name = "Drawer Cashier"
            }));

        var response = await client.PutAsJsonAsync("/api/cash-sessions/current/drawer", new
        {
            counts = new[]
            {
                new { denomination = 500m, quantity = 1m },
                new { denomination = 100m, quantity = 6m }
            },
            total = 1100m
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("A reason is required when adjusting the drawer.", TestJson.GetString(payload!, "message"));
    }

    [Fact]
    public async Task CashSale_WithDenominationCounts_ShouldUpdateDrawerTotal()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await CloseActiveSessionIfPresentAsync();

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
                total = 1000m,
                cashier_name = "Day Cashier"
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
        Assert.Equal(unitPrice, TestJson.GetDecimal(currentAfterSale, "cash_sales_total"));
        Assert.Equal(1000m + unitPrice, TestJson.GetDecimal(currentAfterSale["drawer"]!, "total"));

        var sessionId = Guid.Parse(TestJson.GetString(openedSession, "cash_session_id"));
        var closedSession = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                counts = BuildCounts(1000m + unitPrice),
                total = 1000m + unitPrice
            }));

        Assert.Equal(1000m + unitPrice, TestJson.GetDecimal(closedSession, "expected_cash"));
        Assert.Equal(0m, TestJson.GetDecimal(closedSession, "difference"));
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

    private async Task CloseActiveSessionIfPresentAsync()
    {
        var currentResponse = await client.GetAsync("/api/cash-sessions/current");
        if (!currentResponse.IsSuccessStatusCode)
        {
            return;
        }

        var currentBody = await currentResponse.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(currentBody))
        {
            return;
        }

        var current = JsonNode.Parse(currentBody)?.AsObject()
                     ?? throw new InvalidOperationException("Current cash session response was empty.");
        var status = TestJson.GetString(current, "status");
        if (status is not ("active" or "closing"))
        {
            return;
        }

        var sessionId = Guid.Parse(TestJson.GetString(current, "cash_session_id"));
        var drawer = current["drawer"]!.AsObject();
        await client.PostAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
        {
            counts = drawer["counts"]?.AsArray() ?? [],
            total = TestJson.GetDecimal(drawer, "total"),
            reason = "test cleanup"
        });
    }
}
