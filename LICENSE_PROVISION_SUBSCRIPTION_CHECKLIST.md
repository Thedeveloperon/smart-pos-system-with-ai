# License, Provisioning, and Subscription Implementation Checklist

## Phase 1: Core MVP (Must-Have)

### 1. Product Rules
- [ ] Define license states: `unprovisioned`, `active`, `grace`, `suspended`, `revoked`.
- [ ] Define subscription states: `trialing`, `active`, `past_due`, `canceled`.
- [ ] Define grace policy (example: 7 days).
- [ ] Define blocked actions in `suspended` (example: block checkout/refund, allow read-only reports).

### 2. Database
- [ ] Add `shops` table (optional for now, recommended for future multi-branch/SaaS).
- [ ] Add `subscriptions` table (`shop_id`, plan, status, period_end, billing customer/subscription ids).
- [ ] Add `licenses` table (`shop_id`, token, `valid_until`, `grace_until`, signature metadata).
- [ ] Add `provisioned_devices` table (`device_id`, `device_code`, name, status, assigned/revoked timestamps).
- [ ] Add `license_audit_logs` table (action, actor, reason, timestamp, metadata).
- [ ] Add indexes for `shop_id`, `device_id`, `status`, `valid_until`.

### 3. Backend APIs
- [ ] Implement `POST /api/provision/activate`.
- [ ] Implement `POST /api/provision/deactivate`.
- [ ] Implement `GET /api/license/status`.
- [ ] Implement `POST /api/license/heartbeat`.
- [ ] Return clear machine-readable error codes (`SEAT_LIMIT_EXCEEDED`, `LICENSE_EXPIRED`, `REVOKED`).

### 4. License Enforcement
- [ ] Add backend middleware to validate license for protected routes.
- [ ] Validate signature, expiry, device binding, and store binding.
- [ ] Apply grace logic centrally in middleware.
- [ ] Exclude only health/auth/license bootstrap endpoints from enforcement.

### 5. Frontend Flow (React/PWA)
- [ ] Add startup gate: call `GET /api/license/status` before normal app auth.
- [ ] Show activation screen when `unprovisioned`.
- [ ] Show grace warning banner when in `grace`.
- [ ] Show blocked screen with recovery steps when `suspended`/`revoked`.

### 6. Offline Behavior
- [ ] Cache last valid license locally (encrypted at rest where possible).
- [ ] Store last successful server validation time.
- [ ] Add clock rollback protection (reject suspicious backward jumps).
- [ ] Retry heartbeat automatically when connectivity returns.

## Phase 2: Subscription Integration

### 1. Billing Provider Setup
- [ ] Create plans with seat limits and feature flags.
- [ ] Persist billing provider IDs per shop (`customer_id`, `subscription_id`, `price_id`).

### 2. Webhook Processing
- [ ] Handle webhook events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Verify webhook signatures.
- [ ] Make webhook handling idempotent.
- [ ] Update local subscription state only from webhooks/server-side reconciliation.

### 3. License Issuance
- [ ] Issue short-lived signed license tokens from subscription state.
- [ ] Use asymmetric keys (private key in KMS/HSM, public key in POS backend).
- [ ] Add key rotation support via `kid`.
- [ ] Force token reissue on plan/device/status changes.

## Phase 3: Super Admin Operations

### 1. Admin APIs
- [ ] List shops, subscriptions, license states, and device seats.
- [ ] Revoke/reactivate devices.
- [ ] Extend grace with explicit reason.
- [ ] Force license refresh/resync.

### 2. Admin Panel
- [ ] Enforce MFA for all super admins.
- [ ] Implement RBAC (`support`, `billing_admin`, `security_admin`).
- [ ] Add searchable audit logs.
- [ ] Keep immutable history for manual overrides.

## Phase 4: Security, Testing, and Observability

### 1. Security
- [ ] Keep signing private keys out of app runtime nodes.
- [ ] Add rate limits on activation/deactivation endpoints.
- [ ] Require idempotency keys on mutation endpoints.
- [ ] Encrypt sensitive license/provision data at rest.

### 2. Testing
- [ ] Unit tests for state transitions and policy rules.
- [ ] Integration tests for activation, renewal, deactivation.
- [ ] Offline tests (no internet, heartbeat recovery, grace expiry).
- [ ] Abuse tests (token tampering, replay, expired token, clock rollback).
- [ ] E2E tests for frontend gating and user messaging.

### 3. Observability
- [ ] Add metrics: activations, heartbeat failures, grace-mode shops, suspended shops.
- [ ] Add alerts for webhook failures and license validation spikes.
- [ ] Add support dashboard for quick triage.

## Definition of Done
- [ ] New shop can activate first device in under 2 minutes.
- [ ] Offline checkout works during outage within grace policy.
- [ ] Payment failure transitions automatically to `past_due -> grace -> suspended`.
- [ ] Device seat limits are enforced reliably.
- [ ] Support can resolve common license issues without direct DB edits.
