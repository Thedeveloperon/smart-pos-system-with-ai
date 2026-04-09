# License Control and Super Admin Implementation Tracker

Last updated: 2026-04-02

Purpose: track anti-piracy licensing, payment enforcement, device control, and super-admin operations so copied installers cannot run without a valid paid license.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed

## Phase 0: Current Baseline (Observed)

- [x] Device activation flow is implemented (`provision_activate`).
- [x] License heartbeat flow is implemented (`license_heartbeat`).
- [x] Sensitive action proof verification is implemented (`sensitive_action_proof_verified`).
- [x] Token replay detection is implemented (`TOKEN_REPLAY_DETECTED` monitoring).
- [x] Invalid device signature failures are tracked.
- [x] Device/license states exist (`active`, `grace`, `suspended`, `revoked`).
- [x] Security and licensing trackers exist (`SECURITY_UPGRADE_TRACKER.md`, `LICENSE_PROVISION_SUBSCRIPTION_CHECKLIST.md`).

## Phase 1: Revenue Enforcement (Copied Installer Protection)

- [x] Enforce first-run activation gate for all installer distributions.
- [x] Block POS operations when activation is missing or invalid.
- [x] Ensure unpaid/expired subscriptions transition to `grace -> suspended` automatically.
- [x] Ensure seat-limit overages trigger `SEAT_LIMIT_EXCEEDED` and block checkout.
- [x] Add explicit "license locked" UX with recovery path (renew, contact support, sign in).
- [x] Add automated integration test: "copied installer on unauthorized PC is blocked."

## Phase 2: Customer License Delivery

- [x] Finalize payment-success flow: issue license key or login-based activation entitlement.
- [x] Send license/access details via success page + email.
- [x] Add customer portal page: `My Account -> Licenses`.
- [x] Allow customer self-service device deactivation for seat recovery (policy-limited).
- [x] Add reconciliation job for webhook misses and billing state drift.

## Phase 2B: Manual Cash/Bank Deposit Billing Flow

- [x] Add invoice workflow for offline/manual payments (`invoice_no`, due amount, due date, status).
- [x] Add super-admin payment capture form (`method`, `amount`, `bank_ref`, `deposit_slip`, `received_at`).
- [x] Add `pending_verification -> verified/posted -> rejected` payment lifecycle.
- [x] Update license/subscription only after payment is verified/posted.
- [x] Keep immutable payment audit trail (`recorded_by`, `verified_by`, timestamps, reason).
- [x] Enforce RBAC split: record vs verify/approve roles.
- [x] Add optional second-approval rule for high-value payments/refunds.
- [x] Add daily bank reconciliation report and mismatch alerting.

## Phase 3: Super Admin Control Plane

- [x] Centralize super-admin actions: activate/deactivate, revoke/reactivate, extend grace, transfer seat.
- [x] Require reason code and actor note for every manual override.
- [x] Enforce MFA + role scopes (`support`, `billing_admin`, `security_admin`).
- [x] Add step-up approval for high-risk actions (mass revoke, long grace extension).
- [x] Add one-click emergency actions: `lock device`, `revoke token`, `force re-auth`.
- [x] Add exportable audit view for finance/security/legal reviews.

## Phase 4: Security and Abuse Controls

- [x] Enforce signed, short-lived command envelopes for remote device control.
- [x] Add nonce + expiry checks for all remote control commands.
- [x] Add anomaly policies for multi-device abuse on same license.
- [x] Add alert thresholds for repeated proof/signature failures by source.
- [x] Add runbook for fraud response (detect -> suspend -> verify -> restore or terminate).

## Phase 5: Release Readiness

- [x] Manual QA matrix: fresh install, paid activation, expired billing, stolen installer scenario.
- [x] Verify support playbook resolves top 10 license tickets without DB edits.
- [x] Validate immutable audit logs for all admin/license actions.
- [x] Final legal/EULA check for licensing and anti-abuse terms.
- [~] Go-live checklist signed by product, engineering, security, and support owners.

## Ownership and Dates

- Product owner: TBD
- Engineering owner: TBD
- Security owner: TBD
- Support owner: TBD
- Target production date: TBD

## Change Log

