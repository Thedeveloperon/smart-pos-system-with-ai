# Manual Test Suite (Full Product, Local Seeded)

Date: 2026-04-30  
Owner: QA / Engineering  
Primary artifact: `docs/MANUAL_TEST_SUITE_2026-04-30.md`

## 1. Summary

This document is the authoritative manual QA suite for the current SmartPOS codebase. It covers end-to-end manual testing across:

- POS app
- Cloud Portal (Owner + Super Admin/Billing Admin)
- Inventory Manager
- Licensing and payment flows
- Windows installer and activation-code desktop utility
- Cross-cutting security and regression checks

This suite is designed for execution by QA engineers without code changes.

## 2. Environment and Prerequisites

### 2.1 Local stack

Run services in local seeded mode:

1. Backend API: `http://127.0.0.1:5080`
2. Cloud portal: `http://127.0.0.1:3000`
3. POS app: `http://127.0.0.1:5173`
4. Inventory Manager: `http://127.0.0.1:5173/inventory-manager/` (or configured route)

Health check:

- `http://127.0.0.1:5080/health`

### 2.2 Seeded users

Shop users:

- `owner / owner123`
- `manager / manager123`
- `cashier / cashier123`

Super admin users (MFA required unless specific bypass flow is intentionally tested):

- `support_admin / support123`
- `billing_admin / billing123`
- `security_admin / security123`

### 2.3 Feature flag defaults

Validate default local flags unless a case says otherwise:

- `VITE_POS_SHORTCUTS_ENABLED=true`
- `VITE_BARCODE_FEATURE_ENABLED=true`
- `ProductBarcodes__Enabled=true`

### 2.4 Required tooling for selected flows

- Windows machine/VM for installer/service validation
- Inno Setup for installer build checks
- Browser with devtools (Chrome/Edge)
- Optional: network throttling/offline simulation for resiliency cases

## 3. Test Case Schema and Conventions

All test tables use this schema:

- `Case ID`
- `Priority (P0/P1/P2)`
- `Surface`
- `Role`
- `Preconditions`
- `Steps`
- `Expected Result`
- `Negative/Edge Variant`
- `Evidence`
- `Status`

### 3.1 Case ID prefixes

- `LIC-*`: licensing and entitlement
- `POS-*`: POS application flows
- `CLOUD-OWNER-*`: cloud owner account and commerce
- `CLOUD-ADMIN-*`: cloud admin and billing workspaces
- `INV-*`: inventory manager
- `INSTALLER-*`: installer and desktop utility
- `SEC-*`: cross-cutting security/permission/idempotency
- `REG-*`: release regression packs

### 3.2 Priority meanings

- `P0`: business-critical smoke (daily)
- `P1`: must-pass before release
- `P2`: extended/non-blocking but required for full confidence

### 3.3 Status values

Use one:

- `Not Run`
- `Pass`
- `Fail`
- `Blocked`

Default all new runs to `Not Run`.

## 4. Manual Test Matrix

## 4.1 Licensing and Access (`LIC-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| LIC-001 | P0 | POS License Gate | Unprovisioned device | Device has no active license | Open POS root URL | "License Activation Required" screen is shown with device code | Refresh page repeatedly during first load | `apps/pos-app/tests/e2e/license-gate.spec.js` | Not Run |
| LIC-002 | P0 | POS License Activation | Owner/Manager | Activation entitlement available or provisioning allowed | Click Activate Device and complete activation | License state transitions to active and app proceeds to Sign In | Retry activation after successful activation | `apps/pos-app/tests/e2e/license-gate.spec.js`, `LicensingFlowTests.cs` | Not Run |
| LIC-003 | P0 | License Suspended | Any shop role | Device status suspended | Open POS root URL | Suspended screen with recovery guidance and blocked actions | Trigger Recheck Status while still suspended | `apps/pos-app/tests/e2e/license-gate.spec.js` | Not Run |
| LIC-004 | P0 | License Revoked | Any shop role | Device status revoked | Open POS root URL | Revoked screen and checkout is unavailable | Try direct route navigation to bypass | `apps/pos-app/tests/e2e/license-gate.spec.js`, `LicensingFlowTests.cs` | Not Run |
| LIC-005 | P1 | Grace Mode UX | Manager | License in grace mode | Sign in and load POS shell | Grace banner shown with grace-until guidance | Trigger sales during grace period | `apps/pos-app/tests/e2e/license-gate.spec.js` | Not Run |
| LIC-006 | P1 | Offline Grant Banner Persistence | Manager | Active license with offline grant token | Dismiss offline banner, rotate token, reload | Banner stays dismissed while grant exists and reappears when grant removed | Toggle online/offline during token rotation | `apps/pos-app/tests/e2e/license-gate.spec.js`, `LicensingOfflinePolicySnapshotTests.cs` | Not Run |
| LIC-007 | P1 | Customer License Portal | Owner | Signed in owner with account license data | Open My Account Licenses and view devices | Current entitlements and devices are visible | Device list empty or stale session | `LicensingCustomerPortalTests.cs`, `apps/cloud-portal/src/app/[locale]/account/account.page.flow.test.tsx` | Not Run |
| LIC-008 | P1 | Device Deactivation by Owner | Owner | At least one non-current device assigned | Deactivate a target device from account portal | Device status updates and audit action recorded | Attempt to deactivate unauthorized/invalid device code | `LicensingCustomerPortalTests.cs` | Not Run |
| LIC-009 | P1 | License Access Success Page | Marketing/Owner | Valid activation entitlement key in query string | Open `/license/success?activation_entitlement_key=...` and click download | Access page shows installer metadata and tracks download event | Expired or invalid key | `apps/pos-app/tests/e2e/marketing-license-flow.spec.js` | Not Run |
| LIC-010 | P2 | Heartbeat Continuity | Manager | Active session and active license | Keep POS running beyond heartbeat interval | License remains valid and no forced lockout | Brief network drop and recovery | `LicensingHeartbeatRotationLoadTests.cs`, `LicensingTokenReissueTests.cs` | Not Run |

