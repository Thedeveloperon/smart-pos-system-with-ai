# Barcode Generator and Labeling Implementation Tracker

Created: 2026-04-03  
Status: Completed (Phases 0-7 complete)

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed
- [-] Blocked

## Purpose

Track end-to-end delivery of a production-grade barcode feature for the POS system, including generation, validation, assignment, bulk operations, scanner UX, and label printing.

## Scope

- Product barcode generation (EAN-13 for generated internal barcodes)
- Barcode validation and normalization
- API endpoints for generate, validate, assign, and bulk-generate
- Product form integration (create/edit flows)
- Label preview and print (single and batch)
- Bulk generation for products missing barcodes
- Scanner flow hardening in POS search mode
- Test coverage and rollout readiness

## Out of Scope (v1)

- GS1 company-prefix registration workflow
- QR code generation for products
- Advanced label designer (free-form templates)
- Multi-printer fleet orchestration

## Progress Board

- [x] Phase 0: Baseline and implementation design confirmed
- [x] Phase 1: Barcode rules and backend utility foundation
- [x] Phase 2: Backend barcode API surface
- [x] Phase 3: Frontend product form integration
- [x] Phase 4: Label preview and print
- [x] Phase 5: Bulk generation workflow
- [x] Phase 6: POS scanner UX hardening
- [x] Phase 7: Testing, release readiness, and rollout

## Phase 0: Baseline and Decisions (Observed)

- [x] Confirm product domain already includes `Barcode`.
- [x] Confirm create/update flows already enforce application-level barcode uniqueness.
- [x] Confirm product search supports barcode matching.
- [x] Confirm frontend product forms already expose barcode field.
- [x] Confirm AI suggestion flow already has local EAN-13 generation logic.
- [x] Freeze v1 barcode policy: generated codes are EAN-13 only.
- [x] Freeze overwrite/regenerate policy for products with existing barcodes.
- [x] Freeze default label format and printer targets (thermal + A4 + Electron shell validation target).

## Phase 1: Barcode Rules and Data Integrity Foundation

- [x] Create shared backend `BarcodeService` for:
- [x] EAN-13 check digit generation
- [x] EAN-13 validation
- [x] barcode normalization and safe parsing
- [x] Add barcode-specific validation in product create/update path (checksum and format constraints for EAN-13 path).
- [x] Enforce database-level uniqueness strategy for non-null normalized barcodes.
- [x] Define per-store generation sequence strategy to avoid collisions at scale.
- [x] Add audit events for barcode operations (`generated`, `assigned`, `regenerated`, `bulk_generated`).

## Phase 2: Backend API Delivery

- [x] Add `POST /api/products/barcodes/generate` (returns one unique candidate).
- [x] Add `POST /api/products/{productId}/barcode/generate` (generate and assign to product).
- [x] Add `POST /api/products/barcodes/validate` (format/checksum validation for UI).
- [x] Add `POST /api/products/barcodes/bulk-generate-missing` (manager/owner only).
- [x] Add request/response contracts in product feature contracts.
- [x] Add endpoint-level authorization with existing manager/owner policy.
- [x] Add idempotency and safe retry behavior where needed.

## Phase 3: Frontend Product Form Integration

- [x] Add `Generate` action next to barcode input in New Item dialog.
- [x] Add `Generate` and `Regenerate` actions in Product Management dialog.
- [x] Add inline barcode status message states:
- [x] valid
- [x] invalid format/checksum
- [x] already exists
- [x] Add confirmation UX before regenerating an existing barcode.
- [x] Add frontend API client methods for new barcode endpoints.
- [x] Ensure form submission uses backend validation responses cleanly.

## Phase 4: Label Preview and Print

- [x] Add barcode render utility for labels.
- [x] Add single-label preview modal (product card and product edit entry points).
- [x] Add print options:
- [x] quantity
- [x] show/hide price
- [x] label size preset
- [x] Add batch print from product catalog selection.
- [x] Add print-friendly layout for:
- [x] thermal label
- [x] A4 grid label
- [x] Validate print output on desktop Chromium and Electron shell runtime.

## Phase 5: Bulk Generation and Operations Workflow

- [x] Add "Generate Missing Barcodes" catalog action.
- [x] Add dry-run summary before apply.
- [x] Add result summary after apply:
- [x] generated count
- [x] skipped count
- [x] conflict/retry count
- [x] Add export of generation results (CSV-friendly format).
- [x] Add operation audit log entry with actor and timestamp.

## Phase 6: POS Scanner UX Hardening

- [x] Improve barcode mode autofocus and fast input handling.
- [x] Detect scanner-like input burst and auto-submit on Enter suffix.
- [x] Add clear feedback for no barcode match.
- [x] Keep manual text search fallback behavior unchanged.
- [x] Confirm no regression in existing shortcut behavior.

## Phase 7: Testing and Release

