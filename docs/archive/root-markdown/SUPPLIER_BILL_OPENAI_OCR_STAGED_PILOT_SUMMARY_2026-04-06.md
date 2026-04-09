# Supplier Bill OpenAI OCR Staged Pilot Summary

Generated At (UTC): 2026-04-06 05:59:31Z
Source CSV: `/Users/iroshwijesiri/Documents/SMART POS SYSTEM WITH AI/SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv`
Operators: `codex-local-dryrun`
Note: current dataset includes local development dry-run entries and is not staging signoff evidence.

## Input Coverage

- Completed runs: `20`
- Supplier diversity: `18`
- PDF files: `5`
- JPG/PNG files: `15`

## KPI Snapshot

- Draft rows: `20`
- Manual review count: `2`
- OCR provider fallback count: `2`
- Totals mismatch count: `0`
- Confirm attempted: `18`
- Confirmed: `16`
- Idempotent replay rows: `1`
- Duplicate checks attempted: `1`
- Duplicate checks rejected: `1`
- Stock reconciliation verified rows: `17`
- Ledger reconciliation verified rows: `17`

## Acceptance Gates

- Minimum bills (`>= 20`): `PASS`
- Minimum suppliers (`>= 5`): `PASS`
- Fallback rate (`<= 10%`): `10.00%` -> `PASS`
- Manual review rate (`<= 60%`): `10.00%` -> `PASS`
- Totals mismatch rate (`<= 20%`): `0.00%` -> `PASS`
- Duplicate rejection (`100%`): `100.00%` -> `PASS`
- Stock reconciliation for confirmed imports (`100%`): `PASS`
- Ledger reconciliation for confirmed imports (`100%`): `PASS`

## Verdict

- Overall pilot verdict: `GO`
- Use this summary to fill `SUPPLIER_BILL_OPENAI_OCR_GO_NO_GO_SIGNOFF.md` Pilot Evidence and Decision sections.
