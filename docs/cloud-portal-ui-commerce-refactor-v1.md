# Cloud Portal UI + Commerce Refactor v1 (Pending Review, Product Catalog, Purchase Approval)

## Summary
- Refactor cloud portal from device-centric onboarding to business-centric shop onboarding and purchasing.
- Deliver full end-to-end v1: UI + backend APIs + DB model + admin approval/assignment workflow.
- Keep compatibility with current marketing/payment flow during rollout (no hard cutover in v1).
- Defaults locked:
  1. Registration status starts as `pending_review`.
  2. Registration requires `email`; `phone` is optional.
  3. Approvers are `super_admin` + `billing_admin`.
  4. Product model is a single catalog with `product_type` (POS + AI).

## Implementation Changes

### 1. Domain and persistence (backend)
- Add first-class cloud commerce entities:
  - `cloud_shop_accounts`
  - `cloud_shop_owner_profiles`
  - `cloud_product_catalog`
  - `cloud_purchase_orders`
  - `cloud_purchase_order_items`
  - `cloud_product_assignments`
- Keep existing licensing/wallet/order tables and integrate with them.
- Add migration with backfill rules:
  - Existing shops map into `cloud_shop_accounts` as active records.
  - Existing owner users map into `cloud_shop_owner_profiles` when possible.
  - Existing static plans/AI packs are seeded into `cloud_product_catalog` as active rows.
- Add explicit purchase state machine:
  - `draft`, `submitted`, `payment_pending`, `paid`, `pending_approval`, `approved`, `rejected`, `assigned`, `cancelled`.
- Enforce assignment behavior:
  - POS product assignment updates subscription/license entitlement.
  - AI product assignment credits wallet through current settlement path.
- Keep static `LicenseService` catalogs only as compatibility fallback; mark deprecated in code comments.

### 2. Backend API refactor
- Registration/account APIs:
  - `POST /api/cloud/register` (creates pending shop account + owner profile + owner user)
  - `GET /api/cloud/register/{request_id}` (status tracking)
- Product catalog APIs (admin):
  - `GET /api/admin/cloud/products`
  - `POST /api/admin/cloud/products`
  - `PUT /api/admin/cloud/products/{product_id}`
  - `POST /api/admin/cloud/products/{product_id}/deactivate`
- Purchase APIs:
  - Owner:
    - `POST /api/account/purchases`
    - `GET /api/account/purchases`
    - `GET /api/account/purchases/{purchase_id}`
  - Admin:
    - `GET /api/admin/cloud/purchases`
    - `POST /api/admin/cloud/purchases/{purchase_id}/approve`
    - `POST /api/admin/cloud/purchases/{purchase_id}/reject`
    - `POST /api/admin/cloud/purchases/{purchase_id}/assign`
    - `POST /api/admin/cloud/assignments/{assignment_id}/revoke`
- User management APIs (admin cloud-managed users):
  - Create, edit, activate/deactivate, reset password, assign role.
- Shop management APIs (admin):
  - Shop CRUD + owner remap + assigned products + purchase history + subscription status + AI balance.
- Authorization matrix:
  - Owner-only for account registration/purchase endpoints.
  - `BillingApprover` policy expanded/confirmed for `super_admin` and `billing_admin`.
  - Existing cashier/manager restrictions unchanged.

### 3. Cloud portal UI refactor
- Replace `/start` form with a registration-first flow:
  - Required: shop name, shop address, contact name, contact email, owner full name, owner address, owner email, username, password, confirm password.
  - Optional: contact phone, owner phone.
  - Remove `device_code` from registration UI.
- Add product purchase UI in account area:
  - Product list/cards from `cloud_product_catalog`.
  - Create purchase with selected product(s), quantity if allowed, and notes.
  - Show purchase timeline/status list.
- Refactor `/[locale]/account`:
  - Remove device-centric login fields/messages from primary account auth UI.
  - Keep activation key/device diagnostics only in a dedicated “POS Provisioning” subpanel, not mixed with account authentication.
- Admin console updates:
  - New Product Catalog tab with CRUD.
  - Purchase Queue tab for approve/reject/assign.
  - Enhanced Shops tab: assigned products, purchase history, wallet/subscription summary.
  - Enhanced Users tab for cloud-managed role/password/activation operations.

### 4. Compatibility rollout
- Preserve current endpoints used by existing portal flows (`/api/license/public/payment-request`, `/api/license/public/payment-submit`) in v1.
- Implement adapters so legacy requests create records in new purchase/order model.
- Keep AI invoice flow running; route it through unified purchase/approval service internally where feasible.
- Add feature flags:
  - `CloudPortal_UseNewRegistration`
  - `CloudPortal_UseNewCatalog`
  - `CloudPortal_UseUnifiedPurchaseApproval`

## Public API / Interface Additions
- Registration request payload:
  - `shop_name`, `shop_address`, `shop_contact_name`, `shop_contact_phone?`, `shop_contact_email`, `owner_full_name`, `owner_address`, `owner_phone?`, `owner_email`, `username`, `password`, `confirm_password`
- Product payload:
  - `product_code`, `product_name`, `product_type` (`pos_subscription|ai_credit`), `description`, `price`, `currency`, `billing_mode`, `validity`, `default_quantity_or_credits`, `active`
- Purchase create payload:
  - `items: [{ product_code, quantity }]`, `note?`
- Purchase/admin response core:
  - `purchase_id`, `order_number`, `shop_code`, `status`, `items`, `total_amount`, `currency`, `created_at`, `updated_at`, `approved_by?`, `rejected_by?`, `assigned_by?`
- Assignment response:
  - `assignment_id`, `product_code`, `shop_code`, `status`, `effective_from`, `effective_to?`, `revoked_at?`

## Test Plan
1. Registration validation: required fields, username global uniqueness, password policy, confirm-password mismatch.
2. Registration lifecycle: submit -> `pending_review`; admin can approve/reject; owner visibility matches state.
3. Product CRUD: create/update/deactivate/list/search for both product types.
4. Purchase creation: owner can submit valid products only; manager/cashier blocked.
5. Approval flow: billing_admin/super_admin approve/reject with audit trail.
6. Assignment flow: approved POS purchase creates/updates entitlement; approved AI purchase credits wallet exactly once.
7. Revoke flow: admin revoke updates assignment state and downstream entitlement behavior.
8. Security: cross-shop access blocked; role matrix enforced for all new endpoints.
9. Compatibility: legacy marketing/payment endpoints still function and create valid new-model purchase records.
10. UI regression: account auth no longer requires device code; provisioning messaging isolated to POS provisioning panel.

## Assumptions and Defaults
- Email is required at registration; phone is optional.
- Registration is admin-gated and starts as `pending_review`.
- Approver roles are `super_admin` and `billing_admin` only.
- Single product catalog serves both POS and AI via `product_type`.
- v1 is additive/compatible; hard cutover and removal of legacy endpoints is deferred to v2 after telemetry confirms adoption.
