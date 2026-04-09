using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingOwnerMappingRemediationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task OwnerMappingRemediation_WithSuperAdmin_ShouldCreateOwnerAndClearOwnerGap()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"ownerless-{Guid.NewGuid():N}"[..22];
        await using (var setupScope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = setupScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            dbContext.Shops.Add(new Shop
            {
                Code = shopCode,
                Name = "Ownerless Shop"
            });
            await dbContext.SaveChangesAsync();
        }

        var ownerUsername = $"owner_{Guid.NewGuid():N}"[..26];
        var remediationPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/migration/owner-mapping/remediate", new
            {
                shop_code = shopCode,
                owner_username = ownerUsername,
                owner_full_name = "Migration Owner",
                owner_password = "OwnerFix123!",
                actor = "support_admin",
                reason_code = "migration_owner_mapping_remediation",
                actor_note = "integration-test-remediation"
            }));

        Assert.Equal(shopCode, TestJson.GetString(remediationPayload, "shop_code"));
        Assert.Equal(ownerUsername, TestJson.GetString(remediationPayload, "owner_username"));
        Assert.Equal("created", TestJson.GetString(remediationPayload, "owner_account_state"));
        Assert.Equal("mapped", TestJson.GetString(remediationPayload, "store_mapping_state"));
        Assert.Equal("assigned", TestJson.GetString(remediationPayload, "owner_role_state"));

        await using (var verifyScope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = verifyScope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var ownerUser = await dbContext.Users
                .Include(x => x.UserRoles)
                .ThenInclude(x => x.Role)
                .FirstOrDefaultAsync(x => x.Username == ownerUsername);

            Assert.NotNull(ownerUser);
            var shop = await dbContext.Shops.FirstAsync(x => x.Code == shopCode);
            Assert.Equal(shop.Id, ownerUser!.StoreId);
            Assert.Contains(ownerUser.UserRoles, role => role.Role.Code == SmartPosRoles.Owner);

            var auditExists = await dbContext.LicenseAuditLogs
                .AsNoTracking()
                .AnyAsync(x => x.Action == "migration_owner_mapping_remediated" && x.ShopId == shop.Id);
            Assert.True(auditExists);
        }

        var dryRunPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/migration/ai-wallets/dry-run", new
            {
                persist_artifacts = false,
                include_shop_details = false,
                include_blocker_details = true,
                max_detail_rows = 50
            }));

        var blockers = dryRunPayload["blockers"]?.AsObject()
                       ?? throw new InvalidOperationException("blockers was not returned.");
        Assert.Equal(0, blockers["shops_without_owner_count"]?.GetValue<int>());
    }

    [Fact]
    public async Task OwnerMappingRemediation_WithManager_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/admin/licensing/migration/owner-mapping/remediate", new
        {
            shop_code = "default",
            owner_username = "owner_manager_forbidden",
            owner_password = "OwnerFix123!"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
