# AI Insights Canary Rollout Plan

Created: 2026-04-03

## Feature Flag Controls

- `AiInsights:CanaryOnlyEnabled` (`true|false`)
- `AiInsights:CanaryAllowedUsers` (username or user-id allow list)

When canary mode is enabled, access is blocked for users outside the allow list on:

- `POST /api/ai/insights`
- `POST /api/ai/insights/estimate`
- `GET /api/ai/insights/history`
- `GET /api/ai/wallet`
- `GET /api/ai/credit-packs`
- `POST /api/ai/payments/checkout`
- `GET /api/ai/payments`

## Rollout Steps

1. Enable canary mode in production config.
2. Add 5-10 pilot users to `CanaryAllowedUsers`.
3. Monitor 24-48 hours:
   - API error rate
   - average latency
   - credits burn rate per user
   - refund ratio
4. Expand to 25%, then 50%, then 100% user cohorts.
5. Disable canary gate after stability KPIs meet target for 7 consecutive days.

## Rollback

- Set `AiInsights:CanaryOnlyEnabled = false` to reopen globally, or clear `CanaryAllowedUsers` to freeze access.
- Keep payment webhooks active so pending checkout events still reconcile.

