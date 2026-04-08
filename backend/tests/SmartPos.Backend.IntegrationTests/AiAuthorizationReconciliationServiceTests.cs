using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiAuthorizationReconciliationServiceTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory;

    public AiAuthorizationReconciliationServiceTests(CustomWebApplicationFactory factory)
    {
        appFactory = factory;
    }

    [Fact]
    public async Task RunOnceAsync_ShouldRefundAndFailStalePendingAuthorization()
    {
        var requestId = Guid.NewGuid();
        var staleCreatedAt = DateTimeOffset.UtcNow.AddHours(-1);
        var reservedCredits = 3m;
        var initialCredits = 10m;

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var manager = await dbContext.Users.FirstAsync(x => x.Username == "manager");
            Assert.True(manager.StoreId.HasValue);

            var wallet = await dbContext.AiCreditWallets
                .FirstOrDefaultAsync(x => x.ShopId == manager.StoreId);
            if (wallet is null)
            {
                wallet = new AiCreditWallet
                {
                    UserId = manager.Id,
                    ShopId = manager.StoreId,
                    AvailableCredits = initialCredits,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow,
                    User = manager
                };
                dbContext.AiCreditWallets.Add(wallet);
                await dbContext.SaveChangesAsync();
            }

            wallet.AvailableCredits = initialCredits - reservedCredits;
            wallet.UpdatedAtUtc = DateTimeOffset.UtcNow;

            var staleRequest = new AiInsightRequest
            {
                Id = requestId,
                UserId = manager.Id,
                IdempotencyKey = $"reconcile-{Guid.NewGuid():N}",
                Status = AiInsightRequestStatus.Pending,
                Provider = "openai",
                Model = "gpt-5.4-mini",
                UsageType = AiUsageType.QuickInsights,
                PromptHash = Guid.NewGuid().ToString("N"),
                PromptCharCount = 20,
                ReservedCredits = reservedCredits,
                ChargedCredits = 0m,
                InputTokens = 0,
                OutputTokens = 0,
                CreatedAtUtc = staleCreatedAt,
                UpdatedAtUtc = staleCreatedAt,
                CompletedAtUtc = null,
                User = manager
            };

            dbContext.AiInsightRequests.Add(staleRequest);
            dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
            {
                UserId = manager.Id,
                ShopId = manager.StoreId,
                WalletId = wallet.Id,
                AiInsightRequestId = requestId,
                EntryType = AiCreditLedgerEntryType.Reserve,
                DeltaCredits = -reservedCredits,
                BalanceAfterCredits = wallet.AvailableCredits,
                Description = "test_reserve",
                CreatedAtUtc = staleCreatedAt,
                User = manager,
                Wallet = wallet,
                Shop = null
            });

            await dbContext.SaveChangesAsync();
        }

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<AiAuthorizationReconciliationService>();
            var summary = await service.RunOnceAsync(CancellationToken.None);
            Assert.True(summary.Reconciled >= 1);
        }

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var request = await dbContext.AiInsightRequests.FirstAsync(x => x.Id == requestId);
            Assert.Equal(AiInsightRequestStatus.Failed, request.Status);
            Assert.Equal("orphan_reconciled", request.ErrorCode);
            Assert.NotNull(request.CompletedAtUtc);

            var manager = await dbContext.Users.FirstAsync(x => x.Username == "manager");
            var wallet = await dbContext.AiCreditWallets.FirstAsync(x => x.ShopId == manager.StoreId);
            Assert.Equal(initialCredits, wallet.AvailableCredits);
        }
    }
}
