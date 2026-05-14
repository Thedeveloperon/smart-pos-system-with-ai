using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AdminShopUserManagementTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient adminClient = factory.CreateClient();

    [Fact]
    public async Task SupportAdmin_ShouldManageShopUsers_AndResetPasswordShouldRevokeSessions()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var username = $"shopuser-{Guid.NewGuid():N}".Substring(0, 20);
        const string initialPassword = "StartPass123!";
        const string updatedPassword = "UpdatedPass123!";

        var createdUser = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/licensing/users",
            new
            {
                shop_code = "default",
                username,
                full_name = "Managed Shop User",
                role_code = "cashier",
                password = initialPassword,
                actor = "support_admin",
                reason_code = "manual_shop_user_create",
                actor_note = "create test account"
            });

        var userId = TestJson.GetString(createdUser["user"]!, "user_id");
        Assert.Equal("create", TestJson.GetString(createdUser, "action"));

        var listResponse = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync($"/api/admin/licensing/users?shop_code=default&search={Uri.EscapeDataString(username)}&take=20"));
        var found = listResponse["items"]?
            .AsArray()
            .Any(x => string.Equals(x?["username"]?.GetValue<string>(), username, StringComparison.OrdinalIgnoreCase));
        Assert.True(found);

        var updatedUser = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Put,
            $"/api/admin/licensing/users/{Uri.EscapeDataString(userId)}",
            new
            {
                full_name = "Managed Shop Manager",
                role_code = "manager",
                actor = "support_admin",
                reason_code = "manual_shop_user_update",
                actor_note = "promote to manager"
            });
        Assert.Equal("update", TestJson.GetString(updatedUser, "action"));
        Assert.Equal("manager", TestJson.GetString(updatedUser["user"]!, "role_code"));

        var userClient = appFactory.CreateClient();
        var loginBeforeReset = await userClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = initialPassword,
            device_code = $"user-device-{Guid.NewGuid():N}",
            device_name = "User Device"
        });
        loginBeforeReset.EnsureSuccessStatusCode();

        var resetResponse = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            $"/api/admin/licensing/users/{Uri.EscapeDataString(userId)}/reset-password",
            new
            {
                new_password = updatedPassword,
                actor = "support_admin",
                reason_code = "manual_shop_user_password_reset",
                actor_note = "forced password rotation"
            });
        Assert.Equal("reset_password", TestJson.GetString(resetResponse, "action"));

        var meAfterReset = await userClient.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, meAfterReset.StatusCode);

        var oldPasswordClient = appFactory.CreateClient();
        var oldPasswordLogin = await oldPasswordClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = initialPassword,
            device_code = $"old-pass-{Guid.NewGuid():N}",
            device_name = "Old Password Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, oldPasswordLogin.StatusCode);

        var newPasswordClient = appFactory.CreateClient();
        var newPasswordLogin = await newPasswordClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = updatedPassword,
            device_code = $"new-pass-{Guid.NewGuid():N}",
            device_name = "New Password Device"
        });
        newPasswordLogin.EnsureSuccessStatusCode();

        var deactivateResponse = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/users/{Uri.EscapeDataString(userId)}",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_user_deactivate",
                actor_note = "temporary suspension"
            });
        Assert.Equal("deactivate", TestJson.GetString(deactivateResponse, "action"));
        Assert.False(deactivateResponse["user"]?["is_active"]?.GetValue<bool>());

        var loginWhileInactiveClient = appFactory.CreateClient();
        var loginWhileInactive = await loginWhileInactiveClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = updatedPassword,
            device_code = $"inactive-{Guid.NewGuid():N}",
            device_name = "Inactive User Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, loginWhileInactive.StatusCode);

        var reactivateResponse = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Post,
            $"/api/admin/licensing/users/{Uri.EscapeDataString(userId)}/reactivate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_user_reactivate",
                actor_note = "restore account access"
            });
        Assert.Equal("reactivate", TestJson.GetString(reactivateResponse, "action"));
        Assert.True(reactivateResponse["user"]?["is_active"]?.GetValue<bool>());

        var loginAfterReactivateClient = appFactory.CreateClient();
        var loginAfterReactivate = await loginAfterReactivateClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = updatedPassword,
            device_code = $"reactivated-{Guid.NewGuid():N}",
            device_name = "Reactivated User Device"
        });
        loginAfterReactivate.EnsureSuccessStatusCode();

        var deleteResponse = await SendMutationAndReadAsync(
            adminClient,
            HttpMethod.Delete,
            $"/api/admin/licensing/users/{Uri.EscapeDataString(userId)}/hard-delete",
            new
            {
                actor = "support_admin",
                reason_code = "manual_shop_user_delete",
                actor_note = "retired owner account"
            });
        Assert.Equal("delete", TestJson.GetString(deleteResponse, "action"));

        var loginAfterDeleteClient = appFactory.CreateClient();
        var loginAfterDelete = await loginAfterDeleteClient.PostAsJsonAsync("/api/auth/login", new
        {
            username,
            password = updatedPassword,
            device_code = $"deleted-{Guid.NewGuid():N}",
            device_name = "Deleted User Device"
        });
        Assert.Equal(HttpStatusCode.BadRequest, loginAfterDelete.StatusCode);

        var listAfterDelete = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync($"/api/admin/licensing/users?shop_code=default&search={Uri.EscapeDataString(username)}&take=20"));
        var existsAfterDelete = listAfterDelete["items"]?
            .AsArray()
            .Any(x => string.Equals(x?["username"]?.GetValue<string>(), username, StringComparison.OrdinalIgnoreCase));
        Assert.False(existsAfterDelete);
    }

    [Fact]
    public async Task BillingAdmin_ShouldBeForbidden_FromShopUserCrudEndpoints()
    {
        await TestAuth.SignInAsBillingAdminAsync(adminClient);

        var response = await adminClient.GetAsync("/api/admin/licensing/users?shop_code=default");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task OwnerManagerCashier_ShouldBeForbidden_FromShopUserCrudEndpoints()
    {
        var ownerClient = appFactory.CreateClient();
        var ownerLogin = await ownerClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = "owner",
            password = "owner123",
            device_code = $"owner-admin-denied-{Guid.NewGuid():N}",
            device_name = "Owner Admin Deny Test"
        });
        ownerLogin.EnsureSuccessStatusCode();
        var ownerResponse = await ownerClient.GetAsync("/api/admin/licensing/users?shop_code=default");
        Assert.Equal(HttpStatusCode.Forbidden, ownerResponse.StatusCode);

        var managerClient = appFactory.CreateClient();
        await TestAuth.SignInAsManagerAsync(managerClient);
        var managerResponse = await managerClient.GetAsync("/api/admin/licensing/users?shop_code=default");
        Assert.Equal(HttpStatusCode.Forbidden, managerResponse.StatusCode);

        var cashierClient = appFactory.CreateClient();
        await TestAuth.SignInAsCashierAsync(cashierClient);
        var cashierResponse = await cashierClient.GetAsync("/api/admin/licensing/users?shop_code=default");
        Assert.Equal(HttpStatusCode.Forbidden, cashierResponse.StatusCode);
    }

    [Fact]
    public async Task DeactivateLastOwner_ShouldReturnConflict()
    {
        await TestAuth.SignInAsSupportAdminAsync(adminClient);

        var shopCode = $"owner-guard-{Guid.NewGuid():N}".Substring(0, 20);
        var ownerUsername = $"ownerguard-{Guid.NewGuid():N}".Substring(0, 22);

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var ownerRole = await dbContext.Roles
                .FirstAsync(x => x.Code.ToLower() == SmartPosRoles.Owner);

            var shop = new Shop
            {
                Code = shopCode,
                Name = "Owner Guard Shop",
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow
            };
            dbContext.Shops.Add(shop);

            var owner = new AppUser
            {
                StoreId = shop.Id,
                Username = ownerUsername,
                FullName = "Only Owner",
                PasswordHash = string.Empty,
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow
            };
            owner.PasswordHash = PasswordHashing.HashPassword(owner, "OwnerPass123!");
            dbContext.Users.Add(owner);

            dbContext.UserRoles.Add(new UserRole
            {
                UserId = owner.Id,
                RoleId = ownerRole.Id,
                AssignedAtUtc = DateTimeOffset.UtcNow,
                User = owner,
                Role = ownerRole
            });

            await dbContext.SaveChangesAsync();
        }

        var users = await TestJson.ReadObjectAsync(
            await adminClient.GetAsync($"/api/admin/licensing/users?shop_code={Uri.EscapeDataString(shopCode)}"));
        var ownerNode = users["items"]?
            .AsArray()
            .FirstOrDefault(x => string.Equals(x?["role_code"]?.GetValue<string>(), "owner", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(ownerNode);
        var ownerId = ownerNode!["user_id"]!.GetValue<string>();

        var deactivateRequest = new HttpRequestMessage(HttpMethod.Delete, $"/api/admin/licensing/users/{Uri.EscapeDataString(ownerId)}")
        {
            Content = JsonContent.Create(new
            {
                actor = "support_admin",
                reason_code = "manual_shop_user_deactivate",
                actor_note = "should fail for last owner"
            })
        };
        deactivateRequest.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await adminClient.SendAsync(deactivateRequest);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("INVALID_ADMIN_REQUEST", payload["error"]?["code"]?.GetValue<string>());
    }

    private static async Task<JsonObject> SendMutationAndReadAsync(HttpClient client, HttpMethod method, string path, object body)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await client.SendAsync(request);
        return await TestJson.ReadObjectAsync(response);
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? new JsonObject();
    }
}
