# POS Cloud/Local Architecture — Developer-Ready Gap List

Based on the uploaded architecture plan dated 2026-04-08.

Source file reviewed: `POS_CLOUD_LOCAL_ARCHITECTURE_GAP_AND_IMPLEMENTATION_PLAN_2026-04-08.md`

---

## Summary

The architecture plan is strong on the core split and phased implementation, but it still needs a formal migration plan, local backup/restore strategy, idempotent API contract, offline edge-case rules, and clearer operational/security governance before it is fully production-ready.

---

# Critical

## 1. Migration plan from current monolith to split architecture
**Why this is critical**  
The plan identifies that owner identity, onboarding, AI billing, and POS operational data are currently mixed in one backend and one EF context, but it does not define how existing live data will move safely into the new cloud/local model.

**Gap**
- No migration path for current owners
- No migration path for current shop-scoped AI wallet balances
- No migration path for existing device/license state
- No rollback plan

**Action**
- Write a migration spec for:
  - `Users` owner records → cloud owner accounts
  - `StoreId/Shop` → `Tenant` + `Branch`
  - current wallet balance/ledger → cloud wallet ledger
  - existing activation records → `DeviceRegistration`
- Define one-time migration scripts
- Define rollback and re-run strategy

**Done when**
- A staging migration succeeds end-to-end
- Existing customers can log in after migration
- Wallet balances and device registrations reconcile correctly

**Suggested owner**
- backend lead + DB engineer

---

## 2. Local database backup and restore strategy
**Why this is critical**  
The plan clearly keeps products, sales, inventory, cashier sessions, and local credentials in the local environment, but it does not define recovery if the PC dies or the database is corrupted.

**Gap**
- No automatic backup policy
- No restore workflow
- No disaster recovery instructions for store operators

**Action**
- Add local backup scheduler
- Add restore utility and admin guide
- Define backup retention rules
- Define device replacement flow after hardware failure

**Done when**
- A store can restore a failed machine from backup
- Recovery time objective is documented and tested

**Suggested owner**
- POS runtime/backend lead

---

## 3. Retry, idempotency, and reconciliation contract
**Why this is critical**  
The plan introduces activate, heartbeat, token refresh, AI authorize, settle, and refund flows, but unstable networks will create duplicate requests unless this is formally designed.

**Gap**
- No idempotency standard for cloud write APIs
- No retry rules for settlements/refunds
- No duplicate protection for activation/token refresh

**Action**
- Require idempotency keys for:
  - device activation
  - AI authorize
  - AI settle
  - AI refund
- Define retry windows and duplicate response behavior
- Add reconciliation job for orphaned AI authorizations

**Done when**
- Replayed requests do not double-charge or double-activate
- Network retry tests pass

**Suggested owner**
- API/backend lead

---

## 4. Offline policy edge cases and signed policy trust model
**Why this is critical**  
The plan adds grace periods and signed policy snapshots, which is good, but it does not fully define what happens in disputed edge cases like subscription expiry, suspension, or local clock tampering while offline.

**Gap**
- No clock-skew policy
- No exact rule for “expired while offline”
- No exact rule for “suspended while offline”
- No exact signed-policy validation spec

**Action**
- Define signed policy schema and signature verification
- Define local time tolerance rules
- Define precedence rules:
  - valid cached snapshot until expiry?
  - immediate suspension on next heartbeat?
- Define behavior after grace expiry per feature group

**Done when**
- Offline decisions are deterministic
- Security review signs off on tamper resistance

**Suggested owner**
- backend architect + security reviewer

---

# Important

## 5. Role boundary specification: cloud roles vs local roles
**Why this matters**  
The plan correctly says local users remain local and cashier cannot use AI, but it does not fully define whether local owner/manager roles map to cloud permissions.

**Gap**
- No authoritative mapping between cloud owner and local roles
- No rule for device management permissions
- No rule for branch manager vs tenant owner capabilities

**Action**
- Create permission matrix covering:
  - cloud owner
  - cloud billing admin if needed
  - local owner
  - local manager
  - cashier
- Define which actions are portal-only vs POS-local

**Done when**
- Every privileged action has one clear authority source

**Suggested owner**
- product owner + backend lead

---

## 6. Audit logging and observability specification
**Why this matters**  
The plan says cloud tracks audit and centralized audit events, but does not define required events, metrics, or alerts.

**Gap**
- No event catalog
- No alert thresholds
- No support diagnostics plan

**Action**
- Define logs for:
  - signup/login/verification/reset
  - activation and deactivation
  - heartbeat failures
  - token refresh failures
  - AI authorization denied/approved
  - AI settlement/refund
  - policy snapshot mismatch
