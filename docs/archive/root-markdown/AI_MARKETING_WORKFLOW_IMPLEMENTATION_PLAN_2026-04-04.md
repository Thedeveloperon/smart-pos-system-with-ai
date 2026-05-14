# AI + Marketing Workflow Implementation Plan

Date: 2026-04-04  
Repository: `smart-pos-system-with-ai-main`

## Implementation Checklist

### Phase 0: Contract and Policy Hardening

- [x] Enforce OpenAI provider policy at startup for `AiInsights` + `AiSuggestions` in staging/production.
- [x] Add fail-fast guard for missing OpenAI API key when OpenAI provider is active.
- [x] Keep non-OpenAI providers allowed only via explicit non-production flag.
- [x] Enforce evidence rules server-side:
  - `cash` requires `bank_reference`
  - `bank_deposit`/`bank_transfer` require both `bank_reference` + `deposit_slip_url`
- [x] Add verify-time guard so partial legacy payment records cannot be verified.
- [x] Align website payment submit UX with evidence rules.
- [x] Align admin payment record UX with evidence rules.
- [x] Implement dedicated `billing_admin` workspace with tabs:
  - `Invoices`
  - `Licenses`
  - `Audit`
- [x] Run validation:
  - backend build
  - frontend build
  - website build
  - integration tests for manual billing flow

### Phase 1: Website -> Wallet Credit Order Linkage

- [x] Add `AiCreditOrder` model/table with statuses:
  - `submitted`
  - `pending_verification`
  - `verified`
  - `rejected`
  - `settled`
- [x] Capture identity mapping (`shop_code`, wallet target user/shop, package/trial metadata).
- [x] Link invoice/payment references to each credit order.
- [x] On admin verify, atomically post wallet credits and persist ledger reference on order.
- [x] Add public status API for `Submitted -> Pending Verification -> Verified -> Credits Added`.
- [x] Add integration tests for request/submit/verify/settle flow.

### Phase 2: Tiered AI Usage Model

- [x] Add `usage_type` contract:
  - `quick_insights`
  - `advanced_analysis`
  - `smart_reports`
- [x] Extend `/api/ai/insights` and `/api/ai/insights/estimate` (backward-compatible default).
- [x] Add tier routing policy (token caps, model policy, multipliers `1.0x/1.8x/3.0x`).
- [x] Add POS tier selector and estimate preview updates.
- [x] Add tests for pricing and token caps by tier.

### Phase 3: Chat + Deterministic Analytics

- [x] Add chat APIs under `/api/ai/chat`.
- [x] Add `AiConversation` and `AiConversationMessage`.
- [x] Add deterministic worst-seller and monthly trend/forecast primitives.
- [x] Add grounded citations in chat responses.
- [x] Reuse reserve/settle/refund credit lifecycle for chat messages.

### Phase 4: Smart Reports + Reminders

- [x] Add `AiSmartReportJob` (weekly/monthly generation).
- [x] Add `ReminderRule` and `ReminderEvent`.
- [x] Add reminder APIs:
  - `GET /api/reminders`
  - `POST /api/reminders/rules`
  - `POST /api/reminders/{id}/ack`
  - `POST /api/reminders/run-now`
- [x] Add POS reminder UX (banner/toast/list + acknowledge).

### Phase 5: Live Demo + Backup/DR

- [x] Add website `LiveDemoSection` with seeded read-only data.
- [x] Implement SQLite backup snapshot + WAL-safe copy.
- [x] Add SQLite backup-source guards (reject empty/corrupt DB by default, explicit override flags only).
- [x] Implement Postgres `pg_dump` backup path.
- [x] Add checksum, retention, encrypted offsite upload.
- [x] Add weekly restore smoke test + RPO/RTO runbook tracking.
- [x] Add backup preflight readiness script and scheduler templates (`cron` + `systemd`).
- [x] Add SQLite repair utility to produce backup-safe source DB copies when integrity issues are detected.
- [x] Add backup CI smoke workflow (GitHub Actions) with isolated SQLite roundtrip checks.

## Scope and Locked Decisions

- Yes, missed items exist and must be implemented.
- "All AI paths" means:
  - AI insights endpoints
  - product suggestion and product-from-image endpoints
- Public marketing payment methods remain:
  - `cash`
  - `bank_deposit`
- Priority order:
  - contractual correctness
  - billing/audit integrity
  - feature expansion

## Closed Critical Gaps

- [x] Billing evidence rules from section 15 are now enforced (submit/record/verify + verify-time guard).
- [x] Non-OpenAI paths are blocked in staging/production policy checks.
- [x] Dedicated `billing_admin` workspace (`Invoices`, `Licenses`, `Audit`) is implemented.
- [x] Website-to-wallet AI credit posting linkage is implemented.

## Phase 0: Contract and Policy Hardening (1-1.5 weeks)

### 0.1 OpenAI Policy Enforcement

- Enforce OpenAI-backed flow for staging/production on:
  - insights
  - product suggestion
  - product-from-image
- Startup/config fail-fast when production policy is invalid:
  - invalid provider
  - missing OpenAI key
- Allow non-OpenAI only in explicitly flagged dev/test mode.

### 0.2 Payment Evidence Rules (Backend + UX)

Enforce these rules on submit, record, and verify:

