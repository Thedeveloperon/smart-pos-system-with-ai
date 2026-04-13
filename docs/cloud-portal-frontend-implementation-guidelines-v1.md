# Cloud Portal Frontend Implementation Guidelines v1

Date: 2026-04-13
Owner: Cloud Portal Frontend Team
Reference plan: `docs/cloud-portal-ui-commerce-refactor-v1.md`

## 1. Purpose
This document is the implementation guide for frontend developers to deliver the cloud portal refactor in v1.

Primary goals:
- Move onboarding and purchases to business-first cloud workflows.
- Keep legacy marketing/payment flow operational during transition.
- Support two complete flows:
  - Shop owner: registration -> purchase POS plan and AI credits.
  - Super admin and billing admin: review -> approve/reject -> assign/revoke.

Non-goals for this frontend scope:
- POS local app UI changes.
- Backend schema design details beyond required API contracts.

## 2. Current Codebase Orientation
Framework and stack:
- Next.js App Router (React 18 + TypeScript)
- Tailwind utility classes
- Shared UI primitives in `apps/cloud-portal/src/components/ui`
- API requests are proxied through Next route handlers under `apps/cloud-portal/src/app/api`

Main entry points already in use:
- Marketing onboarding page: `apps/cloud-portal/src/app/[locale]/start/page.tsx`
- Account page: `apps/cloud-portal/src/app/[locale]/account/page.tsx`
- Admin workspace shell: `apps/cloud-portal/src/components/admin/AdminWorkspace.tsx`
- Admin console: `apps/cloud-portal/src/components/admin/AdminConsole.tsx`
- Existing admin panels:
  - `apps/cloud-portal/src/components/admin/AdminShopsPanel.tsx`
  - `apps/cloud-portal/src/components/admin/AdminUsersPanel.tsx`
  - `apps/cloud-portal/src/components/admin/BillingAdminWorkspace.tsx`
  - `apps/cloud-portal/src/components/admin/AiCreditInvoiceRequestsPanel.tsx`

API route proxy helpers:
- Generic upstream: `apps/cloud-portal/src/app/api/_upstreamProxy.ts`
- Account proxy helper: `apps/cloud-portal/src/app/api/account/_proxy.ts`
- Payment proxy helper: `apps/cloud-portal/src/app/api/payment/_proxy.ts`

Client API helper module:
- `apps/cloud-portal/src/lib/adminApi.ts`

Existing tests worth extending:
- `apps/cloud-portal/src/app/[locale]/account/account.page.flow.test.tsx`
- `apps/cloud-portal/src/app/api/account/account.routes.test.ts`

## 3. Target User Flows

### 3.1 Shop owner flow
1. Owner opens marketing registration page.
2. Owner submits full shop + owner registration form.
3. System creates account request in `pending_review` state.
4. Owner logs in to account page using cloud credentials.
5. Owner browses product catalog (POS subscriptions and AI credit packs).
6. Owner creates purchase order(s).
7. Purchase moves through statuses (`submitted`, `payment_pending`, `paid`, `pending_approval`).
8. Owner sees final result:
   - POS plan approved and assigned -> subscription/license entitlement reflected.
   - AI credits approved and assigned -> wallet credited.
9. Owner can review history and status timelines.

### 3.2 Super admin and billing admin flow
1. Admin logs in at `/admin`.
2. Admin reviews pending registrations and purchase queue.
3. Admin performs actions:
   - approve registration or reject registration
   - approve purchase or reject purchase
   - assign approved product to shop
   - revoke assignment when needed
4. Admin monitors:
   - shop status
   - assigned products
   - purchase history
   - subscription/license state
   - AI credit balance

## 4. Role Rules and Access Matrix
Frontend must enforce UI visibility by role. Backend still remains source of truth.

Roles:
- Owner: account registration and own-shop purchases.
- Billing admin: purchase approvals and assignments.
- Super admin: full admin controls including product/shop/user management and approvals.
- Manager and cashier: no access to owner purchase and admin approval actions.

UI-level rules:
- Registration UI is public.
- Purchase creation UI is owner-only.
- Approval queue and assignment controls are `billing_admin` and `super_admin` only.
- Product CRUD and shop/user management are `super_admin` only unless backend policy explicitly expands.

## 5. Frontend Implementation Plan

### 5.1 Refactor `/[locale]/start` into registration-first flow
File to refactor: `apps/cloud-portal/src/app/[locale]/start/page.tsx`

Required form fields:
- shop name
- shop address
- shop contact name
- shop contact email (required)
- shop contact phone (optional)
- owner full name
- owner address
- owner email
- owner phone (optional)
- username
- password
- confirm password

Implementation requirements:
- Remove device-code-first dependency from primary registration path.
- Keep field-level and submit-level validation in UI.
- Validate confirm-password client-side before submit.
- Show server validation errors inline using existing error message style.
- On success, present request status (`pending_review`) with next steps.

### 5.2 Refactor `/[locale]/account` for commerce-first owner experience
File to refactor: `apps/cloud-portal/src/app/[locale]/account/page.tsx`

Implementation requirements:
- Keep account sign-in with cloud credentials.
- Move device/provisioning controls out of the primary account auth section.
- Add product catalog and purchase section:
  - product cards/list by product type
  - quantity and derived totals where allowed
  - purchase submit action
  - status timeline and order history
- Keep AI wallet and AI history visible as part of account financial state.
- Reuse existing invoice and payment status rendering patterns where possible.

### 5.3 Extend admin workspace for approval and assignment
Main file: `apps/cloud-portal/src/components/admin/AdminConsole.tsx`

