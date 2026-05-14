# Desktop License and Marketing Account Access Implementation Tracker

Last updated: 2026-04-07

Purpose: track implementation of a hosted customer account flow (after pricing plan purchase) that delivers license access and install actions, while POS runs locally on customer PCs with local data storage, using Stripe as the primary payment gateway.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed

## Phase 0: Current Baseline (Observed)

- [x] Hosted marketing purchase onboarding exists (`website /[locale]/start`).
- [x] Payment request and payment proof submission flows exist (`/api/license/public/payment-request`, `/payment-submit`, `/payment-proof-upload`).
- [x] License success flow exists with activation entitlement key and installer link support (`/api/license/access/success`, frontend `/license/success`).
- [x] Customer license portal API exists for authenticated owner/manager users (`GET /api/license/account/licenses`).
- [x] Local POS app already enforces license gate before normal usage.
- [x] Hosted marketing site now exposes signed-in customer account route and production hardening foundations.
- [x] Install UX now includes a production-ready PWA baseline (manifest/service worker/install prompt lifecycle).

## Phase 1: Architecture and Product Decisions

- [x] Finalize primary distribution mode:
- Desktop installer first (recommended), with PWA as optional secondary channel.
- [x] Define canonical customer path:
- Pricing plan purchase -> Stripe checkout verification -> account access -> install -> first activation.
- [x] Define domain/session model for account auth between marketing site and backend (`SameSite`, cookie domain, CORS).
- [x] Define account owner identity model (mapped POS owner/manager account with optional MFA).
- [x] Confirm local data strategy per channel:
- Browser PWA (`IndexedDB`) vs desktop runtime (local database/files).
- [x] Select primary payment gateway: Stripe.
- Reference: `DESKTOP_LICENSE_ARCHITECTURE_DECISIONS_2026-04-07.md`.

## Phase 2: Stripe Checkout and Billing Plumbing

- [x] Define Stripe catalog and mapping:
- `starter/pro/business` website plans -> Stripe `product` + `price` IDs -> backend plan codes (`trial/growth/pro`).
- [x] Add/create checkout session endpoint for marketing site (server-side Stripe secret key only).
- [x] Add success and cancel URL routing from Stripe Checkout back to hosted onboarding pages.
- [x] Add checkout session status endpoint for post-redirect payment reconciliation (`/api/license/public/stripe/checkout-session-status`).
- [x] Persist Stripe identifiers (`customer_id`, `subscription_id`, `price_id`) against shop subscription records.
- [x] Implement webhook receiver and signature verification for Stripe events.
- [x] Map Stripe webhook payloads into existing licensing billing update flow:
- `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`.
- [x] Enforce webhook idempotency by Stripe `event.id`.
- [x] Add retry-safe failure handling and dead-letter alert path for malformed/failed webhooks.
- [x] Keep manual cash/bank flow as optional fallback path behind feature flag (operations break-glass).
- Manual fallback is enforced by `Licensing:MarketingManualBillingFallbackEnabled` and covered by integration tests.

## Phase 3: Hosted Customer Account Access

- [x] Add marketing site account route (`/[locale]/account`) as key-based access MVP.
- [x] Implement sign-in flow on marketing site for account holders (username/password + optional MFA, cookie session).
- [x] Add backend API proxy routes in website for account data/actions (licensed endpoints).
- Added proxies: `/api/account/login`, `/api/account/logout`, `/api/account/me`, `/api/account/license-portal`, `/api/account/license-portal/devices/[deviceCode]/deactivate`.
- [x] Show account summary (shop, plan, subscription status, seats used).
- [x] Show activation entitlement key (masked by default) with copy/reveal controls.
- [x] Add device list with self-service deactivate (policy-limited).
- [x] Ensure non-owner/cashier users cannot access owner/manager license APIs.
- Backend authorization policy enforces manager/owner, and marketing account UI blocks cashier role from loading license portal data with flow coverage.

## Phase 4: Installer and App Install UX

- [x] Add clear "Install SmartPOS" section in account page.
- [x] Support desktop installer download from hosted account.
- [x] Keep protected/signed installer links and expiry messaging.
- [x] Show checksum/integrity verification information.
- [x] Add platform-specific fallback instructions (Windows/macOS/Linux, Android, iOS).
- [x] If PWA channel is enabled: add install CTA state machine (install available, installed, unsupported).

## Phase 5: PWA Readiness (If Enabled)

