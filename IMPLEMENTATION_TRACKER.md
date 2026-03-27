# Smart POS System With AI - Implementation Tracker

Use this checklist to track MVP delivery status from `SMART_POS_SYSTEM_WITH_AI_PRD.md`.

## 1. Project Setup
- [x] Create `frontend` app (React + Vite + Tailwind)
- [x] Enable PWA installability (`manifest`, service worker, icons)
- [x] Create `backend` app (ASP.NET Core .NET 8 Web API)
- [x] Add PostgreSQL and Redis via Docker Compose
- [x] Add CI pipeline (build + tests)

## 2. Core Data Model
- [x] Define entities: `products`, `categories`, `inventory`
- [x] Define entities: `sales`, `sale_items`, `payments`, `ledger`
- [x] Define entities: `users`, `roles`, `audit_logs`, `devices`
- [x] Define `offline_events` table for sync engine
- [x] Add optional `store_id` for future multi-branch support
- [x] Add unique constraint on `offline_events.event_id`

## 3. Offline-First Sync Engine
- [x] Implement local event queue in frontend (IndexedDB)
- [x] Add event contract fields (`event_id`, `device_id`, timestamps, `type`, `payload`, `status`)
- [x] Build sync API endpoint in backend
- [x] Implement idempotent event processing
- [x] Implement retry mechanism + error queue
- [x] Add sync status UI (pending/synced/conflict/rejected)
- [x] Implement conflict rules from PRD

## 4. Sales and Checkout (Critical)
- [x] Build one-screen checkout UI
- [x] Product search by name and barcode
- [x] Add/remove items and quantity adjustment
- [x] Discounts with role-based limits
- [x] Hold and resume bill
- [x] Cancel/void bill before payment
- [x] Multi-payment support (cash/card/QR)
- [x] Change calculation
- [x] Thermal receipt print support
- [x] Digital receipt flow (WhatsApp-ready)

## 5. Financial Integrity Rules
- [x] Void before payment: no ledger entry
- [x] Void before payment: restore stock
- [x] Refund after payment linked to `sale_id`
- [x] Refund: increase stock
- [x] Refund: payment reversal recorded
- [x] Refund: ledger reversal recorded
- [x] Refund: proportional tax reversal
- [x] Refund: partial refunds supported
- [x] Full audit trail for all financial actions

## 6. Product and Inventory
- [x] Product creation and editing
- [x] Category management
- [x] Barcode support
- [x] Stock deduction on sale
- [x] Manual stock adjustments
- [x] Low stock alert logic

## 7. User, Roles, and Security
- [x] Implement roles: Owner, Cashier, Manager
- [x] RBAC middleware and policy checks
- [x] HttpOnly JWT cookie authentication for web/PWA
- [x] Device tracking for offline sessions
- [x] Session expiry handling
- [x] Audit logging for sensitive actions

## 8. Receipts and Sales History
- [x] Sales history listing
- [x] Reprint receipt
- [x] Refund tracking view
- [x] Payment breakdown per sale

## 9. Reporting (MVP)
- [x] Daily sales report
- [x] Transactions report
- [x] Payment method breakdown report
- [x] Top-selling items report
- [x] Low stock report

## 10. Performance and Quality
- [x] Offline checkout under 300ms
- [x] Online checkout p95 under 800ms
- [x] Sync API p95 under 1.5s
- [x] Dashboard load under 2s
- [x] Add integration tests for sale/refund/sync flows
- [x] Add end-to-end tests for checkout

## 11. Launch Readiness
- [x] Works on desktop browser/PWA
- [x] Works on mobile browser/PWA
- [x] Offline mode verified
- [x] No duplicate sales during sync
- [x] Onboarding flow is simple and clear

## 12. Post-MVP (Optional Backlog)
- [ ] Suppliers module (V2)
- [ ] Variants module (V2)
- [ ] Customers and loyalty (V2)
- [ ] Profit report with weighted average COGS (V2)
- [ ] Multi-branch support (V3)
- [ ] AI assistant expansion (V3)
- [ ] Promotions and campaigns (V3)
