using System.Diagnostics.Metrics;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicensingMetrics : IDisposable
{
    private readonly Meter meter;
    private readonly Counter<long> activationCounter;
    private readonly Counter<long> heartbeatFailureCounter;
    private readonly IServiceScopeFactory scopeFactory;

    public LicensingMetrics(IServiceScopeFactory scopeFactory)
    {
        this.scopeFactory = scopeFactory;

        meter = new Meter("SmartPos.Licensing", "1.0.0");
        activationCounter = meter.CreateCounter<long>(
            "licensing.activations",
            unit: "count",
            description: "Number of successful license activations.");

        heartbeatFailureCounter = meter.CreateCounter<long>(
            "licensing.heartbeat_failures",
            unit: "count",
            description: "Number of failed heartbeat validations.");

        meter.CreateObservableGauge<long>(
            "licensing.grace_mode_shops",
            ObserveGraceModeShops,
            unit: "shops",
            description: "Distinct shops currently in grace mode.");

        meter.CreateObservableGauge<long>(
            "licensing.suspended_shops",
            ObserveSuspendedShops,
            unit: "shops",
            description: "Distinct shops currently suspended.");
    }

    public void RecordActivation()
    {
        activationCounter.Add(1);
    }

    public void RecordHeartbeatFailure(string? code)
    {
        heartbeatFailureCounter.Add(1, new KeyValuePair<string, object?>("code", string.IsNullOrWhiteSpace(code) ? "unknown" : code));
    }

    private long ObserveGraceModeShops()
    {
        return CountDistinctShopsByWindow(state: LicenseState.Grace);
    }

    private long ObserveSuspendedShops()
    {
        return CountDistinctShopsByWindow(state: LicenseState.Suspended);
    }

    private long CountDistinctShopsByWindow(LicenseState state)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var now = DateTimeOffset.UtcNow;

            var activeDeviceShopById = dbContext.ProvisionedDevices
                .AsNoTracking()
                .Where(x => x.Status == ProvisionedDeviceStatus.Active)
                .Select(x => new { x.Id, x.ShopId })
                .ToDictionary(x => x.Id, x => x.ShopId);

            if (activeDeviceShopById.Count == 0)
            {
                return 0;
            }

            var latestSubscriptionByShop = dbContext.Subscriptions
                .AsNoTracking()
                .ToList()
                .GroupBy(x => x.ShopId)
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                        .First()
                        .Status);

            var activeLicenses = dbContext.Licenses
                .AsNoTracking()
                .Where(x => x.Status == LicenseRecordStatus.Active)
                .Select(x => new
                {
                    x.ShopId,
                    x.ProvisionedDeviceId,
                    x.ValidUntil,
                    x.GraceUntil
                })
                .ToList();

            var matchingShops = new HashSet<Guid>();

            foreach (var license in activeLicenses)
            {
                if (!activeDeviceShopById.TryGetValue(license.ProvisionedDeviceId, out var deviceShopId))
                {
                    continue;
                }

                if (deviceShopId != license.ShopId)
                {
                    continue;
                }

                if (latestSubscriptionByShop.TryGetValue(license.ShopId, out var subscriptionStatus) &&
                    subscriptionStatus == SubscriptionStatus.Canceled)
                {
                    continue;
                }

                var inState = state switch
                {
                    LicenseState.Grace => now > license.ValidUntil && now <= license.GraceUntil,
                    LicenseState.Suspended => now > license.GraceUntil,
                    _ => false
                };

                if (inState)
                {
                    matchingShops.Add(license.ShopId);
                }
            }

            return matchingShops.Count;
        }
        catch
        {
            return 0;
        }
    }

    public void Dispose()
    {
        meter.Dispose();
    }
}
