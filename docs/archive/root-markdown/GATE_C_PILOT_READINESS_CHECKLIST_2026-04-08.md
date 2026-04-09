# Gate C Pilot Readiness Checklist (Onboarding -> First Sale)

Last updated: 2026-04-08

## Purpose

Define the minimum execution checklist to run pilot shops from owner onboarding to first sale under the cloud/local split baseline.

## Gate Prerequisites

- [x] Gate A migration dry-run pass
- [x] Gate B reliability/security baseline pass
- [x] Backend contract freeze for frontend kickoff

## Pilot Readiness Checklist

### 1. Cloud onboarding and tenant provisioning

- [ ] Owner signup flow enabled on production-like marketing environment
- [ ] Owner account activation email/content verified
- [ ] Tenant/business creation and plan assignment verified
- [ ] Trial/subscription status visible in owner portal

### 2. Installer and activation flow

- [ ] Signed installer artifact published in release metadata
- [ ] Owner can download installer from portal
- [ ] Device activation (`challenge` + `activate`) verified against tenant limits
- [ ] Device appears in owner portal active-device list

### 3. Local runtime path to first sale

- [ ] Local POS install + initial local credential login verified
- [ ] Product creation/import path verified on local DB
- [ ] First checkout sale completes end-to-end
- [ ] License heartbeat remains healthy during normal operation

### 4. AI wallet and role enforcement

- [ ] Owner top-up/credit flow verified (shop-scoped wallet)
- [ ] Manager AI usage consumes same shop wallet
- [ ] Cashier is denied AI usage and AI wallet access (`403`)

### 5. Offline and recovery controls

- [ ] Offline grace behavior validated for protected-feature lock rules
- [ ] Backup + restore drill evidence attached for pilot environment
- [ ] Device replacement runbook trial completed

### 6. Support and operations readiness

- [ ] Support has access to triage dashboard and alert catalog
- [ ] Override playbooks validated with dry-run walkthrough
- [ ] Incident contacts/escalation path confirmed for pilot shops

## Known Open Items (Current)

- Cloud owner identity store schema implementation remains pending (tracker blocker).
- POS secure secret-storage mechanism final selection remains pending (tracker blocker).
- Pilot environment onboarding UX validation is pending frontend execution.

## Go/No-Go Rule

Gate C passes only when all checklist items above are complete and no blocker remains open for pilot-critical paths (onboarding, activation, first sale, support triage).
