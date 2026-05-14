# Offline Local Licensing Refactor Feasibility Spec

## Summary

- Feasibility is **high** with the current architecture.
- The app already validates activation keys against the local backend DB and already supports encrypted-at-rest entitlement keys (`ProtectSensitiveValue`) in `LicenseService.cs`.
- The installed runtime already defaults to local backend + local SQLite in production profile (`Database.Provider=Sqlite`) in `appsettings.Production.json`.
- Main work is policy + flow refactor, not a ground-up licensing rewrite.

## Implementation Changes

### 1. Add an explicit offline licensing mode config and make it the default

- `Licensing:Mode = LocalOffline`
- `Licensing:RequireActivationEntitlementKey = true`
- `Licensing:CloudLicensingEndpointsEnabled = false`

### 2. Enforce key-required activation

- Update activation logic to reject activation when no key is provided.
- Remove the fallback activation path that currently allows activation without entitlement key.
- Keep runtime status validation and heartbeat, but only against local backend/local DB.

### 3. Implement manual batch generation of exactly 10 reusable codes

- Add a local-only admin batch operation for entitlement creation, reusing the existing encryption/hash pipeline.
- Provide a manual script that invokes batch generation and outputs:
  - Console output (plaintext keys shown once)
  - CSV output for secure handoff/archive
- Store generated keys in `customer_activation_entitlements` using existing encrypted key storage + hash index.
- Mark as reusable by assigning a very high activation limit and non-expiring or long-lived validity according to offline policy.

### 4. Disable cloud licensing and billing surface by default

- Gate `/api/license/public/*`, webhook/billing reconciliation subscription flows, and related cloud licensing entry points behind `CloudLicensingEndpointsEnabled`.
- Return clear disabled responses when the flag is off.

### 5. Create feasibility markdown deliverable

Add a document in `docs` using the proposed path below:

`OFFLINE_LOCAL_LICENSING_REFACTOR_FEASIBILITY.md`

The document should include:

- Architecture impact
- Risk matrix
- Rollout plan
- Operational runbook

## Public API / Interface Changes

- New backend config keys in `Licensing` options:
  - `Mode`
  - `RequireActivationEntitlementKey`
  - `CloudLicensingEndpointsEnabled`
- New batch-generation operation exposed for local admin automation (script-facing), returning generated code metadata and plaintext codes for one-time output.
- New script entrypoint for operators to:
  - Generate and store 10 codes
  - Write CSV
  - Print summary and usage instructions

## Test Plan

### Backend

- Activation fails when entitlement key is missing in `LocalOffline` mode.
- Activation succeeds with a generated local key.
- Generated keys are unique (`count = 10`), persisted, encrypted at rest, and hash-indexed.
- Reusable key can be used repeatedly without forced revocation.
- Cloud licensing endpoints return a disabled response when `CloudLicensingEndpointsEnabled = false`.

### POS App

- License status and heartbeat still operate with local backend.
- No dependency on Render/cloud licensing API for activation/status flow.

### Script

- Idempotency and guard behavior for repeated runs.
- CSV output correctness and secure file location behavior.

## Assumptions and Defaults (Locked)

- Scope: replace licensing flow with a local-first model with no Render/cloud licensing status dependency.
- Key policy: **10 reusable keys**
- Generation: **manual script-driven** (not auto-seed on startup)
- Script output: plaintext to **console + CSV**
- Cloud licensing APIs: **disabled by default via config**, not physically removed

## Implementation Checklist

Last updated: 2026-04-09

### Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked

### Phase 1: Config and Policy Flags

Status: [x]  
Owner: Backend

- [x] Add `Licensing:Mode` to options and configuration.
- [x] Add `Licensing:RequireActivationEntitlementKey` to options and configuration.
- [x] Add `Licensing:CloudLicensingEndpointsEnabled` to options and configuration.
- [x] Set defaults for offline-first policy in production profile.
- [x] Add startup validation for incompatible combinations (for example cloud relay enabled while cloud licensing endpoints are disabled).

Acceptance criteria:
- New flags are present in `LicenseOptions` and all appsettings profiles.
- Production defaults match locked assumptions.

### Phase 2: Activation Flow Hardening

Status: [x]  
Owner: Backend

- [x] Enforce entitlement key required when `Mode=LocalOffline` and `RequireActivationEntitlementKey=true`.
- [x] Remove keyless activation fallback path for new device activation.
- [x] Preserve existing seat and branch allocation checks after key validation.
- [x] Ensure activation error responses are deterministic for missing/invalid/expired/revoked keys.

Acceptance criteria:
- Activation request without key is rejected in offline mode.
- Activation with valid generated key succeeds and issues token/offline grant.

