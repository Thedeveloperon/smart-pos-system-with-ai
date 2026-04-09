# Desktop Hardening Track

Last updated: 2026-04-01

## Goal

Provide a stronger security baseline than browser-only deployment by moving device private keys and sensitive token handling into OS-backed secure storage.

## Recommended Stack

- Shell/runtime: Tauri (preferred for smaller attack surface and package size) or Electron (fallback if existing ecosystem requirements demand it).
- UI: reuse existing frontend bundle.
- Backend API: unchanged HTTP contract.
- Secure key storage:
- macOS: Keychain
- Windows: DPAPI + TPM where available
- Linux: Secret Service / keyring

## Security Model Changes

1. Device private key is generated and stored by desktop runtime secure APIs and marked non-exportable.
2. License token transport remains HttpOnly cookie first; desktop runtime avoids exposing raw tokens to web storage.
3. Offline grant is cached in encrypted local storage managed by desktop runtime, not browser `localStorage`.
4. Device signatures for activation and sensitive actions are produced by native key APIs, reducing script-level key access risk.

## Migration Plan

1. Phase A: Compatibility shell
- Package current frontend inside Tauri/Electron.
- Keep all API contracts and auth/licensing behavior unchanged.
- Add runtime health telemetry for keychain availability and secure-store failures.

2. Phase B: Native key custody
- Move device identity generation/signing from browser WebCrypto IndexedDB to native secure key APIs.
- Keep browser implementation as fallback path behind feature flag during rollout.
- Add endpoint telemetry field indicating `key_storage_mode` (`browser` or `native`).

3. Phase C: Secure offline store
- Move offline grant cache from browser storage to encrypted native secure storage.
- Preserve rollback and drift detection metadata.
- Block launch into offline mode if secure store is unavailable.

4. Phase D: Enforced production policy
- Disable browser-key fallback in production tenant config.
- Require native key custody for activation, heartbeat, and sensitive mutations.
- Add support runbook for device recovery, key reset, and reactivation flow.

## Operational Notes

- Keep key reset as an audited admin operation because resetting key custody invalidates prior device binding.
- Roll out by tenant or shop cohort with feature flags and measured failure/error budgets.
- Require signed desktop builds and update-channel integrity checks before broad release.
