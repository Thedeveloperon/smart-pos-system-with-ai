# Security Upgrade Tracker

Last updated: 2026-04-01

Purpose: track the security hardening roadmap for device identity, license binding, API proof-of-possession, token replay protection, offline controls, and endpoint abuse detection.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed

## Phase 0: Baseline Inventory (Current State)

- [x] Signed license tokens with server-side verification are implemented.
- [x] License enforcement middleware blocks protected actions by state.
- [x] Seat limits per shop are enforced.
- [x] JWT auth is already stored in HttpOnly cookie.
- [x] Offline cache includes client clock rollback detection.
- [x] Device identity is key-bound with WebCrypto non-exportable keys.
- [x] Sensitive mutation APIs require nonce + per-request device signatures.
- [x] License token replay protection via server-side `jti` tracking is implemented.

## Phase 1: Device Key Registration + Key-Bound License Issuance (Immediate)

### Backend

- [x] Add key-binding columns to `provisioned_devices`:
- [x] `DeviceKeyFingerprint`
- [x] `DevicePublicKeySpki`
- [x] `DeviceKeyAlgorithm`
- [x] `DeviceKeyRegisteredAtUtc`
- [x] Add schema updater changes for both SQLite and Postgres.
- [x] Add `POST /api/provision/challenge` for nonce issuance (short TTL, one-time use).
- [x] Extend `POST /api/provision/activate` contract:
- [x] `key_fingerprint`
- [x] `public_key_spki`
- [x] `challenge_id`
- [x] `challenge_signature`
- [x] Verify challenge signature against provided public key.
- [x] Bind device license to `shop_id + device_code + key_fingerprint`.
- [x] Include `device_key_fingerprint` in signed license token payload.
- [x] Validate token/device key fingerprint match during status + heartbeat checks.
- [x] Add feature flag to allow temporary legacy activation fallback during rollout.

### Frontend

- [x] Add WebCrypto identity module (non-exportable private key).
- [x] Store key pair handle in IndexedDB (not localStorage).
- [x] Export public key SPKI and compute `SHA-256` fingerprint.
- [x] Register/activate using challenge signature flow.
- [x] Replace random localStorage-only device id generation with key-derived device identity.
- [x] Keep backward-compatible fallback path until backend flag is disabled.

### Tests

- [x] Integration: activate with valid challenge + signature succeeds.
- [x] Integration: replayed challenge is rejected.
- [x] Integration: mismatched fingerprint/signature is rejected.
- [x] Integration: key mismatch on heartbeat/status fails with machine-readable code.

### Acceptance Criteria

- [x] A stolen `device_code` alone is insufficient to activate or impersonate a provisioned device.
- [x] License token cannot be reused from a different device key.

## Phase 2: Sensitive API Proof-of-Possession

- [x] Protect `checkout`, `refund`, and admin mutation routes with nonce challenge + device signature.
- [x] Add server nonce store with TTL and one-time consumption.
- [x] Require signed canonical request payload (method + path + body hash + nonce + timestamp).
- [x] Enforce drift window and reject stale/future timestamps.
- [x] Log signature verification failures with code + endpoint metadata.
- [x] Add integration coverage for valid, replayed, and tampered signed requests.

## Phase 3: Short-Lived Tokens + Rotation + Replay Protection

- [x] Move license/access token lifetime to 10-15 minutes.
- [x] Add explicit token rotation flow with overlap window.
- [x] Add token `jti` and store active/revoked ids server-side.
- [x] Reject replayed or revoked `jti` values.
- [x] Add cleanup job for expired `jti` records.
- [x] Add load test for high-frequency heartbeat + token rotation.

## Phase 4: Anomaly Detection and Abuse Signals

- [x] Capture IP + user-agent metadata for auth, activation, heartbeat, and sensitive actions.
- [x] Add rule: impossible travel / unusual geo or ASN shifts per account/device.
- [x] Add rule: same account across unusual concurrent device behavior.
- [x] Add rule: repeated invalid signature attempts by source.
- [x] Emit alerts + counters for support/security dashboard triage.

## Phase 5: Offline Mode Hardening

- [x] Introduce signed offline grant token (24-72 hour max).
- [x] Enforce strict hard expiry of offline grant.
- [x] Force online revalidation after offline grant expiry.
- [x] Keep and strengthen clock rollback detection with server-time delta checks.
- [x] Define explicit policy for max offline checkout operations per grant window.
- [x] Add offline abuse tests (rollback, expired grant, stale signature).

