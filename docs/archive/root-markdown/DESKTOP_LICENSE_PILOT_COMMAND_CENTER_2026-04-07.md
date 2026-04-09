# Desktop License Pilot Command Center Plan (2026-04-07)

Purpose: run the pilot execution window with daily ownership, KPI checks, escalation rules, and go/no-go decisions.

## Timeline (All Dates in 2026, UTC)

- Preparation: April 7 to April 8
- Cohort A (5 shops): April 9 to April 11
- Gate A review: April 12
- Cohort B (10 shops): April 13 to April 16
- Gate B review: April 17
- Cohort C (25 shops): April 18 to April 21
- Final go-live decision: April 22

## Role Ownership

- Incident commander: Engineering Lead (Licensing Platform)
- Business decision owner: Product Owner (Commerce)
- Billing stream owner: Billing Operations Lead
- Support stream owner: Support Operations Lead

## Daily Cadence

1. 08:30 UTC: Daily preflight checks (billing webhooks, account login success, installer link health).
2. 11:00 UTC: KPI snapshot review (TTFA, activation success/failure, support ticket rate).
3. 15:00 UTC: Incident review and mitigation checkpoint.
4. 18:00 UTC: End-of-day report and next-day risk callout.

## Preparation Checklist

### April 7

- [ ] Confirm production env vars for Stripe and installer signing are present.
- [ ] Confirm fallback flag policy for production (`MarketingManualBillingFallbackEnabled=false`).
- [ ] Confirm owner/manager account login path on `/[locale]/account`.
- [ ] Confirm support on-call roster and escalation contacts.

### April 8

- [ ] Execute live dress rehearsal with internal test shop:
- Stripe checkout success -> account login -> key copy -> installer download -> first activation.
- [ ] Run webhook replay drill from Stripe dashboard.
- [ ] Run support dry-run for top 10 incident scenarios.
- [ ] Publish "pilot start" internal status note.

## Cohort A Runbook (April 9 to April 11)

### Day 1 (April 9)

- [ ] Onboard first 2 pilot shops.
- [ ] Capture per-shop TTFA and first-activation outcome.
- [ ] Validate installer checksum confirmation step was completed.

### Day 2 (April 10)

- [ ] Onboard next 2 pilot shops.
- [ ] Validate self-service device deactivation and replacement activation path.
- [ ] Review webhook delay/retry/dead-letter counters.

### Day 3 (April 11)

- [ ] Onboard final shop in Cohort A.
- [ ] Verify support ticket categorization quality.
- [ ] Prepare Gate A report with KPI and incident summary.

## Gate Decision Template

## Gate A (April 12), Gate B (April 17), Final (April 22)

Decision options:
- Go: proceed to next cohort/release.
- Conditional Go: proceed with explicit mitigations and owner/date commitments.
- No-Go: hold rollout, execute rollback/containment plan.

Required inputs:
- KPI dashboard snapshot against thresholds.
- Incident summary (SEV-1/2/3 counts and unresolved items).
- Billing webhook health snapshot.
- Support ticket trend and top root causes.

## Escalation Rules

- SEV-1 trigger: multi-shop checkout/access failure or activation outage.
- SEV-2 trigger: repeated single-shop onboarding failure with no workaround.
- Billing trigger: dead-letter growth spike or signature verification failure spike.

Immediate actions:
1. Incident commander opens active incident bridge.
2. Freeze new shop onboarding until mitigation is confirmed.
3. Publish status update every 60 minutes until resolved.

## Reporting Artifacts

- Daily KPI log: `DESKTOP_LICENSE_PILOT_DAILY_LOG_TEMPLATE.csv`
- Weekly summary report: `DESKTOP_LICENSE_STAGED_PILOT_PLAN_2026-04-07.md`
- Sign-off source of truth: `DESKTOP_LICENSE_OWNER_SIGNOFF_2026-04-07.md`