## 4.2 POS App (`POS-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| POS-001 | P0 | Sign In | Owner/Manager/Cashier | Active licensed device | Login with valid credentials | Authenticated shell loads; role-appropriate controls are shown | Wrong password and retry | `apps/pos-app/tests/e2e/checkout.spec.js`, `AuthSessionHardeningTests.cs` | Not Run |
| POS-002 | P0 | POS Home Load | Manager | Signed in; backend reachable | Open `/` and wait for shell | Product/search/cash-session UI renders without crash | Unknown route fallback | `apps/pos-app/tests/e2e/checkout.spec.js` | Not Run |
| POS-003 | P0 | Open Cash Session | Cashier | No active session | Enter opening counts and open shift | Session opens and selling enabled | Invalid denomination entries | `CashSessionFlowTests.cs`, `OpeningCashDialog.test.tsx` | Not Run |
| POS-004 | P0 | Add Item to Cart | Cashier | Active session and products loaded | Search product and add to cart | Cart updates quantity and totals | Add same product repeatedly | `ProductSearchPanel.test.tsx`, `CartItemRow.test.tsx` | Not Run |
| POS-005 | P0 | Complete Sale (Cash) | Cashier | Cart with valid items and cash session active | Enter cash received and complete sale | Sale success toast; receipt opens; stock updates | Insufficient cash attempt | `CheckoutRefundFlowTests.cs`, `apps/pos-app/tests/e2e/checkout.spec.js` | Not Run |
| POS-006 | P0 | Hold Bill | Cashier | Cart has items | Trigger hold bill | Bill is moved to held list and cart clears | Hold with empty cart | `CheckoutPanel.shortcuts.integration.test.tsx`, `CheckoutRefundFlowTests.cs` | Not Run |
| POS-007 | P0 | Resume Held Bill | Cashier | At least one held bill | Open held bills and resume selected | Cart restored from held bill | Resume removed/invalid bill | `CheckoutRefundFlowTests.cs` | Not Run |
| POS-008 | P0 | Void Held Bill | Manager | Held bill exists | Delete/void held bill | Held bill removed and inventory recalculated | Void already completed sale id | `CheckoutRefundFlowTests.cs` | Not Run |
| POS-009 | P0 | Refund Flow | Manager | Completed refundable sale exists | Open refund dialog from sale and submit valid quantities | Refund created; totals and stock adjust correctly | Over-refund quantity blocked | `CheckoutRefundFlowTests.cs` | Not Run |
| POS-010 | P1 | Today Sales Drawer | Manager | Transactions exist for day | Open Today Sales and inspect entries | Sales list, totals, and drill actions are correct | Empty day shows no-data state | `TodaySalesDrawer.test.tsx` | Not Run |
| POS-011 | P1 | Manager Reports Drawer | Manager | Transactions exist | Open reports and generate key views | Reports load with expected aggregates | Date range with no records | `ReportEndpoints.cs`, `SupportTriageReportTests.cs` | Not Run |
| POS-012 | P1 | Shop Profile Settings | Owner/Manager | Signed in as elevated role | Open shop settings, edit toggles/fields, save | Settings persist and affect visible controls | Invalid field formats | `ShopProfileReceiptTests.cs` | Not Run |
| POS-013 | P1 | Cash Drawer Management | Manager | Active cash session | Open manage drawer, submit recount | Drawer state updates and audit entry created | Negative totals or empty reason when required | `CashSessionFlowTests.cs` | Not Run |
| POS-014 | P1 | Close Cash Session | Cashier/Manager | Active session with activity | Submit closing counts and close shift | Session closes and summary/report path shown | Large mismatch requiring reason | `CashSessionFlowTests.cs` | Not Run |
| POS-015 | P1 | Product Create from POS | Manager | Manager permissions | Open New Item dialog and create product | Product appears in search/catalog | Missing required product fields | `NewItemDialog.barcode.test.tsx`, `ProductInventoryTests.cs` | Not Run |
| POS-016 | P1 | Product Update from POS | Manager | Existing product | Edit product details and save | Updated values reflected immediately | Duplicate SKU/barcode conflict | `ProductInventoryTests.cs` | Not Run |
| POS-017 | P1 | Barcode Generate/Assign | Manager | Barcode feature flag enabled | Generate barcode for product and verify display | Deterministic valid barcode assigned | Feature flag disabled hides controls | `ProductBarcodeFeatureFlagTests.cs`, `ProductBarcodeRulesUnitTests.cs` | Not Run |
| POS-018 | P1 | Barcode Print Labels | Manager | Product with barcode exists | Open label print dialog and print | Print preview or runtime print trigger works | Browser popup blocked | `BarcodeLabelPrintDialog.test.tsx` | Not Run |
| POS-019 | P1 | Barcode Search/Scan Behavior | Cashier | Product has barcode | Search using barcode value | Exact product resolves quickly | Invalid/partial barcode | `ProductSearchPanel.barcode.test.tsx` | Not Run |
| POS-020 | P1 | Keyboard Shortcut F2 | Cashier | Shortcuts enabled; no modal open | Press F2 | Search field receives focus | While typing in input, shortcut ignored | `usePosShortcuts.test.tsx`, `CheckoutPanel.shortcuts.integration.test.tsx` | Not Run |
| POS-021 | P1 | Keyboard Shortcut F4/F8/F9 | Cashier | Active session | Use F4 hold, F8 cash workflow, F9 complete | Correct action fires or clear blocked reason appears | Trigger with empty cart to verify blocked copy | `CheckoutPanel.shortcuts.integration.test.tsx`, `shortcuts.test.ts` | Not Run |
| POS-022 | P1 | Shortcut Help Overlay | Cashier | Shortcuts enabled | Press F1 or ? then Esc | Help dialog opens and closes | Open while another modal active | `usePosShortcuts.test.tsx` | Not Run |
| POS-023 | P1 | Reminders Panel | Manager | Reminder rules exist | Open reminders, acknowledge one, run now | Counts and status update correctly | Acknowledge already-acknowledged reminder | `ReminderFlowTests.cs` | Not Run |
| POS-024 | P1 | Reminder Banner Dismiss | Manager | Open reminder exists | Dismiss banner and reload | Dismissal persists for same reminder id | New reminder id should re-show banner | `Index.tsx behavior`, `ReminderFlowTests.cs` | Not Run |
| POS-025 | P1 | Offline Queue Manual Sync | Manager | Queue has pending offline events | Trigger manual sync | Synced/conflict/rejected messages are accurate | Force one invalid queued event | `offlineSyncQueue.test.ts`, `SyncEngineTests.cs` | Not Run |
| POS-026 | P1 | Auto Sync on Reconnect | Cashier | Start offline, generate queue events | Restore network and observe auto sync | Pending count drops after reconnect flush | Network flaps during flush | `offlineSyncQueue.test.ts`, `api.sync.test.ts` | Not Run |
| POS-027 | P1 | Session Invalidation Recovery | Any | Active session token | Revoke/expire session and perform API action | User redirected or prompted to sign in again | Non-invalidating AI relay error should not force logout | `api.auth-session.test.ts`, `api.token-recovery.test.ts`, `AuthSessionHardeningTests.cs` | Not Run |
| POS-028 | P2 | AI Insights Dialog | Manager | AI wallet credits available | Open AI insights, run estimate/request | Insight response returns and ledger updates | Provider failure refunds reserved credits | `AiInsightsDialog.test.tsx`, `AiInsightsCreditFlowTests.cs`, `AiInsightsFailureRefundTests.cs` | Not Run |
| POS-029 | P2 | AI Chat Flow | Manager/Cashier | AI chat enabled and authorized | Start chat session and send grounded query | Response stream/message appears in conversation | Unsupported intent fallback response | `AiChatFlowTests.cs`, `AiChatIntentPipelineFlowTests.cs`, `ChatConversation.test.tsx` | Not Run |
| POS-030 | P2 | Supplier Bill OCR Import | Manager | OCR provider configured or fallback path available | Upload supplier bill, review draft, confirm import | Draft parses and confirmed import updates inventory | Duplicate/poor quality invoice image | `ImportSupplierBillDialog.test.tsx`, `PurchaseOcrImportTests.cs`, `PurchaseOcrOpenAiImportTests.cs` | Not Run |
| POS-031 | P2 | Cloud Account Link/Unlink | Owner | Cloud account exists | Link account from POS settings then unlink | Status reflects linked/unlinked states | Invalid cloud credentials | `CloudAccountLinkingTests.cs` | Not Run |

