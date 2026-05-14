# AI Insights + Credits Implementation Tracker

Created: 2026-04-03  
Status: Implementation Complete (production operational signoff pending)

## Purpose

Track end-to-end implementation of paid AI insights using customer credits, with safe billing, strong accuracy controls, and production-grade reliability.

## Scope

- Backend AI gateway (server-side OpenAI calls only)
- Credit wallet and immutable ledger
- Credit purchase and webhook top-up flow
- POS-grounded AI insights endpoint
- Frontend credit UX (balance, estimate, actual usage)
- Security, observability, and rollout controls

## Non-Negotiable Rules

- [x] No frontend-to-OpenAI direct requests
- [x] No AI inference without credit reservation
- [x] No double charge on retries (idempotency required)
- [x] Every request must be auditable (`reserve`, `charge`, `refund`)
- [x] Prompt/output safety checks enabled

## Phase 1: Product and Pricing Definition

- [x] Define credit pack catalog (example: 100 / 500 / 2000 credits)
- [x] Define pricing formula and unit economics
- [x] Create `pricing_rules` versioning strategy
- [x] Define daily/user spend limits and abuse limits
- [x] Freeze v1 model list and max token caps

## Phase 2: Database and Ledger Foundation

- [x] Add `wallets` table
- [x] Add immutable `credit_ledger` table
- [x] Add `ai_requests` table with idempotency key
- [x] Add `payments` table with provider references
- [x] Add indexes for `user_id`, `created_at`, `idempotency_key`
- [x] Add migration rollback plan + seed data for local dev

## Phase 3: Credit Engine (Atomic Billing)

- [x] Implement `reserveCredits(userId, requestId, estimatedCredits)`
- [x] Implement `settleCredits(requestId, actualCredits)`
- [x] Implement `refundCredits(requestId, reason)`
- [x] Enforce DB transaction + row locking for balance safety
- [x] Add idempotent replay handling for all credit operations
- [x] Add manual adjustment path (admin-only, audited)

## Phase 4: Payments and Top-Up

- [x] Integrate payment provider checkout flow
- [x] Implement webhook signature verification
- [x] Add webhook idempotency protection
- [x] Write `purchase` ledger entries on successful payment
- [x] Update wallet balance atomically from webhook event
- [x] Add failed/refunded payment reconciliation flow

## Phase 5: AI Gateway and Insight Pipeline

- [x] Create `POST /api/ai/insights` (authenticated)
- [x] Require request `idempotency_key`
- [x] Validate request and estimate maximum credit reserve
- [x] Reserve credits before model call
- [x] Call OpenAI from backend using secret key
- [x] Capture model usage (input/output tokens)
- [x] Settle final credit charge and refund remainder
- [x] Return response with `credits_used` and `remaining_credits`

## Phase 6: Accuracy and Data Grounding

- [x] Build POS fact extractor (sales, margin, stock, trend summaries)
- [x] Inject only verified facts into AI prompt context
- [x] Force structured output schema for insights
- [x] Add fallback: `insufficient data` behavior
- [x] Create evaluation set (100+ real questions)
- [x] Track answer correctness score in QA cycle

## Phase 7: Frontend Customer Experience

- [x] Add wallet balance badge in AI insights screen
- [x] Show estimated credit usage before submission
- [x] Show actual credit usage after response
- [x] Show low balance warning and top-up CTA
- [x] Handle insufficient credit blocking state cleanly
- [x] Add history view for AI requests and credit deductions
- [x] Integrate credit-pack checkout initiation and purchase history in AI insights UI

## Phase 8: Security, Compliance, and Observability

- [x] Store API secrets in secure configuration (not in code)
- [x] Encrypt sensitive prompt data at rest (if stored)
- [x] Avoid raw prompt logging by default (store hash + metadata)
- [x] Add request rate limits and per-user daily cap
- [x] Add moderation/safety checks for prompt/output
- [x] Disable manual wallet top-up by default and restrict overrides to billing roles
- [x] Add telemetry: latency, tokens, cost, error rate, burn rate

Note: raw prompts are not persisted; only prompt hash + metadata is stored, reducing prompt-data-at-rest exposure by design.

## Phase 9: Testing and Launch

- [x] Unit tests for reserve/settle/refund edge cases
- [x] Concurrency tests (double-click, retry, race conditions)
- [x] Integration tests for payment webhook idempotency
- [x] Integration tests for end-to-end AI billing flow
- [x] Manual QA: purchase -> prompt -> charge -> failure refund
- [x] Canary release with feature flag to pilot tenants
- [ ] Production go-live checklist signoff

## Go-Live Checklist

- [ ] Credits can be purchased and reflected in wallet within target SLA
- [x] Successful AI requests always produce correct ledger entries
- [x] Failed AI requests always release reserved credits
- [x] Retry of same request never creates duplicate charges
- [x] Customer always sees current balance after each request
- [x] Support team can trace any billing dispute in under 5 minutes

## Risks and Mitigations

- [x] Risk: duplicate charge under network retry  
Mitigation: mandatory idempotency key + unique index + replay response
- [x] Risk: inaccurate insight hallucination  
Mitigation: POS-grounded facts + schema constraints + QA evaluation set
- [x] Risk: cost overrun from large prompts  
Mitigation: strict token caps + reserve logic + per-user daily caps
- [x] Risk: webhook replay or spoofing  
Mitigation: signature verification + idempotency table

## Owners and Cadence

- [x] Assign owner per phase (Backend, Frontend, QA, DevOps)
- [x] Weekly implementation review with blocker log
- [x] Daily update of tracker status during active rollout window

## Evidence

- Pricing and model freeze: `AI_INSIGHTS_PRICING_RULES_V1_2026-04-03.md`
- Rollback + seed plan: `AI_INSIGHTS_DB_ROLLBACK_AND_DEV_SEED_PLAN_2026-04-03.md`
- QA matrix: `AI_INSIGHTS_MANUAL_QA_MATRIX_2026-04-03.md`
- Go-live signoff template: `AI_INSIGHTS_GO_LIVE_CHECKLIST_2026-04-03.md`
- Integration test coverage:
  - `AiInsightsCreditFlowTests`
  - `AiInsightsCanaryAccessTests`
  - `AiInsightsFailureRefundTests`
