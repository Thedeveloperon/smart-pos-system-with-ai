using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Licensing;

public sealed class AiWalletMigrationDryRunRequest
{
    [JsonPropertyName("batch_id")]
    public string? BatchId { get; set; }

    [JsonPropertyName("persist_artifacts")]
    public bool PersistArtifacts { get; set; } = true;

    [JsonPropertyName("include_shop_details")]
    public bool IncludeShopDetails { get; set; } = true;

    [JsonPropertyName("include_blocker_details")]
    public bool IncludeBlockerDetails { get; set; } = true;

    [JsonPropertyName("max_detail_rows")]
    public int MaxDetailRows { get; set; } = 200;
}

public sealed class AiOwnerMappingRemediationRequest
{
    [JsonPropertyName("shop_id")]
    public Guid? ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string? ShopCode { get; set; }

    [JsonPropertyName("owner_username")]
    public string? OwnerUsername { get; set; }

    [JsonPropertyName("owner_full_name")]
    public string? OwnerFullName { get; set; }

    [JsonPropertyName("owner_password")]
    public string? OwnerPassword { get; set; }

    [JsonPropertyName("actor")]
    public string? Actor { get; set; }

    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; set; }

    [JsonPropertyName("actor_note")]
    public string? ActorNote { get; set; }
}

public sealed class AiOwnerMappingRemediationResponse
{
    [JsonPropertyName("processed_at")]
    public DateTimeOffset ProcessedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("owner_user_id")]
    public Guid OwnerUserId { get; set; }

    [JsonPropertyName("owner_username")]
    public string OwnerUsername { get; set; } = string.Empty;

    [JsonPropertyName("owner_account_state")]
    public string OwnerAccountState { get; set; } = "existing";

    [JsonPropertyName("store_mapping_state")]
    public string StoreMappingState { get; set; } = "already_mapped";

    [JsonPropertyName("owner_role_state")]
    public string OwnerRoleState { get; set; } = "already_assigned";

    [JsonPropertyName("password_state")]
    public string PasswordState { get; set; } = "unchanged";
}

public sealed class AiWalletMigrationDryRunResponse
{
    [JsonPropertyName("batch_id")]
    public string BatchId { get; set; } = string.Empty;

    [JsonPropertyName("generated_at")]
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("source_snapshot")]
    public AiWalletMigrationDryRunSourceSnapshot SourceSnapshot { get; set; } = new();

    [JsonPropertyName("mapping_summary")]
    public AiWalletMigrationDryRunMappingSummary MappingSummary { get; set; } = new();

    [JsonPropertyName("reconciliation")]
    public AiWalletMigrationDryRunReconciliationSummary Reconciliation { get; set; } = new();

    [JsonPropertyName("blockers")]
    public AiWalletMigrationDryRunBlockers Blockers { get; set; } = new();

    [JsonPropertyName("acceptance")]
    public AiWalletMigrationDryRunAcceptance Acceptance { get; set; } = new();

    [JsonPropertyName("artifacts")]
    public AiWalletMigrationDryRunArtifacts Artifacts { get; set; } = new();
}

public sealed class AiWalletMigrationDryRunSourceSnapshot
{
    [JsonPropertyName("shops_total")]
    public int ShopsTotal { get; set; }

    [JsonPropertyName("users_total")]
    public int UsersTotal { get; set; }

    [JsonPropertyName("owner_users_total")]
    public int OwnerUsersTotal { get; set; }

    [JsonPropertyName("users_without_shop_mapping")]
    public int UsersWithoutShopMapping { get; set; }

    [JsonPropertyName("owner_users_without_shop_mapping")]
    public int OwnerUsersWithoutShopMapping { get; set; }

    [JsonPropertyName("wallets_total")]
    public int WalletsTotal { get; set; }

    [JsonPropertyName("wallets_with_shop_mapping")]
    public int WalletsWithShopMapping { get; set; }

    [JsonPropertyName("wallets_without_shop_mapping")]
    public int WalletsWithoutShopMapping { get; set; }

    [JsonPropertyName("ledger_rows_total")]
    public int LedgerRowsTotal { get; set; }

