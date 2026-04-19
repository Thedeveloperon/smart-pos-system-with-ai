using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AdminShopCrudTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient adminClient = factory.CreateClient();

    [Fact]
    public async Task SupportAdmin_ShouldCreateUpdateDeactivateReactivateShop()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var shopCode = $"shop-{Guid.NewGuid():N}"[..18];
        var ownerUsername = $"owner-{Guid.NewGuid():N}"[..20];

        var created = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Pilot Shop",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Pilot Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "create pilot shop"
            });

        Assert.Equal("create", TestJson.GetString(created, "action"));
        Assert.Equal(shopCode, TestJson.GetString(created["shop"]!, "shop_code"));
        Assert.True(created["shop"]?["is_active"]?.GetValue<bool>() ?? false);

        var shopId = TestJson.GetString(created["shop"]!, "shop_id");

        var users = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync($"/api/admin/licensing/users?shop_code={Uri.EscapeDataString(shopCode)}&take=20"));
        var owner = users["items"]?
            .AsArray()
            .FirstOrDefault(x => string.Equals(x?["username"]?.GetValue<string>(), ownerUsername, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(owner);
        Assert.Equal("owner", TestJson.GetString(owner!, "role_code"));

        var ownerSessionClient = appFactory.CreateClient();
        var ownerLogin = await ownerSessionClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = ownerUsername,
            password = "OwnerPass123!",
            device_code = $"shop-owner-{Guid.NewGuid():N}",
            device_name = "Shop Owner Session"
        });
        ownerLogin.EnsureSuccessStatusCode();

        var updated = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Put,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                shop_name = "Pilot Shop Renamed",
                actor = "support_admin",
                reason_code = "manual_shop_update",
                actor_note = "rename shop"
            });

        Assert.Equal("update", TestJson.GetString(updated, "action"));
        Assert.Equal("Pilot Shop Renamed", TestJson.GetString(updated["shop"]!, "shop_name"));

        var deactivated = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "deactivate pilot shop"
            });

        Assert.Equal("deactivate", TestJson.GetString(deactivated, "action"));
        Assert.False(deactivated["shop"]?["is_active"]?.GetValue<bool>() ?? true);

        var ownerMeAfterDeactivate = await ownerSessionClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, ownerMeAfterDeactivate.StatusCode);

        var ownerLoginAfterDeactivateClient = appFactory.CreateClient();
        var ownerLoginAfterDeactivateAttempt = await ownerLoginAfterDeactivateClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = ownerUsername,
            password = "OwnerPass123!",
            device_code = $"inactive-owner-{Guid.NewGuid():N}",
            device_name = "Inactive Owner Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, ownerLoginAfterDeactivateAttempt.StatusCode);

        var usersAfterDeactivate = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync($"/api/admin/licensing/users?shop_code={Uri.EscapeDataString(shopCode)}&include_inactive=true&take=20"));
        var ownerAfterDeactivate = usersAfterDeactivate["items"]?
            .AsArray()
            .FirstOrDefault(x => string.Equals(x?["username"]?.GetValue<string>(), ownerUsername, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(ownerAfterDeactivate);
        Assert.False(ownerAfterDeactivate?["is_active"]?.GetValue<bool>() ?? true);

        var defaultList = await TestJson.ReadObjectAsync(await adminClient.GetAsync("/api/admin/licensing/shops?take=300"));
        var presentInDefault = defaultList["items"]?
            .AsArray()
            .Any(x => string.Equals(x?["shop_code"]?.GetValue<string>(), shopCode, StringComparison.OrdinalIgnoreCase));
        Assert.False(presentInDefault ?? false);

        var withInactive = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync("/api/admin/licensing/shops?include_inactive=true&take=300"));
        var inactiveRow = withInactive["items"]?
            .AsArray()
            .FirstOrDefault(x => string.Equals(x?["shop_code"]?.GetValue<string>(), shopCode, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(inactiveRow);
        Assert.False(inactiveRow!["is_active"]?.GetValue<bool>() ?? true);

        var reactivated = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}/reactivate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_reactivate",
                actor_note = "reactivate pilot shop"
            });

        Assert.Equal("reactivate", TestJson.GetString(reactivated, "action"));
        Assert.True(reactivated["shop"]?["is_active"]?.GetValue<bool>() ?? false);

        var ownerLoginAfterReactivateClient = appFactory.CreateClient();
        var ownerLoginAfterReactivate = await ownerLoginAfterReactivateClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = ownerUsername,
            password = "OwnerPass123!",
            device_code = $"reactivated-shop-owner-{Guid.NewGuid():N}",
            device_name = "Reactivated Shop Owner Device"
        });
        ownerLoginAfterReactivate.EnsureSuccessStatusCode();

        var deactivatedForDelete = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "prepare shop delete"
            });

        Assert.Equal("deactivate", TestJson.GetString(deactivatedForDelete, "action"));
        Assert.False(deactivatedForDelete["shop"]?["is_active"]?.GetValue<bool>() ?? true);

        var deleted = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}/hard-delete",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_delete",
                actor_note = "delete pilot shop"
            });

        Assert.Equal("delete", TestJson.GetString(deleted, "action"));
        Assert.Equal(shopCode, TestJson.GetString(deleted["shop"]!, "shop_code"));

        var listAfterDelete = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync("/api/admin/licensing/shops?include_inactive=true&take=300"));
        var existsAfterDelete = listAfterDelete["items"]?
            .AsArray()
            .Any(x => string.Equals(x?["shop_code"]?.GetValue<string>(), shopCode, StringComparison.OrdinalIgnoreCase));
        Assert.False(existsAfterDelete ?? false);

        var ownerLoginAfterDeleteClient = appFactory.CreateClient();
        var ownerLoginAfterDelete = await ownerLoginAfterDeleteClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = ownerUsername,
            password = "OwnerPass123!",
            device_code = $"deleted-shop-owner-{Guid.NewGuid():N}",
            device_name = "Deleted Shop Owner Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, ownerLoginAfterDelete.StatusCode);
    }

    [Fact]
    public async Task BillingAdmin_ShouldReactivateShop_AndRestoreOwnerCloudAccess()
    {
        var supportClient = appFactory.CreateClient();
        await TestAuth.SignInAsSupportAdminAsync(supportClient);

        var shopCode = $"react-{Guid.NewGuid():N}"[..18];
        var ownerUsername = $"reactowner-{Guid.NewGuid():N}"[..20];

        var created = await SendMutationAndReadAsync(
            supportClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Reactivate Billing Shop",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Reactivate Billing Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed billing reactivate shop"
            });

        var shopId = TestJson.GetString(created["shop"]!, "shop_id");

        await SendMutationAndReadAsync(
            supportClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "deactivate before billing reactivate"
            });

        var billingClient = appFactory.CreateClient();
        await TestAuth.SignInAsBillingAdminAsync(billingClient);

        var reactivated = await SendMutationAndReadAsync(
            billingClient,
            HttpMethod.Post,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}/reactivate",
            new
            {
                actor = "billing_admin",
                reason_code = "manual_shop_reactivate",
                actor_note = "billing admin reactivate"
            });

        Assert.Equal("reactivate", TestJson.GetString(reactivated, "action"));
        Assert.True(reactivated["shop"]?["is_active"]?.GetValue<bool>() ?? false);

        var ownerLoginClient = appFactory.CreateClient();
        var ownerLogin = await ownerLoginClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = ownerUsername,
            password = "OwnerPass123!",
            device_code = $"billing-reactivated-owner-{Guid.NewGuid():N}",
            device_name = "Billing Reactivated Owner Device"
        });
        ownerLogin.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task BillingAdmin_ShouldDeactivateAndDeleteShop()
    {
        var supportClient = appFactory.CreateClient();
        await TestAuth.SignInAsSupportAdminAsync(supportClient);

        var shopCode = $"billdel-{Guid.NewGuid():N}"[..16];
        var ownerUsername = $"billowner-{Guid.NewGuid():N}"[..20];
        var created = await SendMutationAndReadAsync(
            supportClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Billing Delete Shop",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Billing Delete Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed shop for billing delete scope"
            });

        var shopId = TestJson.GetString(created["shop"]!, "shop_id");

        var billingClient = appFactory.CreateClient();
        await TestAuth.SignInAsBillingAdminAsync(billingClient);

        var deactivated = await SendMutationAndReadAsync(
            billingClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                actor = "billing_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "billing admin deactivation test"
            });
        Assert.Equal("deactivate", TestJson.GetString(deactivated, "action"));
        Assert.False(deactivated["shop"]?["is_active"]?.GetValue<bool>() ?? true);

        var deleted = await SendMutationAndReadAsync(
            billingClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}/hard-delete",
            new
            {
                actor = "billing_admin",
                reason_code = "manual_shop_delete",
                actor_note = "billing admin delete test"
            });
        Assert.Equal("delete", TestJson.GetString(deleted, "action"));
        Assert.Equal(shopCode, TestJson.GetString(deleted["shop"]!, "shop_code"));
    }

    [Fact]
    public async Task ShopCreate_ShouldRejectDuplicateShopCodeAndOwnerUsername()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var shopCode = $"dup-{Guid.NewGuid():N}"[..16];
        var ownerUsername = $"dup-owner-{Guid.NewGuid():N}"[..22];

        await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Duplicate Seed",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Dup Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed"
            });

        var duplicateCodeResponse = await SendMutationAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Duplicate Code",
                owner_username = $"another-{Guid.NewGuid():N}"[..18],
                owner_password = "OwnerPass123!",
                owner_full_name = "Another Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "duplicate code"
            });
        Assert.Equal(HttpStatusCode.Conflict, duplicateCodeResponse.StatusCode);

        var duplicateUserResponse = await SendMutationAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = $"unique-{Guid.NewGuid():N}"[..18],
                shop_name = "Duplicate User",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Duplicate Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "duplicate username"
            });
        Assert.Equal(HttpStatusCode.Conflict, duplicateUserResponse.StatusCode);
    }

    [Fact]
    public async Task ShopUpdate_ShouldRejectShopCodeMutation()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var created = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = $"immut-{Guid.NewGuid():N}"[..18],
                shop_name = "Immutable Code Shop",
                owner_username = $"immut-owner-{Guid.NewGuid():N}"[..22],
                owner_password = "OwnerPass123!",
                owner_full_name = "Immutable Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed"
            });

        var shopId = TestJson.GetString(created["shop"]!, "shop_id");

        var response = await SendMutationAsync(
            adminClient,
            HttpMethod.Put,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}",
            new
            {
                shop_code = "changed-code",
                actor = "support_admin",
                reason_code = "manual_shop_update",
                actor_note = "attempt code change"
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task ShopDeactivate_ShouldBlockWhenActiveDependentsExist()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var created = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = $"guard-{Guid.NewGuid():N}"[..18],
                shop_name = "Guard Shop",
                owner_username = $"guard-owner-{Guid.NewGuid():N}"[..22],
                owner_password = "OwnerPass123!",
                owner_full_name = "Guard Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed"
            });

        var shopId = Guid.Parse(TestJson.GetString(created["shop"]!, "shop_id"));

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            dbContext.ProvisionedDevices.Add(new ProvisionedDevice
            {
                ShopId = shopId,
                DeviceCode = $"guard-device-{Guid.NewGuid():N}"[..24],
                Name = "Guard Device",
                Status = ProvisionedDeviceStatus.Active,
                AssignedAtUtc = DateTimeOffset.UtcNow,
                Shop = await dbContext.Shops.FirstAsync(x => x.Id == shopId)
            });
            await dbContext.SaveChangesAsync();
        }

        var response = await SendMutationAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId.ToString())}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "should block"
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task BillingAdmin_ShouldBypassDependencyGuard_ForOpenInvoiceDeactivateAndDelete()
    {
        var supportClient = appFactory.CreateClient();
        await TestAuth.SignInAsSupportAdminAsync(supportClient);

        var shopCode = $"billdep-{Guid.NewGuid():N}"[..16];
        var ownerUsername = $"billdep-owner-{Guid.NewGuid():N}"[..20];
        var created = await SendMutationAndReadAsync(
            supportClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = shopCode,
                shop_name = "Billing Dependency Override Shop",
                owner_username = ownerUsername,
                owner_password = "OwnerPass123!",
                owner_full_name = "Billing Dependency Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed shop for dependency override"
            });

        var shopId = Guid.Parse(TestJson.GetString(created["shop"]!, "shop_id"));

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var shop = await dbContext.Shops.FirstAsync(x => x.Id == shopId);
            dbContext.ManualBillingInvoices.Add(new ManualBillingInvoice
            {
                ShopId = shopId,
                InvoiceNumber = $"INV-{Guid.NewGuid():N}"[..16],
                AmountDue = 2500m,
                AmountPaid = 0m,
                Currency = "LKR",
                Status = ManualBillingInvoiceStatus.Open,
                DueAtUtc = DateTimeOffset.UtcNow.AddDays(7),
                CreatedBy = "integration-tests",
                Shop = shop
            });
            await dbContext.SaveChangesAsync();
        }

        var billingClient = appFactory.CreateClient();
        await TestAuth.SignInAsBillingAdminAsync(billingClient);

        var deactivated = await SendMutationAndReadAsync(
            billingClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId.ToString())}",
            new
            {
                actor = "billing_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "billing admin dependency override deactivation"
            });
        Assert.Equal("deactivate", TestJson.GetString(deactivated, "action"));
        Assert.False(deactivated["shop"]?["is_active"]?.GetValue<bool>() ?? true);

        var deleted = await SendMutationAndReadAsync(
            billingClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId.ToString())}/hard-delete",
            new
            {
                actor = "billing_admin",
                reason_code = "manual_shop_delete",
                actor_note = "billing admin dependency override delete"
            });
        Assert.Equal("delete", TestJson.GetString(deleted, "action"));
        Assert.Equal(shopCode, TestJson.GetString(deleted["shop"]!, "shop_code"));

        await using var verifyScope = appFactory.Services.CreateAsyncScope();
        var verifyDbContext = verifyScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        Assert.False(await verifyDbContext.Shops.AnyAsync(x => x.Id == shopId));
        Assert.False(await verifyDbContext.ManualBillingInvoices.AnyAsync(x => x.ShopId == shopId));
    }

    [Fact]
    public async Task ShopHardDelete_ShouldRequireInactiveShop()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var created = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/shops",
            new
            {
                shop_code = $"harddel-{Guid.NewGuid():N}"[..18],
                shop_name = "Hard Delete Guard Shop",
                owner_username = $"harddel-owner-{Guid.NewGuid():N}"[..22],
                owner_password = "OwnerPass123!",
                owner_full_name = "Hard Delete Owner",
                actor = "support_admin",
                reason_code = "manual_shop_create",
                actor_note = "seed"
            });

        var shopId = TestJson.GetString(created["shop"]!, "shop_id");
        var response = await SendMutationAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(shopId)}/hard-delete",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_delete",
                actor_note = "attempt deleting active shop"
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task DefaultShop_ShouldBeProtectedFromDeactivateAndDelete()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var shops = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync("/api/admin/licensing/shops?include_inactive=true&take=300"));
        var defaultShop = shops["items"]?
            .AsArray()
            .FirstOrDefault(x => string.Equals(x?["shop_code"]?.GetValue<string>(), "default", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(defaultShop);

        var defaultShopId = TestJson.GetString(defaultShop!, "shop_id");

        var deactivateResponse = await SendMutationAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(defaultShopId)}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_deactivate",
                actor_note = "attempt default shop deactivation"
            });
        Assert.Equal(HttpStatusCode.Conflict, deactivateResponse.StatusCode);

        var deactivateError = await deactivateResponse.Content.ReadFromJsonAsync<JsonObject>();
        Assert.NotNull(deactivateError);
        Assert.Equal("DEFAULT_SHOP_PROTECTED", TestJson.GetString(deactivateError!["error"]!, "code"));

        var deleteResponse = await SendMutationAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/shops/{Uri.EscapeDataString(defaultShopId)}/hard-delete",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_delete",
                actor_note = "attempt default shop deletion"
            });
        Assert.Equal(HttpStatusCode.Conflict, deleteResponse.StatusCode);

        var deleteError = await deleteResponse.Content.ReadFromJsonAsync<JsonObject>();
        Assert.NotNull(deleteError);
        Assert.Equal("DEFAULT_SHOP_PROTECTED", TestJson.GetString(deleteError!["error"]!, "code"));
    }

    [Fact]
    public async Task BillingAndLocalRoles_ShouldBeForbidden_FromShopCrud()
    {
        var billingClient = appFactory.CreateClient();
        await TestAuth.SignInAsBillingAdminAsync(billingClient);

        var billingResponse = await billingClient.PostAsJsonAsync("/api/admin/licensing/shops", new
        {
            shop_code = "billing-forbidden-shop",
            shop_name = "Billing Forbidden",
            owner_username = "billing.forbidden.owner",
            owner_password = "OwnerPass123!",
            actor_note = "forbidden"
        });
        Assert.Equal(HttpStatusCode.Forbidden, billingResponse.StatusCode);

        var ownerClient = appFactory.CreateClient();
        var ownerLogin = await ownerClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = "owner",
            password = "owner123",
            device_code = $"owner-shop-crud-{Guid.NewGuid():N}",
            device_name = "Owner Shop CRUD Test"
        });
        ownerLogin.EnsureSuccessStatusCode();

        var ownerResponse = await ownerClient.PostAsJsonAsync("/api/admin/licensing/shops", new
        {
            shop_code = "owner-forbidden-shop",
            shop_name = "Owner Forbidden",
            owner_username = "owner.forbidden.user",
            owner_password = "OwnerPass123!",
            actor_note = "forbidden"
        });
        Assert.Equal(HttpStatusCode.Forbidden, ownerResponse.StatusCode);
    }

    private static async Task<HttpResponseMessage> SendMutationAsync(HttpClient client, HttpMethod method, string path, object payload)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        return await client.SendAsync(request);
    }

    private static async Task<JsonObject> SendMutationAndReadAsync(HttpClient client, HttpMethod method, string path, object payload)
    {
        var response = await SendMutationAsync(client, method, path, payload);
        response.EnsureSuccessStatusCode();
        return await TestJson.ReadObjectAsync(response);
    }
}
