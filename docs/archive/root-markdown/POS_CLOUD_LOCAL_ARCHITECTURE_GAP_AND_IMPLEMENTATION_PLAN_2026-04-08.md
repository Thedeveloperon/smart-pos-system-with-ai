# POS Cloud + Local Split Architecture (v2)

Last updated: 2026-04-08

## 1. Scope and Locked Decisions

Definitions:
- Owner account = marketing website login
- Organization/business = one paying customer (tenant)
- Store/branch = one physical location
- Device/terminal = one POS installation
- Local POS users = cashier, manager, admin

Locked decisions:
- AI credits are tenant-wide (shared wallet across branches).
- Terminal limits are tenant cap with branch allocation quotas.
- Offline stale or invalid policy results in protected-feature lock.
- Installer is production primary; PWA is fallback.

## 2. Target Architecture and Boundaries

Cloud control plane (Render):
- owner identity, tenant billing, subscription state
- tenant/branch/device registry
- AI credits and centralized usage ledger
- release metadata and signed installer access
- audit, support, and admin controls

Local POS runtime:
- local POS backend and local POS database
- local users and local operations (sales, products, inventory, cashier sessions)
- device activation and periodic cloud validation client
- AI calls routed through cloud authorization and settlement

Data ownership:
- Local only: products, sales, inventory, cashier session, local credentials
- Cloud managed: owner account, licenses, subscription, AI credits, device records, downloads

## 3. Current-State Gap Summary

What already exists:
- marketing onboarding + account pages
- device challenge/activate/heartbeat flows
- shop-scoped AI wallet and ledger
- cashier blocked from `/api/ai/*`
- local packaging and installer build pipeline
- AI privacy baseline with payload redaction, allowlist filtering, and retention cleanup

Main gaps:
- owner identity still coupled to POS user domain
- no formal migration and cutover plan
- no formal idempotency and retry contract for cloud write APIs
- no formal offline signed-policy trust and tamper model
- no complete governance spec (versioning, observability, release trust, privacy, support overrides)

## 4. Migration and Cutover

Source to target mapping:
- `Users` owner records -> `OwnerAccount`
- `Shop` plus `StoreId` links -> `Tenant` plus default `Branch`
- current AI wallet and ledger -> cloud `AiWallet` and `AiLedger`
- `ProvisionedDevice` plus `LicenseRecord` -> cloud `DeviceRegistration` plus license snapshot

Migration stages:
1. Extract
- export source snapshot with consistent timestamp and row counts
2. Transform
- normalize owner identity to email login
- build tenant/branch graph
- map wallet balances and immutable ledger references
3. Import
- write into cloud schema with upsert keys and migration tags
4. Reconcile
- compare counts, sums, and cross-reference ids
- generate mismatch report
5. Cutover
- enable cloud reads and writes by feature flag sequence

Rollback and re-run protocol:
- keep monolith live until staging and pilot migration gates pass
- if cutover fails: disable cloud enforcement flags, keep local operations active
- re-run migration by migration batch id with idempotent upserts
- never delete source rows during first pass; use append plus mapping tables

Staging dry-run acceptance criteria:
- owner login continuity is 100 percent for migrated pilot tenants
- wallet balance variance is zero for pilot scope
- device registration and seat counts reconcile with source
- mismatch report has no unresolved critical items

Latest dry-run evidence:
- batch: `staging-dryrun-22e8830543b9458badca7e2043c2d604`
- outcome: `is_ready_for_cutover=true`
- artifacts: `artifacts/migration/staging-dryrun-22e8830543b9458badca7e2043c2d604/`

## 5. Backup and Recovery (Local POS)

Backup policy:
- automatic encrypted backup every 6 hours
- additional pre-upgrade backup before runtime updates
- retention: 14 daily plus 8 weekly backups

Restore workflow:
1. validate backup archive integrity
2. restore into quarantine database
3. run schema and business sanity checks
4. switch active local DB
5. re-run cloud heartbeat and device validation

Device replacement workflow:
- install runtime on new machine
- restore latest valid local backup
- reactivate device token against tenant license
- verify local users and last sales checkpoint

Recovery targets:
- RPO default <= 6 hours
- RTO default <= 60 minutes

Latest restore drill evidence:
- run: `W2 staging-style recovery drill` (2026-04-08)
- API flow: `/api/admin/recovery/preflight/run` -> `/backup/run` -> `/restore-smoke/run`
- result: restore status `completed`, post-drill health `healthy`
- measured: `rto_seconds=1`, `rpo_seconds=2`
- evidence: `W2_STAGING_RESTORE_DRILL_EVIDENCE_2026-04-08.md`

