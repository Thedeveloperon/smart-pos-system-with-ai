# AI Insights Pricing Rules v1

Created: 2026-04-03  
Rules version: `ai_pricing_v1_2026_04_03`

## Frozen v1 model scope

- Allowed models:
  - `gpt-5.4-mini`
  - `local-pos-insights-v1`
- Default configured model: `gpt-5.4-mini`
- Max output tokens per request: `320`

## Credit pack catalog

| Pack code | Credits | Price | Currency | Effective price per credit |
|---|---:|---:|---|---:|
| `pack_100` | 100 | 5.00 | USD | 0.0500 |
| `pack_500` | 500 | 20.00 | USD | 0.0400 |
| `pack_2000` | 2000 | 70.00 | USD | 0.0350 |

## Usage pricing formula

- Input credit rate: `1.0` credits / 1K input tokens
- Output credit rate: `3.0` credits / 1K output tokens
- Minimum charge: `1.0` credits
- Reserve safety multiplier: `1.35`
- Minimum reserve: `1.0` credits

Charge equation:

`charge_credits = max(minimum_charge, round2((input_tokens/1000 * input_rate) + (output_tokens/1000 * output_rate)))`

Reserve equation:

`reserve_credits = max(minimum_reserve, round2(charge_credits * reserve_safety_multiplier))`

## Abuse and spend limits

- Daily max charged credits per user: `250`
- Rate limit per user: `10` requests/minute
- Idempotency required for:
  - `POST /api/ai/insights`
  - `POST /api/ai/payments/checkout`

## Versioning strategy

- Pricing behavior is versioned by `AiInsights:PricingRulesVersion`.
- Any change to rates, reserve policy, minimums, limits, or model scope must:
  1. Introduce a new version string.
  2. Be recorded in this document with date and rationale.
  3. Be deployed behind canary controls before full rollout.
