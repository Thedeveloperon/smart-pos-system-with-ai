# Desktop License Go-Live Checklist (2026-04-07)

Purpose: execute final rollout gates for hosted account access + local desktop activation.

## Engineering

- [x] Backend licensing, Stripe checkout, webhook idempotency/dead-letter, and account APIs implemented.
- [x] Website account route, auth proxy routes, installer UX, and PWA baseline implemented.
- [x] Security hardening completed (key URL cleanup, rate limits, audit trails, anomaly hooks).
- [~] Live E2E validation in production-like environment (real Stripe + installer + local activation).
- Owner: Engineering Lead (Licensing Platform)
- Due date: 2026-04-11

## Security

- [x] Sensitive endpoint throttling in place.
- [x] Installer signed-link expiry and validation in place.
- [x] Stripe secrets model and incident runbook documented.
- [~] Production secret rotation verification and evidence capture.
- Owner: Security Lead (Application Security)
- Due date: 2026-04-10

## Support/Operations

- [x] Account/activation support runbook completed.
- [x] Stripe billing incident runbook completed.
- [~] Support team dry-run for top 10 incidents completed.
- Owner: Support Operations Lead
- Due date: 2026-04-10

## Billing Operations

- [x] Stripe primary gateway path implemented and verified in test coverage.
- [~] Live webhook monitoring dashboard and replay process drill completed.
- Owner: Billing Operations Lead
- Due date: 2026-04-10

## Pilot Execution (Exact Schedule)

- [ ] Cohort A pilot (5 shops): 2026-04-09 to 2026-04-11.
- [ ] Cohort A go/no-go review: 2026-04-12.
- [ ] Cohort B pilot (10 shops): 2026-04-13 to 2026-04-16.
- [ ] Cohort B go/no-go review: 2026-04-17.
- [ ] Cohort C pilot (25 shops): 2026-04-18 to 2026-04-21.
- [ ] Final production go-live decision: 2026-04-22.
- Owner: Product Owner (Commerce) + Engineering Lead + Support Operations Lead
- Command center playbook: `DESKTOP_LICENSE_PILOT_COMMAND_CENTER_2026-04-07.md`
- Daily KPI log template: `DESKTOP_LICENSE_PILOT_DAILY_LOG_TEMPLATE.csv`

## KPI Gates for Final Release

- [ ] TTFA median <= 20 minutes.
- [ ] Activation success rate >= 95%.
- [ ] Activation failure rate <= 5%.
- [ ] Support tickets <= 8 per 100 activations.
- [ ] No unresolved SEV-1 Stripe/licensing incidents.

## Sign-off

- Source of truth: `DESKTOP_LICENSE_OWNER_SIGNOFF_2026-04-07.md`
- Completion rule: Product, Engineering, Billing Ops, and Support must all be marked `Approved`.
- Target production release date: 2026-04-22.
