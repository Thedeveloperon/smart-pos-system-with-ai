using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ImportEndpointsIntegrationTests
{
    [Fact]
    public async Task BulkImportEndpoints_ShouldRequireManagerOrOwner()
    {
        using var factory = new CustomWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsCashierAsync(client);

        var response = await client.PostAsJsonAsync("/api/import/brands", new
        {
            rows = new[]
            {
                new { row_index = 0, name = "Auth Brand", code = "AUTH-BRAND", description = "", is_active = true }
            },
            duplicate_strategy = "skip"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task BulkImportEndpoints_ShouldRejectMoreThan2000Rows()
    {
        using var factory = new CustomWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var rows = Enumerable.Range(0, 2001)
            .Select(index => new
            {
                row_index = index,
                name = $"Brand-{index}",
                code = $"B-{index}",
                description = "",
                is_active = true
            })
            .ToArray();

        var response = await client.PostAsJsonAsync("/api/import/brands", new
        {
            rows,
            duplicate_strategy = "skip"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task BulkImportProducts_ShouldSupportPartialFailureAndDuplicateStrategies()
    {
        using var factory = new CustomWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var brandName = $"ImportBrand-{runId}";
        var categoryName = $"ImportCategory-{runId}";
        var productName = $"Import Product {runId}";
        var productSku = $"IMP-{runId}";
        var barcode = $"990{Random.Shared.Next(100000000, 999999999)}";

        var brandImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/brands", new
        {
            rows = new[]
            {
                new { row_index = 0, name = brandName, code = $"B-{runId}", description = "Imported brand", is_active = true }
            },
            duplicate_strategy = "skip"
        }));
        Assert.Equal(1, TestJson.GetInt32(brandImport, "inserted"));

        var categoryImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/categories", new
        {
            rows = new[]
            {
                new { row_index = 0, name = categoryName, description = "Imported category", is_active = true }
            },
            duplicate_strategy = "skip"
        }));
        Assert.Equal(1, TestJson.GetInt32(categoryImport, "inserted"));

        var firstProductImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/products", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name = productName,
                    sku = productSku,
                    barcode,
                    category_name = categoryName,
                    brand_name = brandName,
                    unit_price = 150m,
                    cost_price = 100m,
                    initial_stock_quantity = 12m,
                    reorder_level = 2m,
                    safety_stock = 1m,
                    target_stock_level = 20m,
                    allow_negative_stock = true,
                    is_active = true
                },
                new
                {
                    row_index = 1,
                    name = $"Bad Product {runId}",
                    sku = $"BAD-{runId}",
                    barcode = "",
                    category_name = "does-not-exist",
                    brand_name = brandName,
                    unit_price = 10m,
                    cost_price = 5m,
                    initial_stock_quantity = 2m,
                    reorder_level = 1m,
                    safety_stock = 1m,
                    target_stock_level = 5m,
                    allow_negative_stock = true,
                    is_active = true
                }
            },
            duplicate_strategy = "skip"
        }));

        Assert.Equal(1, TestJson.GetInt32(firstProductImport, "inserted"));
        Assert.Equal(1, TestJson.GetInt32(firstProductImport, "errors"));
        Assert.Contains(firstProductImport["rows"]!.AsArray(), row => row?["status"]?.GetValue<string>() == "error");

        var skipDuplicate = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/products", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name = productName,
                    sku = productSku,
                    barcode,
                    category_name = categoryName,
                    brand_name = brandName,
                    unit_price = 160m,
                    cost_price = 110m,
                    initial_stock_quantity = 10m,
                    reorder_level = 3m,
                    safety_stock = 2m,
                    target_stock_level = 25m,
                    allow_negative_stock = true,
                    is_active = true
                }
            },
            duplicate_strategy = "skip"
        }));

        Assert.Equal(1, TestJson.GetInt32(skipDuplicate, "skipped"));

        var updateDuplicate = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/products", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name = productName,
                    sku = productSku,
                    barcode,
                    category_name = categoryName,
                    brand_name = brandName,
                    unit_price = 170m,
                    cost_price = 120m,
                    initial_stock_quantity = 8m,
                    reorder_level = 2m,
                    safety_stock = 1m,
                    target_stock_level = 18m,
                    allow_negative_stock = false,
                    is_active = true
                }
            },
            duplicate_strategy = "update"
        }));

        Assert.Equal(1, TestJson.GetInt32(updateDuplicate, "updated"));

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstAsync(x => x.Sku == productSku);
        Assert.Equal(170m, product.UnitPrice);
        Assert.NotNull(product.Inventory);
        Assert.Equal(8m, product.Inventory!.QuantityOnHand);

        var initialStockMovements = await dbContext.StockMovements
            .Where(x => x.ProductId == product.Id && x.Reason == "initial_stock")
            .ToListAsync();
        Assert.Single(initialStockMovements);
        Assert.Equal(12m, initialStockMovements[0].QuantityChange);
    }

    [Fact]
    public async Task BulkImportCustomers_ShouldSupportSkipAndUpdateByPhoneEmailOrName()
    {
        using var factory = new CustomWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var phone = $"+94-77-{Random.Shared.Next(100000, 999999)}";
        var email = $"import-{runId}@example.com";
        var name = $"Import Customer {runId}";

        var initialImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/customers", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name,
                    code = (string?)null,
                    phone,
                    email,
                    address = "Colombo",
                    date_of_birth = "1992-07-15",
                    credit_limit = 500m,
                    notes = "Initial import",
                    is_active = true
                }
            },
            duplicate_strategy = "skip"
        }));

        Assert.Equal(1, TestJson.GetInt32(initialImport, "inserted"));

        var skipImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/customers", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name = $"{name} Updated",
                    code = "C-9999",
                    phone,
                    email,
                    address = "Kandy",
                    date_of_birth = "1990-01-01",
                    credit_limit = 700m,
                    notes = "Should be skipped",
                    is_active = true
                }
            },
            duplicate_strategy = "skip"
        }));

        Assert.Equal(1, TestJson.GetInt32(skipImport, "skipped"));

        var updateImport = await TestJson.ReadObjectAsync(await client.PostAsJsonAsync("/api/import/customers", new
        {
            rows = new[]
            {
                new
                {
                    row_index = 0,
                    name = $"{name} Updated",
                    code = (string?)null,
                    phone,
                    email,
                    address = "Galle",
                    date_of_birth = "1990-01-01",
                    credit_limit = 900m,
                    notes = "Updated by import",
                    is_active = true
                }
            },
            duplicate_strategy = "update"
        }));

        Assert.Equal(1, TestJson.GetInt32(updateImport, "updated"));

        var customers = await TestJson.ReadObjectAsync(await client.GetAsync("/api/customers?include_inactive=true&page=1&take=100"));
        var updatedCustomer = customers["items"]!
            .AsArray()
            .OfType<JsonObject>()
            .First(x => string.Equals(x["phone"]?.GetValue<string>(), phone, StringComparison.Ordinal));

        Assert.Equal($"{name} Updated", TestJson.GetString(updatedCustomer, "name"));
        Assert.Equal(900m, TestJson.GetDecimal(updatedCustomer, "credit_limit"));
    }
}