    [JsonPropertyName("payment_rows_total")]
    public int PaymentRowsTotal { get; set; }
}

public sealed class AiWalletMigrationDryRunMappingSummary
{
    [JsonPropertyName("shops_without_owner")]
    public int ShopsWithoutOwner { get; set; }

    [JsonPropertyName("shops_with_multiple_wallets")]
    public int ShopsWithMultipleWallets { get; set; }

    [JsonPropertyName("wallets_requiring_shop_backfill")]
    public int WalletsRequiringShopBackfill { get; set; }

    [JsonPropertyName("wallets_blocked_unmapped_user")]
    public int WalletsBlockedUnmappedUser { get; set; }

    [JsonPropertyName("wallets_requiring_consolidation")]
    public int WalletsRequiringConsolidation { get; set; }
}

public sealed class AiWalletMigrationDryRunReconciliationSummary
{
    [JsonPropertyName("shops_with_balance_variance")]
    public int ShopsWithBalanceVariance { get; set; }

    [JsonPropertyName("total_absolute_variance")]
    public decimal TotalAbsoluteVariance { get; set; }

    [JsonPropertyName("items")]
    public List<AiWalletMigrationDryRunShopVarianceRow> Items { get; set; } = [];
}

public sealed class AiWalletMigrationDryRunShopVarianceRow
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("wallet_count")]
    public int WalletCount { get; set; }

    [JsonPropertyName("wallet_credits_total")]
    public decimal WalletCreditsTotal { get; set; }

    [JsonPropertyName("ledger_net_credits_total")]
    public decimal LedgerNetCreditsTotal { get; set; }

    [JsonPropertyName("variance")]
    public decimal Variance { get; set; }
}

public sealed class AiWalletMigrationDryRunBlockers
{
    [JsonPropertyName("unmapped_users_count")]
    public int UnmappedUsersCount { get; set; }

    [JsonPropertyName("wallets_blocked_unmapped_user_count")]
    public int WalletsBlockedUnmappedUserCount { get; set; }

    [JsonPropertyName("shops_without_owner_count")]
    public int ShopsWithoutOwnerCount { get; set; }

    [JsonPropertyName("unmapped_users")]
    public List<AiWalletMigrationDryRunUnmappedUserRow> UnmappedUsers { get; set; } = [];

    [JsonPropertyName("shops_without_owner")]
    public List<AiWalletMigrationDryRunShopOwnerGapRow> ShopsWithoutOwner { get; set; } = [];
}

public sealed class AiWalletMigrationDryRunUnmappedUserRow
{
    [JsonPropertyName("user_id")]
    public Guid UserId { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("is_owner")]
    public bool IsOwner { get; set; }
}

public sealed class AiWalletMigrationDryRunShopOwnerGapRow
{
    [JsonPropertyName("shop_id")]
    public Guid ShopId { get; set; }

    [JsonPropertyName("shop_code")]
    public string ShopCode { get; set; } = string.Empty;

    [JsonPropertyName("manager_candidates")]
    public List<string> ManagerCandidates { get; set; } = [];
}

public sealed class AiWalletMigrationDryRunAcceptance
{
    [JsonPropertyName("owner_mapping_ready")]
    public bool OwnerMappingReady { get; set; }

    [JsonPropertyName("wallet_variance_zero")]
    public bool WalletVarianceZero { get; set; }

    [JsonPropertyName("wallet_consolidation_ready")]
    public bool WalletConsolidationReady { get; set; }

    [JsonPropertyName("is_ready_for_cutover")]
    public bool IsReadyForCutover { get; set; }
}

public sealed class AiWalletMigrationDryRunArtifacts
{
    [JsonPropertyName("persisted")]
    public bool Persisted { get; set; }

    [JsonPropertyName("extract_report_path")]
    public string? ExtractReportPath { get; set; }

    [JsonPropertyName("transform_report_path")]
    public string? TransformReportPath { get; set; }

    [JsonPropertyName("reconcile_report_path")]
    public string? ReconcileReportPath { get; set; }

    [JsonPropertyName("go_no_go_path")]
    public string? GoNoGoPath { get; set; }
}
