# Supplier Bill OpenAI OCR Dashboard Validation Checklist

Date: 2026-04-06  
Environment: Staging  
Scope: Validate OCR import counters, dashboard visibility, and alert thresholds before go-live.

## Metric Sources

- Meter: `SmartPos.Purchasing`
- Counters:
- `smartpos.purchasing.ocr_draft.total`
- `smartpos.purchasing.ocr_manual_review.total`
- `smartpos.purchasing.ocr_provider_fallback.total`
- `smartpos.purchasing.ocr_totals_mismatch.total`
- `smartpos.purchasing.import_confirm.total`

## Validation Steps

- [ ] Confirm counters appear in telemetry backend with `provider` and `status` tags where applicable.
- [ ] Trigger one successful import draft and verify `ocr_draft.total` increment.
- [ ] Trigger one manual review draft (low confidence or forced failure) and verify `ocr_manual_review.total` increment.
- [ ] Trigger provider fallback path and verify `ocr_provider_fallback.total` increment.
- [ ] Trigger totals mismatch scenario and verify `ocr_totals_mismatch.total` increment.
- [ ] Confirm one successful import and verify `import_confirm.total{status=confirmed}` increment.
- [ ] Replay same confirm request and verify `import_confirm.total{status=idempotent_replay}` increment.
- [ ] Validate dashboard charts refresh within expected query window.
- [ ] Validate alert rules with thresholds from rollout runbook.

## Alert Rule Validation

- [ ] Fallback spike alert: `ocr_provider_fallback.total >= 10` in 10m.
- [ ] Manual review ratio alert: `ocr_manual_review.total / ocr_draft.total > 0.60` in 30m.
- [ ] Totals mismatch ratio alert: `ocr_totals_mismatch.total / ocr_draft.total > 0.20` in 30m.
- [ ] Idempotent replay anomaly alert: replay status spikes above baseline by 3x.

## Evidence Log

| Check | Evidence Link / Screenshot | Validated By | Validated At (UTC) | Status |
|---|---|---|---|---|
| Counter visibility |  |  |  | Pending |
| Success draft increment |  |  |  | Pending |
| Manual review increment |  |  |  | Pending |
| Fallback increment |  |  |  | Pending |
| Totals mismatch increment |  |  |  | Pending |
| Confirm counters |  |  |  | Pending |
| Replay counter |  |  |  | Pending |
| Dashboard refresh |  |  |  | Pending |
| Alert threshold checks |  |  |  | Pending |

## Completion Rule

Mark `SUPPLIER_BILL_OPENAI_OCR_GO_NO_GO_SIGNOFF.md` risk item "Alert dashboards configured and validated in staging" as complete only after all checks above are `Pass` with evidence.