- `bank_deposit`: both required
  - `bank_reference`
  - `deposit_slip_url`
- `cash`: `reference` required

Add verify-time server guard so legacy partial records cannot be verified.

Update website + admin UX to match exact backend validation.

### 0.3 Dedicated Billing Admin Workspace

- Add billing-admin-focused workspace shell.
- Tabs:
  - `Invoices`
  - `Licenses`
  - `Audit`
- Remove mixed operational tabs for `billing_admin`.

## Phase 1: Website -> Wallet Credit Order Linkage (1.5-2.5 weeks)

### 1.1 Data Model

Add `AiCreditOrder` with lifecycle:

- `submitted`
- `pending_verification`
- `verified`
- `rejected`
- `settled`

Required mapping fields:

- `shop_code`
- target identity (`user_id` and/or shop identity)
- package/trial metadata
- invoice/payment references
- wallet posting ledger reference

### 1.2 Settlement Flow

On admin verification:

- post wallet credits atomically
- persist posting reference on order
- set order to `settled`

### 1.3 Website Status API

Expose status API so user can see:

`Submitted -> Pending Verification -> Verified -> Credits Added`

## Phase 2: Tiered AI Usage Model (1-2 weeks)

- Add `usage_type`:
  - `quick_insights`
  - `advanced_analysis`
  - `smart_reports`
- Extend:
  - `POST /api/ai/insights`
  - `POST /api/ai/insights/estimate`
- Backward-compatible default for old clients.
- Add tier routing policy:
  - token caps
  - model policy
  - credit multipliers `1.0x / 1.8x / 3.0x`
- Add POS tier selector and estimate preview updates.

## Phase 3: Chat + Deterministic Analytics Layer (2-3 weeks)

### 3.1 Chat APIs

- `POST /api/ai/chat/sessions`
- `POST /api/ai/chat/sessions/{id}/messages`
- `GET /api/ai/chat/sessions/{id}`
- `GET /api/ai/chat/history?take=...`

### 3.2 Persistence

- `AiConversation`
- `AiConversationMessage`

### 3.3 Deterministic Primitives

- worst/bottom-selling query
- monthly trend/forecast primitive
- grounded references in chat responses
- reserve/settle/refund credit lifecycle per message

## Phase 4: Smart Reports + Reminders (2-3 weeks)

- `AiSmartReportJob` for scheduled weekly/monthly generation.
- reminders domain:
  - `ReminderRule`
  - `ReminderEvent`
- endpoints:
  - `GET /api/reminders`
  - `POST /api/reminders/rules`
  - `POST /api/reminders/{id}/ack`
  - `POST /api/reminders/run-now`
- POS reminder UX:
  - banner
  - toast
  - list with acknowledge action

## Phase 5: Live Demo + Backup/DR (2 weeks)

### 5.1 Marketing Live Demo

Add `LiveDemoSection` with seeded read-only data for:

- low stock
- best/worst sellers
- smart report preview

### 5.2 Backup + DR

- SQLite snapshot + WAL-safe copy path
- Postgres `pg_dump` path
- checksum + retention
- encrypted offsite upload
- weekly restore smoke test
- RPO/RTO capture in runbook

## API/Contract Additions

- Add `usage_type` on insight estimate/generate payloads.
- Add `/api/ai/chat` APIs.
- Add `/api/reminders` APIs.
- Add AI credit order status API for website onboarding.
- Tighten existing payment submit/record/verify validation without changing endpoint paths.
- Add deterministic reporting contracts for worst-seller and forecast primitives.

## Test Plan

### Backend Validation Matrix

- `cash` submit/record/verify without reference fails.
- `bank_deposit` submit/record/verify without both reference + slip fails.

### Provider Policy Tests

- staging/prod rejects non-OpenAI policy.
- dev/test allows non-OpenAI only with explicit flag.

### Integration Tests

- website request/submit -> admin verify -> `AiCreditOrder` settled -> wallet credits visible.
- tier pricing/token cap behavior by `usage_type`.
- chat credit billing idempotency and citation presence.
- reminder scheduler + ack lifecycle.

### Frontend E2E

- `billing_admin` sees only `Invoices/Licenses/Audit`.
- website shows status progression + correct required fields.
- POS tier picker/chat/reminders work.
- wallet updates after verification.

## Delivery Sequence

1. Phase 0 (hardening first)
2. Phase 1 (credit order linkage)
3. Phase 2 (tiers)
4. Phase 3 (chat + deterministic analytics)
5. Phase 4 (smart reports + reminders)
6. Phase 5 (live demo + backup/DR)

## Success Criteria

- Production AI endpoints are OpenAI-only by policy.
- Payment evidence validation is consistent across website, admin UI, and backend verify.
- Billing admin has dedicated workflow surface.
- Verified AI package payments settle to wallet with auditable references.
- New APIs are additive and backward compatible where required.

## Remaining Blockers Checklist

- [ ] Phase 4 not started yet (smart report jobs, reminder engine/endpoints, POS reminder UX).
- [ ] Phase 5 not started yet (marketing live demo, backup automation, restore drill runbook).
- [ ] Full integration suite has one unrelated pre-existing failure:
  - `PurchaseOcrImportTests.PurchaseOcrDraft_ShouldReturnDraftForManager`
