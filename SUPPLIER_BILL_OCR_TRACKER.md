# Supplier Bill OCR Tracker

Purpose: track implementation of OCR-based supplier bill import from upload to inventory update.

Last Updated: March 29, 2026
Status: Implementation in progress (Phase 1-6 automated QA completed; manual smoke pending)

## Phase 1: Domain and Schema

- [x] Add `Suppliers` entity and table
- [x] Add `PurchaseBills` entity and table
- [x] Add `PurchaseBillItems` entity and table
- [x] Add `BillDocuments` entity/table for OCR metadata and raw extraction
- [x] Add unique constraint for duplicate protection (`supplier_id + invoice_number`)
- [x] Wire new entities into `SmartPosDbContext`
- [x] Extend `DbSchemaUpdater` for SQLite/Postgres compatibility
- [x] **Acceptance:** A purchase bill and items can be persisted with duplicate invoice protection

## Phase 2: OCR Ingestion Pipeline

- [x] Add `IOcrProvider` abstraction
- [x] Add provider implementation and configuration binding
- [x] Create upload endpoint for image/PDF supplier bills
- [x] Enforce upload hardening: extension + MIME sniffing + max file size + max pages
- [x] Reject encrypted/password-protected PDFs
- [x] Add malware scan hook before OCR call (or quarantine path if scanner unavailable)
- [x] Parse OCR output into normalized header and line-item draft model
- [x] Persist OCR draft + confidence + raw payload for audit/debug
- [x] Add correlation ID for full request tracing (`upload -> OCR -> match -> confirm`)
- [x] Add provider resilience: timeout + retry/backoff + circuit breaker
- [x] Add fallback mode when OCR provider is unavailable (manual review/import path)
- [x] Add failure handling for unsupported files, OCR timeout, and parse errors
- [x] **Acceptance:** Valid bill uploads return a parsed draft payload with confidence details

## Phase 3: Product Matching and Review Rules

- [x] Implement deterministic match path: barcode/SKU exact
- [x] Implement normalized-name exact match path
- [x] Implement fuzzy-name fallback with confidence score
- [x] Mark unresolved/low-confidence lines as `needs_review`
- [x] Enforce human-in-the-loop: do not allow auto-commit for lines below confidence threshold
- [x] Add totals validation (subtotal/tax/grand total tolerance checks)
- [x] Require explicit approval reason when totals mismatch exceeds tolerance
- [x] Block auto-commit when unresolved lines remain
- [x] **Acceptance:** Each imported row is classified as matched, review-required, or new-product candidate

## Phase 4: Commit and Inventory Update

- [x] Add confirm endpoint with idempotency key (`import_request_id`)
- [x] Add concurrency guard for confirm step (prevent duplicate stock updates under parallel requests)
- [x] Persist final purchase bill + mapped items in one DB transaction
- [x] Increase inventory quantities for confirmed lines
- [x] Update product cost price policy (if enabled)
- [x] Write audit logs for import + line adjustments
- [x] Add ledger entries for stock intake adjustments
- [x] **Acceptance:** Confirmed import updates stock atomically and cannot be duplicated

## Phase 5: Frontend Import UX

- [x] Add admin header action: `Import Supplier Bill`
- [x] Build upload dialog with file picker and progress states
- [x] Build parsed-line review table with per-line match status
- [x] Add per-line product mapping control for manual fixes
- [x] Show warnings for confidence/totals mismatch before confirm
- [x] Add confirm/import summary toast and refresh product stock state
- [x] **Acceptance:** Admin can complete upload -> review -> confirm in one guided flow

## Phase 6: Testing and QA

- [x] Add backend unit tests for parsing normalization and matching logic
- [x] Add backend integration tests for upload, confirm, duplicate reject, and stock updates
- [x] Add frontend tests for dialog flow and validation states
- [x] Add test fixtures: clear invoice image, noisy invoice image, and PDF
- [x] Run existing backend integration suite
- [x] Run frontend lint/build/tests after integration
- [x] **Acceptance:** OCR import flow is covered by automated tests and passes regression checks

## Phase 7: Rollout and Operations

- [ ] Gate feature behind `Purchasing:EnableOcrImport`
- [ ] Add structured logs and metrics (parse success rate, manual review rate, duplicate rejects)
- [ ] Configure alert thresholds (OCR failure spike, high mismatch rate, duplicate-reject spike)
- [ ] Add user-facing fallback guidance for OCR failures (manual entry path)
- [ ] Document environment/config setup for OCR provider
- [ ] Run staged pilot with sample supplier invoices
- [ ] **Acceptance:** Feature can be safely enabled/disabled and observed in production

## Phase 8: Security and Data Governance

- [ ] Restrict import endpoints to `owner` and `manager` only
- [ ] Add authorization tests for denied access (`cashier`)
- [ ] Define retention policy for uploaded bill files and raw OCR text
- [ ] Add scheduled purge for expired OCR artifacts
- [ ] Encrypt stored bill files and sensitive OCR payloads at rest
- [ ] Add delete-on-request flow for bill artifacts where required
- [ ] **Acceptance:** OCR data lifecycle, access control, and protection controls are enforced and test-covered

## Verification Checklist

- [x] `dotnet test backend/tests/SmartPos.Backend.IntegrationTests`
- [x] `npm run lint` (from `frontend`)
- [x] `npm run build` (from `frontend`)
- [x] `npm run test` (from `frontend`)
- [ ] Manual smoke test: upload, review, confirm, duplicate invoice retry

## Notes

- Scope includes both backend and frontend.
- Current POS codebase has no supplier/purchase module yet; this tracker covers first introduction.
- Initial target is online OCR processing; offline OCR can be tracked as a later phase.
- Frontend lint now passes with warnings only (no errors).
- Fixture files are under `backend/tests/SmartPos.Backend.IntegrationTests/Fixtures` and are copied to test output.