## Phase 6: Storage Hardening + Desktop Track

- [x] Minimize sensitive token use in localStorage.
- [x] Move license token transport to HttpOnly cookie where feasible.
- [x] Add SameSite/Secure policy hardening for production.
- [x] Document optional desktop hardening track (Tauri/Electron + OS keychain/TPM-backed keys).
- [x] Define migration plan from browser PWA key storage to desktop key storage.

## Verification Checklist

- [x] Backend tests pass (`dotnet test`).
- [x] Frontend tests pass (`npm test`).
- [x] Lint/build pass for frontend and backend.
- [x] Manual QA: fresh activation, heartbeat renewal, revoke/reactivate, offline recovery (evidence: `SECURITY_MANUAL_QA_2026-04-01.md`).
- [x] Manual QA: tampered signature, challenge replay, token replay, clock rollback (evidence: `SECURITY_MANUAL_QA_2026-04-01.md`).

## Risks and Notes

- [x] Legacy-client rollout risk mitigated with `RequireDeviceKeyChallenge` and frontend compatibility fallback path.
- [x] Browser WebCrypto key persistence risk accepted for this environment; Chrome desktop/mobile validation is complete, and dedicated Edge-host validation is deferred as follow-up.
- [x] Production secret-hygiene gap closed by env-var-first secret resolution (`SMARTPOS_JWT_SECRET`, `SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY`, `SMARTPOS_BILLING_WEBHOOK_SIGNING_SECRET`) and empty production config defaults.

## Change Log

- 2026-04-01: Initial tracker created for security hardening program.
- 2026-04-01: Phase 1 implemented (device key registration and key-bound license issuance).
- 2026-04-01: Phase 2 implemented (sensitive API nonce + device signature proof-of-possession).
- 2026-04-01: Phase 3 implemented except load testing (10-15 minute TTL, jti rotation overlap, replay protection, cleanup service).
- 2026-04-01: Phase 3 load test added for rapid heartbeat token rotation using latest token handoff.
- 2026-04-01: Phase 4 baseline telemetry added (auth/activation/heartbeat/sensitive-action source metadata) and support triage anomaly summaries (`sensitive_action_proof_failures_in_window`, top failure sources, unusual device source-change counts).
- 2026-04-01: Phase 4 anomaly detection completed with auth impossible-travel/concurrent-device signals, security anomaly spike alerting, and expanded support triage counters/top causes.
- 2026-04-01: Installed .NET 8 SDK locally (`~/.dotnet8`) and verified full backend integration suite (`62/62`) plus frontend unit tests (`13/13`) pass.
- 2026-04-01: Phase 5 completed with signed offline grants (24-72h), strict expiry + forced revalidation, and stronger offline cache tamper/clock-drift checks with abuse tests.
- 2026-04-01: Phase 6 completed with license-token HttpOnly cookie transport, reduced localStorage token usage, production cookie hardening, and desktop hardening migration document (`DESKTOP_HARDENING_TRACK.md`).
- 2026-04-01: `/api/sync/events` now enforces offline grant presence/validity for offline `sale` and `refund` events and applies per-grant checkout/refund operation caps.
- 2026-04-01: Frontend sync client now supports `/api/sync/events` with automatic offline-grant token prefetch for `sale`/`refund` batches and user-friendly mapping of sync rejection machine messages.
- 2026-04-01: Added frontend unit coverage for sync client/grant prefetch/message mapping; frontend tests passing at `19/19`.
- 2026-04-01: Added frontend IndexedDB offline sync queue primitives (enqueue/list/summary/flush with retry backoff), plus POS auto-flush on startup/online/interval and manual sync trigger in header.
- 2026-04-01: Added manual QA evidence document (`SECURITY_MANUAL_QA_2026-04-01.md`) and validated activation/heartbeat/revoke-reactivate/offline-recovery plus tamper/replay/clock-rollback scenarios.
- 2026-04-01: Hardened production secrets by resolving JWT, license encryption, and webhook signing secrets from environment variables first; production config now ships with blank secret values.
- 2026-04-01: Closed final tracker item by accepting/deferring Edge-host WebCrypto persistence validation follow-up (Chrome desktop/mobile validation already complete).
