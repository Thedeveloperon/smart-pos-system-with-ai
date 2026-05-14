using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingPlanCatalogTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task Activation_ShouldApplyPlanSeatLimitsAndFeatureFlags()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = $"plan-first-it-{Guid.NewGuid():N}",
            DeviceName = "Plan Catalog Device 1",
            Actor = "integration-tests",
            Reason = "plan catalog trial activation"
        }, CancellationToken.None);

        var subscription = await dbContext.Subscriptions.FirstAsync();
        Assert.Equal("trial", subscription.Plan, ignoreCase: true, ignoreLineEndingDifferences: false, ignoreWhiteSpaceDifferences: false);
        Assert.Equal(3, subscription.SeatLimit);

        var trialFlags = DeserializeFeatureFlags(subscription.FeatureFlagsJson);
        Assert.Contains("offline-grace", trialFlags);
        Assert.Contains("reports-basic", trialFlags);

        subscription.Plan = "starter";
        subscription.SeatLimit = 0;
        subscription.FeatureFlagsJson = null;
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync();

        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = $"plan-second-it-{Guid.NewGuid():N}",
            DeviceName = "Plan Catalog Device 2",
            Actor = "integration-tests",
            Reason = "plan catalog starter seat"
        }, CancellationToken.None);

        await dbContext.Entry(subscription).ReloadAsync();
        Assert.Equal(2, subscription.SeatLimit);
        var starterFlags = DeserializeFeatureFlags(subscription.FeatureFlagsJson);
        Assert.Contains("reports-basic", starterFlags);
        Assert.DoesNotContain("offline-grace", starterFlags);

        var seatLimitException = await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            await licenseService.ActivateAsync(new ProvisionActivateRequest
            {
                DeviceCode = $"plan-third-it-{Guid.NewGuid():N}",
                DeviceName = "Plan Catalog Device 3",
                Actor = "integration-tests",
                Reason = "starter plan seat limit should block"
            }, CancellationToken.None);
        });

        Assert.Contains("seat limit", seatLimitException.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static IReadOnlyList<string> DeserializeFeatureFlags(string? featureFlagsJson)
    {
        if (string.IsNullOrWhiteSpace(featureFlagsJson))
        {
            return [];
        }

        var values = JsonSerializer.Deserialize<List<string>>(featureFlagsJson);
        return values ?? [];
    }
}