## 4.3 Cloud Portal Owner (`CLOUD-OWNER-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| CLOUD-OWNER-001 | P0 | Marketing Start Plan Routing | Prospect/Owner | Cloud portal up | Open `/en`, click pricing CTA | Routed to `/en/start?plan=...` | Switch locale and repeat | `apps/pos-app/tests/e2e/marketing-license-flow.spec.js` | Not Run |
| CLOUD-OWNER-002 | P0 | Onboarding Request Create | Prospect/Owner | Required fields available | Submit start form with owner credentials and shop details | Payment request created and invoice instructions shown | Missing mandatory fields validation | `apps/cloud-portal/src/app/[locale]/start/page.tsx`, `start.page.stripe-return.test.tsx` | Not Run |
| CLOUD-OWNER-003 | P0 | Manual Payment Submission | Prospect/Owner | Existing pending invoice from onboarding | Submit amount/reference/payment note | Submission accepted and next-step guidance shown | Amount <= 0 or missing reference | `apps/cloud-portal/src/app/[locale]/start/page.tsx` | Not Run |
| CLOUD-OWNER-004 | P0 | Owner Sign In and Session Load | Owner | Owner account exists | Sign in at `/en/account` | Owner dashboard and commerce panels render | Invalid credentials | `account.page.flow.test.tsx` | Not Run |
| CLOUD-OWNER-005 | P1 | Owner Session Expiry Handling | Owner | Session established | Expire session then refresh account page | Session guidance prompts re-login | API 401 during wallet or purchases fetch | `account.page.flow.test.tsx` | Not Run |
| CLOUD-OWNER-006 | P1 | Product Catalog Browsing | Owner | Signed in owner | Navigate Products section and filter | Active products shown with price/discount details | Empty catalog fallback messaging | `adminApi.ts account products`, `account.page.flow.test.tsx` | Not Run |
| CLOUD-OWNER-007 | P1 | Create Cloud Purchase | Owner | At least one purchasable package | Add package and submit purchase | Purchase row appears in history with pending/assigned lifecycle | Submit invalid quantity | `createAccountCloudPurchase`, `LicensingMarketingPaymentFlowTests.cs` | Not Run |
| CLOUD-OWNER-008 | P1 | Purchase History Details | Owner | Purchases exist | Open purchases list and a detail item | Status and amounts match backend data | Unknown purchase id route | `account.page.flow.test.tsx`, `LicenseEndpoints account purchases` | Not Run |
| CLOUD-OWNER-009 | P1 | AI Wallet and Ledger | Owner | Wallet transactions exist | Open AI wallet and ledger sections | Balance and signed deltas are correct | Empty ledger scenario | `account.page.flow.test.tsx`, `AiInsightsCreditFlowTests.cs` | Not Run |
| CLOUD-OWNER-010 | P1 | AI Payment History | Owner | AI payment rows exist | Open payment history panel | Payment statuses and references displayed correctly | Mixed succeeded/pending/failed statuses | `account.page.flow.test.tsx`, `AiCreditPaymentRateLimitTests.cs` | Not Run |
| CLOUD-OWNER-011 | P1 | AI Checkout Return Success | Owner | Valid checkout reference exists | Open `/en/ai-checkout?reference=...` | Polling resolves to succeeded with account return link | Reference not found remains pending guidance | `ai-checkout.page.test.tsx` | Not Run |
| CLOUD-OWNER-012 | P1 | AI Checkout Return Unauthorized | Owner | Session invalidated | Open AI checkout return page | Explicit sign-in guidance displayed | 403 instead of 401 path | `ai-checkout.page.test.tsx` | Not Run |
| CLOUD-OWNER-013 | P1 | License Portal Device Actions | Owner | Devices assigned to owner shop | View device table and deactivate target | Device status updates and audit trail path works | Current device deactivation constraint | `LicensingCustomerPortalTests.cs` | Not Run |
| CLOUD-OWNER-014 | P2 | Locale UX Consistency | Owner | English and Sinhala locales enabled | Compare `/en/account` and `/si/account` key flows | Core flows functional in both locales | Missing translation fallback | `i18n locale tests`, manual | Not Run |

