# Account AI Credits Top-Up Staged Pilot Plan

Last updated: 2026-04-07

## Scope

1. Pilot `My Account` AI top-up to limited owner/manager shops.
2. Keep manual fallback enabled for pilot supportability.
3. Monitor conversion, failures, and verification latency daily.

## Cohorts

1. Cohort A (Day 1-3): 5 shops.
2. Cohort B (Day 4-7): +15 shops after A gate pass.
3. Cohort C (Week 2): +30 shops after B gate pass.

## Entry Criteria

1. Backend + website tests green.
2. Checkout, polling, and manual fallback tested in staging.
3. Billing ops and support runbooks reviewed.

## Gate Criteria

1. Checkout success rate >= 85% per cohort.
2. Failure rate <= 10% with known recovery paths.
3. Manual verification median latency <= 60 minutes.
4. No unresolved critical billing defects.

## Rollback Criteria

1. Failure rate > 20% in 1 hour.
2. Wallet settlement mismatch detected.
3. Support ticket spike > 5x baseline.

## Owners

1. Product Owner (Commerce)
2. Engineering Lead (AI Billing)
3. Billing Operations Lead
4. Support Operations Lead