- [x] Add `manifest.webmanifest` and icons for required sizes.
- [x] Add service worker registration and update strategy.
- [x] Add offline shell and cache versioning policy.
- [x] Handle `beforeinstallprompt` flow and post-install analytics.
- [x] Add browser/platform compatibility matrix and user guidance (account install section).

## Phase 6: Local POS Runtime and Data

- [x] Confirm local runtime target:
- Desktop runtime recommended for production, PWA optional secondary path.
- [x] Define local database lifecycle (create, migrate, backup, restore).
- [x] Ensure local POS starts without hosted URL dependency for day-to-day operations.
- [x] Keep hosted licensing API for activation/heartbeat/renewal while POS data remains local.
- [x] Define offline grace behavior and reconnection recovery.
- Reference: `DESKTOP_LICENSE_ARCHITECTURE_DECISIONS_2026-04-07.md`.

## Phase 7: Security, Abuse Controls, and Compliance

- [x] Remove activation keys from URL/history after first read on account/success pages.
- [x] Rate limit account and license-sensitive endpoints (lookup/portal/deactivate/download track).
- [x] Add audit logs for key/device actions from customer self-service.
- [x] Keep installer link token expiry and signature validation.
- [x] Add anomaly alerts for unusual download/deactivation behavior.
- [x] Rotate and secure Stripe secrets model:
- `STRIPE_SECRET_KEY`, webhook signing secret, publishable key handling, environment isolation.
- Operational reference: `DESKTOP_LICENSE_STRIPE_BILLING_INCIDENT_RUNBOOK.md`.

## Phase 8: QA, Rollout, and Operations

- [x] Add integration tests for account auth + account/licenses + device deactivation.
- [x] Add integration tests for Stripe checkout path:
- webhook mapping and checkout-session-status endpoint coverage.
- [~] Add E2E flow:
- Stripe checkout -> webhook confirmed -> account login -> copy key -> install -> activate local POS.
- Automated coverage exists for account/checkout return flows; real Stripe + installer + local activation remains a staged pilot/manual gate.
- Owner: Engineering Lead (Licensing Platform)
- Due date: 2026-04-11
- [x] Add support runbook for "cannot access account" and "cannot activate on local device".
- Reference: `DESKTOP_LICENSE_SUPPORT_RUNBOOK.md`.
- [x] Add support runbook for Stripe billing incidents:
- delayed webhooks, failed invoice, canceled subscription, disputed payment.
- Reference: `DESKTOP_LICENSE_STRIPE_BILLING_INCIDENT_RUNBOOK.md`.
- [~] Pilot rollout with selected shops before broad release.
- Pilot plan is ready: `DESKTOP_LICENSE_STAGED_PILOT_PLAN_2026-04-07.md`.
- Owner: Product Owner (Commerce) + Engineering Lead + Support Operations Lead
- Date window: 2026-04-09 to 2026-04-21, final go-live decision on 2026-04-22.
- [x] Define KPI dashboard:
- time-to-first-activation, install success rate, activation failure rate, support tickets per 100 activations.
- Reference: `DESKTOP_LICENSE_KPI_DASHBOARD_PLAN.md`.
- [x] Add final go-live checklist with exact schedule and role ownership.
- Reference: `DESKTOP_LICENSE_GO_LIVE_CHECKLIST_2026-04-07.md`.
- [x] Add owner sign-off register for pilot gate and final release gate.
- Reference: `DESKTOP_LICENSE_OWNER_SIGNOFF_2026-04-07.md`.
- [x] Add day-by-day pilot command-center execution plan and KPI log template.
- References: `DESKTOP_LICENSE_PILOT_COMMAND_CENTER_2026-04-07.md`, `DESKTOP_LICENSE_PILOT_DAILY_LOG_TEMPLATE.csv`.

## Ownership and Dates

- Product owner: Product Owner (Commerce)
- Engineering owner: Engineering Lead (Licensing Platform)
- Billing operations owner: Billing Operations Lead
- Support owner: Support Operations Lead
- Pilot start date: 2026-04-09
- Pilot gate review date (Cohort A): 2026-04-12
- Target release date: 2026-04-22

## Open Decisions