## 4.4 Cloud Portal Admin (`CLOUD-ADMIN-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| CLOUD-ADMIN-001 | P0 | Admin Login | support_admin/billing_admin/security_admin | Valid admin credentials and MFA code | Sign in at `/admin/login` | Authorized users reach admin workspace | Invalid MFA code rejected | `AuthSuperAdminPasswordOnlyLoginTests.cs`, `AdminLoginForm.tsx` | Not Run |
| CLOUD-ADMIN-002 | P0 | Admin Role Gate | Non-admin user | Non-admin has valid session | Open `/admin` | Redirect or unauthorized view shown | Cached stale admin cookie | `AdminWorkspace.tsx`, `AuthSessionHardeningTests.cs` | Not Run |
| CLOUD-ADMIN-003 | P1 | Dashboard Load and KPIs | support_admin | Admin data available | Open admin dashboard overview | KPI cards and sections load without fatal errors | Partial API failure degrades gracefully | `AdminPortalDashboard.tsx` | Not Run |
| CLOUD-ADMIN-004 | P1 | Cloud Product Catalog CRUD | support_admin | Product catalog permissions | Create/update/deactivate product package | Catalog reflects changes and persists | Duplicate product code conflict | `AdminShopCrudTests.cs`, `adminApi.ts` | Not Run |
| CLOUD-ADMIN-005 | P1 | Purchase Queue Approve/Reject/Assign | billing_admin | Pending purchases exist | Approve, reject, and assign separate records | Status transitions and notes persist correctly | Repeat action on already terminal status | `CloudPurchaseQueuePanel.tsx`, `LicensingMarketingPaymentFlowTests.cs` | Not Run |
| CLOUD-ADMIN-006 | P1 | Shops Management CRUD | support_admin/security_admin | Admin has shop management access | Create/update/deactivate/reactivate shop | Shop list updates with audit-safe lifecycle | Hard-delete restrictions and validations | `AdminShopCrudTests.cs` | Not Run |
| CLOUD-ADMIN-007 | P1 | Users Management CRUD | support_admin | Admin has user management access | Create/update/deactivate/reactivate/reset-password | User lifecycle actions succeed with correct role bounds | Attempt invalid role assignment | `AdminShopUserManagementTests.cs` | Not Run |
| CLOUD-ADMIN-008 | P1 | AI Credit Invoice Queue | billing_admin | Pending AI credit invoices exist | Open AI credit invoices, approve one, reject one | Invoice status and owner visibility update correctly | Re-approve already resolved invoice | `AiCreditInvoiceRequestsPanel.tsx`, `AiManualPaymentFallbackFeatureFlagTests.cs` | Not Run |
| CLOUD-ADMIN-009 | P1 | Billing Workspace Invoice Create | billing_admin | Billing workspace loaded | Create manual invoice with required actor note | Invoice appears in queue and audit feed | Invalid due date format blocked | `BillingAdminWorkspace.tsx`, `LicensingManualBillingFlowTests.cs` | Not Run |
| CLOUD-ADMIN-010 | P1 | Billing Payment Record and Verify | billing_admin/security_admin | Pending invoice exists | Record payment, then verify payment | Payment status changes to verified; license code workflow available | Reject path with reason code | `BillingAdminWorkspace.tsx`, `LicensingManualBillingFlowTests.cs` | Not Run |
| CLOUD-ADMIN-011 | P1 | Billing Reconciliation Run | support_admin/billing_admin | Billing data exists | Run reconciliation and inspect output | Reconciliation report returns actionable counts | Re-run idempotent behavior | `LicensingBillingStateReconciliationTests.cs` | Not Run |
| CLOUD-ADMIN-012 | P1 | License Audit Log Export | support_admin/billing_admin | Audit logs exist | Search audit logs and export CSV/JSON | Export files download with expected filters | Empty search result export | `exportAdminLicenseAuditLogs`, `LicensingFlowTests.cs` | Not Run |
| CLOUD-ADMIN-013 | P2 | Device Control Actions | super admin/security | Target device exists | Run revoke/deactivate/reactivate/activate/transfer-seat | State transitions enforce policy and log immutable audit entries | Invalid device code and unauthorized role | `LicensingFlowTests.cs`, `LicensingBranchSeatAllocationTests.cs` | Not Run |
| CLOUD-ADMIN-014 | P2 | Emergency Envelope Flow | support_admin/security_admin | Emergency command policies enabled | Create emergency envelope then execute | Command executes once with expected lock/revoke effects | Replay same envelope token | `LicensingFlowTests.cs`, `LicensingTokenReplayProtectionTests.cs` | Not Run |

