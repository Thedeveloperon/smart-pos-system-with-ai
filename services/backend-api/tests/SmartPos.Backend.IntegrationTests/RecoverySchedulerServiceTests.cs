using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Recovery;

namespace SmartPos.Backend.IntegrationTests;

public sealed class RecoverySchedulerServiceTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    [Fact]
    public async Task RunOnceAsync_WithDefaultSettings_ShouldRunPreflightThenBackupInDryRun()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<RecoverySchedulerService>();

        var summary = await service.RunOnceAsync(CancellationToken.None);

        Assert.True(summary.PreflightExecuted);
        Assert.NotNull(summary.PreflightResponse);
        Assert.Equal("preflight", summary.PreflightResponse!.Operation);
        Assert.Equal("backup", summary.BackupResponse.Operation);
        Assert.Equal("completed", summary.BackupResponse.Status);
    }

    [Fact]
    public async Task RunOnceAsync_WithPreflightDisabled_ShouldRunBackupOnly()
    {
        using var localFactory = new RecoverySchedulerNoPreflightFactory();
        await using var scope = localFactory.Services.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<RecoverySchedulerService>();

        var summary = await service.RunOnceAsync(CancellationToken.None);

        Assert.False(summary.PreflightExecuted);
        Assert.Null(summary.PreflightResponse);
        Assert.Equal("backup", summary.BackupResponse.Operation);
        Assert.Equal("completed", summary.BackupResponse.Status);
    }

    private sealed class RecoverySchedulerNoPreflightFactory : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["RecoveryOps:SchedulerRunPreflightFirst"] = "false"
            };
        }
    }
}
