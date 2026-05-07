using System.Net;
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
}