## 4.5 Inventory Manager (`INV-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| INV-001 | P0 | Inventory Landing and Navigation | Manager | Inventory route accessible | Open inventory manager and switch Inventory/Reports/Manager/POS views | Navigation changes views without crashes | Invalid deep link -> not-found handling | `apps/Inventory Manager/src/routes/index.tsx` | Not Run |
| INV-002 | P0 | Inventory Dashboard Overview | Manager | Inventory data exists | Open Overview tab | Low stock, expiry, stocktake, warranty metrics load | Backend timeout fallback state | `InventoryDashboardTab.tsx`, `InventoryEndpoints.cs` | Not Run |
| INV-003 | P1 | Products List and Edit | Manager | Product catalog seeded | Open products tab, edit product, save | Product updates are persisted and reflected | Invalid required fields | `ProductsTab.tsx`, `ProductInventoryTests.cs` | Not Run |
| INV-004 | P1 | Create Product | Manager | Product create permission | Create new product with valid fields | Product appears in catalog and search | Duplicate SKU/barcode | `ProductInventoryTests.cs` | Not Run |
| INV-005 | P1 | Soft Delete Product | Manager | Existing product | Delete product from manager tab | Product deactivated/hidden per filter settings | Attempt delete product with constraints | `ProductEndpoints.cs`, `ProductInventoryTests.cs` | Not Run |
| INV-006 | P1 | Hard Delete Product | Manager | Product eligible for hard delete | Trigger hard delete action | Product removed permanently from active results | Hard delete blocked when dependent records exist | `ProductEndpoints.cs`, manual | Not Run |
| INV-007 | P1 | Stock Adjustment | Manager | Existing product with stock | Submit positive and negative adjustments | Quantities and movement logs update correctly | Excessive negative stock with restriction | `ProductInventoryTests.cs`, `InventoryEndpoints.cs` | Not Run |
| INV-008 | P1 | Categories CRUD | Manager | Manager tab available | Create/update category entries | Category list reflects edits and product links | Duplicate category name handling | `CatalogueTab.tsx`, `ProductEndpoints.cs` | Not Run |
| INV-009 | P1 | Brands CRUD | Manager | Manager tab available | Create/update brand entries | Brand list and associations update | Duplicate brand code handling | `CatalogueTab.tsx`, `ProductEndpoints.cs` | Not Run |
| INV-010 | P1 | Suppliers CRUD | Manager | Supplier tab available | Create/update supplier entries | Supplier rows and links update correctly | Invalid contact email format | `SuppliersTab.tsx`, `ProductEndpoints.cs` | Not Run |
| INV-011 | P1 | Product Supplier Mapping | Manager | Product and supplier exist | Link supplier to product and set preferred | Preferred supplier persists and reflects in views | Multiple preferred flags race | `api.ts product supplier methods`, `ProductEndpoints.cs` | Not Run |
| INV-012 | P1 | Barcode Validate | Manager | Barcode feature enabled | Validate known valid and invalid barcodes | Validation response matches format and duplicate checks | Validate existing barcode collision | `ProductBarcodeRulesUnitTests.cs` | Not Run |
| INV-013 | P1 | Barcode Bulk Generate Missing | Manager | Products without barcodes exist | Run bulk generate missing barcodes | Generated count and skipped count are correct | Dry-run mode verification | `ProductEndpoints.cs`, `ProductBarcodeFeatureFlagTests.cs` | Not Run |
| INV-014 | P1 | Stock Movements Tab | Manager | Movement data exists | Filter movements by type/date/product | Movement table reflects query and quantities | Empty result set | `StockMovementsTab.tsx`, `InventoryEndpoints.cs` | Not Run |
| INV-015 | P1 | Serial Numbers Tab | Manager | Serial-tracked product exists | Add serials, update status, lookup serial | Serial lifecycle transitions are persisted | Lookup unknown serial value | `SerialNumberEndpoints.cs` | Not Run |
| INV-016 | P1 | Batches Tab | Manager | Batch-tracked product exists | Create/update product batch, inspect expiring list | Batch quantities and expiry metadata are correct | Past expiry date handling | `BatchEndpoints.cs` | Not Run |
| INV-017 | P1 | Stocktake Session End-to-End | Manager | Inventory products exist | Create stocktake, start, count items, complete | Variances computed and session closes correctly | Attempt complete with missing counts | `StocktakeEndpoints.cs` | Not Run |
| INV-018 | P1 | Warranty Claims Lifecycle | Manager | Sold serial with warranty exists | Create claim and move through statuses | Claim status updates with notes | Create claim for invalid serial | `WarrantyClaimEndpoints.cs` | Not Run |
| INV-019 | P2 | Reports Page Access | Manager | Reports page route available | Open reports view and run key report widgets | Reports render and return data | No data range case | `ReportsPage.tsx`, `ReportEndpoints.cs` | Not Run |

