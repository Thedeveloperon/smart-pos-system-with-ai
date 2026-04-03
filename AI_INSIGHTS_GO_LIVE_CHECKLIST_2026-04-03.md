# AI Insights Go-Live Checklist

Created: 2026-04-03  
Scope: AI insights + credits billing rollout

## Technical readiness

- [x] AI integration tests pass (`15/15`) for credits, idempotency, checkout, webhook, canary, and refund-on-failure.
- [x] Backend build passes (`backend/backend.csproj`).
- [x] Frontend production build passes (`frontend` `vite build`).
- [x] Pricing rules v1 and model freeze documented (`AI_INSIGHTS_PRICING_RULES_V1_2026-04-03.md`).
- [x] DB rollback + local seed plan documented (`AI_INSIGHTS_DB_ROLLBACK_AND_DEV_SEED_PLAN_2026-04-03.md`).

## Operational signoff (required before production)

- [ ] Product owner approval
- [ ] Support lead approval
- [ ] DevOps approval for secret provisioning
- [ ] Billing owner approval

## Final signoff

- Release owner:
- Date:
- Notes:
