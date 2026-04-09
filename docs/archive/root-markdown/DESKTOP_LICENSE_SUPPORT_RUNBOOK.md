# Desktop License Support Runbook

Scope: customer-facing incidents for hosted account access and local device activation.

## A) Customer Cannot Access `My Account`

### Symptoms
- Login fails on `/[locale]/account`.
- Session appears to log out immediately.
- Account page loads but license portal section is blocked.

### Triage Checklist
1. Confirm username and role from backend auth (`/api/auth/me` via website proxy `/api/account/me`).
2. Verify role is `owner` or `manager`.
3. Confirm cookie/session settings in production:
- `TokenCookieEnabled=true`
- `TokenCookieSecure=true`
- `TokenCookieSameSite=Lax`
4. Check website proxy response status and backend response body for:
- `401` session expired
- `403` role/authorization blocked
5. Confirm backend and marketing site clocks are synchronized.

### Fix Actions
1. If role is `cashier`, instruct customer to sign in using owner/manager account.
2. If session expired, clear cookies and sign in again.
3. If auth cookie not set, verify domain and HTTPS setup.
4. If repeated login failures, reset owner password via admin workflow.

### Customer Message Template
"Please sign in using your owner or manager account on the My Account page. Cashier accounts cannot manage license keys or devices."

## B) Customer Cannot Activate on Local Device

### Symptoms
- Activation fails with key errors.
- Device shows seat limit exceeded.
- Activation succeeded before but now fails on replacement device.

### Triage Checklist
1. Validate key via `/api/license/access/success`.
2. Confirm entitlement status is active and not expired/revoked.
3. Check activations used vs max activations.
4. Check current active seats from `/api/license/account/licenses`.
5. Confirm device code uniqueness and local system time.

### Fix Actions
1. If seat limit reached, deactivate old device from account portal.
2. If deactivation daily limit reached, perform admin override and document reason.
3. If key expired/revoked, issue a new entitlement after billing verification.
4. If installer link expired, refresh account page and generate new signed link.

## C) Evidence to Capture Before Escalation

1. Shop code and username.
2. Device code and local timestamp.
3. Error code/message shown to customer.
4. Last successful activation timestamp (if any).
5. Relevant audit actions:
- `activation_entitlement_issued`
- `self_service_device_deactivate`
- `marketing_installer_download_tracked`

## D) Escalation Conditions

Escalate to engineering if:
- Multiple shops fail login/activation within 15 minutes.
- Rate limit errors persist for valid usage.
- Signed installer links fail with valid non-expired token.

## E) Recovery Drill Diagnostics (W6)

Use support triage endpoint:
- `GET /api/reports/support-triage?window_minutes=30`
- `GET /api/reports/support-alert-catalog`

Recovery panel fields:
- `recovery_drill.status`: `healthy` or `degraded`
- `recovery_drill.issues`: current drill health issues (`restore_drill_stale`, `restore_drill_rto_breach`, etc.)
- `alerts.recovery_drill_alerts_in_window`: count of routed recovery drill alerts in selected window
- `alerts.top_recovery_drill_issues`: most frequent recovery drill issue reasons

Audit signal:
- `recovery_drill_alert_raised` events are written to license audit logs when drill monitor raises an alert.

Triage action:
1. If `restore_drill_stale`, schedule and run restore smoke immediately.
2. If `restore_drill_rto_breach` or `restore_drill_rpo_breach`, open reliability incident and attach latest metrics.
3. If `restore_drill_failed`, run restore smoke against latest valid backup and collect script output tail.

Alert taxonomy reference:
- `OPS_ALERT_EVENT_CATALOG_2026-04-08.md`

## F) Ops Channel Delivery Configuration

Webhook bridge is controlled by `Licensing:OpsAlerts`:
- `Enabled`
- `WebhookUrl`
- `Channel`
- `SourceSystem`
- `AuthHeaderName`
- `AuthScheme`
- `AuthTokenEnvironmentVariable` (preferred)
- `TimeoutSeconds`

Notes:
- Keep `AuthToken` empty in config and provide token via environment variable.
- When enabled, security and recovery alert spikes are pushed to the configured webhook in addition to API diagnostics and audit logs.

## G) Support Overrides Playbook (W12)

### 1) Grace Extension (Temporary Access Recovery)

Endpoint:
- `POST /api/admin/licensing/devices/{device_code}/extend-grace`

Required request fields:
- `reason_code`
- `actor_note`
- `extend_days`

High-risk behavior:
- When `extend_days` reaches high-risk threshold, `step_up_approved_by` and `step_up_approval_note` are mandatory.

Expected audit entries:
- `device_grace_extended`
- `manual_override_extend_grace` (`is_manual_override=true` with immutable hash chain)

### 2) AI Wallet Correction (Billing Reconciliation Fix)

Endpoint:
- `POST /api/admin/licensing/shops/{shop_code}/ai-wallet/correct`

Required request fields:
- `delta_credits` (positive or negative, non-zero)
- `reference` (idempotent correction reference)
- `reason_code`
- `actor_note`

Expected behavior:
- duplicate correction reference returns no-op status and does not apply delta twice
- balance cannot go below zero

Expected audit entries:
- `ai_wallet_corrected`
- `manual_override_ai_wallet_correction` (`is_manual_override=true` with immutable hash chain)

### 3) Device Reset Workflow (Support Recovery Path)

Primary actions:
1. `POST /api/admin/licensing/devices/{device_code}/deactivate`
2. `POST /api/admin/licensing/devices/{device_code}/activate` or `/reactivate`
3. optional tenant-wide token refresh: `POST /api/admin/licensing/resync`

Use cases:
- device replacement
- corrupted local token/session state
- post-incident reissue

Expected audit entries:
- `manual_override_device_deactivate`
- `manual_override_device_activate` or `manual_override_device_reactivate`
- optional `manual_override_force_resync`

### 4) Fraud Lock Workflow (Security Containment)

Endpoint:
- `POST /api/admin/licensing/devices/{device_code}/fraud-lock`

Required request fields:
- `reason_code`
- `actor_note`

High-risk behavior:
- step-up approval required when high-risk step-up policy is enabled

Effects:
- device is deactivated
- active token sessions revoked immediately

Expected audit entries:
- `device_fraud_lock_applied`
- `manual_override_fraud_lock_device`
- `manual_override_fraud_lock_revoke_tokens`

## H) On-call Override Checklist

Before executing any override:
1. Confirm tenant/shop and device identity from support ticket + audit search.
2. Confirm incident classification (`billing`, `recovery`, `security`, `fraud`).
3. Capture reason code and analyst note in the ticket first.

During override:
1. Use unique `Idempotency-Key` header.
2. Record API response payload and timestamp.
3. If step-up required, capture approver identity and approval note.

After override:
1. Verify immutable manual override audit entries exist.
2. Confirm customer-visible state (license status, wallet balance, or activation).
3. Close with remediation notes and any follow-up actions.