## 4.6 Installer and Desktop Utility (`INSTALLER-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| INSTALLER-001 | P0 | Installer Build | Release engineer | Windows build host with prerequisites | Run installer build script | Setup executable and packaged artifacts are produced | Missing signing key or toolchain | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-002 | P0 | Current User Install Mode | Operator | Fresh Windows profile | Install in Current user mode and launch app | App launches and user-local data paths are created | Reinstall over existing user install | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-003 | P0 | Windows Service Install Mode | Operator | Clean VM snapshot | Install in Service mode and verify service | Service exists, auto-start configured, app reachable | Service start failure handling | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-004 | P1 | Activation Code Manager Happy Path | support_admin/security_admin | Local backend running | Open Start Menu utility, generate one code | Code generated with expected metadata and export works | Backend unavailable should show clear error | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-005 | P1 | Activation Code Manager Authorization | owner/manager | Utility available | Attempt generation with unauthorized role | Authorization is denied | Multiple failed attempts and retry | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md`, `LicensingRoleMatrixPolicyTests.cs` | Not Run |
| INSTALLER-006 | P1 | Upgrade Migration | Operator | Existing legacy install state present | Upgrade using new installer package | Legacy config/db/keys migrate to external data root | Partial legacy files present | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-007 | P1 | Uninstall Persistence | Operator | Completed install and runtime data present | Uninstall app from both install modes | Binaries removed; persistent data remains by design | Uninstall interrupted mid-run | `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md` | Not Run |
| INSTALLER-008 | P2 | Signed Release Validation | Release engineer | Signed build available | Verify trust chain and timestamp | Signature and timestamp validate | Expired cert behavior | `scripts/verify-installer-trust-chain.ps1` | Not Run |

