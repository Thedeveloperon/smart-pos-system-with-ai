using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingPolicyTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task GetStatus_ShouldTransitionFromActiveToGraceToSuspended()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"policy-state-it-{Guid.NewGuid():N}";
        var activation = await service.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Policy State Tests Device",
            Actor = "integration-tests",
            Reason = "state transition coverage"
        }, CancellationToken.None);

        var token = activation.LicenseToken
                    ?? throw new InvalidOperationException("Activation did not return a license token.");

        var activeStatus = await service.GetStatusAsync(deviceCode, token, CancellationToken.None);
        Assert.Equal("active", activeStatus.State);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == deviceCode);
        var licenseRecord = await dbContext.Licenses
            .FirstAsync(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == LicenseRecordStatus.Active);
        var now = DateTimeOffset.UtcNow;
        licenseRecord.ValidUntil = now.AddMinutes(-10);
        licenseRecord.GraceUntil = now.AddMinutes(10);
        await dbContext.SaveChangesAsync();

        var graceStatus = await service.GetStatusAsync(deviceCode, token, CancellationToken.None);
        Assert.Equal("grace", graceStatus.State);

        licenseRecord.GraceUntil = DateTimeOffset.UtcNow.AddMinutes(-1);
        await dbContext.SaveChangesAsync();

        var suspendedStatus = await service.GetStatusAsync(deviceCode, token, CancellationToken.None);
        Assert.Equal("suspended", suspendedStatus.State);
        Assert.Contains("checkout", suspendedStatus.BlockedActions);
        Assert.Contains("refund", suspendedStatus.BlockedActions);
    }

    [Fact]
    public async Task GetStatus_WhenSubscriptionCanceled_ShouldReturnRevoked()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"policy-canceled-it-{Guid.NewGuid():N}";
        var activation = await service.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Policy Cancel Tests Device",
            Actor = "integration-tests",
            Reason = "cancellation policy coverage"
        }, CancellationToken.None);

        var token = activation.LicenseToken
                    ?? throw new InvalidOperationException("Activation did not return a license token.");

        var subscription = await dbContext.Subscriptions.FirstAsync();
        subscription.Status = SubscriptionStatus.Canceled;
        subscription.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync();

        var revokedStatus = await service.GetStatusAsync(deviceCode, token, CancellationToken.None);
        Assert.Equal("revoked", revokedStatus.State);
        Assert.Contains("all", revokedStatus.BlockedActions);
    }

    [Fact]
    public async Task EvaluateRequest_WhenSuspended_ShouldBlockCheckoutRefundWritesOnly()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"policy-guard-it-{Guid.NewGuid():N}";
        var activation = await service.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Policy Guard Tests Device",
            Actor = "integration-tests",
            Reason = "guard policy coverage"
        }, CancellationToken.None);

        var token = activation.LicenseToken
                    ?? throw new InvalidOperationException("Activation did not return a license token.");

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstAsync(x => x.DeviceCode == deviceCode);
        var licenseRecord = await dbContext.Licenses
            .FirstAsync(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == LicenseRecordStatus.Active);
        licenseRecord.ValidUntil = DateTimeOffset.UtcNow.AddMinutes(-15);
        licenseRecord.GraceUntil = DateTimeOffset.UtcNow.AddMinutes(-5);
        await dbContext.SaveChangesAsync();

        var blockedCheckout = await service.EvaluateRequestAsync(
            deviceCode,
            token,
            new PathString("/api/checkout/complete"),
            HttpMethods.Post,
            CancellationToken.None);

        Assert.False(blockedCheckout.AllowRequest);
        Assert.Equal("LICENSE_EXPIRED", blockedCheckout.ErrorCode);
        Assert.Equal(StatusCodes.Status403Forbidden, blockedCheckout.StatusCode);
        Assert.Equal(LicenseState.Suspended, blockedCheckout.State);

        var blockedRefund = await service.EvaluateRequestAsync(
            deviceCode,
            token,
            new PathString("/api/refunds"),
            HttpMethods.Post,
            CancellationToken.None);

        Assert.False(blockedRefund.AllowRequest);
        Assert.Equal("LICENSE_EXPIRED", blockedRefund.ErrorCode);
        Assert.Equal(StatusCodes.Status403Forbidden, blockedRefund.StatusCode);
        Assert.Equal(LicenseState.Suspended, blockedRefund.State);

        var allowedCheckoutRead = await service.EvaluateRequestAsync(
            deviceCode,
            token,
            new PathString("/api/checkout/held"),
            HttpMethods.Get,
            CancellationToken.None);

        Assert.True(allowedCheckoutRead.AllowRequest);
        Assert.Equal(LicenseState.Suspended, allowedCheckoutRead.State);

        var allowedNonBlockedWrite = await service.EvaluateRequestAsync(
            deviceCode,
            token,
            new PathString("/api/products"),
            HttpMethods.Post,
            CancellationToken.None);

        Assert.True(allowedNonBlockedWrite.AllowRequest);
        Assert.Equal(LicenseState.Suspended, allowedNonBlockedWrite.State);
    }
}