## 6. API Reliability Contract

Cloud write APIs require:
- `Idempotency-Key`
- `X-Device-Id`
- `X-POS-Version`

Idempotency scope:
- activation, token refresh, AI authorize, AI settle, AI refund, device deactivate, top-up settlement
- retention window: 72 hours
- replay returns original successful response without duplicate side effects

Retry policy:
- client exponential backoff: 1s, 3s, 9s, 27s, 60s
- max five attempts per request
- final failure routed to reconciliation queue for manual or automated recovery

Duplicate and orphan handling:
- duplicate activation must not consume extra seat
- duplicate settle/refund must not double charge or double refund
- reconciliation job closes orphaned authorized AI requests not settled within SLA

## 7. Offline Trust and Policy Enforcement

Signed policy snapshot fields:
- tenant_id, branch_id, device_id
- policy_version, issued_at, expires_at
- subscription_state, protected_features, grace_until
- signature_key_id and signature

Validation rules on POS:
- verify signature and key id trust chain
- verify `issued_at` and `expires_at`
- verify tenant/branch/device binding
- detect clock skew and rollback anomalies

Enforcement rules:
- invalid signature, expired snapshot, or major clock anomaly -> immediate protected-feature lock
- core checkout remains locally available unless hard-stop policy is explicitly enabled
- once reconnect succeeds, cloud state is authoritative immediately

## 8. Governance

### 8.1 Role Authority Matrix

- Cloud owner: billing, plan changes, device list, deactivate device, top-up, downloads
- Local manager: consume AI features, run local operations, no cloud billing admin actions
- Cashier: local operations only, no AI usage, no cloud wallet/device management
- Cloud support or billing admin: manual adjustments and overrides under audit

Reference artifact:
- `ROLE_AUTHORITY_MATRIX_2026-04-08.md`

### 8.2 Observability and Audit

Required event catalog:
- owner signup/login/reset
- device activate/deactivate and validation failures
- heartbeat failures and token refresh failures
- AI authorize approved or denied
- AI settle or refund
- version mismatch and unsupported client
- policy snapshot validation failures

Required alerts:
- activation failure spike
- heartbeat failure rate
- reconciliation backlog growth
- AI settlement error spike
- suspicious repeated activation attempts

### 8.3 API Versioning and Compatibility

- use `/cloud/v1/*` for all new cloud surfaces
- define minimum supported POS version in cloud metadata
- deprecation policy: 90-day notice before enforcement where feasible
- unsupported clients receive deterministic error contract with update action

### 8.4 Update Trust Chain Policy

- release channels: stable, beta, internal
- stable channel requires signed installer and checksum validation
- cloud release metadata enforces trust fields (`installer_download_url`, `installer_checksum_sha256`, `installer_signature_sha256`)
- release metadata APIs return deterministic errors for unknown channel and incomplete trust metadata
- forced updates only for critical security or protocol-compatibility issues
- rollback policy must always keep one previous stable release available
- installer build pipeline includes trust-chain verification step and manifest artifact output

### 8.5 AI Data Governance

- allowlist payload fields for AI requests from POS
- redact customer-sensitive fields before provider calls
- retention defaults: prompts and responses 30 days, billing and audit 365 days
- provider keys remain cloud-only; never stored in local runtime config

Implemented baseline:
- provider payload allowlist is explicit (`customer_question`, `verified_pos_facts_json`, `rules`, `output_language`)
- redaction runs before provider dispatch, before persistence, and for provider/body log previews
- default redaction rules include email, phone, separator-formatted card numbers, and explicit key/token assignments
- retention worker removes stale AI chat messages/conversations and redacts stale AI insight payload text while preserving billing/tokens metadata
- policy and retention contract is exposed at `GET /cloud/v1/meta/ai-privacy-policy`

### 8.6 Support and Admin Overrides

- manual grace extension with reason code and approver
- manual wallet correction with immutable ledger reference
- emergency device reset and fraud lock workflow
- every override must emit audit event with actor, reason, and before/after state

Implemented override APIs:
- `POST /api/admin/licensing/devices/{device_code}/extend-grace`
- `POST /api/admin/licensing/shops/{shop_code}/ai-wallet/correct`
- `POST /api/admin/licensing/devices/{device_code}/fraud-lock`
- `POST /api/admin/licensing/resync`

### 8.7 Runtime Support Matrix

- Installer: full production support and security hardening baseline
- PWA: fallback path with documented limits for offline durability, secret storage, and update behavior

## 9. Public API and Interface Changes

