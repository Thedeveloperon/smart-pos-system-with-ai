using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CustomerFeatureIntegrationTests
{
    [Fact]
    public async Task CustomerCrud_ShouldPersistTierTagsAndSearchResults()
    {
        using var appFactory = new CustomWebApplicationFactory();
        using var client = appFactory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);
        var tierCode = $"PLT-{Guid.NewGuid():N}";
        var tierName = $"Platinum-{Guid.NewGuid():N}";

        var tier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customer-price-tiers", new
            {
                name = tierName,
                code = tierCode,
                discount_percent = 12m,
                description = "High value customers",
                is_active = true
            }));

        var tierId = Guid.Parse(TestJson.GetString(tier, "price_tier_id"));
        Assert.Equal(tierName, TestJson.GetString(tier, "name"));
        Assert.Equal(0, TestJson.GetInt32(tier, "customer_count"));

        var customer = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customers", new
            {
                name = "Gamma Stores",
                code = (string?)null,
                id_number = "NIC-778899V",
                phone = "+94 11 222 3344",
                email = "accounts@gamma.example",
                address = "Colombo",
                date_of_birth = (DateOnly?)null,
                price_tier_id = tierId,
                fixed_discount_percent = (decimal?)null,
                credit_limit = 150000m,
                notes = "Integration test customer",
                tags = new[] { "wholesale", "vip" },
                is_active = true
            }));

        var customerId = Guid.Parse(TestJson.GetString(customer, "customer_id"));
        Assert.Equal("Gamma Stores", TestJson.GetString(customer, "name"));
        Assert.StartsWith("C-", TestJson.GetString(customer, "code"));
        Assert.Equal("NIC-778899V", TestJson.GetString(customer, "id_number"));
        Assert.Equal(150000m, TestJson.GetDecimal(customer, "credit_limit"));
        Assert.Equal(2, customer["tags"]!.AsArray().Count);

        var detail = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/customers/{customerId}"));

        Assert.Equal("Gamma Stores", TestJson.GetString(detail, "name"));
        Assert.Equal("NIC-778899V", TestJson.GetString(detail, "id_number"));
        Assert.Equal(tierId, Guid.Parse(TestJson.GetString(detail["price_tier"]!, "price_tier_id")));
        Assert.Contains("vip", detail["tags"]!.AsArray().Select(tag => tag!.GetValue<string>()));

        var sales = await TestJson.ReadArrayAsync(
            await client.GetAsync($"/api/customers/{customerId}/sales?take=20"));
        Assert.Empty(sales);

        var list = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/customers?page=1&take=20"));
        var listItem = FindObjectFromArray(
            list["items"]!.AsArray(),
            item => Guid.Parse(TestJson.GetString(item, "customer_id")) == customerId);
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(listItem, "customer_id")));
        Assert.Equal("NIC-778899V", TestJson.GetString(listItem, "id_number"));

        var search = await TestJson.ReadArrayAsync(
            await client.GetAsync("/api/customers/search?q=Gamma"));
        var searchItem = FindObjectFromArray(
            search,
            item => Guid.Parse(TestJson.GetString(item, "customer_id")) == customerId);
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(searchItem, "customer_id")));

        var idNumberSearch = await TestJson.ReadArrayAsync(
            await client.GetAsync("/api/customers/search?q=778899"));
        var idSearchItem = FindObjectFromArray(
            idNumberSearch,
            item => Guid.Parse(TestJson.GetString(item, "customer_id")) == customerId);
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(idSearchItem, "customer_id")));
        Assert.Equal("NIC-778899V", TestJson.GetString(idSearchItem, "id_number"));

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var seededCustomer = await dbContext.Customers.FirstAsync(x => x.Id == customerId);
        seededCustomer.LoyaltyPoints = 42m;
        await dbContext.SaveChangesAsync();
        var updatedCustomerCode = $"C-{Random.Shared.Next(9000, 9999)}";

        var updated = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/customers/{customerId}", new
            {
                name = "Gamma Holdings",
                code = updatedCustomerCode,
                id_number = "NIC-112233V",
                phone = "+94 11 222 3344",
                email = "billing@gamma.example",
                address = "Colombo",
                date_of_birth = (DateOnly?)null,
                price_tier_id = tierId,
                fixed_discount_percent = 5m,
                credit_limit = 180000m,
                notes = "Updated customer",
                tags = new[] { "vip" },
                is_active = true
            }));

        Assert.Equal("Gamma Holdings", TestJson.GetString(updated, "name"));
        Assert.Equal(updatedCustomerCode, TestJson.GetString(updated, "code"));
        Assert.Equal("NIC-112233V", TestJson.GetString(updated, "id_number"));
        Assert.Equal(180000m, TestJson.GetDecimal(updated, "credit_limit"));
        Assert.Single(updated["tags"]!.AsArray());
    }

    [Fact]
    public async Task CreditSale_WithCustomerShouldApplyDiscountRedeemLoyaltyAndRecordCreditLedger()
    {
        using var appFactory = new CustomWebApplicationFactory();
        using var client = appFactory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);
        var tierCode = $"SLV-IT-{Guid.NewGuid():N}";
        var tierName = $"Silver-{Guid.NewGuid():N}";

        var tier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customer-price-tiers", new
            {
                name = tierName,
                code = tierCode,
                discount_percent = 10m,
                description = "Integration test price tier",
                is_active = true
            }));

        var tierId = Guid.Parse(TestJson.GetString(tier, "price_tier_id"));

        var customer = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customers", new
            {
                name = "Credit Customer",
                code = (string?)null,
                id_number = "PASSPORT-CR-01",
                phone = "+94 70 555 1234",
                email = "credit@example.com",
                address = "Kandy",
                date_of_birth = (DateOnly?)null,
                price_tier_id = tierId,
                fixed_discount_percent = (decimal?)null,
                credit_limit = 100000m,
                notes = "Uses credit for checkout",
                tags = new[] { "credit" },
                is_active = true
            }));

        var customerId = Guid.Parse(TestJson.GetString(customer, "customer_id"));
        using (var scope = appFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var seededCustomer = await dbContext.Customers.FirstAsync(x => x.Id == customerId);
            seededCustomer.LoyaltyPoints = 50m;
            await dbContext.SaveChangesAsync();
        }

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search?q=Ballpoint%20Pen"));
        var product = FirstObjectFromArray(productSearch["items"]!.AsArray());
        var productId = Guid.Parse(TestJson.GetString(product, "id"));

        var completeResponse = await TestJson.ReadObjectAsync(
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
                customer_id = customerId,
                loyalty_points_to_redeem = 20m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "credit",
                        amount = 250m,
                        reference_number = "CR-001"
                    }
                }
            }));

        var saleId = Guid.Parse(TestJson.GetString(completeResponse, "sale_id"));
        Assert.Equal("completed", TestJson.GetString(completeResponse, "status"));
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(completeResponse, "customer_id")));
        Assert.Equal("Credit Customer", TestJson.GetString(completeResponse, "customer_name"));
        Assert.Equal(20m, TestJson.GetDecimal(completeResponse, "loyalty_points_redeemed"));
        Assert.True(TestJson.GetDecimal(completeResponse, "loyalty_points_earned") > 0m);
        Assert.Equal(250m, TestJson.GetDecimal(completeResponse, "grand_total"));

        using (var scope = appFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

            var customerEntity = await dbContext.Customers
                .Include(x => x.CreditLedger)
                .FirstAsync(x => x.Id == customerId);

            Assert.Equal(280m, customerEntity.LoyaltyPoints);
            Assert.Equal(250m, customerEntity.OutstandingBalance);
            var ledgerEntry = Assert.Single(customerEntity.CreditLedger);
            Assert.Equal(CustomerCreditEntryType.Charge, ledgerEntry.EntryType);
            Assert.Equal(250m, ledgerEntry.Amount);
            Assert.Equal(saleId, ledgerEntry.SaleId);
        }

        var creditLedger = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/customers/{customerId}/credit-ledger"));
        var ledgerItem = FirstObjectFromArray(creditLedger["items"]!.AsArray());
        Assert.Equal("charge", TestJson.GetString(ledgerItem, "entry_type"));
        Assert.Equal(250m, TestJson.GetDecimal(ledgerItem, "amount"));

        var saleReceipt = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/receipts/{saleId}"));
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(saleReceipt, "customer_id")));
        Assert.Equal("Credit Customer", TestJson.GetString(saleReceipt, "customer_name"));
    }

    [Fact]
    public async Task HeldSale_ShouldAllowSelectingCustomerAtCreditCompletion()
    {
        using var appFactory = new CustomWebApplicationFactory();
        using var client = appFactory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var customer = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customers", new
            {
                name = "Held Credit Customer",
                code = (string?)null,
                id_number = "PASSPORT-HLD-01",
                phone = "+94 71 555 4321",
                email = "held-credit@example.com",
                address = "Galle",
                date_of_birth = (DateOnly?)null,
                price_tier_id = (Guid?)null,
                fixed_discount_percent = (decimal?)null,
                credit_limit = 100000m,
                notes = "Used for held credit completion",
                tags = new[] { "held-credit" },
                is_active = true
            }));

        var customerId = Guid.Parse(TestJson.GetString(customer, "customer_id"));

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search?q=Ballpoint%20Pen"));
        var product = FirstObjectFromArray(productSearch["items"]!.AsArray());
        var productId = Guid.Parse(TestJson.GetString(product, "id"));

        var heldSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/hold", new
            {
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 2m
                    }
                },
                discount_percent = 0m,
                role = "cashier"
            }));

        var heldSaleId = Guid.Parse(TestJson.GetString(heldSale, "sale_id"));
        var grandTotal = TestJson.GetDecimal(heldSale, "grand_total");

        var completeResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = heldSaleId,
                customer_id = customerId,
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "credit",
                        amount = grandTotal,
                        reference_number = "CR-HLD-001"
                    }
                }
            }));

        Assert.Equal("completed", TestJson.GetString(completeResponse, "status"));
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(completeResponse, "customer_id")));

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var customerEntity = await dbContext.Customers
            .Include(x => x.CreditLedger)
            .FirstAsync(x => x.Id == customerId);

        Assert.Equal(grandTotal, customerEntity.OutstandingBalance);
        Assert.Single(customerEntity.CreditLedger);
    }

    [Fact]
    public async Task CreditSale_WithoutCustomerShouldFail()
    {
        using var appFactory = new CustomWebApplicationFactory();
        using var client = appFactory.CreateClient();
        await TestAuth.SignInAsCashierAsync(client);

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search?q=Ballpoint%20Pen"));
        var product = FirstObjectFromArray(productSearch["items"]!.AsArray());
        var productId = Guid.Parse(TestJson.GetString(product, "id"));
        var unitPrice = product["unitPrice"]?.GetValue<decimal>()
            ?? throw new InvalidOperationException("Missing unitPrice for product search item.");

        var response = await client.PostAsJsonAsync("/api/checkout/complete", new
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
                    method = "credit",
                    amount = unitPrice * 2m,
                    reference_number = "CR-NO-CUSTOMER"
                }
            }
        });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.NotNull(payload);
        Assert.Equal("Credit sales require a customer.", TestJson.GetString(payload, "message"));
    }

    private static JsonObject FirstObjectFromArray(JsonArray array)
    {
        return array.OfType<JsonObject>().FirstOrDefault()
            ?? throw new InvalidOperationException("Array was empty.");
    }

    private static JsonObject FindObjectFromArray(JsonArray array, Func<JsonObject, bool> predicate)
    {
        return array.OfType<JsonObject>().FirstOrDefault(predicate)
            ?? throw new InvalidOperationException("Matching object was not found.");
    }
}