- [x] Desktop shell mandatory for production, or allow browser-only PWA tenants.
- [x] Account authentication method for non-technical shop owners.
- [x] Whether account route is in marketing app only or shared with POS web app.
- [x] Installer delivery policy: fully protected signed links vs mixed public/private channels.
- [x] Billing fallback policy when Stripe is unavailable (queue/retry/manual override).
- Reference: `DESKTOP_LICENSE_ARCHITECTURE_DECISIONS_2026-04-07.md`.

## Change Log

- 2026-04-07: Tracker created for hosted customer account access after purchase and local-first POS runtime (localhost/desktop/PWA) with licensing and install flows.
- 2026-04-07: Stripe chosen as primary payment gateway; tracker expanded with Stripe checkout, webhook, billing-id sync, and Stripe incident runbook tasks.
- 2026-04-07: Implementation started for Stripe path: added backend checkout-session API (`/api/license/public/stripe/checkout-session`), Stripe webhook ingestion endpoint (`/api/license/webhooks/stripe`) with payload mapping into existing billing webhook processor, website proxy route (`/api/payment/stripe-checkout`), and start-page Stripe CTA wiring.
- 2026-04-07: Added Stripe return handling and status polling: backend checkout-session-status API, website proxy route (`/api/payment/stripe-checkout-status`), and start-page post-checkout success/cancel UX with live status reconciliation.
- 2026-04-07: Added integration coverage for Stripe endpoints: webhook mapping test and checkout-session-status endpoint test with mocked Stripe API responses.
- 2026-04-07: Added hosted `My Account` MVP on marketing site (`/[locale]/account`) with activation-key lookup, license summary, masked/reveal/copy key controls, desktop installer download CTA, and PWA install prompt handling.
- 2026-04-07: Added website proxy route (`/api/license/access-success`) and linked account access from navbar and Stripe success messaging on the onboarding page.
- 2026-04-07: Added authenticated account flow on marketing site using existing backend auth/session cookies and licensed portal APIs (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/license/account/licenses`) plus self-service device deactivation via website proxy routes.
- 2026-04-07: Added website Vitest coverage for account proxy routes (`/api/account/login`, `/api/account/me`, `/api/account/logout`, `/api/account/license-portal`, `/api/account/license-portal/devices/[deviceCode]/deactivate`) including cookie forwarding, idempotency behavior, and route validation paths.
- 2026-04-07: Added website account UI-flow test (`/[locale]/account`) covering sign-in, authenticated portal rendering, self-service device deactivation, and state refresh path.
- 2026-04-07: Added account-role hardening on marketing `My Account` page to block cashier users from owner/manager license portal actions; added cashier denial UI-flow test and proxy forbidden-response test coverage.
- 2026-04-07: Added Stripe return UI-flow test (`/[locale]/start`) validating checkout success status polling and account handoff CTA.
- 2026-04-07: Added Stripe/billing webhook retry hardening with dead-letter handling after max failed attempts, failure counters + dead-letter timestamps in webhook event persistence, malformed-webhook security anomaly alerts, and integration coverage for dead-letter transition behavior.
- 2026-04-07: Added manual fallback feature-flag enforcement (`MarketingManualBillingFallbackEnabled`) across backend + onboarding UI, plus integration coverage for disabled fallback behavior.
- 2026-04-07: Added rate limiting for sensitive license/account endpoints, audit tracking proxy for installer/key actions, and anomaly detection hooks for installer download spikes and self-service deactivation spikes.
- 2026-04-07: Completed installer hardening and PWA readiness baseline (`manifest.webmanifest`, service worker registration/update flow, offline shell/cache policy, compatibility guidance on account page).
- 2026-04-07: Added operations artifacts: architecture decisions, support runbook, Stripe billing incident runbook, KPI dashboard plan, and staged pilot rollout plan.
- 2026-04-07: Validation results: backend licensing-focused integration tests passed (77/77), website tests passed (13/13), website production build passed, frontend production build passed.
- 2026-04-07: Added final execution closeout artifacts with exact dates and owners: `DESKTOP_LICENSE_GO_LIVE_CHECKLIST_2026-04-07.md` and `DESKTOP_LICENSE_OWNER_SIGNOFF_2026-04-07.md`; updated tracker ownership and rollout due dates.
- 2026-04-07: Added pilot command-center operations plan with daily cadence and gate process (`DESKTOP_LICENSE_PILOT_COMMAND_CENTER_2026-04-07.md`) plus KPI/event capture template (`DESKTOP_LICENSE_PILOT_DAILY_LOG_TEMPLATE.csv`).
