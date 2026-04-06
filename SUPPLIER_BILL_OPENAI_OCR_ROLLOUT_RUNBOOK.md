# Supplier Bill OpenAI OCR Rollout Runbook

Last Updated: April 6, 2026
Owner: POS backend team

## Objective

Roll out OpenAI-backed supplier bill OCR safely while preserving existing manual review controls and inventory integrity.

## Feature Flag and Config

- `Purchasing:EnableOcrImport=true`
- `Purchasing:OcrProvider=openai`
- `Purchasing:OpenAiApiBaseUrl=https://api.openai.com/v1`
- `Purchasing:OpenAiApiKeyEnvironmentVariable=OPENAI_API_KEY`
- `Purchasing:OpenAiModel=gpt-5.4-mini` (default)
- `Purchasing:OpenAiRequestTimeoutMs=20000`
- `Purchasing:OpenAiMaxOutputTokens=1600`

## Rollout Stages

1. Development
- Enable `Purchasing:OcrProvider=openai` locally.
- Run automated tests:
  - `dotnet test backend/tests/SmartPos.Backend.IntegrationTests`
  - `npm run test` (from `frontend`)
- Perform manual import smoke with one PNG and one PDF.

2. Staging
- Enable OpenAI provider for staging environment only.
- Run at least 20 real sample bills from multiple suppliers.
- Follow `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_PLAN_2026-04-06.md`.
- Record outcomes in `SUPPLIER_BILL_OPENAI_OCR_STAGED_PILOT_RESULTS_TEMPLATE.csv`.
- Validate monitoring and alert rules with `SUPPLIER_BILL_OPENAI_OCR_DASHBOARD_VALIDATION_CHECKLIST_2026-04-06.md`.
- Validate:
  - extraction quality
  - manual review gating behavior
  - confirm idempotency
  - duplicate invoice rejection
  - stock and ledger updates

3. Production
- Start with pilot stores/users only.
- Monitor metrics and logs continuously for first 24-48 hours.
- If fallback/manual-review spikes, switch back quickly:
  - `Purchasing:OcrProvider=basic-text`

## Instrumentation

## Meter

- `SmartPos.Purchasing` (version `1.0.0`)

## Counters

- `smartpos.purchasing.ocr_draft.total`
  - Tags: `provider`, `status`
- `smartpos.purchasing.ocr_manual_review.total`
  - Tags: `provider`, `status`, `reason`
- `smartpos.purchasing.ocr_provider_fallback.total`
- `smartpos.purchasing.ocr_totals_mismatch.total`
  - Tags: `provider`, `status`
- `smartpos.purchasing.import_confirm.total`
  - Tags: `status`

## Key Logs

- OCR draft completion log with provider, status, review required, line count, blocked reasons.
- Confirm replay/confirmed logs with import request id and purchase bill id.

## Alert Thresholds (Initial)

- OCR provider fallback spike:
  - Trigger when `ocr_provider_fallback.total` >= 10 within 10 minutes.
- Manual review rate spike:
  - Trigger when `ocr_manual_review.total / ocr_draft.total` > 0.60 over 30 minutes.
- Totals mismatch spike:
  - Trigger when `ocr_totals_mismatch.total / ocr_draft.total` > 0.20 over 30 minutes.
- Confirm replay anomaly:
  - Trigger when `import_confirm.total{status=idempotent_replay}` unexpectedly spikes above baseline by 3x.

Tune thresholds after first production week using observed baseline.

## Manual Smoke Checklist

- Upload PNG supplier bill -> review -> confirm -> stock increments.
- Upload PDF supplier bill -> review -> confirm -> stock increments.
- Force OCR failure path -> status becomes `manual_review_required` with blocked reason `ocr_provider_unavailable`.
- Attempt duplicate supplier+invoice confirm -> blocked with duplicate invoice error.

## Rollback Plan

1. Set `Purchasing:OcrProvider=basic-text`.
2. Redeploy backend.
3. Verify `/api/purchases/imports/ocr-draft` returns normal draft responses.
4. Continue with existing review+confirm process until OpenAI path is fixed.
