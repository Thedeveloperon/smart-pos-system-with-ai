using System.Net;
using System.Net.Http.Json;

namespace SmartPos.Backend.IntegrationTests;

public sealed class RecoveryEndpointsTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task RecoveryStatusAndBackup_WithManager_ShouldReturnDryRunResults()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var statusResponse = await client.GetAsync("/api/admin/recovery/status");
        statusResponse.EnsureSuccessStatusCode();
        var statusPayload = await TestJson.ReadObjectAsync(statusResponse);
        Assert.True(statusPayload["enabled"]?.GetValue<bool>() ?? false);
        Assert.True(statusPayload["dry_run"]?.GetValue<bool>() ?? false);
        Assert.NotNull(statusPayload["drill_health"]);
        Assert.False(string.IsNullOrWhiteSpace(statusPayload["drill_health"]?["status"]?.GetValue<string>()));

        var backupResponse = await client.PostAsJsonAsync("/api/admin/recovery/backup/run", new
        {
            backup_mode = "full"
        });
        backupResponse.EnsureSuccessStatusCode();
        var backupPayload = await TestJson.ReadObjectAsync(backupResponse);
        Assert.Equal("backup", TestJson.GetString(backupPayload, "operation"));
        Assert.Equal("completed", TestJson.GetString(backupPayload, "status"));
        Assert.Contains("Dry-run mode", TestJson.GetString(backupPayload, "message"), StringComparison.OrdinalIgnoreCase);
        Assert.Contains("backup-db.sh", TestJson.GetString(backupPayload, "command"), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RecoveryBackup_WithoutIdempotencyKey_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);

        client.DefaultRequestHeaders.Remove("Idempotency-Key");
        try
        {
            var response = await client.PostAsJsonAsync("/api/admin/recovery/backup/run", new
            {
                backup_mode = "full"
            });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var payload = await response.Content.ReadFromJsonAsync<System.Text.Json.Nodes.JsonObject>()
                ?? throw new InvalidOperationException("Response body was empty.");
            Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", payload["error"]?["code"]?.GetValue<string>());
        }
        finally
        {
            client.DefaultRequestHeaders.Add("Idempotency-Key", "integration-tests-default");
        }
    }

    [Fact]
    public async Task RecoveryStatusAndBackup_WithCashier_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsCashierAsync(client);

        var statusResponse = await client.GetAsync("/api/admin/recovery/status");
        Assert.Equal(HttpStatusCode.Forbidden, statusResponse.StatusCode);

        var backupResponse = await client.PostAsJsonAsync("/api/admin/recovery/backup/run", new
        {
            backup_mode = "full"
        });
        Assert.Equal(HttpStatusCode.Forbidden, backupResponse.StatusCode);
    }

    [Fact]
    public async Task RecoveryRestoreSmoke_WithMissingBackup_ShouldReturnNotFound()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/admin/recovery/restore-smoke/run", new
        {
            backup_file_path = $"backups/it-missing-{Guid.NewGuid():N}.tar.gz"
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<System.Text.Json.Nodes.JsonObject>()
            ?? throw new InvalidOperationException("Response body was empty.");
        Assert.Equal("RECOVERY_BACKUP_FILE_NOT_FOUND", payload["error"]?["code"]?.GetValue<string>());
    }
}