## 4.7 Security and Reliability (`SEC-*`)

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | P0 | Role Permission Boundary (POS) | cashier/manager/owner | Active session per role | Attempt privileged actions with each role | Restricted actions are hidden or denied correctly | Cached UI shows action but API denies | `LicensingRoleMatrixPolicyTests.cs`, `HeaderBar` role controls | Not Run |
| SEC-002 | P0 | Role Permission Boundary (Cloud Admin) | mixed admin roles | Admin sessions established | Access purchase approval, security, and support flows by role | Only authorized roles can execute each action | Direct API request from unauthorized role | `LicensingRoleMatrixPolicyTests.cs`, `AdminWorkspace.tsx` | Not Run |
| SEC-003 | P1 | Idempotent Payment Request | Owner | Onboarding/payment endpoint reachable | Replay same `Idempotency-Key` request | Duplicate payment records are not created | Concurrent replay from two tabs | `AiInsightsCreditFlowTests.cs`, `LicensingWebhookIdempotencyTests.cs` | Not Run |
| SEC-004 | P1 | Idempotent Checkout Completion | Cashier | Valid cart and active session | Retry complete sale on transient failure | System avoids duplicate finalized sales | Double click/rapid submit | `CheckoutRefundFlowTests.cs` | Not Run |
| SEC-005 | P1 | Webhook Signature Handling | Billing system integration | Webhook endpoint reachable | Send valid and invalid webhook signatures | Valid accepted; invalid rejected with audit signal | Replay old webhook payload | `LicensingWebhookSignatureVerificationTests.cs`, `LicensingWebhookEventHandlingTests.cs` | Not Run |
| SEC-006 | P1 | Sensitive Action Device Proof | Super admin/security | Device proof endpoints enabled | Perform sensitive device action requiring proof | Action succeeds with valid proof | Attempt with missing/expired proof | `SensitiveActionDeviceProofTests.cs`, `AdminSensitiveActionDeviceProofBypassTests.cs` | Not Run |
| SEC-007 | P1 | Auth Session Revocation | Any signed-in role | Multiple active sessions | Revoke other session and test old token | Revoked session loses access on next request | Same-device session continuity | `AuthSessionHardeningTests.cs`, `AuthAnomalyDetectionTests.cs` | Not Run |
| SEC-008 | P2 | Cloud API Version Compatibility | POS client with version headers | Backend compatibility middleware enabled | Send supported and unsupported version requests | Supported pass; unsupported returns compatibility error | Missing version header behavior | `CloudApiVersionCompatibilityMiddlewareTests.cs` | Not Run |
| SEC-009 | P2 | Offline Abuse Guard | POS in offline mode | Offline grant limits configured | Exceed offline checkout/refund limits | Further offline operations blocked with explicit reason | Clock skew attempts | `LicensingAbuseTests.cs`, `LicensingOfflineLocalRefactorTests.cs` | Not Run |

