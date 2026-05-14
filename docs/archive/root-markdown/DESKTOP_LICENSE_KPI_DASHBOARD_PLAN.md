# Desktop License KPI Dashboard Plan

Purpose: define rollout and steady-state KPIs for hosted account + local activation experience.

## Core KPIs

1. Time-to-first-activation (TTFA)
- Definition: median minutes from checkout completion to first successful device activation.
- Target: <= 20 minutes.

2. Install success rate
- Definition: percentage of accounts that click installer download and complete first activation within 24 hours.
- Target: >= 90%.

3. Activation failure rate
- Definition: failed activation attempts / total activation attempts.
- Target: <= 5%.

4. Support tickets per 100 activations
- Definition: account-access + activation tickets normalized by successful activations.
- Target: <= 8.

## Supporting KPIs

1. Stripe checkout paid-to-access-ready latency (p95).
2. Webhook dead-letter count per day.
3. Expired installer-link recovery success rate.
4. Self-service deactivation usage and limit-hit rate.
5. Cashier-role account access denied events (expected control metric).

## Event/Data Sources

1. Website analytics events
- checkout return
- account login
- activation key reveal/copy
- installer download click
- checksum copy

2. Backend licensing audit logs
- `marketing_installer_download_tracked`
- `self_service_device_deactivate`
- entitlement and activation events

3. Billing webhook event persistence
- event status, retries, dead-letter transitions

4. Support system
- tagged ticket categories: account_access, activation_failure, installer_issue, billing_sync

## Dashboard Cadence

1. Pilot phase: daily review.
2. Post-rollout: weekly review with monthly trend report.

## Alert Thresholds

1. TTFA p95 > 60 minutes for 2 hours.
2. Activation failure rate > 10% in rolling 1 hour.
3. Dead-letter webhook events > 5 in rolling 1 hour.
4. Support tickets > 12 per 100 activations in rolling 7 days.
