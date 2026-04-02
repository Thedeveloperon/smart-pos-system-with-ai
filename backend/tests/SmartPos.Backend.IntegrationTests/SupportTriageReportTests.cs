using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Infrastructure;

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
        Assert.True(report.Alerts.SecurityAnomaliesInWindow >= 0);
        Assert.NotNull(report.RecentAuditEvents);
    }

    [Fact]
    public async Task SupportTriageReport_Service_ShouldSurfaceSourceAnomalySignals()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var reportService = scope.ServiceProvider.GetRequiredService<ReportService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"support-anomaly-it-{Guid.NewGuid():N}";
        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Support Anomaly Tests Device",
            Actor = "integration-tests",
            Reason = "support anomaly coverage"
        }, CancellationToken.None);

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == deviceCode, CancellationToken.None);

        var now = DateTimeOffset.UtcNow;
        dbContext.LicenseAuditLogs.AddRange(
            new LicenseAuditLog
            {
                ShopId = provisionedDevice.ShopId,
                ProvisionedDeviceId = provisionedDevice.Id,
                Action = "sensitive_action_proof_failed",
                Actor = "device-proof",
                Reason = "INVALID_DEVICE_PROOF",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    device_code = deviceCode,
                    source_ip = "198.51.100.25",
                    source_ip_prefix = "198.51.100.0/24",
                    source_user_agent_family = "chrome",
                    source_fingerprint = "fp-alpha"
                }),
                CreatedAtUtc = now.AddSeconds(-10)
            },
            new LicenseAuditLog
            {
                ShopId = provisionedDevice.ShopId,
                ProvisionedDeviceId = provisionedDevice.Id,
                Action = "sensitive_action_proof_failed",
                Actor = "device-proof",
                Reason = "INVALID_DEVICE_PROOF",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    device_code = deviceCode,
                    source_ip = "203.0.113.44",
                    source_ip_prefix = "203.0.113.0/24",
                    source_user_agent_family = "firefox",
                    source_fingerprint = "fp-beta"
                }),
                CreatedAtUtc = now.AddSeconds(-5)
            });
        await dbContext.SaveChangesAsync(CancellationToken.None);

        var report = await reportService.GetSupportTriageReportAsync(30, CancellationToken.None);

        Assert.True(report.Alerts.SensitiveActionProofFailuresInWindow >= 2);
        Assert.True(report.Alerts.DevicesWithUnusualSourceChangesInWindow >= 1);
        Assert.True(report.Alerts.SecurityAnomaliesInWindow >= 0);
        Assert.Contains(
            report.Alerts.TopSensitiveActionFailureSources,
            x => string.Equals(x.Reason, "fingerprint:fp-alpha", StringComparison.Ordinal));
        Assert.Contains(
            report.Alerts.TopSensitiveActionFailureSources,
            x => string.Equals(x.Reason, "fingerprint:fp-beta", StringComparison.Ordinal));
        Assert.Contains(
            report.RecentAuditEvents,
            x => x.Action == "sensitive_action_proof_failed" &&
                 string.Equals(x.SourceFingerprint, "fp-alpha", StringComparison.Ordinal));
    }
}