## 5. Regression Packs (`REG-*`)

### 5.1 P0 Daily Smoke

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| REG-001 | P0 | Daily Smoke | Manager | Local stack healthy | Run: LIC-001, POS-001, POS-003, POS-005, CLOUD-OWNER-004, CLOUD-ADMIN-001 | All listed P0 flows pass in one run | Any single failure blocks daily signoff | Aggregates from listed case evidence | Not Run |
| REG-002 | P0 | Daily Smoke | Cashier | Active session | Run: POS-004, POS-006, POS-007 | Core cashier sale lifecycle passes | Network interruption during cycle | Aggregates from listed case evidence | Not Run |
| REG-003 | P0 | Daily Smoke | Billing Admin | Pending queue available | Run: CLOUD-ADMIN-005, CLOUD-ADMIN-010 | Purchase/payment queue actions are operational | One item already terminal status | Aggregates from listed case evidence | Not Run |

### 5.2 P1 Pre-release Pack

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| REG-101 | P1 | Pre-release | QA Lead | Build candidate ready | Execute all P0 + all P1 cases in this document | Release candidate meets must-pass criteria | If blocked, create waiver with owner/date | Aggregated execution log | Not Run |
| REG-102 | P1 | Pre-release | QA Lead | Installer build available | Execute INSTALLER-001 through INSTALLER-007 | Install and upgrade paths validated | Service-mode-only failure | Aggregated execution log | Not Run |
| REG-103 | P1 | Pre-release | Security QA | Admin and webhook test harness available | Execute SEC-001 through SEC-007 | Permission and security-critical controls validated | One false positive on permission boundary | Aggregated execution log | Not Run |

### 5.3 P2 Extended Pack

| Case ID | Priority (P0/P1/P2) | Surface | Role | Preconditions | Steps | Expected Result | Negative/Edge Variant | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| REG-201 | P2 | Extended | QA | Stable branch | Execute all P2 cases and exploratory around AI/OCR/offline edges | Non-critical regressions found before production | Third-party provider instability | Aggregated execution log | Not Run |
| REG-202 | P2 | Extended | QA | Inventory dataset with serial/batch depth | Execute INV-015 through INV-019 with large data volumes | Inventory advanced flows remain stable | Long-running stocktake session | Aggregated execution log | Not Run |
| REG-203 | P2 | Extended | Release engineer | Signed installer candidate | Execute INSTALLER-008 and trust chain verification | Signature trust chain and release metadata validated | Timestamp or chain warning | Aggregated execution log | Not Run |

## 6. Execution Log Template

Use this section per run:

| Run Date | Build/Commit | Environment | Tester | Pack (P0/P1/P2) | Pass | Fail | Blocked | Notes |
|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | `<hash>` | local-seeded | `<name>` | `<pack>` | 0 | 0 | 0 | `<summary>` |

## 7. Sign-off Rules

- Daily readiness: all `P0` cases pass.
- Release readiness: all `P0` and `P1` pass, no unapproved blockers.
- Full confidence run: `P0 + P1 + P2` complete, with documented evidence links/screenshots/log references.

## 8. Reference Sources

- `README.md`
- `apps/pos-app/tests/e2e/*.spec.js`
- `apps/cloud-portal/src/app/[locale]/*/*.test.tsx`
- `services/backend-api/tests/SmartPos.Backend.IntegrationTests/*.cs`
- `GUI_WINDOWS_INSTALLER_SMOKE_TEST_2026-04-25.md`
- `docs/archive/root-markdown/LICENSE_MANUAL_QA_MATRIX_2026-04-02.md`
- `docs/archive/root-markdown/AI_INSIGHTS_MANUAL_QA_MATRIX_2026-04-03.md`
