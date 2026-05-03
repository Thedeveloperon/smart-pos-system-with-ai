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

        var tier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customer-price-tiers", new
            {
                name = "Platinum",
                code = "PLT",
                discount_percent = 12m,
                description = "High value customers",
                is_active = true
            }));

        var tierId = Guid.Parse(TestJson.GetString(tier, "price_tier_id"));
        Assert.Equal("Platinum", TestJson.GetString(tier, "name"));
        Assert.Equal(0, TestJson.GetInt32(tier, "customer_count"));

        var customer = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customers", new
            {
                name = "Gamma Stores",
                code = (string?)null,
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
        Assert.Equal("C-0001", TestJson.GetString(customer, "code"));
        Assert.Equal(150000m, TestJson.GetDecimal(customer, "credit_limit"));
        Assert.Equal(2, customer["tags"]!.AsArray().Count);

        var detail = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/customers/{customerId}"));

        Assert.Equal("Gamma Stores", TestJson.GetString(detail, "name"));
        Assert.Equal(tierId, Guid.Parse(TestJson.GetString(detail["price_tier"]!, "price_tier_id")));
        Assert.Contains("vip", detail["tags"]!.AsArray().Select(tag => tag!.GetValue<string>()));

        var list = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/customers?page=1&take=20"));
        var listItem = FirstObjectFromArray(list["items"]!.AsArray());
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(listItem, "customer_id")));

        var search = await TestJson.ReadArrayAsync(
            await client.GetAsync("/api/customers/search?q=Gamma"));
        var searchItem = FirstObjectFromArray(search);
        Assert.Equal(customerId, Guid.Parse(TestJson.GetString(searchItem, "customer_id")));

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var seededCustomer = await dbContext.Customers.FirstAsync(x => x.Id == customerId);
        seededCustomer.LoyaltyPoints = 42m;
        await dbContext.SaveChangesAsync();

        var updated = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/customers/{customerId}", new
            {
                name = "Gamma Holdings",
                code = "C-9001",
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
        Assert.Equal("C-9001", TestJson.GetString(updated, "code"));
        Assert.Equal(180000m, TestJson.GetDecimal(updated, "credit_limit"));
        Assert.Single(updated["tags"]!.AsArray());
    }

    [Fact]
    public async Task CreditSale_WithCustomerShouldApplyDiscountRedeemLoyaltyAndRecordCreditLedger()
    {
        using var appFactory = new CustomWebApplicationFactory();
        using var client = appFactory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var tier = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/customer-price-tiers", new
            {
                name = "Silver",
                code = "SLV-IT",
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

    private static JsonObject FirstObjectFromArray(JsonArray array)
    {
        return array.OfType<JsonObject>().FirstOrDefault()
            ?? throw new InvalidOperationException("Array was empty.");
    }
}
