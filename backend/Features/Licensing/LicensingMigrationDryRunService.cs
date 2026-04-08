using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicensingMigrationDryRunService(
    SmartPosDbContext dbContext,
    IWebHostEnvironment environment)
{
    private static readonly Regex OwnerUsernamePattern = new(
        @"^[a-z0-9._@\-]+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ReasonCodePattern = new(
        @"^[a-z0-9_\-:.]+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly JsonSerializerOptions ReportJsonOptions = new()
    {
        WriteIndented = true
    };

    public async Task<AiWalletMigrationDryRunResponse> RunAiWalletDryRunAsync(
        AiWalletMigrationDryRunRequest? request,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = request ?? new AiWalletMigrationDryRunRequest();
        var now = DateTimeOffset.UtcNow;
        var batchId = ResolveBatchId(normalizedRequest.BatchId, now);
        var maxDetailRows = Math.Clamp(normalizedRequest.MaxDetailRows <= 0 ? 200 : normalizedRequest.MaxDetailRows, 1, 2000);

        var shops = await dbContext.Shops
            .AsNoTracking()
            .Select(x => new ShopRow(x.Id, x.Code))
            .ToListAsync(cancellationToken);
        var users = await dbContext.Users
            .AsNoTracking()
            .Select(x => new UserRow(x.Id, x.Username, x.StoreId))
            .ToListAsync(cancellationToken);
        var wallets = await dbContext.AiCreditWallets
            .AsNoTracking()
            .Select(x => new WalletRow(x.Id, x.UserId, x.ShopId, x.AvailableCredits))
            .ToListAsync(cancellationToken);

        var ownerUserIds = (await (
                from userRole in dbContext.UserRoles.AsNoTracking()
                join role in dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
                where role.Code.ToLower() == SmartPosRoles.Owner
                select userRole.UserId)
            .Distinct()
            .ToListAsync(cancellationToken))
            .ToHashSet();
        var managerUserIds = (await (
                from userRole in dbContext.UserRoles.AsNoTracking()
                join role in dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
                where role.Code.ToLower() == SmartPosRoles.Manager
                select userRole.UserId)
            .Distinct()
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var usersById = users.ToDictionary(x => x.Id);
        var shopsById = shops.ToDictionary(x => x.Id);

        var usersWithoutShop = users
            .Where(x => !x.StoreId.HasValue || x.StoreId == Guid.Empty)
            .ToList();
        var ownersWithoutShop = usersWithoutShop
            .Where(x => ownerUserIds.Contains(x.Id))
            .ToList();

        var walletsWithoutShop = wallets
            .Where(x => !x.ShopId.HasValue || x.ShopId == Guid.Empty)
            .ToList();
        var walletsRequiringBackfill = walletsWithoutShop
            .Count(x => usersById.TryGetValue(x.UserId, out var user) && user.StoreId.HasValue && user.StoreId != Guid.Empty);
        var walletsBlockedUnmappedUser = walletsWithoutShop
            .Count(x => !usersById.TryGetValue(x.UserId, out var user) || !user.StoreId.HasValue || user.StoreId == Guid.Empty);

        var ownerShopIds = users
            .Where(x => ownerUserIds.Contains(x.Id) && x.StoreId.HasValue && x.StoreId != Guid.Empty)
            .Select(x => x.StoreId!.Value)
            .ToHashSet();
        var shopsWithoutOwner = shops
            .Where(x => !ownerShopIds.Contains(x.Id))
            .ToList();
        var shopsWithoutOwnerCount = shopsWithoutOwner.Count;

        var walletByShop = wallets
            .Where(x => x.ShopId.HasValue && x.ShopId != Guid.Empty)
            .GroupBy(x => x.ShopId!.Value)
            .ToDictionary(
                group => group.Key,
                group => new WalletAggregate(group.Count(), Round(group.Sum(x => x.AvailableCredits))));

        Dictionary<Guid, decimal> ledgerByShop;
        if (dbContext.Database.IsSqlite())
        {
            var ledgerRows = await dbContext.AiCreditLedgerEntries
                .AsNoTracking()
                .Where(x => x.ShopId.HasValue)
                .Select(x => new { ShopId = x.ShopId!.Value, x.DeltaCredits })
                .ToListAsync(cancellationToken);
            ledgerByShop = ledgerRows
                .GroupBy(x => x.ShopId)
                .ToDictionary(
                    group => group.Key,
                    group => Round(group.Sum(x => x.DeltaCredits)));
        }
        else
        {
            ledgerByShop = await dbContext.AiCreditLedgerEntries
                .AsNoTracking()
                .Where(x => x.ShopId.HasValue)
                .GroupBy(x => x.ShopId!.Value)
                .Select(group => new
                {
                    ShopId = group.Key,
                    NetCredits = group.Sum(x => x.DeltaCredits)
                })
                .ToDictionaryAsync(
                    x => x.ShopId,
                    x => Round(x.NetCredits),
                    cancellationToken);
        }

        var varianceShopIds = walletByShop.Keys
            .Union(ledgerByShop.Keys)
            .Distinct()
            .ToList();
        var varianceRows = varianceShopIds
            .Select(shopId =>
            {
                var walletAggregate = walletByShop.GetValueOrDefault(shopId) ?? new WalletAggregate(0, 0m);
                var ledgerNet = ledgerByShop.GetValueOrDefault(shopId);
                var variance = Round(walletAggregate.TotalCredits - ledgerNet);
                var shopCode = shopsById.TryGetValue(shopId, out var shop) ? shop.Code : "unknown";
                return new AiWalletMigrationDryRunShopVarianceRow
                {
                    ShopId = shopId,
                    ShopCode = shopCode,
                    WalletCount = walletAggregate.Count,
                    WalletCreditsTotal = walletAggregate.TotalCredits,
                    LedgerNetCreditsTotal = ledgerNet,
                    Variance = variance
                };
            })
            .Where(x => x.Variance != 0m)
            .OrderByDescending(x => Math.Abs(x.Variance))
            .ThenBy(x => x.ShopCode, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var shopsWithMultipleWallets = walletByShop.Values.Count(x => x.Count > 1);
        var walletsRequiringConsolidation = walletByShop.Values
            .Where(x => x.Count > 1)
            .Sum(x => x.Count - 1);

        var response = new AiWalletMigrationDryRunResponse
        {
            BatchId = batchId,
            GeneratedAt = now,
            SourceSnapshot = new AiWalletMigrationDryRunSourceSnapshot
            {
                ShopsTotal = shops.Count,
                UsersTotal = users.Count,
                OwnerUsersTotal = ownerUserIds.Count,
                UsersWithoutShopMapping = usersWithoutShop.Count,
                OwnerUsersWithoutShopMapping = ownersWithoutShop.Count,
                WalletsTotal = wallets.Count,
                WalletsWithShopMapping = wallets.Count - walletsWithoutShop.Count,
                WalletsWithoutShopMapping = walletsWithoutShop.Count,
                LedgerRowsTotal = await dbContext.AiCreditLedgerEntries.AsNoTracking().CountAsync(cancellationToken),
                PaymentRowsTotal = await dbContext.AiCreditPayments.AsNoTracking().CountAsync(cancellationToken)
            },
            MappingSummary = new AiWalletMigrationDryRunMappingSummary
            {
                ShopsWithoutOwner = shopsWithoutOwnerCount,
                ShopsWithMultipleWallets = shopsWithMultipleWallets,
                WalletsRequiringShopBackfill = walletsRequiringBackfill,
                WalletsBlockedUnmappedUser = walletsBlockedUnmappedUser,
                WalletsRequiringConsolidation = walletsRequiringConsolidation
            },
            Reconciliation = new AiWalletMigrationDryRunReconciliationSummary
            {
                ShopsWithBalanceVariance = varianceRows.Count,
                TotalAbsoluteVariance = Round(varianceRows.Sum(x => Math.Abs(x.Variance))),
                Items = normalizedRequest.IncludeShopDetails
                    ? varianceRows.Take(maxDetailRows).ToList()
                    : []
            },
            Blockers = new AiWalletMigrationDryRunBlockers
            {
                UnmappedUsersCount = usersWithoutShop.Count,
                WalletsBlockedUnmappedUserCount = walletsBlockedUnmappedUser,
                ShopsWithoutOwnerCount = shopsWithoutOwnerCount,
                UnmappedUsers = normalizedRequest.IncludeBlockerDetails
                    ? usersWithoutShop
                        .OrderBy(x => x.Username, StringComparer.OrdinalIgnoreCase)
                        .Take(maxDetailRows)
                        .Select(x => new AiWalletMigrationDryRunUnmappedUserRow
                        {
                            UserId = x.Id,
                            Username = x.Username,
                            IsOwner = ownerUserIds.Contains(x.Id)
                        })
                        .ToList()
                    : [],
                ShopsWithoutOwner = normalizedRequest.IncludeBlockerDetails
                    ? shopsWithoutOwner
                        .OrderBy(x => x.Code, StringComparer.OrdinalIgnoreCase)
                        .Take(maxDetailRows)
                        .Select(x => new AiWalletMigrationDryRunShopOwnerGapRow
                        {
                            ShopId = x.Id,
                            ShopCode = x.Code,
                            ManagerCandidates = users
                                .Where(user => user.StoreId == x.Id && managerUserIds.Contains(user.Id))
                                .OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
                                .Select(user => user.Username)
                                .Take(10)
                                .ToList()
                        })
                        .ToList()
                    : []
            },
            Acceptance = new AiWalletMigrationDryRunAcceptance
            {
                OwnerMappingReady = shopsWithoutOwnerCount == 0 && ownersWithoutShop.Count == 0,
                WalletVarianceZero = varianceRows.Count == 0,
                WalletConsolidationReady = walletsRequiringConsolidation == 0,
                IsReadyForCutover = shopsWithoutOwnerCount == 0 &&
                                    ownersWithoutShop.Count == 0 &&
                                    walletsBlockedUnmappedUser == 0 &&
                                    varianceRows.Count == 0 &&
                                    walletsRequiringConsolidation == 0
            }
        };

        if (!normalizedRequest.PersistArtifacts)
        {
            response.Artifacts = new AiWalletMigrationDryRunArtifacts
            {
                Persisted = false
            };
            return response;
        }

        response.Artifacts = await PersistArtifactsAsync(response, cancellationToken);
        return response;
    }

    public async Task<AiOwnerMappingRemediationResponse> RemediateOwnerMappingAsync(
        AiOwnerMappingRemediationRequest? request,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = request ?? new AiOwnerMappingRemediationRequest();
        var now = DateTimeOffset.UtcNow;

        var shop = await ResolveTargetShopAsync(
            normalizedRequest.ShopId,
            normalizedRequest.ShopCode,
            cancellationToken);
        var ownerRole = await dbContext.Roles
            .FirstOrDefaultAsync(x => x.Code.ToLower() == SmartPosRoles.Owner, cancellationToken)
            ?? throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                "Owner role is not configured.",
                StatusCodes.Status500InternalServerError);

        var ownerUsername = NormalizeOwnerUsername(normalizedRequest.OwnerUsername);
        var ownerPassword = NormalizeOwnerPassword(normalizedRequest.OwnerPassword);
        var ownerFullName = NormalizeOwnerFullName(normalizedRequest.OwnerFullName);
        var actor = NormalizeActor(normalizedRequest.Actor);
        var reasonCode = NormalizeReasonCode(normalizedRequest.ReasonCode);
        var actorNote = NormalizeOptionalValue(normalizedRequest.ActorNote) ?? "manual_owner_mapping_remediation";

        var existingUser = await dbContext.Users
            .Include(x => x.UserRoles)
            .FirstOrDefaultAsync(x => x.Username.ToLower() == ownerUsername, cancellationToken);

        AppUser ownerUser;
        string ownerAccountState;
        string storeMappingState;
        string passwordState;

        if (existingUser is null)
        {
            if (string.IsNullOrWhiteSpace(ownerPassword))
            {
                throw new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "owner_password is required when owner account does not exist.",
                    StatusCodes.Status400BadRequest);
            }

            ownerUser = new AppUser
            {
                StoreId = shop.Id,
                Username = ownerUsername,
                FullName = ownerFullName,
                PasswordHash = string.Empty,
                IsActive = true,
                CreatedAtUtc = now
            };
            ownerUser.PasswordHash = PasswordHashing.HashPassword(ownerUser, ownerPassword);
            dbContext.Users.Add(ownerUser);

            ownerAccountState = "created";
            storeMappingState = "mapped";
            passwordState = "set";
        }
        else
        {
            if (existingUser.StoreId.HasValue &&
                existingUser.StoreId.Value != Guid.Empty &&
                existingUser.StoreId.Value != shop.Id)
            {
                throw new LicenseException(
                    LicenseErrorCodes.DuplicateSubmission,
                    "owner_username is already assigned to another shop.",
                    StatusCodes.Status409Conflict);
            }

            ownerUser = existingUser;
            ownerAccountState = "existing";

            if (!ownerUser.StoreId.HasValue || ownerUser.StoreId == Guid.Empty)
            {
                ownerUser.StoreId = shop.Id;
                storeMappingState = "mapped";
            }
            else
            {
                storeMappingState = "already_mapped";
            }

            if (!string.IsNullOrWhiteSpace(ownerFullName) &&
                !string.Equals(ownerUser.FullName, ownerFullName, StringComparison.Ordinal))
            {
                ownerUser.FullName = ownerFullName;
            }

            if (!string.IsNullOrWhiteSpace(ownerPassword))
            {
                ownerUser.PasswordHash = PasswordHashing.HashPassword(ownerUser, ownerPassword);
                passwordState = "reset";
            }
            else
            {
                passwordState = "unchanged";
            }
        }

        var hasOwnerRole = ownerUser.UserRoles.Any(x => x.RoleId == ownerRole.Id);
        string ownerRoleState;
        if (!hasOwnerRole)
        {
            ownerUser.UserRoles.Add(new UserRole
            {
                UserId = ownerUser.Id,
                User = ownerUser,
                RoleId = ownerRole.Id,
                Role = ownerRole,
                AssignedAtUtc = now
            });
            ownerRoleState = "assigned";
        }
        else
        {
            ownerRoleState = "already_assigned";
        }

        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shop.Id,
            Action = "migration_owner_mapping_remediated",
            Actor = actor,
            Reason = reasonCode,
            MetadataJson = JsonSerializer.Serialize(new
            {
                shop_id = shop.Id,
                shop_code = shop.Code,
                owner_username = ownerUser.Username,
                owner_account_state = ownerAccountState,
                store_mapping_state = storeMappingState,
                owner_role_state = ownerRoleState,
                password_state = passwordState,
                actor_note = actorNote
            }),
            IsManualOverride = true,
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AiOwnerMappingRemediationResponse
        {
            ProcessedAt = now,
            ShopId = shop.Id,
            ShopCode = shop.Code,
            OwnerUserId = ownerUser.Id,
            OwnerUsername = ownerUser.Username,
            OwnerAccountState = ownerAccountState,
            StoreMappingState = storeMappingState,
            OwnerRoleState = ownerRoleState,
            PasswordState = passwordState
        };
    }

    private async Task<AiWalletMigrationDryRunArtifacts> PersistArtifactsAsync(
        AiWalletMigrationDryRunResponse response,
        CancellationToken cancellationToken)
    {
        var batchFolder = Path.Combine(
            environment.ContentRootPath,
            "artifacts",
            "migration",
            response.BatchId);
        Directory.CreateDirectory(batchFolder);

        var extractReportPath = Path.Combine(batchFolder, $"migration_extract_report_{response.BatchId}.json");
        var transformReportPath = Path.Combine(batchFolder, $"migration_transform_report_{response.BatchId}.json");
        var reconcileReportPath = Path.Combine(batchFolder, $"migration_reconcile_report_{response.BatchId}.json");
        var goNoGoPath = Path.Combine(batchFolder, $"migration_go_no_go_{response.BatchId}.md");

        var extractPayload = new
        {
            response.BatchId,
            response.GeneratedAt,
            response.SourceSnapshot
        };
        var transformPayload = new
        {
            response.BatchId,
            response.GeneratedAt,
            response.MappingSummary,
            response.Blockers
        };
        var reconcilePayload = new
        {
            response.BatchId,
            response.GeneratedAt,
            response.Reconciliation,
            response.Acceptance
        };

        await File.WriteAllTextAsync(
            extractReportPath,
            JsonSerializer.Serialize(extractPayload, ReportJsonOptions),
            Encoding.UTF8,
            cancellationToken);
        await File.WriteAllTextAsync(
            transformReportPath,
            JsonSerializer.Serialize(transformPayload, ReportJsonOptions),
            Encoding.UTF8,
            cancellationToken);
        await File.WriteAllTextAsync(
            reconcileReportPath,
            JsonSerializer.Serialize(reconcilePayload, ReportJsonOptions),
            Encoding.UTF8,
            cancellationToken);
        await File.WriteAllTextAsync(
            goNoGoPath,
            BuildGoNoGoMarkdown(response),
            Encoding.UTF8,
            cancellationToken);

        return new AiWalletMigrationDryRunArtifacts
        {
            Persisted = true,
            ExtractReportPath = ToRelativePath(extractReportPath),
            TransformReportPath = ToRelativePath(transformReportPath),
            ReconcileReportPath = ToRelativePath(reconcileReportPath),
            GoNoGoPath = ToRelativePath(goNoGoPath)
        };
    }

    private string BuildGoNoGoMarkdown(AiWalletMigrationDryRunResponse response)
    {
        var goNoGo = response.Acceptance.IsReadyForCutover ? "GO" : "NO-GO";
        return $"""
                # Migration Go/No-Go ({response.BatchId})

                Generated at: {response.GeneratedAt:O}
                Decision: {goNoGo}

                ## Acceptance checks

                - owner_mapping_ready: {response.Acceptance.OwnerMappingReady}
                - wallet_variance_zero: {response.Acceptance.WalletVarianceZero}
                - wallet_consolidation_ready: {response.Acceptance.WalletConsolidationReady}
                - is_ready_for_cutover: {response.Acceptance.IsReadyForCutover}

                ## Blockers

                - unmapped_users_count: {response.Blockers.UnmappedUsersCount}
                - wallets_blocked_unmapped_user_count: {response.Blockers.WalletsBlockedUnmappedUserCount}
                - shops_without_owner_count: {response.Blockers.ShopsWithoutOwnerCount}

                ## Reconciliation

                - shops_with_balance_variance: {response.Reconciliation.ShopsWithBalanceVariance}
                - total_absolute_variance: {response.Reconciliation.TotalAbsoluteVariance}
                """;
    }

    private string ToRelativePath(string absolutePath)
    {
        var relative = Path.GetRelativePath(environment.ContentRootPath, absolutePath);
        return relative.Replace('\\', '/');
    }

    private async Task<Shop> ResolveTargetShopAsync(
        Guid? shopId,
        string? shopCode,
        CancellationToken cancellationToken)
    {
        var normalizedShopCode = NormalizeOptionalValue(shopCode)?.ToLowerInvariant();
        if ((!shopId.HasValue || shopId == Guid.Empty) && string.IsNullOrWhiteSpace(normalizedShopCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "Either shop_id or shop_code is required.",
                StatusCodes.Status400BadRequest);
        }

        if (shopId.HasValue && shopId != Guid.Empty)
        {
            var byId = await dbContext.Shops
                .FirstOrDefaultAsync(x => x.Id == shopId.Value, cancellationToken);
            if (byId is not null)
            {
                return byId;
            }
        }

        if (!string.IsNullOrWhiteSpace(normalizedShopCode))
        {
            var byCode = await dbContext.Shops
                .FirstOrDefaultAsync(x => x.Code.ToLower() == normalizedShopCode, cancellationToken);
            if (byCode is not null)
            {
                return byCode;
            }
        }

        throw new LicenseException(
            LicenseErrorCodes.InvalidAdminRequest,
            "Shop was not found.",
            StatusCodes.Status404NotFound);
    }

    private static string NormalizeOwnerUsername(string? ownerUsername)
    {
        var normalized = NormalizeOptionalValue(ownerUsername)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username is required.",
                StatusCodes.Status400BadRequest);
        }

        if (normalized.Length is < 3 or > 64)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username must be between 3 and 64 characters.",
                StatusCodes.Status400BadRequest);
        }

        if (!OwnerUsernamePattern.IsMatch(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_username contains invalid characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string? NormalizeOwnerPassword(string? ownerPassword)
    {
        var normalized = NormalizeOptionalValue(ownerPassword);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length is < 8 or > 128)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_password must be between 8 and 128 characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string NormalizeOwnerFullName(string? ownerFullName)
    {
        var normalized = NormalizeOptionalValue(ownerFullName) ?? "Shop Owner";
        if (normalized.Length > 120)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "owner_full_name must be 120 characters or less.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string NormalizeActor(string? actor)
    {
        var normalized = NormalizeOptionalValue(actor) ?? "support-admin";
        if (normalized.Length > 120)
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "actor must be 120 characters or less.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string NormalizeReasonCode(string? reasonCode)
    {
        var normalized = NormalizeOptionalValue(reasonCode)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "migration_owner_mapping_remediation";
        }

        if (normalized.Length > 80 || !ReasonCodePattern.IsMatch(normalized))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidAdminRequest,
                "reason_code contains invalid characters.",
                StatusCodes.Status400BadRequest);
        }

        return normalized;
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string ResolveBatchId(string? requestedBatchId, DateTimeOffset now)
    {
        var normalized = (requestedBatchId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return $"dryrun-{now:yyyyMMdd-HHmmss}";
        }

        var safe = Regex.Replace(normalized, @"[^a-zA-Z0-9\-_]", "_");
        if (safe.Length > 80)
        {
            safe = safe[..80];
        }

        return string.IsNullOrWhiteSpace(safe)
            ? $"dryrun-{now:yyyyMMdd-HHmmss}"
            : safe;
    }

    private static decimal Round(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private sealed record ShopRow(Guid Id, string Code);
    private sealed record UserRow(Guid Id, string Username, Guid? StoreId);
    private sealed record WalletRow(Guid Id, Guid UserId, Guid? ShopId, decimal AvailableCredits);
    private sealed record WalletAggregate(int Count, decimal TotalCredits);
}
