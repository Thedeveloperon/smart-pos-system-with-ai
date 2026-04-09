# Support/Admin Override Playbook (W12)

Last updated: 2026-04-08

## Scope

This playbook defines controlled manual override actions for licensing and AI billing incidents:
- grace extension
- AI wallet correction
- device reset
- fraud lock

All actions must produce immutable manual override audit entries in `license_audit_logs`.

## Required Controls

1. Every override mutation call includes `Idempotency-Key`.
2. `reason_code` and `actor_note` are mandatory.
3. High-risk actions require step-up approval (`step_up_approved_by`, `step_up_approval_note`) when policy is enabled.
4. Ticket must contain pre-check evidence and post-check verification.

## Override Procedures

### A) Grace Extension
- Endpoint: `POST /api/admin/licensing/devices/{device_code}/extend-grace`
- Outcome: extends active license `grace_until`.
- Audit: `device_grace_extended`, `manual_override_extend_grace`.

### B) AI Wallet Correction
- Endpoint: `POST /api/admin/licensing/shops/{shop_code}/ai-wallet/correct`
- Required body: `delta_credits`, `reference`, `reason_code`, `actor_note`.
- Outcome: adds adjustment ledger entry for shop wallet; duplicate `reference` becomes no-op.
- Audit: `ai_wallet_corrected`, `manual_override_ai_wallet_correction`.

### C) Device Reset
- Endpoints:
  - `POST /api/admin/licensing/devices/{device_code}/deactivate`
  - `POST /api/admin/licensing/devices/{device_code}/activate` or `/reactivate`
  - optional `POST /api/admin/licensing/resync`
- Outcome: re-issues valid runtime state.
- Audit: `manual_override_device_deactivate`, `manual_override_device_activate`/`manual_override_device_reactivate`, optional `manual_override_force_resync`.

### D) Fraud Lock
- Endpoint: `POST /api/admin/licensing/devices/{device_code}/fraud-lock`
- Outcome: deactivates device and revokes active token sessions.
- Audit: `device_fraud_lock_applied`, `manual_override_fraud_lock_device`, `manual_override_fraud_lock_revoke_tokens`.

## Post-action Validation Checklist

1. Verify expected status response from endpoint.
2. Verify immutable hash chain fields (`is_manual_override`, `immutable_hash`, `immutable_previous_hash`) are present in audit log.
3. Confirm customer-visible state changed as intended:
- license or device status for grace/device/fraud actions
- updated AI wallet balance for wallet correction
