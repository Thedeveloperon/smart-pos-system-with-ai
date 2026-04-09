# Admin UI Tracker

Purpose: track `/admin` UI improvements for clarity, speed, and operational usability.

## Phase 1: Admin Layout Structure

- [x] Create admin-first page layout (not cashier-first)
- [ ] Add clear top-level sections/tabs:
  - [x] `Operations`
  - [x] `Inventory`
  - [x] `Reports`
  - [x] `Sync`
- [x] Ensure section switching works on desktop and mobile
- [x] **Acceptance:** Admin can reach any main function in one click without long scrolling

## Phase 2: KPI + Header Improvements

- [x] Add sticky KPI row at top (`Today Sales`, `Pending Sync`, `Low Stock`, `Refunds`)
- [x] Improve header hierarchy (title, context, role badge, timestamp)
- [x] Make KPI cards visually distinct from content cards
- [x] **Acceptance:** Admin status is visible immediately after page load

## Phase 3: Recent Sales Usability

- [x] Limit recent sales list height with internal scroll
- [x] Add pagination or `Load More`
- [x] Keep key actions visible (`Reprint`, `WhatsApp`, `Refund`)
- [x] Add quick filters (status/payment/date)
- [x] **Acceptance:** Recent sales no longer push inventory/reports out of view

## Phase 4: Inventory + Reports Readability

- [x] Increase spacing and typography readability in `Product & Inventory`
- [x] Improve form grouping and labels for product/category flows
- [x] Improve reports layout with consistent card sizing and headings
- [x] Highlight critical signals (`low stock`, `negative stock`, `failed sync`)
- [x] **Acceptance:** Admin can scan and act without zooming or dense reading

## Phase 5: Persistent Admin Actions

- [x] Add sticky action/filter bar for frequently used admin actions
- [x] Keep refresh and date filters easily reachable
- [x] Ensure action styles are consistent (`primary`, `secondary`, `danger`)
- [x] **Acceptance:** Frequent admin actions are accessible without page repositioning

## Verification

- [x] Run `npm run lint`
- [x] Run `npm run build`
- [x] Run `npm run test:e2e`
- [ ] Manual QA on `/admin` for desktop and mobile

## Notes

- Scope: `frontend/src/App.jsx` (`/admin`) only unless backend/UI contract changes are required.
- Keep `/launch101` cashier experience separate and unchanged.
