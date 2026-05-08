using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PromotionsEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ListPromotions_ShouldRecreateMissingPromotionsTable()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            await dbContext.Database.ExecuteSqlRawAsync("""DROP TABLE IF EXISTS "promotions";""");
        }

        var response = await client.GetAsync("/api/promotions");
        var body = await response.Content.ReadAsStringAsync();

        Assert.True(response.StatusCode == HttpStatusCode.OK, body);

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Empty(payload["items"]?.AsArray() ?? throw new InvalidOperationException("Expected promotions array."));

        using var verificationScope = factory.Services.CreateScope();
        var verificationDbContext = verificationScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var promotionCount = await verificationDbContext.Promotions.CountAsync();

        Assert.Equal(0, promotionCount);
    }

    [Fact]
    public async Task CreatePromotion_ShouldRejectFixedProductDiscountAboveUnitPrice()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Promo Product {runId}",
                sku = $"PROMO-{runId}",
                unit_price = 100m,
                cost_price = 80m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        var response = await client.PostAsJsonAsync("/api/promotions", new
        {
            name = $"Fixed Over Price {runId}",
            scope = "product",
            product_id = productId,
            value_type = "fixed",
            value = 120m,
            starts_at_utc = DateTimeOffset.UtcNow.AddDays(-1),
            ends_at_utc = DateTimeOffset.UtcNow.AddDays(1),
            is_active = true
        });

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Fixed discount value cannot exceed the product price.", message);
    }

    [Fact]
    public async Task ProductSearch_ShouldIncludeActivePromotionDiscountFields()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var product = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Search Promo Product {runId}",
                sku = $"SEARCH-PROMO-{runId}",
                unit_price = 200m,
                cost_price = 150m,
                initial_stock_quantity = 0m,
                allow_negative_stock = false,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(product, "product_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/promotions", new
            {
                name = $"Search Promo {runId}",
                scope = "product",
                product_id = productId,
                value_type = "percent",
                value = 12m,
                starts_at_utc = DateTimeOffset.UtcNow.AddDays(-1),
                ends_at_utc = DateTimeOffset.UtcNow.AddDays(1),
                is_active = true
            }));

        var searchResponse = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString($"SEARCH-PROMO-{runId}")}&take=20"));
        var matchedItem = searchResponse["items"]?.AsArray().OfType<JsonObject>()
            .FirstOrDefault(item => TestJson.GetString(item, "id") == productId.ToString())
            ?? throw new InvalidOperationException("Expected promoted product in search results.");

        Assert.Equal("percent", TestJson.GetString(matchedItem, "active_promotion_discount_type"));
        Assert.Equal(12m, TestJson.GetDecimal(matchedItem, "active_promotion_discount_value"));
    }

    [Fact]
    public async Task SerialLookup_ShouldIncludeActivePromotionDiscountFields()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        string serialValue;
        Guid productId;
        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var serialRecord = await dbContext.SerialNumbers
                .AsNoTracking()
                .Include(x => x.Product)
                .FirstOrDefaultAsync(x => x.Product.IsActive && x.Product.IsSerialTracked)
                ?? throw new InvalidOperationException("No seeded serial record available for lookup test.");

            serialValue = serialRecord.SerialValue;
            productId = serialRecord.ProductId;
        }

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/promotions", new
            {
                name = $"Serial Promo {runId}",
                scope = "product",
                product_id = productId,
                value_type = "fixed",
                value = 25m,
                starts_at_utc = DateTimeOffset.UtcNow.AddDays(-1),
                ends_at_utc = DateTimeOffset.UtcNow.AddDays(1),
                is_active = true
            }));

        var lookupResponse = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/serials/lookup?serial={Uri.EscapeDataString(serialValue)}"));
        var productNode = lookupResponse["product"] ?? throw new InvalidOperationException("Missing serial lookup product.");

        Assert.Equal("fixed", TestJson.GetString(productNode, "active_promotion_discount_type"));
        Assert.Equal(25m, TestJson.GetDecimal(productNode, "active_promotion_discount_value"));
    }
}
