# Supplier Bill OpenAI OCR Staged Pilot Plan

Date: 2026-04-06  
Environment: Staging  
Scope: `Purchasing:OcrProvider=openai` for supplier bill import

## Objective

Validate extraction quality and safety gates using real supplier bills before production enablement.

## Entry Criteria

- Backend integration tests passing.
- Frontend tests passing.
- Manual smoke completed for success and forced-failure paths.
- Staging OpenAI key configured via `OPENAI_API_KEY`.
- Rollback config ready: `Purchasing:OcrProvider=basic-text`.

## Pilot Sample Set

- Minimum bills: 20
- Minimum suppliers: 5
- Minimum file mix:
- 10 JPG/PNG files
- 10 PDF files
- Minimum invoice mix:
- 3 duplicate-invoice attempts
- 3 low-quality scans (blurred/noisy)

## Execution Procedure

1. Enable `Purchasing:OcrProvider=openai` in staging.
2. For each bill, run upload -> draft review -> confirm path.
3. Record each run in `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv`.
4. For duplicate checks, retry confirm with same supplier+invoice and verify rejection.
5. For low-quality scans, verify manual review gating.
6. Reconcile stock and ledger for every confirmed import.
7. Capture counter snapshots:
- `smartpos.purchasing.ocr_draft.total`
- `smartpos.purchasing.ocr_manual_review.total`
- `smartpos.purchasing.ocr_provider_fallback.total`
- `smartpos.purchasing.ocr_totals_mismatch.total`
- `smartpos.purchasing.import_confirm.total`

## Acceptance Criteria

- OCR provider fallback rate <= 10%.
- Manual review rate <= 60%.
- Totals mismatch rate <= 20%.
- Duplicate invoice rejection: 100% for test duplicates.
- Confirm idempotent replay correctness: 100%.
- Stock and ledger reconciliation: 100% for confirmed imports.
- No P1/P2 import integrity defects.

## Stop and Rollback Triggers

- `ocr_provider_fallback.total` spike >= 10 in 10 minutes.
- Confirmed imports with stock mismatch > 0 cases.
- Duplicate invoice accepted when it should be rejected.
- Repeated provider timeout/unavailable errors across consecutive bills.

Rollback steps:

1. Set `Purchasing:OcrProvider=basic-text`.
2. Redeploy staging.
3. Re-run 3-bill regression check (draft/confirm/stock).

## Exit Deliverables

- Filled pilot results CSV.
- Pilot KPI summary generated from CSV:
- `python3 scripts/purchases/summarize_openai_ocr_pilot.py --input SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv --output SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_SUMMARY_2026-04-06.md`
- Counter summary and observed rates.
- Defect log (if any) and mitigations.
- Updated `SUPPLIER_BILL_OPENAI_OCR_GO_NO_GO_SIGNOFF.md` decision section.
