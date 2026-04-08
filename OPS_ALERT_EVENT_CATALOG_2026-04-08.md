# SmartPOS Ops Alert Event Catalog

Last updated: 2026-04-08  
Catalog version: `w6-alert-catalog-v1-2026-04-08`

## Purpose

Publish a single reference for operations-facing alert/event codes, where they are emitted, and how support should triage them.

## Event List

| Code | Category | Severity | Source | Surfaces |
|---|---|---|---|---|
| `licensing.validation_spike` | licensing | warning | `LicensingAlertMonitor` | Ops webhook, support triage validation breakdown |
| `licensing.webhook_failure_spike` | billing | warning | `LicensingAlertMonitor` | Ops webhook, support triage webhook breakdown |
| `licensing.security_anomaly_spike` | security | critical | `LicensingAlertMonitor` | Ops webhook, support triage security breakdown |
| `recovery.drill_degraded` | recovery | critical | `RecoveryDrillAlertService` | Ops webhook, support triage recovery panel |
| `recovery_drill_alert_raised` | recovery | warning | `RecoveryDrillAlertService` | License audit logs, support triage recent events |
| `billing_webhook_malformed_payload` | security | critical | `LicenseEndpoints` | Security anomaly stream, audit logs |
| `provisioning_rate_limit_exceeded` | security | warning | `ProvisioningRateLimitMiddleware` | Security anomaly stream |

## API Exposure

- `GET /api/reports/support-alert-catalog`
- `GET /api/reports/support-triage?window_minutes=30`

## Triage Rules

1. Recovery alerts (`recovery.drill_degraded`, `recovery_drill_alert_raised`)
- Run restore smoke test on latest backup.
- Compare reported RTO/RPO against configured thresholds.

2. Webhook alerts (`licensing.webhook_failure_spike`, `billing_webhook_malformed_payload`)
- Verify webhook signing secret and header compatibility.
- Inspect provider retries and dead-letter backlog.

3. Security alerts (`licensing.security_anomaly_spike`, `provisioning_rate_limit_exceeded`)
- Check source fingerprints/IP prefixes for abuse patterns.
- Validate if traffic spike is legitimate onboarding activity.

## Ownership

- DevOps: Ops channel webhook and incident routing.
- Backend: alert emission integrity and payload schema stability.
- Support: first-response triage and escalation evidence capture.
