using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.IntegrationTests;

public sealed class SupportTriageReportTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task SupportTriageReport_Service_ShouldReturnSnapshot()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var reportService = scope.ServiceProvider.GetRequiredService<ReportService>();

        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = $"support-triage-it-{Guid.NewGuid():N}",
            DeviceName = "Support Triage Tests Device",
            Actor = "integration-tests",
            Reason = "support triage coverage"
        }, CancellationToken.None);

        var report = await reportService.GetSupportTriageReportAsync(30, CancellationToken.None);

        Assert.Equal(30, report.WindowMinutes);
        Assert.True(report.Devices.ActiveDevices >= 1);
        Assert.True(report.Shops.ActiveShops >= 1);
        Assert.True(report.Alerts.ValidationFailuresInWindow >= 0);
        Assert.True(report.Alerts.WebhookFailuresInWindow >= 0);
        Assert.NotNull(report.RecentAuditEvents);
    }
}
