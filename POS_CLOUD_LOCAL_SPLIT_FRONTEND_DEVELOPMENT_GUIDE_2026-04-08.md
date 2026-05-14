# POS Cloud/Local Split Frontend Development Guide (Comprehensive)

Last updated: 2026-04-08  
Audience: frontend team building `website` (marketing/account) and `frontend` (POS runtime)

## 1. Backend Readiness Confirmation

Backend implementation status for frontend integration:
- Contract freeze: **PASS** (`BACKEND_CONTRACT_FREEZE_REVIEW_2026-04-08.md`)
- Gate C backend verification bundle: **92 passed, 0 failed** (`GATE_C_PILOT_READINESS_STATUS_2026-04-08.md`)
- Frozen frontend-facing contract is ready for implementation.

Important backend program status:
- There are still program blockers in the tracker (`POS_CLOUD_LOCAL_SPLIT_IMPLEMENTATION_TRACKER.md`):
  - tenant/branch migration identifier strategy finalization
  - cloud owner identity store schema not implemented
  - POS secure secret storage mechanism final selection pending
- These blockers are pilot/rollout governance items, not blockers for starting frontend build on frozen routes.

## 2. Product Architecture for Frontend

Frontend must support two separate systems:
- `website` app: marketing onboarding + owner account portal in cloud context.
- `frontend` app: local POS runtime with local users and cloud licensing/AI calls.

Identity boundaries:
- Owner account login is cloud/portal auth.
- POS cashier/manager/admin login is local POS auth.
- POS-to-cloud calls use device identity and license context, not cashier passwords.

## 3. Codebase Map (Current)

Marketing + account app:
- `website/src/app/[locale]/start/page.tsx`
- `website/src/app/[locale]/account/page.tsx`
- `website/src/app/api/payment/*`
- `website/src/app/api/account/*`

POS runtime app:
- `frontend/src/App.tsx`
- `frontend/src/components/licensing/LicensingContext.tsx`
- `frontend/src/components/licensing/LicenseScreens.tsx`
- `frontend/src/components/auth/AuthContext.tsx`
- `frontend/src/pages/Index.tsx`
- `frontend/src/lib/api.ts`

Current frontend test anchors:
- `website/src/app/[locale]/account/account.page.flow.test.tsx`
- `website/src/app/api/account/account.routes.test.ts`
- `frontend/src/components/licensing/LicensingContext.test.tsx`
- `frontend/src/lib/api.token-recovery.test.ts`
- `frontend/src/lib/api.sync.test.ts`

## 4. Environment and Local Run

Website (`website`):
- `npm install`
- `npm run dev`
- Runs on `http://localhost:3000`
- Required env:
  - `SMARTPOS_BACKEND_API_URL`
  - optional toggles:
    - `NEXT_PUBLIC_ACCOUNT_AI_TOPUP_ENABLED`
    - `NEXT_PUBLIC_ACCOUNT_AI_TOPUP_MANUAL_FALLBACK_ENABLED`
    - `NEXT_PUBLIC_MARKETING_MANUAL_BILLING_FALLBACK_ENABLED`

POS frontend (`frontend`):
- `npm install`
- `npm run dev`
- Required env:
  - `VITE_API_BASE_URL`
  - optional:
    - `VITE_INSTALLER_DOWNLOAD_URL`
    - `VITE_INSTALLER_CHECKSUM_SHA256`

## 5. Frozen API Contracts You Must Build Against

Marketing flow backend routes:
- `POST /api/license/public/payment-request`
- `POST /api/license/public/payment-submit`
- `POST /api/license/public/payment-proof-upload`
- `POST /api/license/public/stripe/checkout-session`
- `GET /api/license/public/stripe/checkout-session-status`
- `GET /api/license/access/success`
- `POST /api/license/public/download-track`

