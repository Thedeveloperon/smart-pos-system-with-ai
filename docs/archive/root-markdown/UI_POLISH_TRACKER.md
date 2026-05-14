# UI Polish Tracker

Purpose: track final cashier-focused UI improvements after the redesigned checkout layout.

## Phase: Checkout UX Polish

- [x] 1. Mobile action safety (sticky checkout action)
  - [x] Add sticky bottom action area for small screens (`Complete Sale`, `Hold`, `Cancel`)
  - [x] Ensure no content is hidden behind sticky area (add safe bottom padding)
  - [x] Verify touch targets are at least 44px height
  - [x] Test on viewport widths: 360px, 390px, 430px
  - [x] **Acceptance:** Cashier can complete a sale without scrolling back to top/bottom to find the primary action

- [x] 2. Checkout speed (keyboard shortcuts + focus flow)
  - [x] Add shortcut for search focus (`F2`)
  - [x] Add shortcut for complete sale (`F9`) with guardrails (only when form valid)
  - [x] Keep focus in search input after adding item (fast repeated scans/typing)
  - [x] Show lightweight hint text for available shortcuts
  - [x] **Acceptance:** Keyboard-only cashier flow works for search -> add -> complete

- [x] 3. Payment UX validation visibility
  - [x] Show inline validation near payment fields when due amount is not covered
  - [x] Highlight due/change panel states clearly (error/warning/success)
  - [x] Disable `Complete Sale` with an explicit reason when payment is insufficient
  - [x] Keep error copy short and actionable
  - [x] **Acceptance:** User instantly understands why checkout is blocked

- [x] 4. Admin separation by role
  - [x] Collapse `Admin Tools` by default for `cashier`
  - [x] Keep admin sections expanded/accessible for `manager` and `owner`
  - [x] Preserve current permissions (UI gating remains aligned with backend policy)
  - [x] **Acceptance:** Cashier view stays focused on billing, admin panels are non-distracting

- [x] 5. Density/readability polish
  - [x] Increase product card and recent-sales metadata readability (font size/line height)
  - [x] Tighten spacing rhythm consistently across cards and controls
  - [x] Ensure button styles remain consistent (primary/secondary/danger)
  - [x] Validate readability and spacing on both desktop and mobile
  - [x] **Acceptance:** Faster scanability without increasing visual clutter

## Verification

- [x] Run `npm run lint`
- [x] Run `npm run build`
- [x] Run `npm run test:e2e`
- [ ] Manual smoke test: login, search/add items, payment, complete sale, print/share receipt

## Notes

- Scope is **frontend-only** unless a blocker is discovered.
- Keep existing backend API contracts unchanged.
