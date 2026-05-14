# Frontend Adoption Tracker (lovable-frontend-design -> Smart POS)

Date: 2026-04-08
Mode: Visual-layer merge (no backend/API contract changes)

## Locked Decisions
- Keep `website` and `frontend` app structures unchanged.
- Keep existing routes and IA unchanged.
- Keep all existing API endpoints, headers, payloads, and semantics unchanged.
- Do not import demo `mockApi`/demo auth/role/POS contexts from source design repo.

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` completed
- `[!]` blocked

## Slice Board

### Slice A - Shared Design Layer
Status: `[x]`
- Added shared visual primitives and tokens in:
  - `website/src/app/globals.css`
  - `website/tailwind.config.ts`
  - `frontend/src/index.css`
  - `frontend/tailwind.config.ts`
- Added app-shell/surface/field/status utilities for controlled reuse.

### Slice B - Website `/start`
Status: `[x]`
- Visual refresh applied in:
  - `website/src/app/[locale]/start/page.tsx`
- Preserved onboarding/payment behavior:
  - owner credential capture
  - Stripe/manual branching
  - idempotent write calls
  - checkout return/polling

### Slice C - Website `/account`
Status: `[x]`
- Visual refresh applied in:
  - `website/src/app/[locale]/account/page.tsx`
- Preserved behavior:
  - login/logout/session hydration
  - role gating (owner/manager allow, cashier deny)
  - license/device management
  - installer + checksum + PWA install flows
  - AI wallet/top-up flows and status polling

### Slice D - POS Shell + AI Visual Refresh
Status: `[x]`
- Visual refresh applied in:
  - `frontend/src/pages/Index.tsx`
  - `frontend/src/components/pos/HeaderBar.tsx`
  - `frontend/src/components/pos/AiInsightsDialog.tsx`
  - `frontend/src/components/pos/AiInsightsFab.tsx`
- Preserved runtime behavior:
  - license and offline/grace gates
  - local auth and role restrictions
  - existing API client/retry/idempotency behavior

## Validation Evidence
- Website tests: `npm test` (18 passed)
- Frontend tests: `npm test` (67 passed)
- Website build: `npm run build` (pass)
- Frontend build: `npm run build` (pass)

## Notes
- Frontend chunk-size warning remains pre-existing in `frontend` build output and does not block this UI adoption pass.