Add new admin panels:
- Product catalog management panel.
- Purchase queue panel with approve/reject.
- Assignment panel for assign/revoke.

Reuse or extend existing panels:
- Keep `AdminShopsPanel` and `AdminUsersPanel` as base.
- Keep `AiCreditInvoiceRequestsPanel` behavior, but align with unified purchase queue when backend is ready.

### 5.4 Add or extend API route proxies under `src/app/api`
Create new route handlers as proxy wrappers to backend endpoints.

Owner-facing proxies:
- `GET|POST /api/account/purchases`
- `GET /api/account/purchases/{purchase_id}`
- `GET /api/account/products` if account catalog endpoint is provided

Admin-facing proxies:
- `GET|POST|PUT /api/admin/cloud/products...`
- `GET /api/admin/cloud/purchases`
- `POST /api/admin/cloud/purchases/{id}/approve`
- `POST /api/admin/cloud/purchases/{id}/reject`
- `POST /api/admin/cloud/purchases/{id}/assign`
- `POST /api/admin/cloud/assignments/{id}/revoke`

Proxy behavior requirements:
- Forward cookies and auth headers.
- Forward idempotency key for mutating calls.
- Normalize upstream non-JSON and empty responses using existing helper conventions.

### 5.5 Extend `src/lib/adminApi.ts`
Add typed client functions for all new owner/admin APIs.

Requirements:
- Use shared `request<T>()` helper.
- Add typed request/response interfaces for new flows.
- Keep mutating requests idempotent.
- Keep all frontend pages/components consuming `adminApi.ts` instead of direct `fetch` for admin/account flows.

## 6. Public API Contracts Frontend Must Implement
Use these payload shapes until backend contract finalization changes them.

Registration request:
- `shop_name`, `shop_address`, `shop_contact_name`, `shop_contact_phone?`, `shop_contact_email`,
  `owner_full_name`, `owner_address`, `owner_phone?`, `owner_email`, `username`, `password`, `confirm_password`

Product item:
- `product_code`, `product_name`, `product_type` (`pos_subscription` or `ai_credit`),
  `description`, `price`, `currency`, `billing_mode`, `validity`, `default_quantity_or_credits`, `active`

Purchase create:
- `items: [{ product_code, quantity }]`, `note?`

Purchase row:
- `purchase_id`, `order_number`, `shop_code`, `status`, `items`, `total_amount`, `currency`,
  `created_at`, `updated_at`, `approved_by?`, `rejected_by?`, `assigned_by?`

Admin actions:
- Approve: `{ actor_note }`
- Reject: `{ actor_note, reason_code? }`
- Assign: `{ actor_note }` plus assignment metadata from backend endpoint
- Revoke: `{ actor_note, reason_code? }`

## 7. UX and Validation Standards
Use the same UI style patterns already used in portal pages.

Validation rules:
- Username must be present and lowercased before submit.
- Email is required for registration.
- Password policy must be enforced client-side and backend-side.
- Confirm password must match before submit.

Error handling:
- Prefer backend message passthrough using existing `parseErrorMessage` behavior.
- Show inline errors near affected form sections.
- Avoid generic failures when a specific backend message exists.

Status rendering:
- Convert snake_case to sentence labels in UI.
- Always show last updated time for registration/order statuses.
- Keep a visible badge for `pending_review`, `pending_approval`, `approved`, `rejected`, `assigned`.

## 8. Compatibility and Feature Flags
v1 must remain additive.

Required behavior:
- Do not remove legacy payment endpoints or legacy screens in the same release.
- New flows can coexist with current `/api/payment/request` and `/api/payment/submit` path.
- If feature flags are wired, gate new UI sections with:
  - `CloudPortal_UseNewRegistration`
  - `CloudPortal_UseNewCatalog`
  - `CloudPortal_UseUnifiedPurchaseApproval`

Environment requirement:
- `SMARTPOS_BACKEND_API_URL` must point to backend API host for all portal proxy routes.

## 9. Test Requirements for Frontend Team
Add or update tests for each section.

API route tests:
- Extend `account.routes.test.ts` and add new admin route tests.
- Validate proxy forwarding, idempotency, and error handling.

Page flow tests:
- Registration happy path and validation failures.
- Account purchase creation and status rendering.
- Owner-only and admin-only visibility rules.

Admin UI tests:
- Product CRUD panel rendering and submit actions.
- Purchase approval/reject and assignment/revoke actions.
- Role-based panel visibility.

Manual QA checklist:
- New owner registration produces `pending_review` state.
- Owner can create POS and AI purchases.
- Billing admin/super admin can approve/reject and assign/revoke.
- Approved AI purchase updates wallet display.
- Approved POS purchase updates subscription/license display.
- Legacy payment flow still works during compatibility period.

## 10. Definition of Done
Frontend implementation is done when:
- All required owner and admin flows are present and role-guarded.
- New API proxies and typed client functions are in place.
- Tests pass for new route handlers and page workflows.
- Legacy flow remains functional.
- No device-code dependency is present in the primary registration flow.
- Developer handoff notes include any backend endpoint mismatches found during integration.

## 11. Recommended Delivery Sequence
1. Add types and API client functions in `adminApi.ts`.
2. Add Next API proxy routes for new endpoints.
3. Refactor `/start` registration flow.
4. Refactor `/account` purchase and status flow.
5. Add admin product and purchase/assignment panels.
6. Wire role-based visibility.
7. Add tests and complete manual QA matrix.

This sequence minimizes merge risk and keeps UI testable at each step.