Account portal backend routes:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/sessions`
- `POST /api/auth/sessions/{device_code}/revoke`
- `POST /api/auth/sessions/revoke-others`
- `GET /api/license/account/licenses`
- `POST /api/license/account/licenses/devices/{device_code}/deactivate`
- `GET /api/ai/wallet`
- `GET /api/ai/credit-packs`
- `GET /api/ai/payments`
- `POST /api/ai/payments/checkout`

POS cloud contract (available now, migration target):
- `GET /cloud/v1/health`
- `GET /cloud/v1/meta/version-policy`
- `GET /cloud/v1/meta/contracts`
- `GET /cloud/v1/meta/ai-privacy-policy`
- `GET /cloud/v1/releases/latest`
- `GET /cloud/v1/releases/min-supported`
- `POST /cloud/v1/device/challenge`
- `POST /cloud/v1/device/activate`
- `POST /cloud/v1/device/deactivate`
- `GET /cloud/v1/license/status`
- `POST /cloud/v1/license/heartbeat`
- `GET /cloud/v1/license/feature-check`

## 6. Required Request Semantics

For protected cloud writes:
- send `Idempotency-Key`
- send `X-Device-Id`
- send `X-POS-Version`

Behavior:
- replayed write returns committed result and `X-Idempotency-Replayed: true`
- never show duplicate success toasts or duplicate state mutations on replay

Session security:
- on `401` with `AUTH_SESSION_REVOKED` or `AUTH_SESSION_INVALID`, clear local auth state and redirect to login

Version compatibility:
- handle `400 POS_VERSION_INVALID`
- handle `426 POS_VERSION_UNSUPPORTED` with forced update UX

## 7. Role Matrix for Frontend Rendering

Portal:
- owner: full license + AI billing sections
- manager: full license + AI billing sections
- cashier: deny license/AI sections and show role access message

POS runtime:
- owner/manager/admin: AI features allowed
- cashier: no AI usage entry points and no AI wallet/license account controls

Critical rule:
- UI hide is not enough; API already enforces `403`, and frontend must handle `403` gracefully without retries.

## 8. Website Frontend Implementation Guide

## 8.1 Start Page (`/start`)

Current implemented behavior:
- owner account fields submitted with onboarding request.
- paid plans support Stripe and optional manual fallback.
- starter plan skips payment.

Current payload shape:
- `owner_username`
- `owner_password`
- `owner_full_name`
- `shop_name`
- `plan_code`
- contact fields

Frontend task note:
- If product decision is email-as-username, update form and payload mapping to use email value for `owner_username` until backend contract changes.

## 8.2 Account Page (`/account`)

Current implemented behavior:
- account login
- license portal device list and self-deactivate
- installer and checksum display
- PWA install prompt
- AI wallet, packs, checkout, payment history, status polling
- cashier access denial messaging

Must preserve:
- AI top-up only in account page, not start page
- clear status guidance for `pending`, `pending_verification`, `failed`, `succeeded`

## 8.3 Website Proxy Layer

Use existing proxy routes in `website/src/app/api/*`:
- payment proxies: `website/src/app/api/payment/*`
- account proxies: `website/src/app/api/account/*`

Rules:
- keep idempotency for mutation routes
- forward auth cookies for account routes
- never expose backend internal URLs in browser code

## 9. POS Frontend Implementation Guide

## 9.1 App Bootstrap Sequence

Current sequence in `frontend/src/App.tsx`:
1. license gate via `LicensingProvider`
2. if unprovisioned -> activation screen
3. if blocked -> blocked screen
4. if licensed -> auth flow via `AuthProvider`
5. role-based route dispatch to POS or admin console

Keep this gate order unchanged.

## 9.2 Licensing UX Requirements

Implement and maintain:
- activation screen with device code copy + activation key input
- blocked screen with recovery steps
- grace banner in active runtime
- offline banner with grant limits and pending sync count

All from:
- `frontend/src/components/licensing/LicenseScreens.tsx`
- `frontend/src/components/licensing/LicensingContext.tsx`

## 9.3 POS Main Runtime and Role UX

In `frontend/src/pages/Index.tsx`:
- cashier toolbar visibility already driven by `shopProfile` flags
- AI FAB currently shown only for admin/manager path
- license account dialog and AI dialog are wired

Required behavior to verify:
- cashier cannot open AI dialog through visible controls
- direct API `403` shows access-denied toasts/messages and no infinite retries

## 9.4 AI Features in POS

AI entry points:
- `AiInsightsFab`
- `AiInsightsDialog`
- chat components under `frontend/src/components/chatbot/*`

Backend calls used:
- `/api/ai/wallet`
- `/api/ai/insights*`
- `/api/ai/chat/*`
- `/api/ai/credit-packs`
- `/api/ai/payments*`

Frontend rule:
- wallet is shop-scoped and shared; do not represent as per-user balance.

## 9.5 API Client Layer

Centralize behavior in `frontend/src/lib/api.ts`:
- idempotency key injection for mutations
- token replay recovery (`TOKEN_REPLAY_DETECTED`)
- device proof fallback/recovery
- consistent error mapping

Do not bypass this wrapper in new components.

## 10. Planned Frontend Migration to `/cloud/v1`

Current POS runtime still uses legacy `/api/*` licensing routes internally.
Next frontend step (after UI stabilization):
- move license/device/version metadata calls to `/cloud/v1/*`
- keep legacy fallback temporarily for compatibility window
- surface deprecation warnings in diagnostics UI only, not cashier flow

## 11. UX Flows to Build and Validate

Owner onboarding:
1. submit start page
2. complete Stripe/manual flow
3. open account page
4. login with owner credentials
5. view installer + activation key + wallet

Activation and first sale:
1. install POS
2. activate device with entitlement key
3. login local POS user
4. add product
5. complete first checkout sale

AI usage:
1. owner tops up wallet in account page
2. manager in POS uses AI
3. wallet decreases from same shop pool
4. cashier denied at API/UI

## 12. Frontend Test Matrix (Minimum)

Website tests:
1. start flow request + Stripe return + status polling
2. account login + portal load + device deactivation
3. AI checkout card + manual bank transfer + status reconciliation
4. cashier account login shows access-denied panel

POS tests:
1. unprovisioned activation flow
2. blocked license flow
3. grace/offline banners
4. auth revoked handling
5. cashier AI denial handling
6. token replay recovery on mutation retry
7. offline sync grant prefetch behavior

## 13. Definition of Done for Frontend Build

Frontend can be considered implementation-complete when:
- all frozen routes are integrated without contract drift
- role visibility and deny UX match matrix
- onboarding-to-first-sale pilot walkthrough succeeds in staging
- no duplicate writes from client retries
- session revoke and version-unsupported paths have deterministic UX

## 14. Known Gaps and Decisions to Keep Visible

Keep explicit in team backlog:
- Owner signup currently uses `owner_username`; if business requires email-only identity, this needs a coordinated contract update.
- Cloud owner identity store schema is still a backend program blocker for full production governance.
- POS secure secret-storage final implementation is pending runtime hardening decision.

## 15. Suggested Execution Order for Frontend Team

1. Stabilize website account and start page behavior on frozen contracts.
2. Finalize POS role-based UX enforcement and AI denial states.
3. Add version policy/update surfaces in POS UI from cloud metadata endpoints.
4. Run full onboarding-to-first-sale staging script with evidence capture.
5. Then begin visual/UI iteration work after behavior is locked.

