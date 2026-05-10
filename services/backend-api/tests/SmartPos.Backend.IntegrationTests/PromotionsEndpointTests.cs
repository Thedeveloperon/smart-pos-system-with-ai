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
    public async Task CreatePromotion_ShouldRejectAllScope()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var now = DateTimeOffset.UtcNow;
        var response = await client.PostAsJsonAsync("/api/promotions", new
        {
            name = "Global discount",
            description = "Should require an explicit scope selection.",
            scope = "all",
            value_type = "percent",
            value = 10,
            starts_at_utc = now,
            ends_at_utc = now.AddDays(7),
            is_active = true
        });

        var body = await response.Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "Promotion scope is required. Choose category or product.",
            body?["message"]?.GetValue<string>());
    }

    [Fact]
    public async Task CreatePromotion_ShouldRejectPastStartDate()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var createCategoryResponse = await client.PostAsJsonAsync("/api/categories", new
        {
            name = $"Promotion Category {Guid.NewGuid():N}",
            description = "Used for promotion validation tests.",
            is_active = true
        });
        var category = await TestJson.ReadObjectAsync(createCategoryResponse);
        var categoryId = Guid.Parse(TestJson.GetString(category, "category_id"));

        var now = DateTimeOffset.UtcNow;
        var response = await client.PostAsJsonAsync("/api/promotions", new
        {
            name = "Backdated discount",
            description = "Should reject past start times.",
            scope = "category",
            category_id = categoryId,
            value_type = "percent",
            value = 10,
            starts_at_utc = now.AddDays(-1),
            ends_at_utc = now.AddDays(7),
            is_active = true
        });

        var body = await response.Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(
            "Promotion start date must be current UTC time or later.",
            body?["message"]?.GetValue<string>());
    }
}
