using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingCustomerPortalTests : IDisposable
{
    private const string CurrentSessionDeviceCode = "integration-tests-device";
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public LicensingCustomerPortalTests()
    {
        appFactory = new CustomWebApplicationFactory();
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task CustomerPortal_ShouldListDevices_AndAllowSelfServiceDeactivation()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var deviceA = $"cust-portal-a-{Guid.NewGuid():N}";
        var deviceB = $"cust-portal-b-{Guid.NewGuid():N}";
        await ActivateDeviceAsync(deviceA);
        await ActivateDeviceAsync(deviceB);
        await RefreshCurrentDeviceLicenseAsync();

        var initialPortal = await TestJson.ReadObjectAsync(await client.GetAsync("/api/license/account/licenses"));
        var devices = initialPortal["devices"]?.AsArray() ?? [];

        Assert.Equal("default", initialPortal["shop_code"]?.GetValue<string>());
        Assert.Contains(devices, node => node?["device_code"]?.GetValue<string>() == "integration-tests-device");
        Assert.Contains(devices, node => node?["device_code"]?.GetValue<string>() == deviceA);
        Assert.Contains(devices, node => node?["device_code"]?.GetValue<string>() == deviceB);

        var deactivation = await TestJson.ReadObjectAsync(
            await PostSelfDeactivateAsync(deviceA, "seat recovery"));
        Assert.Equal(deviceA, deactivation["device_code"]?.GetValue<string>());
        Assert.Equal("revoked", deactivation["status"]?.GetValue<string>());

        await RefreshCurrentDeviceLicenseAsync();
        var portalAfter = await TestJson.ReadObjectAsync(await client.GetAsync("/api/license/account/licenses"));
        var portalAfterDevices = portalAfter["devices"]?.AsArray() ?? [];
        var revokedDeviceRow = portalAfterDevices
            .FirstOrDefault(node => node?["device_code"]?.GetValue<string>() == deviceA);
        Assert.NotNull(revokedDeviceRow);
        Assert.Equal("revoked", revokedDeviceRow?["device_status"]?.GetValue<string>());
    }

    [Fact]
    public async Task CustomerPortal_SelfServiceDeactivation_ShouldEnforceDailyLimit()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var deviceA = $"cust-limit-a-{Guid.NewGuid():N}";
        var deviceB = $"cust-limit-b-{Guid.NewGuid():N}";
        await ActivateDeviceAsync(deviceA);
        await ActivateDeviceAsync(deviceB);
        await RefreshCurrentDeviceLicenseAsync();

        await TestJson.ReadObjectAsync(await PostSelfDeactivateAsync(deviceA, "seat recovery one"));
        await RefreshCurrentDeviceLicenseAsync();
        await TestJson.ReadObjectAsync(await PostSelfDeactivateAsync(deviceB, "seat recovery two"));
        await RefreshCurrentDeviceLicenseAsync();

        var deviceC = $"cust-limit-c-{Guid.NewGuid():N}";
        await ActivateDeviceAsync(deviceC);
        await RefreshCurrentDeviceLicenseAsync();

        var limitResponse = await PostSelfDeactivateAsync(deviceC, "seat recovery three");
        Assert.Equal(HttpStatusCode.Conflict, limitResponse.StatusCode);
        var payload = await ReadJsonAsync(limitResponse);
        Assert.Equal(
            "SELF_SERVICE_DEVICE_DEACTIVATION_LIMIT_REACHED",
            payload["error"]?["code"]?.GetValue<string>());
    }

    private async Task ActivateDeviceAsync(string deviceCode)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/provision/activate")
        {
            Content = JsonContent.Create(new
            {
                device_code = deviceCode,
                device_name = "Customer Portal Device",
                actor = "integration-tests",
                reason = "customer-portal-test"
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        request.Headers.TryAddWithoutValidation("X-Device-Code", $"portal-test-{Guid.NewGuid():N}");

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }

    private async Task<HttpResponseMessage> PostSelfDeactivateAsync(string deviceCode, string reason)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/license/account/licenses/devices/{Uri.EscapeDataString(deviceCode)}/deactivate")
        {
            Content = JsonContent.Create(new
            {
                reason
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        return await client.SendAsync(request);
    }

    private async Task RefreshCurrentDeviceLicenseAsync()
    {
        var response = await client.GetAsync(
            $"/api/license/status?device_code={Uri.EscapeDataString(CurrentSessionDeviceCode)}");
        response.EnsureSuccessStatusCode();
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
