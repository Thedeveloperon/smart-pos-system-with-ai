# Supplier Bill OpenAI OCR Implementation Tracker

Purpose: track implementation of OpenAI-backed supplier bill import for the existing upload -> review -> confirm flow.

Last Updated: April 6, 2026
Status: In progress (automated backend/frontend test suites passing; manual smoke completed; staged pilot pending)

## Scope

- Add OpenAI as an OCR provider option for supplier bill extraction.
- Keep existing safety behavior: manual review gates, totals tolerance checks, duplicate protections, idempotent confirm.
- Preserve fallback path when provider is unavailable.

## Phase 1: Configuration and Options

- [x] Extend `PurchasingOptions` with OpenAI OCR settings:
- [x] `OpenAiApiBaseUrl`
- [x] `OpenAiApiKey`
- [x] `OpenAiApiKeyEnvironmentVariable`
- [x] `OpenAiModel`
- [x] `OpenAiRequestTimeoutMs`
- [x] `OpenAiMaxOutputTokens`
- [x] Add `Purchasing` config values in `appsettings.json`.
- [x] Add `Purchasing` config values in `appsettings.Production.json`.
- [x] Document environment variable requirements for production.
- [x] Define provider value convention (`basic-text`, `tesseract`, `openai`).

## Phase 2: OpenAI OCR Provider Implementation

- [x] Add `OpenAiOcrProvider` implementing `IOcrProviderCore`.
- [x] Build OpenAI `/responses` request payload for bill extraction.
- [x] Define strict JSON output contract for extracted fields:
- [x] Header fields: supplier, invoice number/date, subtotal/tax/grand total, currency
- [x] Line fields: item name, quantity, unit cost, line total, confidence
- [x] Parse and validate OpenAI response safely.
- [x] Map parsed payload into `PurchaseOcrExtractionResult`.
- [x] Normalize numeric formats and handle OCR noise.
- [x] Add robust error handling for timeout, non-2xx, invalid JSON, empty output.
- [x] Ensure no sensitive bill text is over-logged.

## Phase 3: Dependency Injection and Provider Selection

- [x] Register `OpenAiOcrProvider` in `Program.cs`.
- [x] Update OCR provider switch to support `Purchasing:OcrProvider = openai`.
- [x] Keep warning + fallback behavior for unknown provider values.
- [x] Ensure `ResilientOcrProvider` retry/circuit-breaker wraps OpenAI path.

## Phase 4: Draft and Review Flow Compatibility

- [x] Confirm `CreateOcrDraftAsync` works unchanged with OpenAI result shape.
- [x] Verify match pipeline still runs (SKU/barcode/name/fuzzy).
- [x] Verify blocked reasons and warnings are preserved.
- [x] Ensure low-confidence extraction triggers manual review.
- [x] Ensure totals mismatch still requires `approval_reason` on confirm.

## Phase 5: Security and Reliability Hardening

- [x] Verify upload hardening remains unchanged (MIME, extension, page limits, size limits).
- [x] Confirm malware scan hook is executed before OpenAI call.
- [x] Ensure API key resolution order is explicit and documented.
- [x] Add request timeout clamps and cancellation propagation.
- [x] Add defensive handling for partial/invalid extracted line data.

## Phase 6: Testing

- [x] Unit tests for OpenAI response parsing and mapping.
- [x] Unit tests for malformed/partial response handling.
- [x] Integration test: successful OpenAI draft extraction path.
- [x] Integration test: OpenAI timeout/failure -> manual review fallback path.
- [x] Integration test: confirm import still updates inventory/ledger correctly with OpenAI draft.
- [x] Integration test: duplicate invoice protection remains enforced.
- [x] Frontend test: dialog still handles warnings and confirm gating for OpenAI drafts.

## Phase 7: Rollout

- [x] Add feature rollout notes (dev -> staging -> production).
- [x] Prepare staged pilot execution plan and results template.
- [x] Pilot artifacts:
- [x] `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_PLAN_2026-04-06.md`
- [x] `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv`
- [x] `SUPPLIER_BILL_OPENAI_OCR_DASHBOARD_VALIDATION_CHECKLIST_2026-04-06.md`
- [x] `SUPPLIER_BILL_OPENAI_OCR_OWNER_SIGNOFF_2026-04-06.md`
- [x] Pilot summary script:
- [x] `scripts/purchases/summarize_openai_ocr_pilot.py`
- [x] Add metrics to monitor:
- [x] OpenAI OCR success rate
- [x] manual review rate
- [x] provider fallback rate
- [x] totals mismatch rate
- [x] Set alert thresholds for OCR provider failure spikes.
- [ ] Run staged pilot with real supplier bill samples.
- [x] Capture go/no-go signoff checklist.

## Verification Checklist

- [x] `dotnet test backend/tests/SmartPos.Backend.IntegrationTests`
- [x] `npm run test` (from `frontend`)
- [x] Manual smoke: upload sample bill -> review -> confirm -> stock increment verified
- [x] Manual smoke: forced OpenAI failure -> fallback manual review path verified
- [x] Pilot execution dry-run (local fixtures): 20 rows populated in `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv`
- [x] Dry-run KPI snapshot generated: `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_SUMMARY_2026-04-06.md` (`GO` for local dry-run dataset; staging evidence still pending)

Manual smoke evidence (April 6, 2026):
- Success path: `ocr-draft` status `parsed` with matched product, `confirm` status `confirmed`, stock increased (`3.0 -> 4.0`).
- Failure path: mocked provider 500 returned `ocr-draft` status `manual_review_required` with blocked reasons including `ocr_provider_unavailable`.

## Decision Log

- [ ] Model choice finalized (`gpt-5.4-mini` vs `gpt-5.4`).
- [ ] Token/cost budget approved.
- [ ] Production key management approach approved.
- [ ] Data retention policy for bill payloads approved.
- [x] Decision approval register prepared:
- [x] `SUPPLIER_BILL_OPENAI_OCR_OWNER_SIGNOFF_2026-04-06.md`
