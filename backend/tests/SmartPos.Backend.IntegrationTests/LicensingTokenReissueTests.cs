using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingTokenReissueTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ReconcileSubscriptionStateAsync_ShouldForceReissueAndRevokePreviousToken()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"reissue-subscription-it-{Guid.NewGuid():N}";
        var activation = await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Token Reissue Subscription Device",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var originalToken = activation.LicenseToken
                            ?? throw new InvalidOperationException("Activation did not return a license token.");

        await licenseService.ReconcileSubscriptionStateAsync(new SubscriptionReconciliationRequest
        {
            ShopCode = "default",
            SubscriptionStatus = "active",
            Plan = "growth",
            PeriodStart = DateTimeOffset.UtcNow.AddDays(-1),
            PeriodEnd = DateTimeOffset.UtcNow.AddDays(15),
            Actor = "integration-tests",
            Reason = "force reissue on subscription change"
        }, CancellationToken.None);

        await AssertStatusWithOldTokenRejectedAsync(deviceCode, originalToken);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == deviceCode);

        var reissuedActiveToken = await dbContext.Licenses
            .AsNoTracking()
            .Where(x => x.ProvisionedDeviceId == provisionedDevice.Id && x.Status == LicenseRecordStatus.Active)
            .Select(x => x.Token)
            .ToListAsync();

        Assert.Single(reissuedActiveToken);
        Assert.NotEqual(originalToken, reissuedActiveToken[0]);
    }

    [Fact]
    public async Task ActivateAsync_WhenNewDeviceActivated_ShouldForceReissueExistingDeviceTokens()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var firstDeviceCode = $"reissue-device-a-it-{Guid.NewGuid():N}";
        var firstActivation = await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = firstDeviceCode,
            DeviceName = "Token Reissue Device A",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var firstToken = firstActivation.LicenseToken
                         ?? throw new InvalidOperationException("Activation did not return a license token.");

        var secondDeviceCode = $"reissue-device-b-it-{Guid.NewGuid():N}";
        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = secondDeviceCode,
            DeviceName = "Token Reissue Device B",
            Actor = "integration-tests"
        }, CancellationToken.None);

        await AssertStatusWithOldTokenRejectedAsync(firstDeviceCode, firstToken);

        var firstProvisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == firstDeviceCode);

        var replacementToken = await dbContext.Licenses
            .AsNoTracking()
            .Where(x => x.ProvisionedDeviceId == firstProvisionedDevice.Id && x.Status == LicenseRecordStatus.Active)
            .Select(x => x.Token)
            .ToListAsync();

        Assert.Single(replacementToken);
        Assert.NotEqual(firstToken, replacementToken[0]);
    }

    private async Task AssertStatusWithOldTokenRejectedAsync(string deviceCode, string token)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/license/status?device_code={Uri.EscapeDataString(deviceCode)}");
        request.Headers.Add("X-License-Token", token);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(
            "TOKEN_REPLAY_DETECTED",
            payload?["error"]?["code"]?.GetValue<string>());
    }
}
