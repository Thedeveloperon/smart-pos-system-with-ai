using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingMigrationDryRunTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task AiWalletDryRun_WithSuperAdmin_ShouldReturnSnapshot()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var response = await client.PostAsJsonAsync("/api/admin/licensing/migration/ai-wallets/dry-run", new
        {
            batch_id = $"it-dryrun-{Guid.NewGuid():N}",
            persist_artifacts = false,
            include_shop_details = true,
            include_blocker_details = true,
            max_detail_rows = 25
        });
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("dry-run response payload was empty.");

        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(payload, "batch_id")));
        var source = payload["source_snapshot"]?.AsObject()
                     ?? throw new InvalidOperationException("source_snapshot was not returned.");
        Assert.True((source["users_total"]?.GetValue<int>() ?? 0) > 0);
        Assert.True((source["shops_total"]?.GetValue<int>() ?? 0) > 0);

        var artifacts = payload["artifacts"]?.AsObject()
                        ?? throw new InvalidOperationException("artifacts payload was not returned.");
        Assert.False(artifacts["persisted"]?.GetValue<bool>() ?? true);
    }

    [Fact]
    public async Task AiWalletDryRun_WithManager_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/admin/licensing/migration/ai-wallets/dry-run", new
        {
            persist_artifacts = false
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
