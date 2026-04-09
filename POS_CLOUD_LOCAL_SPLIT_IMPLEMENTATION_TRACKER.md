# POS Cloud/Local Split Implementation Tracker

Last updated: 2026-04-08
Program owner: Architecture and Platform Team

## Goal and Locked Decisions

Goal:
- Deliver cloud/local split architecture with safe migration, deterministic offline enforcement, secure device and AI governance, and controlled rollout.

Locked decisions:
- AI credits are tenant-wide shared wallet.
- Device limits are tenant cap with branch allocation.
- Offline stale or invalid policy triggers protected-feature lock.
- Installer is production primary runtime; PWA is fallback.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked

## Readiness Gates

- [x] Gate A: Migration dry-run pass
- [x] Gate B: Reliability and security baseline pass
- [ ] Gate C: Pilot readiness pass
- [ ] Gate D: Production readiness pass

## Workstreams

## W1 Migration and Cutover

Status: [x]  
Owner: Backend lead + DB engineer  
Dependencies: None  
Start date: 2026-04-08  
Target date: 2026-04-22  
Risks: Owner identity mapping collisions; wallet ledger mismatch; device state drift  
Acceptance criteria:
- source-to-target mapping spec approved
- staging dry-run report with reconciled counts and balances
- rollback and re-run protocol tested
Evidence links:
- `POS_CLOUD_LOCAL_ARCHITECTURE_GAP_AND_IMPLEMENTATION_PLAN_2026-04-08.md`
- `POS_CLOUD_LOCAL_SPLIT_MIGRATION_SPEC_AND_DRY_RUN_CHECKLIST.md`
- `W1_STAGING_DRY_RUN_EVIDENCE_2026-04-08.md`
- `backend/Features/Licensing/LicensingMigrationDryRunService.cs`
- `backend/Features/Licensing/LicensingMigrationDryRunContracts.cs`
- `backend/Features/Licensing/LicenseEndpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingMigrationDryRunTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/DbSchemaUpdaterAiInsightsSchemaTests.cs`
- `backend/artifacts/migration/manual-dryrun-2346bbb1bb1f4434a33a8f8eef18c03f/`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingOwnerMappingRemediationTests.cs`
- `backend/artifacts/migration/manual-dryrun-e1e4a98337804257b183fe070d32ea21/`
- `artifacts/migration/staging-dryrun-22e8830543b9458badca7e2043c2d604/`

## W2 Local Backup and Recovery

Status: [x]  
Owner: POS runtime lead  
Dependencies: W1 data mapping assumptions  
Start date: 2026-04-10  
Target date: 2026-04-24  
Risks: Backup integrity failures; restore complexity in store operations  
Acceptance criteria:
- automated backup schedule implemented
- restore workflow and runbook validated
- RPO and RTO drill completed
Evidence links:
- `BACKUP_DR_RUNBOOK.md`
- `POS_CLOUD_LOCAL_SPLIT_LOCAL_BACKUP_RESTORE_RECOVERY_SPEC.md`
- `backend/Features/Recovery/RecoveryOpsOptions.cs`
- `backend/Features/Recovery/RecoveryOpsService.cs`
- `backend/Features/Recovery/RecoverySchedulerService.cs`
- `backend/Features/Recovery/RecoveryDrillAlertService.cs`
- `backend/Features/Recovery/RecoveryDrillHealthEvaluator.cs`
- `backend/Features/Recovery/RecoveryEndpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/RecoveryEndpointsTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/RecoverySchedulerServiceTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/RecoveryDrillAlertServiceTests.cs`
- `W2_STAGING_RESTORE_DRILL_EVIDENCE_2026-04-08.md`
- `artifacts/tmp/w2-recovery-api/`

## W3 Cloud API Reliability (Idempotency, Retry, Reconcile)

Status: [x]  
Owner: API lead  
Dependencies: W1 identifiers and mapping keys  
Start date: 2026-04-10  
Target date: 2026-04-21  
Risks: Duplicate side effects under unstable network conditions  
Acceptance criteria:
- all cloud write APIs require idempotency key
- replay returns original result without duplicate writes
- orphan AI authorization reconciliation job deployed
Evidence links:
- `POS_CLOUD_LOCAL_ARCHITECTURE_GAP_AND_IMPLEMENTATION_PLAN_2026-04-08.md`
- `POS_CLOUD_LOCAL_SPLIT_CLOUD_API_IDEMPOTENCY_RETRY_CONTRACT.md`
- `backend/Security/CloudWriteReliabilityMiddleware.cs`
- `backend/Features/Ai/AiAuthorizationReconciliationService.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudWriteReliabilityMiddlewareTests.cs`

## W4 Offline Trust Model

Status: [x]  
Owner: Backend architect + security reviewer  
Dependencies: W3 contract and token format  
Start date: 2026-04-12  
Target date: 2026-04-26  
Risks: Clock tamper bypass, stale policy abuse, false lockouts  
Acceptance criteria:
- signed snapshot schema and verification rules implemented
- clock skew and rollback handling tested
- deterministic protected-feature lock behavior verified
Evidence links:
- `DESKTOP_LICENSE_ARCHITECTURE_DECISIONS_2026-04-07.md`
- `backend/Features/Licensing/LicenseService.cs`
- `backend/Security/LicenseEnforcementMiddleware.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingOfflinePolicySnapshotTests.cs`

## W5 Role and Permission Matrix

Status: [x]  
Owner: Product owner + backend lead  
Dependencies: W1 tenant and branch model  
Start date: 2026-04-12  
Target date: 2026-04-19  
Risks: Conflicting authority between local and cloud contexts  
Acceptance criteria:
- authority matrix approved
- cashier AI denial enforced in UI and API
- portal and POS permission behavior documented
Evidence links:
- `ACCOUNT_AI_CREDITS_TOPUP_IMPLEMENTATION_TRACKER.md`
- `ROLE_AUTHORITY_MATRIX_2026-04-08.md`
- `backend/Features/Ai/AiSuggestionEndpoints.cs`
- `backend/Features/AiChat/AiChatEndpoints.cs`
- `backend/Features/Licensing/LicenseEndpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AiInsightsCreditFlowTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AiChatFlowTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingRoleMatrixPolicyTests.cs`

## W6 Observability and Audit

Status: [x]  
Owner: DevOps + backend lead  
Dependencies: W3 API events, W4 policy events  
Start date: 2026-04-14  
Target date: 2026-04-28  
Risks: Missing diagnostics during pilot incidents  
Acceptance criteria:
- event catalog implemented
- alert thresholds configured
- support diagnostics checklist validated
Evidence links:
- `DESKTOP_LICENSE_SUPPORT_RUNBOOK.md`
- `backend/Features/Reports/ReportService.cs`
- `backend/Features/Reports/ReportContracts.cs`
- `backend/Features/Recovery/RecoveryDrillAlertService.cs`
- `backend/Features/Licensing/OpsAlertPublisher.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/SupportTriageReportTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/OpsAlertPublisherTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/SupportAlertCatalogEndpointTests.cs`
- `OPS_ALERT_EVENT_CATALOG_2026-04-08.md`

## W7 Versioning and Compatibility

Status: [x]  
Owner: Backend architect  
Dependencies: W10 release metadata rules  
Start date: 2026-04-16  
Target date: 2026-04-25  
Risks: Old client breakage at rollout  
Acceptance criteria:
- `/cloud/v1/*` contract versioning finalized
- minimum-supported version behavior implemented
- deprecation communication window documented
Evidence links:
- `POS_CLOUD_LOCAL_ARCHITECTURE_GAP_AND_IMPLEMENTATION_PLAN_2026-04-08.md`
- `backend/Security/CloudApiVersionCompatibilityMiddleware.cs`
- `backend/Security/CloudApiCompatibilityOptions.cs`
- `backend/Security/CloudWriteRequestContract.cs`
- `backend/Security/CloudLegacyApiDeprecationMiddleware.cs`
- `backend/Features/Licensing/CloudV1Endpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudApiVersionCompatibilityMiddlewareTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudV1LicensingEndpointsTests.cs`
- `CLOUD_V1_VERSION_COMPATIBILITY_POLICY_2026-04-08.md`

## W8 Multi-branch Billing and Device Policy

Status: [x]  
Owner: Product owner + backend lead  
Dependencies: W1 migration model  
Start date: 2026-04-14  
Target date: 2026-04-23  
Risks: Branch quota misallocation; unclear transfer behavior  
Acceptance criteria:
- tenant wallet sharing policy enforced
- branch allocation and transfer rules documented
- seat enforcement deterministic for activation flow
Evidence links:
- `POS_CLOUD_LOCAL_ARCHITECTURE_GAP_AND_IMPLEMENTATION_PLAN_2026-04-08.md`
- `backend/Domain/Models.cs`
- `backend/Infrastructure/SmartPosDbContext.cs`
- `backend/Infrastructure/DbSchemaUpdater.cs`
- `backend/Features/Licensing/LicenseContracts.cs`
- `backend/Features/Licensing/LicenseEndpoints.cs`
- `backend/Features/Licensing/LicenseService.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingBranchSeatAllocationTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingFlowTests.cs`

## W9 Portal Security Hardening

Status: [x]  
Owner: Auth lead  
Dependencies: W1 owner identity migration  
Start date: 2026-04-15  
Target date: 2026-04-29  
Risks: brute force and session abuse on owner portal  
Acceptance criteria:
- login throttling and lockout policy enabled
- session and device revocation supported
- suspicious login and email change verification flow documented
Evidence links:
- `SECURITY_UPGRADE_TRACKER.md`
- `PORTAL_SECURITY_HARDENING_RUNBOOK_2026-04-08.md`
- `backend/Features/Auth/AuthService.cs`
- `backend/Features/Auth/AuthContracts.cs`
- `backend/Features/Auth/AuthEndpoints.cs`
- `backend/Security/AuthSessionRevocationMiddleware.cs`
- `backend/Security/AuthSecurityOptions.cs`
- `backend/Infrastructure/DbSchemaUpdater.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AuthSessionHardeningTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AuthAnomalyDetectionTests.cs`

## W10 Update and Release Trust Chain

Status: [x]  
Owner: Release engineer  
Dependencies: W7 version policy  
Start date: 2026-04-16  
Target date: 2026-04-30  
Risks: unsigned or downgraded installer distribution  
Acceptance criteria:
- release channel policy active (stable, beta, internal)
- installer signature and checksum verification in pipeline
- rollback policy validated
Evidence links:
- `installer/SmartPOS.iss`
- `UPDATE_RELEASE_TRUST_CHAIN_POLICY_2026-04-08.md`
- `backend/Security/CloudApiCompatibilityOptions.cs`
- `backend/Features/Licensing/CloudV1Endpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudApiVersionCompatibilityMiddlewareTests.cs`
- `scripts/build-installer.ps1`
- `scripts/verify-installer-trust-chain.ps1`

## W11 AI Privacy Governance

Status: [x]  
Owner: Product owner + backend lead  
Dependencies: W3 AI contract envelope  
Start date: 2026-04-18  
Target date: 2026-05-02  
Risks: over-collection or prolonged retention of sensitive data  
Acceptance criteria:
- AI payload allowlist and redaction policy approved
- retention periods configured and documented
- provider key handling remains cloud-only
Evidence links:
- `AI_PRIVACY_GOVERNANCE_POLICY_2026-04-08.md`
- `backend/Features/Ai/AiPrivacyGovernanceService.cs`
- `backend/Features/Ai/AiPrivacyRetentionCleanupService.cs`
- `backend/Features/Ai/AiInsightService.cs`
- `backend/Features/AiChat/AiChatService.cs`
- `backend/Features/Licensing/CloudV1Endpoints.cs`
- `backend/Features/Ai/AiInsightOptions.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AiPrivacyGovernanceTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudV1LicensingEndpointsTests.cs`

## W12 Support and Admin Overrides

Status: [x]  
Owner: Support ops + backend lead  
Dependencies: W6 event catalog and W9 auth hardening  
Start date: 2026-04-20  
Target date: 2026-05-04  
Risks: inconsistent manual interventions and audit gaps  
Acceptance criteria:
- runbooks for grace extension, wallet correction, device reset, fraud lock
- override actions produce immutable audit entries
- support on-call checklist approved
Evidence links:
- `DESKTOP_LICENSE_SUPPORT_RUNBOOK.md`
- `SUPPORT_ADMIN_OVERRIDE_PLAYBOOK_2026-04-08.md`
- `backend/Features/Licensing/LicenseEndpoints.cs`
- `backend/Features/Licensing/LicenseService.cs`
- `backend/Features/Licensing/LicenseContracts.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingFlowTests.cs`

## Execution Board

## Current sprint tasks

- [x] Update architecture doc to v2 with migration, backup, reliability, offline trust, and governance
- [x] Create this program tracker and lock program decisions
- [x] Draft migration mapping tables and dry-run checklist (W1)
- [x] Define idempotency policy and replay semantics by endpoint (W3)
- [x] Define local backup cadence and restore drill script scope (W2)
- [x] Implement cloud-write idempotency persistence and replay middleware on protected write routes (W3)
- [x] Enforce `Idempotency-Key`, `X-Device-Id`, and `X-POS-Version` contract for protected write routes (W3)
- [x] Add orphan AI authorization reconciliation background worker and validation tests (W3)
- [x] Implement signed policy snapshot issuance + protected-route validation with clock-skew checks and lock semantics (W4)
- [x] Implement W1 admin dry-run API for AI wallet migration mapping/reconciliation with optional batch artifact output
- [x] Convert Phase A specs into implementation tickets and assign owners
- [x] Execute first local W1 migration dry-run batch and persist artifact set (result: NO-GO due owner-mapping gap)
- [x] Implement W1 owner-mapping remediation API (super-admin), with integration tests and audit logging
- [x] Execute remediation and re-run W1 dry-run batch (result: GO with `is_ready_for_cutover=true`)
- [x] Execute staging-style W1 dry-run batch and persist full artifact set (result: GO with `is_ready_for_cutover=true`)
- [x] Implement W2 recovery orchestration backend APIs (`/api/admin/recovery/status`, `/preflight/run`, `/backup/run`, `/restore-smoke/run`) with idempotency enforcement on mutation paths
- [x] Add W2 integration coverage for manager access, cashier deny, idempotency header enforcement, and restore missing-backup failure behavior
- [x] Implement W2 scheduler automation service with configurable cadence and optional preflight-before-backup execution path
- [x] Implement W2 restore-drill metrics ingestion + alert wiring (RTO/RPO/staleness checks against `restore_metrics.jsonl`) and expose drill health in recovery status API
- [x] Execute W2 staging-style restore drill through backend recovery APIs and publish RPO/RTO evidence artifact
- [x] Implement W6 support-triage recovery drill panel and route recovery drill alerts into license audit stream (`recovery_drill_alert_raised`) for support diagnostics
- [x] Implement W6 ops notification webhook bridge (`Licensing:OpsAlerts`) and publish alert spikes/degraded recovery drill events to external ops channel
- [x] Publish W6 alert taxonomy/event catalog via API (`/api/reports/support-alert-catalog`) and operations markdown artifact
- [x] Start W7 by adding minimum supported POS version enforcement middleware and `/cloud/v1/meta/*` compatibility endpoints
- [x] Add W7 `/cloud/v1` operational aliases for onboarding (`/device/challenge`, `/device/activate`, `/device/deactivate`, `/license/status`, `/license/heartbeat`, `/license/feature-check`) and extend compatibility middleware coverage to cloud v1 write paths
- [x] Add W7 legacy `/api/*` licensing-route deprecation headers (`Deprecation`, `Sunset`, `Link`) and publish migration window in cloud v1 compatibility policy
- [x] Complete W8 tenant branch-seat policy implementation (branch allocations, activation branch quota enforcement, same-shop branch transfer rules, admin branch allocation endpoints, and integration coverage)
- [x] Complete W9 portal security hardening baseline (login lockout/throttle policy, auth session/device revocation APIs, session-revocation middleware enforcement, and suspicious-login/email-change runbook)
- [x] Complete W10 update trust-chain baseline (release-channel metadata endpoints, trust metadata enforcement, rollback policy contract, installer signing/checksum verification script, and installer build integration)
- [x] Complete W11 AI privacy governance baseline (payload allowlist filtering, sensitive-field redaction before provider/log/persistence, retention cleanup worker, and cloud privacy metadata contract endpoint)
- [x] Complete W12 support/admin override baseline (shop wallet correction API, device fraud-lock API, immutable manual-override audit coverage, and support override playbooks)
- [x] Finalize W5 role matrix with explicit policy evidence for owner/manager/cashier and admin-scope boundaries
- [x] Complete W6 alert taxonomy cleanup by publishing support-override security/billing event codes in API and ops catalog
- [x] Complete backend contract freeze review for frontend integration kickoff and publish frozen-scope artifact
- [x] Execute Gate C backend verification bundle and publish backend-vs-ops readiness split artifact
- [x] Publish comprehensive frontend development guide aligned to frozen backend contracts and current repo structure

## Next sprint queue

- Complete Gate C pilot ops/frontend validations using readiness split artifact (`GATE_C_PILOT_READINESS_STATUS_2026-04-08.md`)
- Execute pilot environment walkthrough: owner signup -> installer download -> device activation -> local first sale
- Run support dry-run with pilot escalation roster and override playbook rehearsal

## Blockers

- [ ] Final tenant and branch migration identifier strategy not finalized
- [ ] Cloud owner identity store schema not implemented
- [ ] POS secure secret-storage mechanism selection pending runtime hardening design

## Decision log

- 2026-04-08: AI wallet scope set to tenant-wide shared credits
- 2026-04-08: Device limit policy set to tenant cap with branch allocation
- 2026-04-08: Offline stale or invalid policy set to protected-feature lock
- 2026-04-08: Installer primary runtime, PWA fallback support path

## Change log

- 2026-04-08: Tracker created with 12 workstreams and readiness gates
- 2026-04-08: Program baseline entered into execution board
- 2026-04-08: Added Phase A migration spec, idempotency contract, and local recovery spec as formal artifacts
- 2026-04-08: Completed W3 reliability baseline implementation in backend (idempotency persistence/replay + protected write header enforcement + orphan AI reconciliation worker)
- 2026-04-08: Completed W4 offline trust baseline in backend (signed policy snapshot token issuance + protected route enforcement + clock-skew/expiry tests)
- 2026-04-08: Advanced W5 role enforcement verification with explicit cashier deny-path integration tests for AI insights, wallet, and AI chat endpoints
- 2026-04-08: Added W1 migration dry-run backend API for AI wallet cutover readiness (source snapshot, mapping blockers, per-shop variance reconciliation, and optional artifact files)
- 2026-04-08: Fixed SQLite startup schema path to always execute AI wallet shop-scope migration, added regression test, and executed first persisted local dry-run batch (`manual-dryrun-2346bbb1bb1f4434a33a8f8eef18c03f`) with NO-GO outcome due one shop without owner mapping
- 2026-04-08: Added W1 super-admin owner-mapping remediation API (`/api/admin/licensing/migration/owner-mapping/remediate`) with integration tests; remediated shop `mkt-sithija-communication-07a519` and produced GO dry-run batch `manual-dryrun-e1e4a98337804257b183fe070d32ea21` (`is_ready_for_cutover=true`)
- 2026-04-08: Implemented W2 recovery orchestration API surface and options binding (`RecoveryOps`) for preflight/backup/restore-smoke execution with explicit mutation idempotency-key enforcement; added integration tests for role gating and failure paths
- 2026-04-08: Added W2 recovery scheduler automation service (`RecoverySchedulerService`) with configurable interval/preflight behavior and integration tests validating run summaries in dry-run mode
- 2026-04-08: Added W2 restore-drill metrics evaluator and alert service (`RecoveryDrillAlertService`) to ingest `restore_metrics.jsonl`, detect stale/failed/breach states, emit anomalies through existing alert monitor, and surface `drill_health` via `/api/admin/recovery/status`
- 2026-04-08: Advanced W6 observability by adding recovery drill diagnostics to `/api/reports/support-triage` (`recovery_drill` panel + recovery-specific alert breakdown) and persisting drill alerts as license audit events (`recovery_drill_alert_raised`)
- 2026-04-08: Added W6 external ops alert delivery bridge via `Licensing:OpsAlerts` with webhook publisher (`OpsAlertPublisher`) and wired alert spike + recovery drill degraded notifications to outbound channel delivery
- 2026-04-08: Published W6 alert/event catalog as API surface (`/api/reports/support-alert-catalog`) and operations artifact (`OPS_ALERT_EVENT_CATALOG_2026-04-08.md`) with coded triage references
- 2026-04-08: Started W7 compatibility baseline with `CloudApi` minimum-client-version middleware, `/cloud/v1/health`, `/cloud/v1/meta/version-policy`, `/cloud/v1/meta/contracts`, and corresponding integration tests + policy doc
- 2026-04-08: Extended W7 with `/cloud/v1` operational alias endpoints for device/license lifecycle, added `cloud/v1` write-path coverage in cloud reliability/version middleware matching, and added integration tests for alias lifecycle + feature-check validation
- 2026-04-08: Completed W7 deprecation communication behavior for legacy `/api` licensing routes via `Deprecation`/`Sunset`/`Link` headers, surfaced deprecation-window fields in `/cloud/v1/meta/version-policy`, and added integration coverage
- 2026-04-08: Completed W8 multi-branch billing/device policy backend implementation with branch allocation persistence, activation seat enforcement by branch, same-shop branch transfer support, admin allocation APIs, and integration tests (`LicensingBranchSeatAllocationTests`)
- 2026-04-08: Completed W9 portal security hardening backend baseline with account lockout/throttled failed logins, session-version based device revocation, enforcement middleware for revoked sessions, auth session management endpoints, and operator runbook for suspicious-login/email-change verification flow
- 2026-04-08: Completed W10 update/release trust chain baseline with channelized release metadata (`stable`/`beta`/`internal`), `/cloud/v1/releases/latest` and `/cloud/v1/releases/min-supported` endpoints, trust metadata enforcement (`RELEASE_TRUST_METADATA_INCOMPLETE`), rollback policy guardrails, installer build signing hook support, and trust-chain verification script output manifest
- 2026-04-08: Completed W11 AI privacy governance baseline with explicit provider payload allowlist filtering, redaction service for provider/storage/log paths, retention cleanup worker for chat/insight payload lifecycle, and metadata endpoint `/cloud/v1/meta/ai-privacy-policy` with integration coverage
- 2026-04-08: Completed W12 support/admin override baseline with shop wallet correction endpoint (`/api/admin/licensing/shops/{shop_code}/ai-wallet/correct`), device fraud-lock endpoint (`/api/admin/licensing/devices/{device_code}/fraud-lock`), immutable audit-chain coverage for new override actions, and support/admin override playbooks
- 2026-04-08: Completed W5 role matrix finalization with documented authority matrix artifact and integration policy coverage for cashier denial and admin-scope endpoint separation
- 2026-04-08: Completed W6 alert taxonomy cleanup by expanding support alert catalog (`v2`) with support-override and fraud-lock event codes and updating operations catalog triage guidance
- 2026-04-08: Completed staging-style W1 migration dry-run batch `staging-dryrun-22e8830543b9458badca7e2043c2d604` with persisted extract/transform/reconcile/go-no-go artifacts and `is_ready_for_cutover=true`
- 2026-04-08: Completed W2 staging-style recovery drill run (`preflight` -> `backup` -> `restore-smoke`) with persisted evidence in `W2_STAGING_RESTORE_DRILL_EVIDENCE_2026-04-08.md` and `artifacts/tmp/w2-recovery-api/`; post-drill `drill_health.status=healthy`
- 2026-04-08: Fixed W2 path propagation and Windows-host execution gaps by aligning `RecoveryOpsService` backup/metrics environment overrides and adding path normalization + Python SQLite fallback in backup scripts
- 2026-04-08: Completed Gate B reliability/security baseline signoff with targeted integration baseline (`29 passed, 0 failed`) and published evidence in `GATE_B_RELIABILITY_SECURITY_BASELINE_SIGNOFF_2026-04-08.md`
- 2026-04-08: Completed backend contract freeze review for frontend kickoff; locked frontend-facing backend route surface, invariants, and verification evidence in `BACKEND_CONTRACT_FREEZE_REVIEW_2026-04-08.md` (`48 passed, 0 failed` targeted integration tests)
- 2026-04-08: Added Gate C pilot-readiness execution checklist covering onboarding, activation, first-sale path, AI role policy, offline/recovery, and support readiness in `GATE_C_PILOT_READINESS_CHECKLIST_2026-04-08.md`
- 2026-04-08: Executed Gate C backend verification test bundle (`92 passed, 0 failed`) and published backend-vs-ops readiness split in `GATE_C_PILOT_READINESS_STATUS_2026-04-08.md` with TRX evidence at `artifacts/tmp/gate-c-readiness/GateC-Pilot-Readiness.trx`
- 2026-04-08: Replaced frontend guide with comprehensive implementation document covering website + POS runtime execution against frozen contracts, role matrix, API semantics, test matrix, and known gaps in `POS_CLOUD_LOCAL_SPLIT_FRONTEND_DEVELOPMENT_GUIDE_2026-04-08.md`
- 2026-04-08: Migrated super-admin portal from POS runtime to website admin routes (`/admin/login`, `/admin`) with website proxy coverage for admin/report/AI/cash-session surfaces, preserved backend contracts, and hard-switched POS `/admin*` to website handoff (`ADMIN_PORTAL_WEBSITE_MIGRATION_TRACKER_2026-04-08.md`)
- 2026-04-09: Manual payment proof model switched to `reference_only` across marketing/admin/AI flows; `deposit_slip_url` removed from active API contracts, `/api/license/public/payment-proof-upload` disabled (`410 PAYMENT_PROOF_UPLOAD_DISABLED`), and website/admin invoice workflows updated to display reference-proof metadata instead of slip links.
