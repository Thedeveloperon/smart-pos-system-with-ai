using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Activation_Heartbeat_Deactivation_ShouldTransitionStates()
    {
        var deviceCode = $"license-it-{Guid.NewGuid():N}";

        var initialStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={deviceCode}"));
        Assert.Equal("unprovisioned", TestJson.GetString(initialStatus, "state"));

        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "License IT Device",
                actor = "integration-tests",
                reason = "initial activation"
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        var issuedToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(issuedToken));

        var heartbeat = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = issuedToken
            }));

        Assert.Equal("active", TestJson.GetString(heartbeat, "state"));
        var refreshedToken = TestJson.GetString(heartbeat, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(refreshedToken));

        await TestAuth.SignInAsManagerAsync(client);

        var deactivate = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/deactivate", new
            {
                device_code = deviceCode,
                actor = "manager",
                reason = "device retired"
            }));

        Assert.Equal("revoked", TestJson.GetString(deactivate, "state"));

        var finalStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={deviceCode}"));
        Assert.Equal("revoked", TestJson.GetString(finalStatus, "state"));
    }

    [Fact]
    public async Task Activation_WhenSeatLimitReached_ShouldReturnMachineCode()
    {
        var activatedDeviceCodes = new List<string>();

        for (var i = 0; i < 10; i++)
        {
            var deviceCode = $"seat-limit-it-{i}-{Guid.NewGuid():N}";
            var response = await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Seat Limit Device"
            });

            if (response.IsSuccessStatusCode)
            {
                activatedDeviceCodes.Add(deviceCode);
                continue;
            }

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var payload = await ReadJsonAsync(response);
            Assert.Equal(
                "SEAT_LIMIT_EXCEEDED",
                payload["error"]?["code"]?.GetValue<string>());
            await RevokeDevicesAsync(activatedDeviceCodes);
            return;
        }

        await RevokeDevicesAsync(activatedDeviceCodes);
        throw new InvalidOperationException("Expected SEAT_LIMIT_EXCEEDED but all activations succeeded.");
    }

    [Fact]
    public async Task ProtectedRoute_WithUnprovisionedDevice_ShouldBeBlockedByMiddleware()
    {
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = $"unprovisioned-it-{Guid.NewGuid():N}",
            device_name = "Unprovisioned Device"
        });

        loginResponse.EnsureSuccessStatusCode();

        var blockedResponse = await client.GetAsync("/api/checkout/held");
        Assert.Equal(HttpStatusCode.Forbidden, blockedResponse.StatusCode);

        var payload = await ReadJsonAsync(blockedResponse);
        Assert.Equal("UNPROVISIONED", payload["error"]?["code"]?.GetValue<string>());
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }

    private async Task RevokeDevicesAsync(IEnumerable<string> deviceCodes)
    {
        var codes = deviceCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (codes.Count == 0)
        {
            return;
        }

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var devices = await dbContext.ProvisionedDevices
            .Where(x => codes.Contains(x.DeviceCode))
            .ToListAsync();
        if (devices.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var device in devices)
        {
            device.Status = ProvisionedDeviceStatus.Revoked;
            device.RevokedAtUtc = now;
            device.LastHeartbeatAtUtc = now;
        }

        var deviceIds = devices.Select(x => x.Id).ToList();
        var activeLicenses = await dbContext.Licenses
            .Where(x => deviceIds.Contains(x.ProvisionedDeviceId) && x.Status == LicenseRecordStatus.Active)
            .ToListAsync();
        foreach (var license in activeLicenses)
        {
            license.Status = LicenseRecordStatus.Revoked;
            license.RevokedAtUtc = now;
        }

        await dbContext.SaveChangesAsync();
    }
}
