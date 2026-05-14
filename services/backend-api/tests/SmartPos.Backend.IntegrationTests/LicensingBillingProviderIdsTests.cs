using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingBillingProviderIdsTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task UpsertBillingProviderIds_ShouldPersistAndAllowClearingPerShop()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var shopCode = $"billing-shop-it-{Guid.NewGuid():N}";
        var firstUpsert = await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "cus_test_001",
            SubscriptionId = "sub_test_001",
            PriceId = "price_test_001",
            Actor = "integration-tests",
            Reason = "initial billing provider sync"
        }, CancellationToken.None);

        Assert.Equal(shopCode, firstUpsert.ShopCode);
        Assert.Equal("cus_test_001", firstUpsert.CustomerId);
        Assert.Equal("sub_test_001", firstUpsert.SubscriptionId);
        Assert.Equal("price_test_001", firstUpsert.PriceId);

        var subscription = await dbContext.Subscriptions
            .Include(x => x.Shop)
            .SingleAsync(x => x.Shop.Code == shopCode);

        Assert.Equal("cus_test_001", subscription.BillingCustomerId);
        Assert.Equal("sub_test_001", subscription.BillingSubscriptionId);
        Assert.Equal("price_test_001", subscription.BillingPriceId);

        var secondUpsert = await licenseService.UpsertBillingProviderIdsAsync(new BillingProviderIdsUpsertRequest
        {
            ShopCode = shopCode,
            CustomerId = "   ",
            SubscriptionId = "sub_test_002",
            PriceId = null,
            Actor = "integration-tests",
            Reason = "rotate and clear billing identifiers"
        }, CancellationToken.None);

        Assert.Null(secondUpsert.CustomerId);
        Assert.Equal("sub_test_002", secondUpsert.SubscriptionId);
        Assert.Null(secondUpsert.PriceId);

        await dbContext.Entry(subscription).ReloadAsync();
        Assert.Null(subscription.BillingCustomerId);
        Assert.Equal("sub_test_002", subscription.BillingSubscriptionId);
        Assert.Null(subscription.BillingPriceId);

        var auditLogs = (await dbContext.LicenseAuditLogs
                .Where(x => x.ShopId == subscription.ShopId && x.Action == "billing_provider_ids_upserted")
                .ToListAsync())
            .OrderBy(x => x.CreatedAtUtc)
            .ToList();

        Assert.Equal(2, auditLogs.Count);
        Assert.Contains("sub_test_001", auditLogs[0].MetadataJson ?? string.Empty, StringComparison.Ordinal);
        Assert.Contains("sub_test_002", auditLogs[1].MetadataJson ?? string.Empty, StringComparison.Ordinal);
    }
}
