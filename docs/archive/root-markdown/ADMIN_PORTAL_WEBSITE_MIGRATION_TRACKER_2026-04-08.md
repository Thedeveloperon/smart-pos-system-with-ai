# Admin Portal Migration Tracker (POS -> Website)

Date: 2026-04-08
Owner: Platform Engineering

## Locked Decisions
- Full parity target: POS super-admin capabilities moved to website `/admin`.
- Admin IA: non-localized direct routes `/admin/login` and `/admin`.
- Backend contracts: no endpoint/path/payload changes.
- Session model: shared backend auth cookie.
- Cutover: hard switch from POS admin to website admin.

## Checkpoints
- [x] Website admin routes created (`/admin/login`, `/admin`)
- [x] Website admin auth flow wired to existing backend login/me/logout
- [x] Website proxy layer added for `/api/admin/*`, `/api/reports/*`, `/api/ai/*`, `/api/cash-sessions/*`
- [x] Admin console UI migrated into website app (`AdminConsole`)
- [x] Billing admin workspace migrated into website app (`BillingAdminWorkspace`)
- [x] Super-admin reports/admin operations panel migrated into website app (`ManagerReportsDrawer`)
- [x] POS `/admin*` runtime disabled and redirected to website admin portal
- [x] POS admin sign-in references replaced with website admin URL

## Parity Matrix (v1)
- [x] AI pending manual list + verify
- [x] Manual invoice create/record/verify/reject
- [x] Device actions: activate/deactivate/revoke/reactivate/transfer/extend grace
- [x] Emergency actions: lock/revoke token/force reauth
- [x] Billing reconciliation and drift reconciliation actions
- [x] Audit search + export (CSV/JSON)
- [x] Support triage + report views in admin drawer

## Validation Pending
- [ ] Website app build and regression run
- [ ] Role matrix smoke test (`support_admin`, `billing_admin`, `security_admin`, non-admin)
- [ ] Cutover smoke: POS `/admin*` handoff + website `/admin` end-to-end
- [ ] Cross-flow smoke: bank transfer onboarding -> admin verify -> account/license readiness

## Evidence Links
- Website admin routes:
  - `website/src/app/admin/login/page.tsx`
  - `website/src/app/admin/page.tsx`
- Website admin components:
  - `website/src/components/admin/AdminLoginForm.tsx`
  - `website/src/components/admin/AdminWorkspace.tsx`
  - `website/src/components/admin/AdminConsole.tsx`
  - `website/src/components/admin/BillingAdminWorkspace.tsx`
  - `website/src/components/admin/ManagerReportsDrawer.tsx`
- Website proxy layer:
  - `website/src/app/api/_upstreamProxy.ts`
  - `website/src/app/api/admin/[...path]/route.ts`
  - `website/src/app/api/reports/[...path]/route.ts`
  - `website/src/app/api/ai/[...path]/route.ts`
  - `website/src/app/api/cash-sessions/[[...path]]/route.ts`
- POS hard switch:
  - `frontend/src/App.tsx`
  - `frontend/src/components/auth/LoginScreen.tsx`
  - `frontend/src/components/licensing/LicenseScreens.tsx`
