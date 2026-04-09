using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AuthAnomalyDetectionTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Login_WithRapidSourceShiftAndConcurrentDevices_ShouldWriteAnomalyAuditEvents()
    {
        await LoginAsync(
            username: "manager",
            password: "manager123",
            deviceCode: $"auth-anomaly-a-{Guid.NewGuid():N}",
            forwardedFor: "198.51.100.10",
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36");

        await LoginAsync(
            username: "manager",
            password: "manager123",
            deviceCode: $"auth-anomaly-b-{Guid.NewGuid():N}",
            forwardedFor: "203.0.113.44",
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/124.0");

        await LoginAsync(
            username: "manager",
            password: "manager123",
            deviceCode: $"auth-anomaly-c-{Guid.NewGuid():N}",
            forwardedFor: "192.0.2.85",
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36");

        await using var scope = appFactory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var managerUser = await dbContext.Users
            .AsNoTracking()
            .SingleAsync(x => x.Username == "manager", CancellationToken.None);

        var anomalyActions = await dbContext.AuditLogs
            .AsNoTracking()
            .Where(x => x.UserId == managerUser.Id &&
                        (x.Action == "auth_anomaly_impossible_travel" ||
                         x.Action == "auth_anomaly_concurrent_devices"))
            .Select(x => x.Action)
            .ToListAsync(CancellationToken.None);

        Assert.Contains("auth_anomaly_impossible_travel", anomalyActions);
        Assert.Contains("auth_anomaly_concurrent_devices", anomalyActions);
    }

    private async Task LoginAsync(
        string username,
        string password,
        string deviceCode,
        string forwardedFor,
        string userAgent)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new
            {
                username,
                password,
                device_code = deviceCode,
                device_name = "Auth Anomaly IT Device"
            })
        };
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        request.Headers.TryAddWithoutValidation("User-Agent", userAgent);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
