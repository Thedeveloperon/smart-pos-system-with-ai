# My Account AI Credits Top-Up Implementation Tracker

Last updated: 2026-04-07 (implementation in progress)

Purpose: track implementation of a Stripe-first AI credits top-up experience inside `My Account` (`/[locale]/account`) so customers can repeatedly purchase credits after onboarding.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed

## Phase 0: Current Baseline (Observed)

- [x] AI credits wallet and ledger infrastructure already exists in backend.
- [x] AI credit manual order path exists in marketing onboarding (`/[locale]/start`) with `payment-request` and `payment-submit`.
- [x] AI credit payment APIs exist in backend AI module (`/api/ai/credit-packs`, `/api/ai/payments/checkout`, `/api/ai/payments`, `/api/ai/payments/pending-manual`, `/api/ai/payments/verify`).
- [x] `My Account` page and auth/session proxy flow already exist.
- [x] `My Account` currently does not provide a dedicated AI credit purchase panel.
- [ ] Stripe checkout in marketing flow currently blocks AI credit orders (subscription-only path).

## Phase 1: Product and UX Decisions

- [x] Confirm information architecture:
- `Start` page for first-time plan onboarding; `My Account` for repeat top-ups and payment history.
- [x] Define Stripe-first UX policy for AI credits:
- card checkout as primary CTA, manual bank/cash as secondary fallback.
- [x] Define target wallet identity UX:
- default current owner/manager, optional user selector, avoid free-text username where possible.
- [~] Define purchase confirmation UX:
- pack, amount, credits to add, estimated balance after top-up.
- [~] Define payment result UX states:
- `processing`, `succeeded`, `failed`, `action_required`, `pending_verification`.
- [ ] Define failure recovery UX:
- retry payment, switch method, and contact support actions.

## Phase 2: Backend and Billing Flow

- [x] Decide canonical backend path for account top-up:
- reuse `/api/ai/payments/checkout` or add account-scoped licensing endpoint.
- [~] Add Stripe one-time AI credit checkout support (if not already supported for credits).
- [x] Ensure idempotency for all top-up mutations.
- [x] Ensure webhook mapping settles credits exactly once.
- [x] Keep manual verification path for `cash` and `bank_deposit` (feature-flag controlled).
- [x] Return normalized payment status for account UI polling.

## Phase 3: Marketing Website API Proxy Layer

- [x] Add account-side proxy routes for AI credit operations:
- credit packs, checkout create, payment status/history, optional pending-manual visibility.
- [x] Ensure cookie forwarding and authorization behavior matches existing account proxies.
- [~] Validate request schema and map backend errors into stable UI-safe error payloads.
- [x] Add idempotency key forwarding/generation where required.

## Phase 4: My Account UI Implementation

- [x] Add AI wallet summary card:
- current balance, last top-up timestamp, sync note for local POS.
- [x] Add pack selection UI (100/500/2000 and any configured packs).
- [x] Add Stripe checkout CTA (`Pay with Card`) as primary action.
- [ ] Add optional manual fallback section (`Need bank transfer?`) behind feature flag.
- [x] Add payment status panel and auto-refresh polling after return.
- [x] Add payment history table:
- date, method, amount, credits, status, reference.
- [x] Add clear empty/loading/error states and responsive mobile layout.

## Phase 5: Security and Abuse Controls

- [x] Restrict purchase actions to authorized owner/manager roles.
- [ ] Add/confirm rate limits on top-up create/status endpoints.
- [ ] Add audit logs for purchase initiation, completion, failure, and manual verification.
- [ ] Add anomaly alerts for repeated failed attempts and suspicious retries.
- [ ] Confirm secrets handling:
- Stripe secret/webhook secret server-only, no client leakage.

## Phase 6: Analytics and KPI Instrumentation

- [~] Track funnel events:
- top-up panel viewed, pack selected, checkout started, checkout returned, success/failure.
- [ ] Track operational metrics:
- top-up conversion rate, payment failure rate, average credits purchased, time-to-credit-settlement.
- [ ] Link support ticket categories to top-up events for root-cause analysis.

## Phase 7: QA and Rollout

- [x] Add backend integration tests:
- credit purchase idempotency, webhook settlement, manual verify, duplicate webhook handling.
- [x] Add website route tests for new AI proxy endpoints.
- [x] Add UI flow tests for `My Account` top-up journey:
- select pack -> checkout -> return -> status -> updated balance/history.
- [ ] Execute manual QA matrix across role types and payment methods.
- [ ] Pilot rollout with selected shops before broad release.

## Definition of Done

- [~] Customer can top up AI credits from `My Account` with Stripe-first flow.
- [x] Credits settle exactly once and wallet/history update correctly.
- [x] Failed/retried checkout does not double charge credits.
- [ ] Manual fallback (if enabled) works end-to-end with verification workflow.
- [x] Owner/manager-only controls are enforced.
- [ ] Support can trace each top-up from UI event to ledger entry in under 5 minutes.

## Ownership and Dates

- Product owner: TBD
- Engineering owner: TBD
- Billing operations owner: TBD
- Support owner: TBD
- Target pilot start date: TBD
- Target release date: TBD

## Open Decisions

- [ ] Reuse existing `/api/ai/payments/checkout` contracts vs add account-specific top-up contracts.
- [ ] Stripe path for credits: direct provider session vs internal checkout redirect model.
- [ ] Manual fallback default policy for production (`enabled` vs `disabled`).
- [ ] Whether cashier role should see read-only wallet balance or no AI billing data at all.

## Change Log

- 2026-04-07: Tracker created for implementing Stripe-first AI credit top-up inside `My Account` with strong UX, idempotent billing behavior, and production-grade supportability.
- 2026-04-07: Implemented account AI top-up foundation in website: authenticated proxy routes (`/api/account/ai/wallet`, `/credit-packs`, `/payments`, `/payments/checkout`), account-page AI wallet/packs/history UI, card checkout CTA, and route-test coverage.
- 2026-04-07: Added account-page AI checkout status reconciliation: persisted pending reference, auto-refresh polling after return, latest checkout status panel, and UI flow test coverage for checkout -> status success.
- 2026-04-07: Added stricter account checkout proxy payload validation (`pack_code` required, `payment_method` enum) with route-test coverage.