Versioned cloud endpoints:
- `POST /cloud/v1/auth/signup`
- `POST /cloud/v1/auth/login`
- `POST /cloud/v1/devices/activate`
- `POST /cloud/v1/devices/heartbeat`
- `POST /cloud/v1/devices/token/refresh`
- `POST /cloud/v1/license/validate`
- `POST /cloud/v1/features/check`
- `POST /cloud/v1/ai/authorize`
- `POST /cloud/v1/ai/settle`
- `POST /cloud/v1/ai/refund`
- `GET /cloud/v1/releases/latest`
- `GET /cloud/v1/releases/min-supported`
- `GET /cloud/v1/meta/ai-privacy-policy`

Portal session-security endpoints:
- `GET /api/auth/sessions`
- `POST /api/auth/sessions/{device_code}/revoke`
- `POST /api/auth/sessions/revoke-others`

Portal security enforcement:
- JWT includes per-device `auth_session_version`
- revocation increments device session version
- middleware rejects stale/revoked sessions with deterministic `401`

POS cloud-client obligations:
- include required headers on write calls
- idempotent retries with backoff
- classify failures as retriable vs final
- emit local audit event for cloud call failures

W8 branch-commercial policy endpoints:
- `GET /api/admin/licensing/shops/{shop_code}/branch-allocations`
- `PUT /api/admin/licensing/shops/{shop_code}/branch-allocations/{branch_code}`

W12 support override endpoints:
- `POST /api/admin/licensing/shops/{shop_code}/ai-wallet/correct`
- `POST /api/admin/licensing/devices/{device_code}/fraud-lock`
- `POST /api/admin/licensing/devices/{device_code}/transfer-seat` with optional `target_shop_code` and required `target_branch_code` for same-shop branch moves

W8 enforcement semantics:
- activation resolves `branch_code` and enforces both tenant seat limit and branch seat quota
- if branch quotas are enabled and no branch quota is available, activation fails with deterministic `SEAT_LIMIT_EXCEEDED`
- same-shop seat transfer is allowed only when target branch differs and target branch quota has capacity

## 10. Phased Execution and Gates

Phase A: Foundation controls
- migration spec and staging dry-run
- idempotency plus retry plus reconciliation
- backup plus restore runbook and drill

Phase B: Cloud/local protocol hardening
- signed snapshot verification and offline enforcement
- device token issue and refresh and revoke lifecycle
- role authority enforcement across portal and POS

Phase C: Platform governance
- API versioning and compatibility behavior
- observability dashboards and alert thresholds
- release trust chain controls

Phase D: Product completion
- multi-branch commercial enforcement behavior
- AI governance and retention and redaction
- support override playbooks

Phase E: Pilot and rollout
- pilot with reconciliation audits
- production cutover with rollback window

Readiness gates:
- Gate A: migration dry-run pass
- Gate B: reliability and security baseline pass
- Gate C: pilot readiness pass
- Gate D: production readiness pass

Latest gate outcomes:
- 2026-04-08: Gate A passed (`staging-dryrun-22e8830543b9458badca7e2043c2d604`, `is_ready_for_cutover=true`)
- 2026-04-08: Gate B passed (`29` targeted reliability/security integration tests passed; see `GATE_B_RELIABILITY_SECURITY_BASELINE_SIGNOFF_2026-04-08.md`)
- 2026-04-08: Frontend kickoff contract freeze completed; see `BACKEND_CONTRACT_FREEZE_REVIEW_2026-04-08.md`

## 11. Test and Acceptance Criteria

1. Migration dry-run reconciles owners, tenants, branches, wallets, and device registrations.
2. Replay requests do not double activate devices or double charge AI credits.
3. Backup and restore drill meets RPO and RTO targets.
4. Offline stale or invalid snapshot triggers deterministic protected-feature lock.
5. Cashier AI access is blocked in UI and API.
6. Older POS clients fail predictably under minimum-supported policy.
7. Installer signature and checksum verification pass in release flow.
8. Support can diagnose activation, license, and AI issues from logs without direct DB edits.
9. Branch quota enforcement blocks over-capacity activations and transfers with deterministic conflict responses.
10. Account lockout and session revocation paths are deterministic under repeated login failures and suspicious-session response workflows.
11. Release-channel metadata and installer trust-chain checks are deterministic for stable, beta, and internal channels.
12. AI payloads are redacted/allowlisted, and retention cleanup removes or redacts expired AI payload content deterministically.

## 12. Assumptions

- Current monolith stays live until migration gate passes.
- Existing local POS usernames and passwords remain unchanged.
- AI provider keys and billing controls stay cloud-only.
- Program tracking and status are managed in `POS_CLOUD_LOCAL_SPLIT_IMPLEMENTATION_TRACKER.md`.
