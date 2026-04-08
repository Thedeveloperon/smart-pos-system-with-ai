# POS Cloud/Local Split Frontend Development Guide (v2)

Last updated: 2026-04-08  
Backend baseline: W3 reliability + W4 offline trust + W9 portal security hardening + W10 release trust chain + W11 AI privacy governance

## 1. Scope

This guide defines frontend behavior required by current backend implementation for:

- Protected cloud write reliability contract (idempotency and request identity)
- Offline trust policy snapshot enforcement for protected feature writes
- Portal auth lockout, active session management, and revoked-session handling
- Release channel metadata consumption and minimum-supported update handling

## 2. Protected write headers (existing W3 contract)

For protected cloud write routes, frontend must send:

- `Idempotency-Key`
- `X-Device-Id`
- `X-POS-Version`

Validation errors:

- `IDEMPOTENCY_KEY_REQUIRED`
- `DEVICE_ID_REQUIRED`
- `POS_VERSION_REQUIRED`

If the backend replays a previous successful write, it returns:

- `X-Idempotency-Replayed: true`

Treat replayed success as normal success. Do not duplicate UI side effects.

## 3. New W4 policy snapshot contract

`GET /api/license/status` now includes:

- `policy_snapshot_token`
- `policy_snapshot_expires_at`

For protected feature write routes (currently configured with `/api/checkout` in strict mode), frontend must include:

- `X-License-Policy-Snapshot: <policy_snapshot_token>`
- Optional: `X-License-Policy-Client-Time: <ISO-8601 UTC time>`

Backend denial codes:

- `POLICY_SNAPSHOT_REQUIRED`
- `POLICY_SNAPSHOT_INVALID`
- `POLICY_SNAPSHOT_EXPIRED`
- `POLICY_SNAPSHOT_CLOCK_SKEW`
- `POLICY_SNAPSHOT_STALE`

## 4. Frontend request flow for protected feature writes

1. Resolve latest cached license status.
2. If `policy_snapshot_token` missing or expired, refresh using `GET /api/license/status`.
3. Execute protected write with:
   - auth/session token
   - W3 headers (`Idempotency-Key`, `X-Device-Id`, `X-POS-Version`)
   - W4 header (`X-License-Policy-Snapshot`)
   - optional `X-License-Policy-Client-Time`
4. On policy snapshot errors, perform one forced status refresh and one retry.
5. If still denied, lock protected actions and show actionable UI message.

## 5. UI behavior for lock scenarios

When backend returns policy snapshot errors:

- `POLICY_SNAPSHOT_REQUIRED` or `POLICY_SNAPSHOT_INVALID`:
  - show "Protected action requires license refresh."
- `POLICY_SNAPSHOT_EXPIRED`:
  - show "License policy snapshot expired. Reconnect and refresh license."
- `POLICY_SNAPSHOT_CLOCK_SKEW`:
  - show "System time differs from server time. Correct device clock."
- `POLICY_SNAPSHOT_STALE`:
  - show "License policy changed. Refresh required before protected actions."

In all cases:

- Keep core non-protected views usable
- Lock protected actions only (checkout/refund/AI protected writes, based on backend config)

## 6. Role behavior required in frontend

Backend role policy for AI endpoints is owner/manager only. Cashier is denied.

Frontend requirements:

- Hide AI wallet/AI top-up/AI chat entry points for cashier sessions.
- If cashier reaches AI API routes via direct calls, show access denied state (do not retry).
- Do not render AI billing history controls for cashier role.

## 7. Client implementation checklist

- [ ] Central API wrapper injects W3 headers on protected cloud writes
- [ ] License status model includes `policy_snapshot_token` and expiry
- [ ] Protected-feature write wrapper injects `X-License-Policy-Snapshot`
- [ ] Optional client-time header uses UTC ISO-8601 (`new Date().toISOString()`)
- [ ] One-refresh-one-retry policy implemented for snapshot failures
- [ ] UI lock state for protected features implemented with clear error mapping
- [ ] Cashier role UI exclusions implemented for AI areas
- [ ] Idempotency key lifecycle remains per user intent

## 8. QA acceptance checklist

1. Protected write without snapshot header returns `403 POLICY_SNAPSHOT_REQUIRED`.
2. Protected write with tampered snapshot returns `403 POLICY_SNAPSHOT_INVALID`.
3. Protected write with skewed client time returns `403 POLICY_SNAPSHOT_CLOCK_SKEW`.
4. Protected write with expired snapshot returns `403 POLICY_SNAPSHOT_EXPIRED`.
5. Protected write with valid snapshot passes license middleware (then route-level validation applies).
6. Cashier receives `403` on `/api/ai/insights`.
7. Cashier receives `403` on `/api/ai/wallet`.
8. Cashier receives `403` on `/api/ai/chat/sessions`.

## 9. Reference backend files

- `backend/Features/Licensing/LicenseService.cs`
- `backend/Security/LicenseEnforcementMiddleware.cs`
- `backend/Features/Licensing/LicenseContracts.cs`
- `backend/Security/CloudWriteRequestContract.cs`
- `backend/Security/CloudWriteReliabilityMiddleware.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingOfflinePolicySnapshotTests.cs`

## 10. W9 portal security behavior

Login lockout policy:
- lockout is enabled after repeated failed login attempts within configured window
- backend returns `400` with a lockout message when account is temporarily locked

Session management APIs:
- `GET /api/auth/sessions`: list current and other active/revoked device sessions
- `POST /api/auth/sessions/{device_code}/revoke`: revoke specific session/device
- `POST /api/auth/sessions/revoke-others`: revoke all sessions except current

Revoked-session enforcement:
- backend middleware returns `401` with:
  - `AUTH_SESSION_INVALID` when token session claims are malformed
  - `AUTH_SESSION_REVOKED` when session version no longer matches server record
- backend deletes auth cookie on revoked-session denial

Frontend requirements:
- route suspicious-login UI to session management page and allow owner/manager to revoke sessions
- on `401 AUTH_SESSION_REVOKED`, clear local auth state immediately and route to login with message
- on lockout response, show lockout notice and suppress repeated rapid retries

## 11. W10 release trust-chain frontend behavior

New read endpoints:
- `GET /cloud/v1/releases/latest?channel=<stable|beta|internal>`
- `GET /cloud/v1/releases/min-supported?channel=<stable|beta|internal>`

Recommended frontend flow:
1. resolve active update channel (`stable` default)
2. fetch `/cloud/v1/releases/min-supported`
3. compare local POS version with `minimum_supported_pos_version`
4. if local version below minimum, mark update as required
5. fetch `/cloud/v1/releases/latest` for installer URL and release metadata

Error handling:
- `RELEASE_CHANNEL_NOT_FOUND` (`404`): fallback to `stable`
- `RELEASE_TRUST_METADATA_INCOMPLETE` (`503`): block update download UI and show service warning

UI requirements:
- show channel badge (`stable`, `beta`, `internal`) near update card
- show latest version + min-supported version together
- if update required, prevent protected cloud writes that are already gated by minimum version policy

## 12. W11 AI privacy governance frontend behavior

New read endpoint:
- `GET /cloud/v1/meta/ai-privacy-policy`

Recommended frontend use:
1. fetch policy at app bootstrap (or on settings page load)
2. display retention windows in owner/admin privacy UI
3. display provider payload allowlist in developer/support diagnostics UI
4. do not assume AI history payload availability after retention windows; show fallback empty-state messaging

UI guidance:
- when AI replay/history item has no response payload, show: "Payload no longer available due to retention policy."
- do not expose raw provider error bodies in UI; rely on backend-sanitized message fields
