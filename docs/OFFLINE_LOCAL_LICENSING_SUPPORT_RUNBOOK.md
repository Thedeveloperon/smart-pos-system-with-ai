# Offline Local Licensing Support Runbook

Last updated: 2026-04-09

## Scope

Use this runbook for stores operating in `LocalOffline` licensing mode where activation keys are generated locally and cloud licensing endpoints are disabled by default.

## Baseline policy

- Activation requires `activation_entitlement_key`.
- Cloud licensing surfaces are disabled by default (`CLOUD_LICENSING_DISABLED`).
- Keys are generated in manual batches of exactly `10`.

## Triage checklist (first response)

1. Confirm active backend config:
   - `Licensing:Mode=LocalOffline`
   - `Licensing:RequireActivationEntitlementKey=true`
   - `Licensing:CloudLicensingEndpointsEnabled=false`
2. Confirm device code from POS activation screen.
3. Confirm operator used a key from latest approved batch CSV.
4. Check licensing audit logs for the device/shop and entitlement source.

## Common activation failures

### `INVALID_ACTIVATION_ENTITLEMENT` with message `activation_entitlement_key is required`

- Cause: key not provided by client.
- Action:
  1. Re-enter activation key in POS activation screen.
  2. Confirm no whitespace-only value was submitted.
  3. Retry activation.

### `ACTIVATION_ENTITLEMENT_NOT_FOUND` or `activation_entitlement_key was not found`

- Cause: wrong key, typo, or key from unrelated environment.
- Action:
  1. Validate key format and source batch.
  2. Compare against current active batch CSV.
  3. If unknown key source, generate fresh batch and re-issue key.

### `activation_entitlement_key is revoked` / `expired`

- Cause: key lifecycle ended by policy or admin action.
- Action:
  1. Generate new offline batch.
  2. Distribute fresh key through secure channel.
  3. Record old key as invalid in incident notes.

## Reuse and misuse handling

If suspicious repeated usage appears:

1. Identify impacted entitlement IDs from audit logs.
2. Revoke affected keys via admin workflow (or supersede with new batch and stop sharing old keys).
3. Generate replacement batch and rotate distribution list.
4. Document scope:
   - affected shops/devices
   - time window
   - operator channel used

For fraud indicators, follow:
- `docs/archive/root-markdown/LICENSE_FRAUD_RESPONSE_RUNBOOK.md`

## `CLOUD_LICENSING_DISABLED` responses

- Expected in offline-local deployments.
- If cloud payment onboarding is intentionally required for a hosted environment:
  1. Temporarily set `Licensing:CloudLicensingEndpointsEnabled=true`.
  2. If needed, switch `Licensing:Mode=CloudCompatible`.
  3. Validate endpoint behavior, then time-box and revert.

## Key generation and CSV handling policy

- Generate keys only with:
  - `./scripts/licensing/generate-offline-activation-codes.sh`
- Store CSV under restricted path (`chmod 600` effective).
- Retention:
  - operational copy: up to 90 days
  - then encrypted archive or secure deletion.

## Escalation

Escalate to platform/security when:

- Same key appears across unrelated stores.
- Multiple failed activation attempts suggest brute force or leak.
- Cloud endpoints must be re-enabled outside approved maintenance window.
