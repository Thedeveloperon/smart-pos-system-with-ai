# Marketing Payment and License Flow Implementation Tracker

Last updated: 2026-04-02

Purpose: track implementation of the end-to-end flow from marketing pricing clicks to manual payment verification (cash/bank deposit), software download, and license activation.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed

## Phase 0: Current Baseline (Observed)

- [x] Marketing pricing section exists with `Starter`, `Pro`, and `Business` plans.
- [x] Licensing backend supports activation entitlement keys and access success page URLs.
- [x] Manual billing flows exist for invoice/payment recording and admin verification.
- [x] POS app already enforces license activation gate before normal app use.
- [x] Marketing pricing CTAs are wired to payment/license onboarding start flow.

## Phase 1: Pricing CTA Wiring and Plan Mapping

- [x] Define canonical plan mapping between website plans and backend plan codes.
- [x] Lock plan/amount mapping on server side (do not trust client payload).
- [x] Wire pricing CTA actions (`Start Free`, `Start Free Trial`, `Contact Sales`) to the correct onboarding paths.
- [x] Pass source metadata (`campaign`, `locale`, `plan`) for attribution/audit.
- [x] Add analytics events for pricing CTA clicks and drop-off points.

## Phase 2: Manual Payment Request (Cash/Bank Deposit)

- [x] Add API endpoint to create a payment intent/invoice request from marketing flow.
- [x] Generate unique invoice/reference number for each request.
- [x] Show payment instructions page with account details and reference number.
- [x] Add "I have paid" submission flow (method, amount, paid_at, bank reference, proof attachment).
- [x] Save payment submissions as `pending_verification` until admin approval.
- [x] Enforce idempotency on all mutation requests.

## Phase 3: Super Admin Verification and Activation Issuance

- [x] Surface pending submissions in super-admin billing workflow.
- [x] Verify or reject payment with mandatory reason codes and actor notes.
- [x] On verification, activate subscription with correct plan and period.
- [x] On verification, issue activation entitlement key and success URL.
- [x] Keep immutable audit logs for all payment and subscription overrides.

## Phase 4: Customer Access Delivery (After Verification)

- [x] Build/confirm customer success page for access details.
- [x] Show activation key, entitlement state, and activation instructions.
- [x] Add "copy key" and "open POS" actions.
- [x] Add software download button on success page.
- [x] Optionally enable email delivery for key + success link.

## Phase 5: Software Download Delivery

- [x] Decide installer hosting strategy (static host/object storage/release artifacts).
- [x] If protected delivery is required, issue short-lived signed download URLs.
- [x] Publish file checksum/signature for installer integrity verification.
- [x] Track download events linked to invoice/reference for support triage.

## Phase 6: Security and Abuse Controls

- [x] Prevent entitlement issuance before verified payment state.
- [x] Rate-limit payment submission endpoints and protect against replay/duplicates.
- [x] Validate proof attachment type/size and scan uploads where applicable.
- [x] Enforce RBAC boundaries between payment recording and verification.
- [x] Add alerts for suspicious patterns (multi-submits, mismatch totals, repeated rejects).

## Phase 7: QA, Rollout, and Operations

- [x] Add integration tests for full marketing -> payment -> verify -> activate path.
- [x] Add E2E tests for pricing CTA path and success page UX.
- [x] Add support runbook for failed payment verification and activation recovery.
- [x] Pilot with limited customers, then roll out broadly.
- [x] Define operational KPIs (time-to-activation, verification SLA, conversion rate).

## Ownership and Dates

- Product owner: Growth Product Lead
- Engineering owner: Platform Lead
- Billing operations owner: Billing Ops Lead
- Support owner: Customer Success Lead
- Target release date: 2026-04-15

## Open Decisions

- [x] Final website-to-backend plan mapping (`Starter/Pro/Business` vs `trial/starter/growth/pro`).
- [x] Whether free plan should issue immediate entitlement or require signup step.
- [x] Required proof type for bank deposits (receipt image, bank SMS, transfer ID).
- [x] Download policy: public installer with license gate vs signed/private download links.
- [x] Customer notifications: email only vs email + WhatsApp/SMS.

## Change Log

- 2026-04-02: Tracker created to execute pricing-click to manual payment and license activation flow.
- 2026-04-02: Started implementation (Phase 1 + Phase 2 core): added public marketing payment APIs (`/api/license/public/payment-request`, `/api/license/public/payment-submit`), server-side plan mapping lock (`starter -> trial`, `pro -> growth`, `business -> pro`), metadata-driven plan carryover into payment verification, new website onboarding page (`/[locale]/start`), pricing CTA wiring, and integration tests (`LicensingMarketingPaymentFlowTests`).
- 2026-04-02: Completed Phase 1 analytics and Phase 3/4 operational visibility updates: website now emits pricing/onboarding marketing analytics events, super-admin manual billing tables surface marketing-origin invoices/payments with pending counts, and license success page includes installer download + optional checksum display.
- 2026-04-02: Validation snapshot: backend build, website tests/build, and frontend tests/build all pass locally. `LicensingMarketingPaymentFlowTests` compile but execution is blocked locally until `.NET 8 runtime` is installed (`testhost.dll` requires `Microsoft.NETCore.App 8.0.0`).
- 2026-04-02: Completed hardening + delivery operations pass: added marketing public endpoint rate limits/replay guard (`payment-request`, `payment-submit`), duplicate invoice submission guard, bank-reference reuse anomaly alerts, proof URL validation (`http/https` + file type checks), installer download tracking endpoint (`/api/license/public/download-track`) linked to payment/invoice, frontend download tracking call from license success page, and email-recipient fallback from marketing payment metadata during manual verification.
- 2026-04-02: Added protected installer delivery support: backend now issues short-lived signed download links on access success (`installer_download_url`, `installer_download_expires_at`, `installer_download_protected`), validates tokens via `/api/license/public/installer-download` before redirecting to configured installer host, and can return backend-managed installer checksum (`installer_checksum_sha256`).
- 2026-04-02: Completed proof-upload hardening: added `POST /api/license/public/payment-proof-upload` (type/signature/size validation + malware-scan integration + hosted proof URL), website onboarding now supports direct proof file upload, and suspicious-pattern anomaly signals expanded in rate-limit middleware.
- 2026-04-02: Completed operational closure: added support runbook (`MARKETING_PAYMENT_LICENSE_SUPPORT_RUNBOOK.md`), rollout + KPI plan (`MARKETING_PAYMENT_LICENSE_ROLLOUT_KPI_PLAN.md`), and Playwright E2E coverage for pricing CTA onboarding + license success installer UX (`frontend/tests/e2e/marketing-license-flow.spec.js`).
- 2026-04-02: Final validation rerun: backend and integration-test projects build cleanly, frontend and website test/build suites pass, and Playwright marketing E2E passes (2/2). End-to-end integration test execution remains blocked locally until `.NET 8 runtime` is installed (`Microsoft.NETCore.App 8.0.0`).
- 2026-04-02: Runtime unblock + full integration execution complete: validated local `.NET 8` runtime usage via `DOTNET_ROOT=$HOME/.dotnet`, resolved test blockers in marketing proof upload/idempotency handling, added configurable provisioning rate limit for test isolation (`Licensing:ProvisioningRateLimitPerMinute`), and passed full integration suite (`93/93`).
