# License, Provisioning, and Subscription Implementation Checklist

## Phase 1: Core MVP (Must-Have)

### 1. Product Rules
- [x] Define license states: `unprovisioned`, `active`, `grace`, `suspended`, `revoked`.
- [x] Define subscription states: `trialing`, `active`, `past_due`, `canceled`.
- [x] Define grace policy (example: 7 days).
- [x] Define blocked actions in `suspended` (example: block checkout/refund, allow read-only reports).

### 2. Database
- [x] Add `shops` table (optional for now, recommended for future multi-branch/SaaS).
- [x] Add `subscriptions` table (`shop_id`, plan, status, period_end, billing customer/subscription ids).
- [x] Add `licenses` table (`shop_id`, token, `valid_until`, `grace_until`, signature metadata).
- [x] Add `provisioned_devices` table (`device_id`, `device_code`, name, status, assigned/revoked timestamps).
- [x] Add `license_audit_logs` table (action, actor, reason, timestamp, metadata).
- [x] Add indexes for `shop_id`, `device_id`, `status`, `valid_until`.

### 3. Backend APIs
- [x] Implement `POST /api/provision/activate`.
- [x] Implement `POST /api/provision/deactivate`.
- [x] Implement `GET /api/license/status`.
- [x] Implement `POST /api/license/heartbeat`.
- [x] Return clear machine-readable error codes (`SEAT_LIMIT_EXCEEDED`, `LICENSE_EXPIRED`, `REVOKED`).

### 4. License Enforcement
- [x] Add backend middleware to validate license for protected routes.
- [x] Validate signature, expiry, device binding, and store binding.
- [x] Apply grace logic centrally in middleware.
- [x] Exclude only health/auth/license bootstrap endpoints from enforcement.

### 5. Frontend Flow (React/PWA)
- [x] Add startup gate: call `GET /api/license/status` before normal app auth.
- [x] Show activation screen when `unprovisioned`.
- [x] Show grace warning banner when in `grace`.
- [x] Show blocked screen with recovery steps when `suspended`/`revoked`.

### 6. Offline Behavior
- [x] Cache last valid license locally (encrypted at rest where possible).
- [x] Store last successful server validation time.
- [x] Add clock rollback protection (reject suspicious backward jumps).
- [x] Retry heartbeat automatically when connectivity returns.

## Phase 2: Subscription Integration

### 1. Billing Provider Setup
- [x] Create plans with seat limits and feature flags.
- [x] Persist billing provider IDs per shop (`customer_id`, `subscription_id`, `price_id`).

### 2. Webhook Processing
- [x] Handle webhook events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [x] Verify webhook signatures.
- [x] Make webhook handling idempotent.
- [x] Update local subscription state only from webhooks/server-side reconciliation.

### 3. License Issuance
- [x] Issue short-lived signed license tokens from subscription state.
- [x] Use asymmetric keys (private key in KMS/HSM, public key in POS backend).
- [x] Add key rotation support via `kid`.
- [x] Force token reissue on plan/device/status changes.

## Phase 3: Super Admin Operations

### 1. Admin APIs
- [x] List shops, subscriptions, license states, and device seats.
- [x] Revoke/reactivate devices.
- [x] Extend grace with explicit reason.
- [x] Force license refresh/resync.

### 2. Admin Panel
- [x] Enforce MFA for all super admins.
- [x] Implement RBAC (`support`, `billing_admin`, `security_admin`).
- [x] Add searchable audit logs.
- [x] Keep immutable history for manual overrides.

## Phase 4: Security, Testing, and Observability

### 1. Security
- [x] Keep signing private keys out of app runtime nodes.
- [x] Add rate limits on activation/deactivation endpoints.
- [x] Require idempotency keys on mutation endpoints.
- [x] Encrypt sensitive license/provision data at rest.

### 2. Testing
- [x] Unit tests for state transitions and policy rules.
- [x] Integration tests for activation, renewal, deactivation.
- [x] Offline tests (no internet, heartbeat recovery, grace expiry).
- [x] Abuse tests (token tampering, replay, expired token, clock rollback).
- [x] E2E tests for frontend gating and user messaging.

### 3. Observability
- [x] Add metrics: activations, heartbeat failures, grace-mode shops, suspended shops.
- [x] Add alerts for webhook failures and license validation spikes.
- [x] Add support dashboard for quick triage.

## Definition of Done
- [x] New shop can activate first device in under 2 minutes.
- [x] Offline checkout works during outage within grace policy.
- [x] Payment failure transitions automatically to `past_due -> grace -> suspended`.
- [x] Device seat limits are enforced reliably.
- [x] Support can resolve common license issues without direct DB edits.