### Phase 3: Batch Generation for 10 Reusable Keys

Status: [x]  
Owner: Backend + Ops Script

- [x] Add backend batch generation operation for local admin use.
- [x] Generate exactly 10 unique keys in one run.
- [x] Persist each key with encrypted-at-rest storage and hash index.
- [x] Apply reusable policy (high activation limit + long-lived or non-expiring policy).
- [x] Ensure operation is idempotent/guarded (prevent accidental duplicate batches).

Acceptance criteria:
- Batch operation returns metadata and plaintext keys for one-time output.
- DB stores only protected key material plus hash index.

### Phase 4: Script Entrypoint and Operator UX

Status: [x]  
Owner: Ops Script

- [x] Add script entrypoint under `scripts/` for local operators.
- [x] Script invokes batch generation operation and prints summary.
- [x] Script writes CSV output to explicit secure path.
- [x] Script prints one-time handling instructions (store securely, do not reprint).
- [x] Script exits with non-zero code on partial failure.

Acceptance criteria:
- Operator can run one command and receive 10 keys + CSV + usage steps.
- Re-running script follows guard behavior and does not silently over-generate.

### Phase 5: Cloud Surface Gating

Status: [x]  
Owner: Backend

- [x] Gate `/api/license/public/*` behind `CloudLicensingEndpointsEnabled`.
- [x] Gate billing webhook endpoints behind `CloudLicensingEndpointsEnabled`.
- [x] Gate billing reconciliation and subscription/billing-provider mutation flows behind the same flag.
- [x] Gate cloud v1 licensing entry points if they remain in-process.
- [x] Return clear disabled payloads (`code`, `message`) when gated off.

Acceptance criteria:
- Cloud licensing/billing endpoints are disabled by default and return deterministic disabled responses.
- Local provisioning/status/heartbeat paths continue to function.

### Phase 6: POS and Portal Alignment

Status: [x]  
Owner: POS + Cloud Portal

- [x] Confirm POS activation UI always provides activation key in offline mode.
- [x] Update POS error copy for missing key and invalid key scenarios.
- [x] Ensure portal routes that depend on `/api/license/public/*` are feature-flag aware.
- [x] Add environment-level override strategy for hosted environments that still require cloud onboarding.

Acceptance criteria:
- Offline POS has no dependency on cloud licensing paths.
- Hosted portal behavior is explicit and non-breaking under disabled cloud licensing.

### Phase 7: Tests and Regression Coverage

Status: [x]  
Owner: Backend + POS

- [x] Add integration test: activation fails when key missing in offline mode.
- [x] Add integration test: activation succeeds with generated local key.
- [x] Add integration test: generated batch count is exactly 10 and all keys unique.
- [x] Add integration test: keys are encrypted-at-rest and hash-indexed in DB.
- [x] Add integration test: reusable key can be used repeatedly per policy.
- [x] Add integration test: cloud endpoints return disabled response when flag is false.
- [x] Update existing tests that currently assume keyless activation and always-on cloud v1/public endpoints.

Acceptance criteria:
- New and updated tests pass in CI.
- No unexpected regressions in licensing heartbeat/status paths.

### Phase 8: Rollout and Operational Readiness

Status: [~]  
Owner: Platform + Support

- [x] Update deployment docs with offline-local licensing defaults.
- [x] Add operator runbook for key generation, secure storage, and recovery.
- [x] Add support runbook entries for activation failures and key misuse.
- [!] Perform staged rollout: dev -> staging -> first production cohort. (requires live environment execution and approval gates)
- [x] Record rollback toggle path and validate it before production rollout.

Acceptance criteria:
- Operations can generate and distribute keys without engineering intervention.
- Support can resolve top failure modes using runbook only.

### Blockers to Resolve Before Full Rollout

Status: [x]  
Owner: Platform + Product

- [x] Confirm policy for "reusable" key activation limit and expiry period (exact numeric values).
- [x] Decide whether cloud portal payment onboarding remains active in some environments.
- [x] Decide cloud v1 deprecation behavior once cloud licensing endpoints are gated off.
- [x] Confirm secure storage location and retention policy for generated CSV files.

Decision notes:
- Hosted environments may keep cloud onboarding active only when `Licensing:CloudLicensingEndpointsEnabled=true` and (if needed) `Licensing:Mode=CloudCompatible`.
- In offline-local default mode, cloud v1 licensing entry points return deterministic disabled responses (`CLOUD_LICENSING_DISABLED`) instead of hard removal.
- Generated CSV files are written to restricted storage (`./secure/licensing` by default), retained for up to 90 days, then archived encrypted or securely deleted.