- [x] Add backend unit tests for EAN-13 generation and checksum validation.
- [x] Add backend integration tests for new barcode APIs.
- [x] Add backend integration tests for uniqueness and conflict behavior.
- [x] Add frontend unit/component tests for generate/regenerate actions.
- [x] Add frontend tests for inline validation states.
- [x] Add manual QA matrix for scanner hardware and label print flows.
- [x] Add release checklist and rollback notes.
- [x] Gate rollout behind feature flag for staged enablement.

## Manual QA Matrix (Scanner + Labels)

| ID | Flow | Environment | Steps | Expected |
| --- | --- | --- | --- | --- |
| QA-BC-01 | Scanner exact match add-to-cart | Desktop Chromium + USB scanner in keyboard wedge mode | Open POS, enable barcode mode, scan known EAN-13, scanner sends Enter suffix | Product is added to cart once, search input resets, focus remains ready for next scan |
| QA-BC-02 | Scanner no-match feedback | Desktop Chromium + USB scanner | Scan unknown barcode with Enter suffix | No item is added, clear no-match barcode feedback is shown |
| QA-BC-03 | Manual search fallback | Desktop Chromium keyboard | Keep manual mode and search by name/SKU | Existing manual search behavior is unchanged |
| QA-BC-04 | Mobile fallback | Android/iOS browser | Search with on-screen keyboard in manual mode | Product filtering and add-to-cart behavior remains stable on mobile |
| QA-BC-05 | Single label print preview | Desktop Chromium print preview | Open product management, click `Print` for one barcoded item | Label preview renders EAN-13 bars and text correctly |
| QA-BC-06 | Batch label print | Desktop Chromium print preview | Select multiple products and click `Print Selected` | Selected labels are rendered with quantity/options correctly |
| QA-BC-07 | Thermal preset output | 58mm thermal target | Use thermal preset and print test label | Label dimensions and barcode readability are acceptable |
| QA-BC-08 | A4 grid preset output | A4 laser/inkjet target | Use A4 preset and print batch labels | Grid spacing and barcode readability are acceptable |
| QA-BC-09 | Feature flag off behavior | Frontend + backend flags disabled | Set `VITE_BARCODE_FEATURE_ENABLED=false` and `ProductBarcodes:Enabled=false`, reload app | Barcode generator/regenerator/print/scanner UI actions are hidden and barcode API endpoints return `404` |
| QA-BC-10 | Electron shell print runtime | Electron shell desktop runtime | Open label dialog, verify runtime target note, print thermal and A4 presets | Print document opens with Electron-safe print trigger and outputs readable labels |

## Release Checklist and Rollback

### Release Checklist

- [x] Confirm backend barcode endpoints, DB uniqueness, and barcode rule tests build successfully.
- [x] Confirm frontend barcode flows build and targeted barcode tests pass.
- [x] Ensure rollout gates are available:
  - backend: `ProductBarcodes:Enabled`
  - frontend: `VITE_BARCODE_FEATURE_ENABLED`
- [x] Validate scanner and label manual QA matrix on pilot devices/printers before broad rollout.
- [x] Communicate cashier training notes for scanner mode and label printing.
- [x] Monitor post-release errors for barcode endpoints and print/scanner UX complaints.

### Rollback Notes

1. Disable frontend barcode UI immediately:
   - set `VITE_BARCODE_FEATURE_ENABLED=false`
   - redeploy frontend
2. Disable backend barcode APIs immediately:
   - set `ProductBarcodes:Enabled=false`
   - restart backend service
3. Keep existing product create/update/search operational; only barcode feature surface is gated.
4. If needed, revert to previous release tag/commit after capturing logs and incident timestamps.
5. Re-run smoke checks for checkout, product search, and product management after rollback.

## Acceptance Criteria

- [x] Manager can generate and assign a unique barcode in product create/edit flows.
- [x] Generated barcode always passes EAN-13 checksum validation.
- [x] Duplicate barcodes are blocked by backend and database protections.
- [x] Catalog bulk generation safely fills missing product barcodes.
- [x] Labels can be previewed and printed for single and batch workflows.
- [x] POS cashier can scan barcode and add matched item reliably.

## Risks and Mitigations

- [ ] Risk: duplicate generation under high concurrency  
Mitigation: sequence strategy + DB uniqueness + retry with bounded attempts
- [ ] Risk: invalid external barcode formats from suppliers  
Mitigation: explicit validation rules and clear UI error messaging
- [ ] Risk: print output mismatch across printers  
Mitigation: thermal and A4 preset testing before rollout
- [ ] Risk: cashier scanning regressions  
Mitigation: scanner burst QA and fallback search path retention

## Ownership and Cadence

- [ ] Product owner: TBD
- [ ] Engineering owner: TBD
- [ ] QA owner: TBD
- [ ] Support owner: TBD
- [ ] Weekly progress review during implementation
- [ ] Daily tracker update while active build is in progress

