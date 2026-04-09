# POS Shortcuts Implementation Plan

Created: 2026-04-02
Status: In Progress (Phase 1-4 largely implemented)

## Purpose

Define and implement a safe, discoverable keyboard shortcut system for cashier speed in the POS billing flow.

## Goals

- Reduce checkout time for keyboard-driven cashiers.
- Keep destructive actions safe and auditable.
- Make shortcuts easy to discover without prior training.

## Proposed Shortcut Set (v1)

- `F2`: Focus product search.
- `F4`: Hold current bill.
- `F8`: Open cash count dialog / focus cash workflow.
- `F9`: Complete sale (only when valid).
- `F1` or `?`: Open shortcuts help modal.
- `Esc`: Close open non-destructive dialogs.

## Guardrails

- Ignore most global shortcuts while user is typing in text inputs, textareas, or contenteditable fields.
- Run the same validation rules as click actions (no shortcut-only bypass).
- Show a clear toast when action is blocked (example: `F9 blocked: insufficient cash`).
- Require confirmation for destructive actions (`Cancel Sale`, `Refund`, `End Shift`).
- Keep role-based restrictions aligned with backend permissions.
- Log audit events for sensitive shortcut actions.

## Implementation Phases

- [x] Phase 1: Baseline and docs
  - [x] Create shared shortcut spec in code (`shortcut map + labels + descriptions`).
  - [x] Add user-facing docs section in `README.md`.
  - [x] Add internal note for cashier training card text.

- [x] Phase 2: Core handler
  - [x] Implement centralized `usePosShortcuts` hook.
  - [x] Mount hook in POS root page (`frontend/src/pages/Index.tsx`).
  - [x] Add context/guard helpers (`isTypingTarget`, dialog-open checks, role checks).

- [x] Phase 3: Action wiring
  - [x] Wire `F2` to focus product search input.
  - [x] Wire `F4` to hold bill action.
  - [x] Wire `F8` to cash count dialog flow.
  - [x] Wire `F9` to complete sale action with full validity checks.
  - [x] Wire `Esc` for safe close behavior.

- [x] Phase 4: Discoverability UX
  - [x] Add shortcut labels on key action buttons (example: `Complete Sale (F9)`).
  - [x] Add persistent hint strip in checkout/search area.
  - [x] Add help modal opened by `F1` and `?`.
  - [x] Add one-time onboarding tooltip for first-time cashier login.

- [ ] Phase 5: Tests and rollout
  - [x] Unit tests for key mapping and guard logic.
  - [x] Integration tests for success + blocked flows.
  - [ ] Manual QA matrix for Windows and macOS keyboards.
  - [x] Pilot rollout behind a feature flag.
  - [ ] Collect cashier feedback and finalize v1.

## Acceptance Criteria

- Cashier can complete search -> add -> complete using keyboard only.
- No destructive action can happen accidentally from shortcuts.
- A new cashier can discover available shortcuts in under 10 seconds on first use.
- Shortcut behavior is consistent between desktop and laptop keyboards.

## QA Matrix (minimum)

- [ ] Desktop full keyboard: Windows
- [ ] Desktop full keyboard: macOS
- [ ] Laptop keyboard without numpad: Windows
- [ ] Laptop keyboard without numpad: macOS
- [ ] Barcode scanner typing into focused search input
- [ ] Dialog open states (shortcut suppression and `Esc` behavior)

## Notes

- Keep `F2/F9` as primary cashier flow keys for fast adoption.
- Avoid browser-conflicting combos (`Ctrl+L`, `Ctrl+R`, `Cmd+R`, etc.).
- If store hardware differs, add configurable remapping in v2.
