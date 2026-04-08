using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingBranchSeatAllocationTests : IDisposable
{
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public LicensingBranchSeatAllocationTests()
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
    public async Task AdminBranchSeatAllocationEndpoints_ShouldUpsertAndList()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);
        var shopCode = await GetPrimaryShopCodeAsync();
        var branchCode = $"branch-{Guid.NewGuid():N}".Substring(0, 20);

        await UpsertBranchAllocationAsync(shopCode, "main", 1, true);
        var upsertPayload = await UpsertBranchAllocationAsync(shopCode, branchCode, 2, true);
        var item = upsertPayload["item"] as JsonObject ?? throw new InvalidOperationException("item payload missing.");
        Assert.Equal(branchCode, TestJson.GetString(item, "branch_code"));
        Assert.Equal(2, upsertPayload["item"]?["seat_quota"]?.GetValue<int>());
        Assert.True(upsertPayload["item"]?["is_active"]?.GetValue<bool>());

        var list = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/admin/licensing/shops/{Uri.EscapeDataString(shopCode)}/branch-allocations"));
        Assert.Equal(shopCode, TestJson.GetString(list, "shop_code"));
        var items = list["items"]?.AsArray() ?? throw new InvalidOperationException("items payload missing.");
        var row = items
            .Select(node => node as JsonObject)
            .FirstOrDefault(node => string.Equals(
                node?["branch_code"]?.GetValue<string>(),
                branchCode,
                StringComparison.Ordinal));
        Assert.NotNull(row);
        Assert.Equal(2, row["seat_quota"]?.GetValue<int>());
        Assert.True(row["is_active"]?.GetValue<bool>());
    }

    [Fact]
    public async Task Activation_WhenBranchQuotaReached_ShouldReturnSeatLimitExceeded()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);
        var shopCode = await GetPrimaryShopCodeAsync();

        await UpsertBranchAllocationAsync(shopCode, "main", 1, true);

        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = $"w8-branch-main-overflow-{Guid.NewGuid():N}",
            device_name = "W8 Main Overflow Device",
            branch_code = "main",
            actor = "integration-tests",
            reason = "branch quota overflow check"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("SEAT_LIMIT_EXCEEDED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task AdminTransferSeat_WhenTargetBranchQuotaReached_ShouldReturnSeatLimitExceeded()
    {
        var sourceDeviceCode = $"w8-transfer-source-{Guid.NewGuid():N}";
        var occupiedTargetDeviceCode = $"w8-transfer-target-occupied-{Guid.NewGuid():N}";
        const string targetBranchCode = "branch-a";

        await TestAuth.SignInAsSupportAdminAsync(client);
        var shopCode = await GetPrimaryShopCodeAsync();

        await UpsertBranchAllocationAsync(shopCode, "main", 2, true);
        await UpsertBranchAllocationAsync(shopCode, targetBranchCode, 1, true);

        (await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = sourceDeviceCode,
            device_name = "W8 Source Device",
            branch_code = "main",
            actor = "integration-tests",
            reason = "branch transfer source setup"
        })).EnsureSuccessStatusCode();

        (await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = occupiedTargetDeviceCode,
            device_name = "W8 Target Occupied Device",
            branch_code = targetBranchCode,
            actor = "integration-tests",
            reason = "branch transfer target setup"
        })).EnsureSuccessStatusCode();

        var transferResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(sourceDeviceCode)}/transfer-seat",
            new
            {
                target_branch_code = targetBranchCode,
                actor = "support_admin",
                reason_code = "manual_transfer_seat",
                actor_note = "w8 branch quota transfer deny",
                reason = "w8 branch quota transfer deny"
            });

        Assert.Equal(HttpStatusCode.Conflict, transferResponse.StatusCode);
        var payload = await ReadJsonAsync(transferResponse);
        Assert.Equal("SEAT_LIMIT_EXCEEDED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task AdminTransferSeat_ShouldMoveDeviceToTargetBranchInSameShop()
    {
        var sourceDeviceCode = $"w8-transfer-branch-success-{Guid.NewGuid():N}";
        const string targetBranchCode = "branch-b";

        await TestAuth.SignInAsSupportAdminAsync(client);
        var shopCode = await GetPrimaryShopCodeAsync();

        await UpsertBranchAllocationAsync(shopCode, "main", 2, true);
        await UpsertBranchAllocationAsync(shopCode, targetBranchCode, 1, true);

        (await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = sourceDeviceCode,
            device_name = "W8 Branch Transfer Success Device",
            branch_code = "main",
            actor = "integration-tests",
            reason = "branch transfer success setup"
        })).EnsureSuccessStatusCode();

        var transferResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(sourceDeviceCode)}/transfer-seat",
            new
            {
                target_branch_code = targetBranchCode,
                actor = "support_admin",
                reason_code = "manual_transfer_seat",
                actor_note = "w8 branch transfer success",
                reason = "w8 branch transfer success"
            });
        transferResponse.EnsureSuccessStatusCode();

        var transferPayload = await TestJson.ReadObjectAsync(transferResponse);
        Assert.Equal("main", TestJson.GetString(transferPayload, "source_branch_code"));
        Assert.Equal(targetBranchCode, TestJson.GetString(transferPayload, "target_branch_code"));
        Assert.Equal(shopCode, TestJson.GetString(transferPayload, "source_shop_code"));
        Assert.Equal(shopCode, TestJson.GetString(transferPayload, "target_shop_code"));

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var sourceDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == sourceDeviceCode);
        Assert.Equal(targetBranchCode, sourceDevice.BranchCode);
    }

    private async Task<JsonObject> UpsertBranchAllocationAsync(
        string shopCode,
        string branchCode,
        int seatQuota,
        bool isActive)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopCode)}/branch-allocations/{Uri.EscapeDataString(branchCode)}")
        {
            Content = JsonContent.Create(new
            {
                seat_quota = seatQuota,
                is_active = isActive,
                actor = "support_admin",
                reason_code = "branch_seat_allocation_update",
                actor_note = "integration test"
            })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await TestJson.ReadObjectAsync(response);
    }

    private async Task<string> GetPrimaryShopCodeAsync()
    {
        var shops = await TestJson.ReadObjectAsync(await client.GetAsync("/api/admin/licensing/shops"));
        var firstItem = shops["items"]?.AsArray().FirstOrDefault() as JsonObject
                        ?? throw new InvalidOperationException("No admin licensing shops found.");
        return TestJson.GetString(firstItem, "shop_code");
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