- 2026-04-01: Tracker created to coordinate licensing enforcement, customer activation flow, and super-admin device control rollout.
- 2026-04-01: Implemented manual cash/bank-deposit billing flow in backend and super-admin UI (invoices, payment recording, verify/reject lifecycle, subscription activation on verify, immutable audit trail, scoped RBAC).
- 2026-04-01: Added high-value second-approval enforcement and daily bank reconciliation with mismatch alerting in super-admin licensing/billing; added API/UI support and integration tests (`LicensingManualBillingFlowTests`) for second-approver and mismatch scenarios.
- 2026-04-01: Validation passed after implementation: backend licensing integration tests (`41 passed`) and frontend unit/component tests (`22 passed`).
- 2026-04-01: Added anti-piracy integration scenario in `LicensingAbuseTests` proving copied installer usage on an unprovisioned device is blocked from protected POS APIs until activation; licensing integration suite now passes (`42 passed`).
- 2026-04-01: Phase 1 completed: first-run activation gate + protected-route enforcement (`LicenseEnforcementMiddleware`, `App` license gate), automatic `grace -> suspended` behavior (`LicensingPolicyTests`), seat-limit enforcement (`SEAT_LIMIT_EXCEEDED` in `LicensingFlowTests`), and lock-screen recovery UX updates (renew/contact support/admin sign-in path in `LicenseBlockedScreen`).
- 2026-04-01: Completed Phase 2 item 1 by adding activation-entitlement issuance and consumption: payment success now issues customer activation keys (`invoice.paid` webhook + manual billing verify), `/api/provision/activate` accepts `activation_entitlement_key`, owner/manager endpoint added for latest key lookup, activation UI accepts key entry, and super-admin manual verify flow now surfaces/copies the issued key. Validation: targeted backend licensing tests (`12 passed` across manual billing/webhook/abuse suites, plus `LicensingFlowTests` smoke) and frontend tests/build (`22 tests passed`, production build successful).
- 2026-04-02: Completed Phase 2 items 3 and 4 by adding customer-facing `My Account -> Licenses` UX (shop/plan/seat summary, activation key display/copy, provisioned device list) and policy-limited self-service seat recovery via `/api/license/account/licenses/devices/{device_code}/deactivate`. Validation: targeted integration tests in `LicensingCustomerPortalTests` (`2 passed`), frontend tests (`22 passed`), and frontend production build successful.
- 2026-04-02: Completed Phase 2 item 2 by adding access delivery after payment verification/webhook: backend now returns `access_delivery` (success page URL + email delivery result), added anonymous `GET /api/license/access/success` for customer key retrieval, manual billing verify accepts optional `customer_email`, and frontend includes new `/license/success` page plus super-admin share/copy flow in manager reports. Validation: targeted backend integration tests passed (`10/10` across `LicensingManualBillingFlowTests`, `LicensingWebhookEventHandlingTests`, `LicensingWebhookIdempotencyTests`, `LicensingCustomerPortalTests`) using self-contained test execution, backend build successful, frontend tests (`22 passed`), and frontend production build successful.
- 2026-04-02: Completed Phase 2 item 5 by implementing automated billing-state reconciliation for missed webhooks and subscription drift: new hosted job (`BillingStateReconciliationService`), new admin endpoint (`POST /api/admin/licensing/billing/reconciliation/run`), service-level drift detection/remediation (expired billing periods reconciled to `past_due` with audit trail + failed-webhook surfacing), and super-admin UI trigger/reporting in manager reports (`Run Drift Check`). Validation: backend build successful, targeted integration tests passed (`13/13` across billing reconciliation + manual billing/webhook/customer portal suites), frontend tests (`22 passed`), frontend production build successful.
- 2026-04-02: Completed Phase 3 item 1 by centralizing super-admin device controls for full seat lifecycle operations: added admin endpoints for `deactivate`, `activate`, and `transfer-seat` (`/api/admin/licensing/devices/{device_code}/...`), service-level orchestration/auditing (`DeactivateDeviceAsAdminAsync`, `ActivateDeviceAsAdminAsync`, `TransferDeviceSeatAsAdminAsync`), API client wiring, and manager reports UI actions (Deactivate/Activate + Transfer Seat, alongside existing Revoke/Reactivate/Extend Grace). Validation: backend build successful, targeted backend integration tests passed (`22/22` across `LicensingFlowTests`, `LicensingBillingStateReconciliationTests`, `LicensingManualBillingFlowTests`, `LicensingWebhookEventHandlingTests`, `LicensingWebhookIdempotencyTests`, `LicensingCustomerPortalTests`), frontend tests (`22 passed`), frontend production build successful.
- 2026-04-02: Completed Phase 3 items 2-6 and Phase 4 items 1-5: manual overrides now require structured `reason_code` + `actor_note`; high-risk admin controls enforce step-up approval (long grace extension and mass revoke); emergency one-click controls (`lock_device`, `revoke_token`, `force_reauth`) now use signed short-lived command envelopes with nonce consumption and expiry checks; audit logs are exportable via admin API/UI (CSV/JSON); fraud-response runbook added (`LICENSE_FRAUD_RESPONSE_RUNBOOK.md`). Validation: backend build successful; targeted integration tests passed for licensing admin controls and billing (`20/20` across `LicensingFlowTests`, `LicensingManualBillingFlowTests`, `LicensingBillingStateReconciliationTests`).
- 2026-04-02: Completed Phase 5 items 1-4 with release artifacts and validation docs: manual QA matrix (`LICENSE_MANUAL_QA_MATRIX_2026-04-02.md`), support top-10 no-DB-edit playbook (`LICENSE_SUPPORT_PLAYBOOK_TOP10_2026-04-02.md`), immutable audit validation evidence (`LICENSE_AUDIT_VALIDATION_2026-04-02.md` + `LicensingFlowTests.ManualOverrideAuditHashes_ShouldBuildImmutableChain`), and legal/EULA checklist (`LICENSE_LEGAL_EULA_CHECK_2026-04-02.md`). Added go-live checklist template (`LICENSE_GO_LIVE_CHECKLIST_2026-04-02.md`); owner signatures remain pending.
- 2026-04-02: Prepared formal owner sign-off register (`LICENSE_OWNER_SIGNOFF_2026-04-02.md`) and linked it as the Phase 5 approval source of truth. Engineering implementation is complete; product/engineering/security/support approvals are the only remaining gate.