- Add metrics dashboards and alerts

**Done when**
- Support can diagnose activation/licensing/AI failures from logs alone

**Suggested owner**
- DevOps + backend lead

---

## 7. API versioning and compatibility policy
**Why this matters**  
The plan includes app version metadata and minimum supported version, but not explicit API compatibility behavior across old POS clients.

**Gap**
- No API versioning scheme
- No compatibility window
- No deprecation rules

**Action**
- Version cloud APIs explicitly
- Define minimum compatible POS version
- Define deprecation notice period
- Define behavior for unsupported clients

**Done when**
- Old clients fail predictably and safely
- New cloud releases do not break old installed terminals unexpectedly

**Suggested owner**
- backend architect

---

## 8. Multi-branch commercial and technical policy
**Why this matters**  
The plan introduces `Tenant`, `Branch`, and device registrations, but does not define tenant-wide vs branch-specific rules.

**Gap**
- No clear rule for AI credit sharing
- No clear rule for terminal limits by tenant vs branch
- No reassignment policy for terminals

**Action**
- Decide and document:
  - AI credits tenant-wide or per branch
  - device caps per tenant or per branch
  - branch transfer workflow for terminals
  - whether one owner can manage multiple branches

**Done when**
- Billing and device enforcement behavior is deterministic

**Suggested owner**
- product owner + backend lead

---

## 9. Owner portal security hardening
**Why this matters**  
The plan includes email/password, verification, and reset, but stops short of broader account-hardening measures.

**Gap**
- No MFA readiness
- No rate limiting policy
- No session revocation model
- No suspicious login handling

**Action**
- Add login throttling
- Add session/device revocation
- Add MFA roadmap, even if phase 2
- Add email change verification flow

**Done when**
- Basic owner-account abuse protections are in place

**Suggested owner**
- auth/backend lead

---

## 10. Installer/update trust chain and release policy
**Why this matters**  
The plan includes signed installers and checksum verification, but not the operational release policy.

**Gap**
- No channel strategy
- No downgrade policy
- No emergency security rollout policy

**Action**
- Define:
  - stable/beta/internal channels
  - forced update rules
  - rollback rules
  - signature/checksum validation location
  - code-signing ownership and renewal

**Done when**
- Update rollout and rollback are repeatable and secure

**Suggested owner**
- release engineer + product owner

---

# Nice to have

## 11. AI data governance and privacy rules
**Why this matters**  
The plan defines the AI envelope and central settlement, but not what business/customer data may be sent upstream.

**Gap**
- No prompt payload policy
- No retention policy
- No redaction rules

**Action**
- Define allowed/disallowed fields in AI payloads
- Define retention period for prompts/responses
- Define redaction for customer-sensitive data

**Done when**
- Team knows exactly what may be sent to AI and stored in cloud

**Suggested owner**
- product owner + backend lead

---

## 12. Support/admin override procedures
**Why this matters**  
The plan mentions admin tools but not the manual support playbooks needed in real operations.

**Gap**
- No manual extension flow
- No manual credit adjustment flow
- No emergency device unlock flow

**Action**
- Add support procedures for:
  - manual device reset
  - temporary grace extension
  - wallet correction
  - fraud lock / suspension review

**Done when**
- Support can resolve common billing/device incidents without ad hoc DB edits

**Suggested owner**
- support ops + backend lead

---

## 13. PWA vs installer decision clarity
**Why this matters**  
The plan briefly mentions “signed installer or PWA option,” but those have very different security and local-storage implications.

**Gap**
- No final runtime decision
- No feature parity definition between packaged client and PWA

**Action**
- Decide whether PWA is:
  - a real supported runtime
  - or only a temporary/testing path
- Document limitations for printing, secret storage, offline reliability, updates

**Done when**
- Runtime support matrix is explicit

**Suggested owner**
- architect + frontend/runtime lead

---

# Recommended Execution Order

Do these first:
1. Migration plan
2. Backup/restore
3. Idempotency/retry contract
4. Offline edge-case trust model

Then:
5. Role boundary spec
6. Audit/observability
7. API versioning
8. Multi-branch policy
9. Portal security hardening
10. Update trust chain

Finally:
11. AI privacy rules
12. Support/admin overrides
13. PWA decision clarity

---

# Internal Summary Message

The architecture plan is strong on the core split and phased implementation, but it still needs a formal migration plan, local backup/restore strategy, idempotent API contract, offline edge-case rules, and clearer operational/security governance before it is fully production-ready.