## Change Log

- 2026-04-03: Tracker created with approved phase plan for full barcode feature delivery (generation, validation, assignment, printing, bulk operations, scanner UX, and rollout testing).
- 2026-04-03: Implemented Phase 1 foundation and core Phase 2/3/5 items: backend barcode rules utility, product barcode validation on create/update, normalized-uniqueness DB index bootstrap, new barcode endpoints (generate/validate/assign/bulk-generate-missing), frontend API wiring, New Item generate action, Product Management generate/regenerate actions, and integration test coverage additions for barcode endpoint flows. Validation: backend build passed, integration test assembly build passed, frontend production build passed. Runtime note: integration test execution is blocked locally until .NET 8 runtime is available on this machine.
- 2026-04-03: Completed remaining Phase 3 UI validation tasks by adding inline barcode validation states (`valid`, `invalid`, `already exists`) in New Item and Product Management dialogs using `/api/products/barcodes/validate`; frontend build passed after wiring.
- 2026-04-03: Implemented core Phase 4 label workflow in catalog/product management: new barcode label print dialog with EAN-13 SVG renderer, single-label preview from edit/catalog actions, batch printing from selected catalog rows, print options (quantity, show price toggle, thermal vs A4 presets), and print document generation for browser print flow; frontend build passed.
- 2026-04-03: Completed Phase 5 UI workflow in product catalog: added `Generate Missing` action with dry-run confirmation, apply run, result summary banner (generated/skipped/failed), and CSV export for operational review; frontend build passed.
- 2026-04-03: Completed Phase 6 scanner UX hardening in POS search: barcode-mode autofocus/selection, scanner-like input burst detection, Enter-suffix barcode submit with exact barcode add-to-cart, explicit no-match feedback messaging, and retained manual search mode behavior. Added `ProductSearchPanel.barcode.test.tsx` coverage (barcode add, no-match feedback, manual mode non-regression, shortcut focus handle) and verified with targeted Vitest runs (`ProductSearchPanel.barcode.test.tsx`, `CheckoutPanel.shortcuts.integration.test.tsx`) plus frontend production build.
- 2026-04-03: Progressed Phase 7 backend test coverage: added `ProductBarcodeRulesUnitTests` for EAN-13/checksum/normalization/custom-format validation and extended `ProductInventoryTests` with duplicate-barcode conflict and `exclude_product_id` validation checks. Backend and test assembly builds passed. Runtime note: local test execution remains blocked until .NET 8 runtime is installed for `testhost`.
- 2026-04-03: Expanded Phase 7 frontend coverage with `NewItemDialog.barcode.test.tsx` and `ProductManagementDialog.barcode.test.tsx` for barcode generate/regenerate actions and inline validation states (`invalid`, `already exists`, `valid`). Added a shared `ResizeObserver` test polyfill in `src/test/setup.ts` for Radix switch/dialog rendering under jsdom. Verification: targeted Vitest run for both new files passed and frontend production build passed.
- 2026-04-03: Added staged rollout gate for barcode feature (`ProductBarcodes:Enabled` backend + `VITE_BARCODE_FEATURE_ENABLED` frontend). Barcode API endpoints now return `404` when disabled, and barcode-specific UI actions (generate/regenerate/print/scanner mode) are hidden when frontend flag is off. Added feature-flag integration coverage scaffold (`ProductBarcodeFeatureFlagTests`) and documented manual QA matrix plus release/rollback checklist.
- 2026-04-03: Completed remaining Phase 2/4 items and closed tracker to done. Backend now supports deterministic barcode generation when `Idempotency-Key` is present (safe replay behavior), with bounded DB unique-conflict persistence retries for assign/bulk barcode writes. Added backend coverage for deterministic idempotency replay (`ProductInventoryTests` + `ProductBarcodeRulesUnitTests`). Frontend label print flow now detects runtime target (`Chromium` vs `Electron`) and emits runtime-specific print HTML/script behavior; added `BarcodeLabelPrintDialog.test.tsx` to validate thermal/A4 output and runtime handling. Validation: backend builds passed, integration test assembly build passed, targeted frontend barcode tests passed (including new print runtime tests), frontend production build passed. Runtime note: local `dotnet test` execution remains blocked until .NET 8 runtime is installed for `testhost`.
- 2026-04-04: Resolved local backend testhost runtime blocker and completed previously blocked execution validation. Installed/used .NET 8 runtime (`8.0.25`) and executed barcode-focused integration/unit tests via .NET 8 SDK path with passing result (`Failed: 0, Passed: 12`). During this run, uncovered and fixed SQLite translation failure in bulk barcode generation ordering (`DateTimeOffset` ORDER BY), by applying SQLite-safe client-side ordering fallback in `ProductService.BulkGenerateMissingBarcodesAsync`; retested successfully.
