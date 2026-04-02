# Licensing Fraud Response Runbook

Last updated: 2026-04-02

Purpose: define operational steps for fraud/abuse handling in licensing and device-control flows.

## Trigger Conditions

Start this runbook when one or more of these are detected:
- repeated `sensitive_action_proof_failed` events from the same source fingerprint or IP prefix
- `auth_anomaly_impossible_travel` and `auth_anomaly_concurrent_devices` spikes
- repeated token replay (`TOKEN_REPLAY_DETECTED`) or invalid device signature failures
- manual billing second-approval conflicts or suspicious payment verification patterns

## Stage 1: Detect and Triage

1. Open support triage report (`/api/reports/support-triage`) for the last 30-60 minutes.
2. Capture affected shop/device IDs, source fingerprint(s), and top anomaly reasons.
3. Pull admin audit logs (`/api/admin/licensing/audit-logs`) filtered by affected device/shop.
4. Classify severity:
   - `sev-1`: active checkout abuse, account takeover indication, multi-device concurrent abuse
   - `sev-2`: suspicious but unconfirmed misuse
   - `sev-3`: low confidence alert/no customer impact

## Stage 2: Contain

Use super-admin emergency controls (no DB edits):
1. `lock_device` when active misuse must stop immediately.
2. `revoke_token` when session token compromise is suspected.
3. `force_reauth` when identity/session freshness must be re-established.
4. For branch-wide compromise, run `mass-revoke` with step-up approval.

Every manual override must include:
- `reason_code`
- `actor_note`
- step-up approver details for high-risk actions

## Stage 3: Verify

1. Re-run support triage report to confirm anomaly counters stabilize.
2. Confirm emergency command execution and manual overrides in immutable audit logs.
3. Check billing and subscription state for unintended regressions.
4. Contact customer and validate expected device inventory/branch ownership.

## Stage 4: Restore or Terminate

If legitimate customer:
1. Reactivate approved devices.
2. Transfer seats where needed.
3. Extend grace only with explicit reason and step-up approval for long extensions.

If confirmed abuse:
1. Keep affected devices revoked/locked.
2. Keep compromised token sessions revoked.
3. Set subscription to suspended/canceled per policy and legal direction.
4. Preserve audit export package for compliance and legal review.

## Evidence Package (Required)

Collect and attach:
- support triage snapshot (timestamped)
- exported audit logs (CSV/JSON)
- list of emergency command IDs executed
- payment verification/rejection evidence (if billing involved)
- customer communication summary
