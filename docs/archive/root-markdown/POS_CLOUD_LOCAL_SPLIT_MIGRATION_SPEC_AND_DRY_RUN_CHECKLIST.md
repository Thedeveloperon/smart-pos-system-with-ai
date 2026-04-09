# POS Cloud/Local Split Migration Spec and Dry-Run Checklist

Last updated: 2026-04-08
Owner: Backend lead + DB engineer

## 1. Objective

Migrate production data from current monolith model into cloud/local split with no owner lockout, no wallet drift, and no device-seat corruption.

## 2. Source to Target Mapping

Identity and tenancy:
- `Users` with owner role -> `OwnerAccount`
- `Shops` -> `Tenant`
- `StoreId` references -> `Branch` (default branch for first migration)

Billing and credits:
- `AiCreditWallets` -> `CloudAiWallet` (tenant-scoped)
- `AiCreditLedgerEntries` -> `CloudAiLedger` (preserve immutable reference and timestamp)
- `AiCreditPayments` -> `CloudAiPayments` with original provider ids

Licensing and devices:
- `ProvisionedDevices` -> `DeviceRegistration`
- `LicenseRecord` and latest effective state -> `DeviceLicenseSnapshot`
- `Subscription` -> `TenantSubscription`

Operational local data:
- products, inventory, sales, cashier sessions remain local and are not copied to cloud tenant domain.

## 3. Migration Stages

1. Extract
- capture consistent source snapshot
- record row counts and checksum per table
- record extract timestamp

2. Transform
- normalize owner identity to email login id
- build tenant and default branch graph
- resolve owner collisions:
  - same owner linked to same tenant -> merge mapping
  - same owner linked to different tenant -> block and manual resolution queue
- compute wallet expected balance from ledger for validation

3. Import
- import by deterministic upsert keys:
  - `tenant_key`
  - `owner_account_key`
  - `device_registration_key`
  - `ledger_entry_key`
- tag all imported rows with `migration_batch_id`

4. Reconcile
- reconcile counts, sums, and key relationships
- generate mismatch report:
  - missing owners
  - wallet variance
  - device-seat count mismatch
  - subscription-state mismatch

5. Cutover
- feature flag progression:
  - `CloudReadEnabled=true`
  - `CloudWriteEnabled=true`
  - `CloudEnforcementEnabled=true` (after pilot pass)

## 4. Rollback and Re-run

Rollback trigger conditions:
- owner login failure > threshold
- wallet variance > 0 for pilot tenants
- activation failures above baseline spike threshold

Rollback steps:
1. disable `CloudEnforcementEnabled`
2. disable `CloudWriteEnabled` for affected tenant batches
3. keep monolith local operations active
4. preserve failed batch artifacts for forensics

Re-run policy:
- every batch is idempotent by migration keys
- no destructive source deletes in initial migration waves
- rerun only failed tenant batches after fix

## 5. Staging Dry-Run Acceptance Criteria

- owner login continuity for pilot set = 100 percent
- wallet variance = 0 for migrated tenants
- active device count equals expected seat occupancy
- no unresolved critical mismatch in reconciliation report
- cutover flags toggled and reverted successfully in rehearsal

## 6. Dry-Run Execution Checklist

Pre-run:
- [ ] staging source snapshot created
- [ ] migration keys and batch id generated
- [ ] rollback path validated
- [ ] observability dashboard prepared

Run:
- [ ] extract completed with row count report
- [ ] transform completed with collision report
- [ ] import completed without fatal errors
- [ ] reconciliation report generated

Post-run:
- [ ] acceptance criteria reviewed
- [ ] signoff from backend lead and product owner
- [ ] go/no-go recorded for next wave

## 7. Artifacts Produced Per Run

- `migration_extract_report_<batch>.json`
- `migration_transform_report_<batch>.json`
- `migration_reconcile_report_<batch>.json`
- `migration_go_no_go_<batch>.md`

