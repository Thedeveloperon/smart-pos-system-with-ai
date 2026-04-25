using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiCreditBillingService(
    SmartPosDbContext dbContext,
    AuditLogService auditLogService)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<AiWalletResponse> GetWalletAsync(Guid userId, CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var wallet = await dbContext.AiCreditWallets
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ShopId == context.ShopId, cancellationToken);

        if (wallet is null)
        {
            return new AiWalletResponse
            {
                AvailableCredits = 0m,
                UpdatedAt = DateTimeOffset.UtcNow
            };
        }

        return new AiWalletResponse
        {
            AvailableCredits = wallet.AvailableCredits,
            UpdatedAt = wallet.UpdatedAtUtc
        };
    }

    public async Task<AiCreditLedgerResponse> GetLedgerAsync(
        Guid userId,
        int take,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 200);
        var candidateTake = Math.Clamp(normalizedTake * 4, normalizedTake, 800);

        List<AiCreditLedgerEntry> rows;
        if (dbContext.Database.IsSqlite())
        {
            rows = (await dbContext.AiCreditLedgerEntries
                    .AsNoTracking()
                    .Where(x => x.ShopId == context.ShopId && x.EntryType != AiCreditLedgerEntryType.Reserve)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(candidateTake)
                .ToList();
        }
        else
        {
            rows = await dbContext.AiCreditLedgerEntries
                .AsNoTracking()
                .Where(x => x.ShopId == context.ShopId && x.EntryType != AiCreditLedgerEntryType.Reserve)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(candidateTake)
                .ToListAsync(cancellationToken);
        }

        var items = rows
            .Where(ShouldExposeLedgerEntry)
            .Select(MapLedgerItem)
            .Take(normalizedTake)
            .ToList();

        return new AiCreditLedgerResponse
        {
            Items = items
        };
    }

    public async Task<AiWalletResponse> AddCreditsAsync(
        Guid userId,
        decimal credits,
        string reference,
        string? description,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        return await AddCreditsToShopAsync(
            context.ShopId,
            context.User.Id,
            credits,
            reference,
            description,
            cancellationToken);
    }

    public async Task<AiWalletResponse> AddCreditsToShopAsync(
        Guid shopId,
        Guid initiatedByUserId,
        decimal credits,
        string reference,
        string? description,
        CancellationToken cancellationToken)
    {
        var normalizedCredits = RoundCredits(credits);
        if (normalizedCredits <= 0m)
        {
            throw new InvalidOperationException("Credit amount must be greater than zero.");
        }

        var normalizedReference = (reference ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedReference))
        {
            throw new InvalidOperationException("Credit reference is required.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var wallet = await GetOrCreateWalletForShopForUpdateAsync(
            shopId,
            initiatedByUserId,
            cancellationToken);

        var duplicateReferenceExists = await dbContext.AiCreditLedgerEntries
            .AnyAsync(
                x => x.ShopId == shopId &&
                     x.EntryType == AiCreditLedgerEntryType.Purchase &&
                     x.Reference == normalizedReference,
                cancellationToken);

        if (duplicateReferenceExists)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new AiWalletResponse
            {
                AvailableCredits = wallet.AvailableCredits,
                UpdatedAt = wallet.UpdatedAtUtc
            };
        }

        var descriptionValue = string.IsNullOrWhiteSpace(description)
            ? "credit_purchase"
            : description.Trim();
        var beforeBalance = wallet.AvailableCredits;
        wallet.AvailableCredits = RoundCredits(wallet.AvailableCredits + normalizedCredits);
        wallet.UpdatedAtUtc = now;

        dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
        {
            UserId = initiatedByUserId,
            ShopId = shopId,
            WalletId = wallet.Id,
            EntryType = AiCreditLedgerEntryType.Purchase,
            DeltaCredits = normalizedCredits,
            BalanceAfterCredits = wallet.AvailableCredits,
            Reference = normalizedReference,
            Description = descriptionValue,
            CreatedAtUtc = now,
            Wallet = wallet,
            User = await GetUserAsync(initiatedByUserId, cancellationToken)
        });
        auditLogService.Queue(
            action: "ai_wallet_top_up",
            entityName: nameof(AiCreditWallet),
            entityId: wallet.Id.ToString(),
            before: new { available_credits = beforeBalance },
            after: new
            {
                shop_id = shopId,
                initiated_by_user_id = initiatedByUserId,
                available_credits = wallet.AvailableCredits,
                delta_credits = normalizedCredits,
                reference = normalizedReference,
                description = descriptionValue
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AiWalletResponse
        {
            AvailableCredits = wallet.AvailableCredits,
            UpdatedAt = wallet.UpdatedAtUtc
        };
    }

    public async Task<AiCreditReservationResult> ReserveCreditsAsync(
        Guid userId,
        Guid requestId,
        decimal reserveCredits,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var normalizedReserve = RoundCredits(reserveCredits);
        if (normalizedReserve <= 0m)
        {
            throw new InvalidOperationException("Reserve credits must be greater than zero.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var wallet = await GetOrCreateWalletForShopForUpdateAsync(
            context.ShopId,
            context.User.Id,
            cancellationToken);

        AiCreditLedgerEntry? existingReserveEntry;
        if (dbContext.Database.IsSqlite())
        {
            existingReserveEntry = (await dbContext.AiCreditLedgerEntries
                    .Where(
                        x => x.AiInsightRequestId == requestId &&
                             x.EntryType == AiCreditLedgerEntryType.Reserve)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();
        }
        else
        {
            existingReserveEntry = await dbContext.AiCreditLedgerEntries
                .Where(
                    x => x.AiInsightRequestId == requestId &&
                         x.EntryType == AiCreditLedgerEntryType.Reserve)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (existingReserveEntry is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new AiCreditReservationResult(
                wallet.AvailableCredits,
                Math.Abs(existingReserveEntry.DeltaCredits));
        }

        if (wallet.AvailableCredits < normalizedReserve)
        {
            throw new InvalidOperationException("Insufficient credits. Please top up to continue.");
        }

        wallet.AvailableCredits = RoundCredits(wallet.AvailableCredits - normalizedReserve);
        wallet.UpdatedAtUtc = now;
        dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
        {
            UserId = context.User.Id,
            ShopId = context.ShopId,
            WalletId = wallet.Id,
            AiInsightRequestId = requestId,
            EntryType = AiCreditLedgerEntryType.Reserve,
            DeltaCredits = -normalizedReserve,
            BalanceAfterCredits = wallet.AvailableCredits,
            Description = "ai_reserve",
            CreatedAtUtc = now,
            Wallet = wallet,
            User = context.User
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AiCreditReservationResult(wallet.AvailableCredits, normalizedReserve);
    }

    public async Task<AiCreditSettlementResult> SettleReservationAsync(
        Guid userId,
        Guid requestId,
        decimal reservedCredits,
        decimal chargedCredits,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var normalizedReserved = Math.Max(0m, RoundCredits(reservedCredits));
        var normalizedCharge = Math.Max(0m, RoundCredits(chargedCredits));
        var normalizedRefund = normalizedReserved > normalizedCharge
            ? RoundCredits(normalizedReserved - normalizedCharge)
            : 0m;
        var overageCharge = normalizedCharge > normalizedReserved
            ? RoundCredits(normalizedCharge - normalizedReserved)
            : 0m;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var wallet = await GetOrCreateWalletForShopForUpdateAsync(
            context.ShopId,
            context.User.Id,
            cancellationToken);

        var existingCharge = await dbContext.AiCreditLedgerEntries
            .AnyAsync(
                x => x.AiInsightRequestId == requestId &&
                     x.EntryType == AiCreditLedgerEntryType.Charge,
                cancellationToken);

        var existingRefund = await dbContext.AiCreditLedgerEntries
            .AnyAsync(
                x => x.AiInsightRequestId == requestId &&
                     x.EntryType == AiCreditLedgerEntryType.Refund,
                cancellationToken);

        if (existingCharge || existingRefund)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new AiCreditSettlementResult(
                wallet.AvailableCredits,
                normalizedCharge,
                normalizedRefund);
        }

        var finalBalance = RoundCredits(wallet.AvailableCredits + normalizedRefund - overageCharge);
        if (finalBalance < 0m)
        {
            throw new InvalidOperationException("Credits were exhausted while finalizing this request.");
        }

        var runningBalance = wallet.AvailableCredits;

        if (normalizedRefund > 0m)
        {
            runningBalance = RoundCredits(runningBalance + normalizedRefund);
            dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
            {
                UserId = context.User.Id,
                ShopId = context.ShopId,
                WalletId = wallet.Id,
                AiInsightRequestId = requestId,
                EntryType = AiCreditLedgerEntryType.Refund,
                DeltaCredits = normalizedRefund,
                BalanceAfterCredits = runningBalance,
                Description = "ai_reserve_refund",
                CreatedAtUtc = now,
                Wallet = wallet,
                User = context.User
            });
        }

        if (normalizedCharge > 0m)
        {
            if (overageCharge > 0m)
            {
                runningBalance = RoundCredits(runningBalance - overageCharge);
            }

            dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
            {
                UserId = context.User.Id,
                ShopId = context.ShopId,
                WalletId = wallet.Id,
                AiInsightRequestId = requestId,
                EntryType = AiCreditLedgerEntryType.Charge,
                DeltaCredits = -overageCharge,
                BalanceAfterCredits = runningBalance,
                Description = "ai_charge",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    charged_credits = normalizedCharge,
                    overage_credits = overageCharge
                }, JsonOptions),
                CreatedAtUtc = now,
                Wallet = wallet,
                User = context.User
            });
        }

        wallet.AvailableCredits = finalBalance;
        wallet.UpdatedAtUtc = now;

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AiCreditSettlementResult(
            wallet.AvailableCredits,
            normalizedCharge,
            normalizedRefund);
    }

    public async Task<AiWalletResponse> RefundReservationAsync(
        Guid userId,
        Guid requestId,
        decimal reservedCredits,
        string reason,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        var normalizedReserve = Math.Max(0m, RoundCredits(reservedCredits));
        if (normalizedReserve <= 0m)
        {
            return await GetWalletAsync(userId, cancellationToken);
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var wallet = await GetOrCreateWalletForShopForUpdateAsync(
            context.ShopId,
            context.User.Id,
            cancellationToken);

        var existingRefund = await dbContext.AiCreditLedgerEntries
            .AnyAsync(
                x => x.AiInsightRequestId == requestId &&
                     x.EntryType == AiCreditLedgerEntryType.Refund,
                cancellationToken);

        if (!existingRefund)
        {
            wallet.AvailableCredits = RoundCredits(wallet.AvailableCredits + normalizedReserve);
            wallet.UpdatedAtUtc = now;

            dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
            {
                UserId = context.User.Id,
                ShopId = context.ShopId,
                WalletId = wallet.Id,
                AiInsightRequestId = requestId,
                EntryType = AiCreditLedgerEntryType.Refund,
                DeltaCredits = normalizedReserve,
                BalanceAfterCredits = wallet.AvailableCredits,
                Description = string.IsNullOrWhiteSpace(reason) ? "ai_refund" : reason.Trim(),
                CreatedAtUtc = now,
                Wallet = wallet,
                User = context.User
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AiWalletResponse
        {
            AvailableCredits = wallet.AvailableCredits,
            UpdatedAt = wallet.UpdatedAtUtc
        };
    }

    public async Task<AiWalletAdjustmentResult> AdjustCreditsAsync(
        Guid userId,
        decimal deltaCredits,
        string reference,
        string? reason,
        CancellationToken cancellationToken)
    {
        var context = await ResolveUserShopContextAsync(userId, cancellationToken);
        return await AdjustCreditsForShopAsync(
            context.ShopId,
            context.User.Id,
            deltaCredits,
            reference,
            reason,
            cancellationToken);
    }

    public async Task<AiWalletAdjustmentResult> AdjustCreditsForShopAsync(
        Guid shopId,
        Guid initiatedByUserId,
        decimal deltaCredits,
        string reference,
        string? reason,
        CancellationToken cancellationToken)
    {
        var normalizedDelta = RoundCredits(deltaCredits);
        if (normalizedDelta == 0m)
        {
            throw new InvalidOperationException("Adjustment delta cannot be zero.");
        }

        var normalizedReference = (reference ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedReference))
        {
            throw new InvalidOperationException("Adjustment reference is required.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var wallet = await GetOrCreateWalletForShopForUpdateAsync(
            shopId,
            initiatedByUserId,
            cancellationToken);

        var duplicateReferenceExists = await dbContext.AiCreditLedgerEntries
            .AnyAsync(
                x => x.ShopId == shopId &&
                     x.EntryType == AiCreditLedgerEntryType.Adjustment &&
                     x.Reference == normalizedReference,
                cancellationToken);

        if (duplicateReferenceExists)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new AiWalletAdjustmentResult(
                wallet.AvailableCredits,
                0m,
                normalizedReference,
                wallet.UpdatedAtUtc);
        }

        var finalBalance = RoundCredits(wallet.AvailableCredits + normalizedDelta);
        if (finalBalance < 0m)
        {
            throw new InvalidOperationException("Adjustment exceeds available credits.");
        }

        var descriptionValue = string.IsNullOrWhiteSpace(reason)
            ? "manual_adjustment"
            : reason.Trim();
        var beforeBalance = wallet.AvailableCredits;
        wallet.AvailableCredits = finalBalance;
        wallet.UpdatedAtUtc = now;

        dbContext.AiCreditLedgerEntries.Add(new AiCreditLedgerEntry
        {
            UserId = initiatedByUserId,
            ShopId = shopId,
            WalletId = wallet.Id,
            EntryType = AiCreditLedgerEntryType.Adjustment,
            DeltaCredits = normalizedDelta,
            BalanceAfterCredits = wallet.AvailableCredits,
            Reference = normalizedReference,
            Description = descriptionValue,
            CreatedAtUtc = now,
            Wallet = wallet,
            User = await GetUserAsync(initiatedByUserId, cancellationToken)
        });
        auditLogService.Queue(
            action: "ai_wallet_adjustment",
            entityName: nameof(AiCreditWallet),
            entityId: wallet.Id.ToString(),
            before: new { available_credits = beforeBalance },
            after: new
            {
                shop_id = shopId,
                initiated_by_user_id = initiatedByUserId,
                available_credits = wallet.AvailableCredits,
                delta_credits = normalizedDelta,
                reference = normalizedReference,
                reason = descriptionValue
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new AiWalletAdjustmentResult(
            wallet.AvailableCredits,
            normalizedDelta,
            normalizedReference,
            wallet.UpdatedAtUtc);
    }

    private async Task<AiCreditWallet> GetOrCreateWalletForShopForUpdateAsync(
        Guid shopId,
        Guid defaultUserId,
        CancellationToken cancellationToken)
    {
        var wallet = await dbContext.AiCreditWallets
            .FirstOrDefaultAsync(x => x.ShopId == shopId, cancellationToken);

        if (wallet is not null)
        {
            await LockWalletRowAsync(wallet.Id, cancellationToken);
            return wallet;
        }

        var user = await GetUserAsync(defaultUserId, cancellationToken);

        wallet = new AiCreditWallet
        {
            UserId = defaultUserId,
            ShopId = shopId,
            AvailableCredits = 0m,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
            User = user
        };

        dbContext.AiCreditWallets.Add(wallet);
        await dbContext.SaveChangesAsync(cancellationToken);
        await LockWalletRowAsync(wallet.Id, cancellationToken);
        return wallet;
    }

    private async Task<ShopActorContext> ResolveUserShopContextAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");

        if (!user.StoreId.HasValue || user.StoreId == Guid.Empty)
        {
            throw new InvalidOperationException(
                "AI billing is unavailable because this account is not mapped to a shop. Contact support.");
        }

        return new ShopActorContext(user, user.StoreId.Value);
    }

    private async Task<AppUser> GetUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");
    }

    private async Task LockWalletRowAsync(Guid walletId, CancellationToken cancellationToken)
    {
        var providerName = dbContext.Database.ProviderName ?? string.Empty;
        if (!providerName.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"""SELECT 1 FROM ai_credit_wallets WHERE "Id" = {walletId} FOR UPDATE;""",
            cancellationToken);
    }

    private static decimal RoundCredits(decimal credits)
    {
        return decimal.Round(credits, 2, MidpointRounding.AwayFromZero);
    }

    private static bool ShouldExposeLedgerEntry(AiCreditLedgerEntry entry)
    {
        // Reserve/refund pairs are internal settlement details for AI requests.
        // They are hidden from user-facing history to prevent misleading deltas.
        if (entry.EntryType == AiCreditLedgerEntryType.Refund && entry.AiInsightRequestId.HasValue)
        {
            return false;
        }

        return true;
    }

    private static AiCreditLedgerItemResponse MapLedgerItem(AiCreditLedgerEntry entry)
    {
        return new AiCreditLedgerItemResponse
        {
            EntryType = MapLedgerEntryType(entry.EntryType),
            DeltaCredits = MapLedgerDelta(entry),
            BalanceAfterCredits = entry.BalanceAfterCredits,
            Reference = entry.Reference,
            Description = entry.Description,
            CreatedAtUtc = entry.CreatedAtUtc
        };
    }

    private static string MapLedgerEntryType(AiCreditLedgerEntryType entryType)
    {
        return entryType switch
        {
            AiCreditLedgerEntryType.Purchase => "purchase",
            AiCreditLedgerEntryType.Charge => "charge",
            AiCreditLedgerEntryType.Refund => "refund",
            AiCreditLedgerEntryType.Adjustment => "adjustment",
            _ => "adjustment"
        };
    }

    private static decimal MapLedgerDelta(AiCreditLedgerEntry entry)
    {
        if (entry.EntryType != AiCreditLedgerEntryType.Charge)
        {
            return entry.DeltaCredits;
        }

        var chargedCredits = ResolveChargedCredits(entry);
        if (chargedCredits <= 0m)
        {
            return entry.DeltaCredits;
        }

        return -chargedCredits;
    }

    private static decimal ResolveChargedCredits(AiCreditLedgerEntry entry)
    {
        if (string.IsNullOrWhiteSpace(entry.MetadataJson))
        {
            return Math.Abs(entry.DeltaCredits);
        }

        try
        {
            using var document = JsonDocument.Parse(entry.MetadataJson);
            if (document.RootElement.TryGetProperty("charged_credits", out var chargedCreditsElement) &&
                chargedCreditsElement.TryGetDecimal(out var chargedCredits))
            {
                return RoundCredits(Math.Max(0m, chargedCredits));
            }
        }
        catch (JsonException)
        {
            // Fall back to persisted delta for malformed metadata.
        }

        return Math.Abs(entry.DeltaCredits);
    }

    private readonly record struct ShopActorContext(
        AppUser User,
        Guid ShopId);
}

public readonly record struct AiCreditReservationResult(
    decimal RemainingCredits,
    decimal ReservedCredits);

public readonly record struct AiCreditSettlementResult(
    decimal RemainingCredits,
    decimal ChargedCredits,
    decimal RefundedCredits);

public readonly record struct AiWalletAdjustmentResult(
    decimal AvailableCredits,
    decimal AppliedDelta,
    string Reference,
    DateTimeOffset UpdatedAt);
