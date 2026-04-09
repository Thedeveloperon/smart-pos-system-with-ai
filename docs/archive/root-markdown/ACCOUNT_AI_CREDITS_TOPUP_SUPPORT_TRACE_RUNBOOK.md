# Account AI Credits Top-Up Support Trace Runbook

Last updated: 2026-04-07

## Objective

Trace any AI top-up from customer report to ledger outcome in under 5 minutes.

## Inputs from Customer

1. Account username/shop code.
2. Payment reference (external reference shown in account status/history).
3. Approximate payment time.
4. Payment method used.

## Trace Steps

1. Locate `AiCreditPayment` by `external_reference`.
2. Verify payment status, method, created/completed timestamps.
3. Check audit logs for:
- `ai_payment_checkout_created`
- `ai_payment_manual_verified` (manual path)
- `ai_payment_failed` / `ai_payment_settled`
4. If `succeeded`, locate matching wallet ledger purchase reference.
5. If `pending_verification`, route to billing operations queue.
6. If `failed`, ask customer to retry card or use fallback flow.

## Common Resolutions

1. `processing` too long: refresh status, verify webhook ingress.
2. `pending_verification`: confirm proof and verify manually.
3. `failed`: retry card, then switch to bank transfer if repeated.
4. duplicate attempts: confirm idempotency conflict and advise new checkout.

## Escalation

1. Engineering: settlement mismatch or missing ledger updates.
2. Billing Ops: manual verification backlog > SLA.
3. Product: repeated UX confusion on fallback/retry path.
