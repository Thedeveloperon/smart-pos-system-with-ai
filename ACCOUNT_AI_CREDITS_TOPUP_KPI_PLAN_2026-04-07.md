# Account AI Credits Top-Up KPI Plan

Last updated: 2026-04-07

## Funnel Metrics

1. `marketing_account_ai_topup_panel_viewed`
2. `marketing_account_ai_pack_selected`
3. `marketing_account_ai_checkout_started`
4. `marketing_account_ai_checkout_created`
5. `marketing_account_ai_checkout_returned`
6. `marketing_account_ai_checkout_result`
7. `marketing_account_ai_checkout_failed`
8. `marketing_account_ai_support_contact_clicked`

## Core KPIs

1. Checkout start rate = checkout started / panel viewed
2. Checkout completion rate = succeeded result / checkout started
3. Manual fallback share = manual payment method / checkout started
4. Payment failure rate = failed result / checkout started
5. Average credits per purchase = total credits purchased / succeeded purchases
6. Time-to-credit-settlement = `payment completed_at - payment created_at`

## Operational Dashboards

1. Daily conversion trend by locale and plan.
2. Failure reasons by payment method and provider.
3. Pending verification aging buckets: `<15m`, `15-60m`, `1-6h`, `>6h`.
4. Top affected references for support triage.

## Alert Thresholds

1. Failure rate > 15% in 30 minutes.
2. Pending verification older than 6 hours > 10 payments.
3. Top-up checkout idempotency conflicts > 5 in 30 minutes.

## Ownership

1. Product Owner (Commerce): conversion and pricing decisions.
2. Engineering Lead (AI Billing): reliability and settlement metrics.
3. Billing Operations Lead: manual verification SLA.
4. Support Operations Lead: contact and recovery workflows.
