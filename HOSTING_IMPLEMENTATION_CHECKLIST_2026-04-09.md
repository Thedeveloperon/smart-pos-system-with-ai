# Hosting Implementation Checklist (Cloud Control Plane + Local POS)

Last updated: 2026-04-09  
Owner: Platform and Product Engineering

Purpose:
- Execute the production hosting model where POS runs local-first on store devices, while cloud portal and backend remain hosted on Render.
- Remove production dependency on hosted `pos-app` for customer payment/activation flows.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked

## Locked Scope

- [x] POS daily operations stay local-first (desktop runtime primary).
- [x] Cloud portal and backend remain hosted.
- [x] Hosted `pos-app` is not primary production runtime.

## Phase 1: Remove Hosted POS Checkout Dependency (Critical Path)

Status: [~]  
Target date: 2026-04-12

- [x] Add cloud portal AI checkout return route that accepts `reference` and `pack`.
- [x] Route verifies checkout status and shows deterministic customer state (pending/succeeded/failed).
- [x] Route links customer to account wallet/history state after verification.
- [x] Update backend AI checkout URL to point to cloud portal route (no `smartpos-pos-frontend` dependency).
- [x] Add automated tests for route behavior and backend URL handoff.

Acceptance criteria:
- Card AI checkout no longer depends on `https://smartpos-pos-frontend.onrender.com/ai-checkout`.
- End-to-end flow passes: start checkout -> redirect -> verify -> account state reflects payment.

## Phase 2: Production Configuration Hardening

Status: [ ]  
Target date: 2026-04-13

- [ ] Split Render resources into dedicated `staging` and `production` projects.
- [ ] Confirm backend CORS allowlist only includes production/staging portal origins.
- [ ] Confirm all required secrets are stored in Render env/secret management only.
- [ ] Validate cookie security settings in production runtime (`Secure`, `HttpOnly`, `SameSite` policy as designed).
- [ ] Review all external URLs (`CheckoutBaseUrl`, success URLs, account links) for cloud-portal-first routing.

Acceptance criteria:
- No production config points required customer flows to hosted POS frontend.
- Production and staging are isolated with separate secrets and endpoints.

## Phase 3: Database and Reliability Baseline

Status: [ ]  
Target date: 2026-04-14

- [ ] Upgrade Postgres plan from free tier for production workload.
- [ ] Enable and validate backup retention policy.
- [ ] Execute one restore drill and document RTO/RPO evidence.
- [ ] Configure deployment health checks and alert destinations.

Acceptance criteria:
- Restore drill evidence is captured and signed off.
- Health and alerting paths are verified for production incidents.

## Phase 4: Deployment Blueprint and Service Role Cleanup

Status: [ ]  
Target date: 2026-04-15

- [ ] Keep `smartpos-backend` and `smartpos-marketing-website` as required production services.
- [ ] Mark hosted `smartpos-pos-frontend` as optional (demo/UAT) or remove from production blueprint.
- [ ] Update deployment docs to show required vs optional services explicitly.
- [ ] Confirm support runbook reflects local POS primary runtime.

Acceptance criteria:
- Production blueprint has no hidden critical dependency on hosted POS frontend.
- Documentation and runbooks match real runtime architecture.

## Phase 5: Cutover, Validation, and Rollback Readiness

Status: [ ]  
Target date: 2026-04-16

- [ ] Run staging cutover checklist for hosted POS dependency removal.
- [ ] Perform production canary with one controlled tenant/shop.
- [ ] Monitor checkout success, activation success, and support tickets for 24 hours.
- [ ] Keep rollback toggle/path to previous checkout URL until canary sign-off.

Acceptance criteria:
- Canary period completes without payment/activation regressions.
- Rollback path is tested and documented before full rollout.

## Operational Evidence to Attach

- [ ] API and portal test run outputs for checkout-return flow.
- [ ] Config snapshot (non-secret) proving updated URLs and CORS origins.
- [ ] Backup and restore drill log.
- [ ] Canary metrics summary and go/no-go decision note.

## Change Log

- 2026-04-09: Checklist created to operationalize cloud control plane + local POS hosting model and remove hosted POS checkout dependency.
- 2026-04-09: Phase 1 implementation started: added cloud portal AI checkout return routes (`/[locale]/ai-checkout`, `/ai-checkout`), switched production AI checkout base URL to cloud portal, and added route-level UI flow tests.
