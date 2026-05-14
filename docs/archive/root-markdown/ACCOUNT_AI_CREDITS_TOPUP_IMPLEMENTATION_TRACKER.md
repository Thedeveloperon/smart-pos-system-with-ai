# Shop-Scoped AI Credits Implementation Tracker

Last updated: 2026-04-07

## Goal

Move from user-scoped AI credits to shop/business-scoped AI credits and align onboarding + account flows with:

1. Owner self-signup from marketing website.
2. Install package options in My Account (PWA + Windows).
3. Dedicated shop wallet.
4. Top-up from My Account only.
5. Shared usage by owner and manager.
6. Cashier blocked from AI usage and AI billing visibility.

## Status Legend

- [ ] Not started
- [~] In progress / partially complete
- [x] Completed

## Locked Product Decisions

- [x] Owner account is created during marketing onboarding self-signup.
- [x] AI credit purchase entrypoint is My Account, not `/start`.
- [x] Cashier cannot use AI credits or access AI wallet/top-up UI.
- [x] Keep both install options visible (PWA + Windows) until packaging decision is finalized.

## User Flows

1. Owner Onboarding Flow
- [x] Marketing onboarding request now captures owner credentials (`owner_username`, `owner_password`, `owner_full_name`).
- [x] Shop + owner account mapping is created/ensured during onboarding.
- [x] Trial path provisions shop + owner without payment.
- [x] Paid path keeps onboarding tied to the same shop record and owner account.

2. Install Flow (Post-Payment)
- [x] My Account includes installer download path and PWA install path.
- [x] AI billing logic is independent from installer choice.

3. Shop Wallet Top-Up Flow
- [x] My Account top-up routes proxy to backend AI payment endpoints.
- [x] Checkout records and payment history are shop-scoped in backend.
- [x] Manual verify / webhook settlement updates shared shop wallet.

4. AI Usage Flow (Shared Shop Credits)
- [x] Reserve/charge/refund now resolve wallet by shop (`StoreId` mapping from authenticated user).
- [x] Owner/manager users mapped to the same shop consume shared balance.
- [x] Audit trail retains actor user while wallet owner is shop.

5. Cashier Flow
- [x] Cashier is blocked at API policy layer for AI endpoints (`/api/ai/*` requires ManagerOrOwner policy; cashier excluded).
- [x] Account page gating avoids loading AI billing data for non owner/manager roles.
- [x] Cashier receives forbidden behavior if attempting restricted AI/account operations.

## Implementation Checklist

1. Data Model + Migration
- [x] Added shop ownership fields to AI wallet, ledger, and payments.
- [x] Added AI wallet migration ledger entity/table for auditability.
- [x] Added schema updater logic for shop columns, backfill from user `StoreId`, wallet consolidation, and indexes.
- [x] Added explicit unmapped-user guard for AI billing usage.

2. Onboarding / Account Provisioning
- [x] Marketing contracts updated for owner credential fields.
- [x] Marketing service provisions/ensures owner account mapped to onboarding shop.
- [x] `/start` flow removed AI package purchase request semantics from request creation.

3. AI Billing Scope Change
- [x] Billing service resolves wallets by shop context.
- [x] Payment service stores and reads shop-scoped payment ownership.
- [x] Settlement and refund operations post to shop wallet with actor metadata retained.

4. Authorization and Role Policy
- [~] Cashier exclusion is enforced server-side and in account UI.
- [~] Owner/manager shared usage is enforced.
- [~] Admin roles still retain some broader API access through existing policy for operational scenarios; strict owner/manager-only scope for every customer-facing AI route is not fully narrowed yet.

5. Website UX Updates
- [x] `/start` now focuses on onboarding + owner account creation, not AI top-up.
- [x] My Account AI panel supports wallet, packs, checkout, status polling, retries, and history.
- [x] My Account handles unauthorized/forbidden responses and hides unavailable billing actions.
- [x] Installer options remain visible in account.

6. Tracker Refactor
- [x] Tracker objective changed from user/account top-up to shop wallet billing model.
- [x] Explicit sections added for onboarding provisioning, migration, role enforcement, and cashier exclusion.

## Public API / Interface Notes

- [x] Marketing onboarding payload now includes owner credential fields.
- [x] Existing `/api/account/ai/*` routes remain, with shop-scoped backend semantics.
- [x] AI usage/payment internal billing charges by shop derived from authenticated user mapping.
- [x] `/start` no longer submits AI package purchase fields in website onboarding requests.

## Test Status

- [x] Backend build passes.
- [x] Targeted integration suites pass:
  - `AiInsightsCreditFlowTests`
  - `AiInsightsFailureRefundTests`
  - `LicensingMarketingPaymentFlowTests`
  - `LicensingStripeCheckoutStatusEndpointTests`
- [x] Website flow tests pass:
  - `start.page.stripe-return.test.tsx`
  - `account.page.flow.test.tsx`

## Remaining Work

- [ ] Decide whether to enforce strict owner/manager-only access on all customer-facing AI routes (while keeping separate admin operational endpoints).
- [ ] Run full regression suite beyond targeted tests before release.
- [ ] Finalize production payment provider behavior and operational playbook (Stripe/manual reconciliation).

## Change Log

- 2026-04-07: Switched AI billing ownership to shop scope in domain model, schema updater, billing, and payment services.
- 2026-04-07: Refactored marketing onboarding to create/ensure owner account and removed `/start` AI-credit purchase behavior.
- 2026-04-07: Updated `/start` UI to owner-account-first onboarding fields and removed AI package controls.
- 2026-04-07: Updated integration and website tests to align with shop-scoped AI wallet behavior and confirmed targeted suites passing.
