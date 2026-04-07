# Desktop License Staged Pilot Plan (2026-04-07)

Purpose: validate hosted account-to-local activation flow before broad rollout.

## Pilot Cohorts

1. Cohort A (internal + friendly stores): 5 shops.
2. Cohort B (low-risk external): 10 shops.
3. Cohort C (broader pre-release): 25 shops.

## Entry Criteria

1. Stripe checkout and webhook monitoring enabled.
2. Account page (`/[locale]/account`) accessible with owner/manager auth.
3. Protected installer links and checksum visible.
4. Support runbooks active for account and activation incidents.

## Exit Gates Per Cohort

1. Time-to-first-activation median under 20 minutes.
2. Activation success rate >= 95%.
3. No unresolved SEV-1 billing webhook incidents.
4. Support ticket rate <= 8 per 100 activations.

## Pilot Test Scenarios

1. Paid plan checkout success and account handoff.
2. Account login with owner role and cashier denial check.
3. Activation key reveal/copy and installer download.
4. Device deactivation and reactivation on replacement device.
5. Expired signed installer link recovery.
6. Stripe webhook delay replay and state reconciliation.

## Operational Cadence

1. Daily KPI review during active cohort window.
2. Daily support standup for top incident categories.
3. End-of-cohort go/no-go review with product + engineering + support.

## Rollback Triggers

1. Activation success rate below 90% for two consecutive days.
2. Repeated checkout paid-but-no-access incidents above threshold.
3. Security anomaly spikes indicating abuse of key/download/deactivation flows.

## Rollback Actions

1. Pause new cohort onboarding.
2. Keep existing active entitlements available for already-onboarded shops.
3. Enable manual fallback only if Stripe incidents block paid onboarding.
4. Publish customer status update and ETA.
