# AI Request Flow and Credit Calculation

This document explains how AI requests are processed and how wallet credits are calculated in the current Smart POS setup.

## Scope

- AI Insights and AI Chat credit billing
- Cloud relay mode (`AiInsights__CloudRelayEnabled=true`)
- Wallet and ledger behavior shown in the owner portal

## Current Runtime Context

Your current client runtime config enables cloud relay:

- `release/lanka-pos-win-x64/client.env`
  - `AiInsights__Enabled=true`
  - `AiInsights__CloudRelayEnabled=true`
  - `AiInsights__CloudRelayBaseUrl=https://smartpos-backend-v7yd.onrender.com`

Because relay is enabled, wallet reads and AI requests are forwarded to cloud endpoints for billing and settlement.

## End-to-End Request Lifecycle

## 1) API entry

- Insights request enters: `POST /api/ai/insights`
- Estimate request enters: `POST /api/ai/insights/estimate`
- In relay mode, endpoints call `AiCreditCloudRelayService` instead of local direct service.

Reference:
- `services/backend-api/Features/Ai/AiSuggestionEndpoints.cs`
- `services/backend-api/Features/Ai/AiCreditCloudRelayService.cs`

## 2) Relay forwarding

Relay sends requests to cloud:

- `cloud/v1/ai/insights`
- `cloud/v1/ai/insights/estimate`
- `cloud/v1/ai/wallet`

Cloud auth context is built from linked cloud auth token and/or license token.

Reference:
- `services/backend-api/Features/Ai/AiCreditCloudRelayService.cs`
- `services/backend-api/Features/Ai/CloudAiRelayEndpoints.cs`

## 3) Estimate stage

Estimate computes:

- `estimated_input_tokens`
- `estimated_output_tokens`
- `estimated_charge_credits`
- `reserve_credits`
- `can_afford`

Estimate uses:

- prompt token estimate
- system prompt reserve
- grounding reserve buffer
- usage-type multiplier
- min charge/min reserve rules

Reference:
- `services/backend-api/Features/Ai/AiInsightService.cs` (`EstimateInsightAsync`, `BuildInsightEstimate`)

## 4) Reserve credits before AI call

Before provider generation:

- `ReserveCreditsAsync` deducts `reserve_credits` from wallet
- ledger adds internal entry: `ai_reserve`
- request row is marked with `ReservedCredits`

Reference:
- `services/backend-api/Features/Ai/AiInsightService.cs` (`GenerateInsightAsync`)
- `services/backend-api/Features/Ai/AiCreditBillingService.cs` (`ReserveCreditsAsync`)

## 5) Provider execution

Provider (OpenAI/local) returns:

- final `input_tokens`
- final `output_tokens`
- response content

Then final `charged_credits` is calculated from real token usage.

Reference:
- `services/backend-api/Features/Ai/AiInsightService.cs` (`GenerateWithOpenAiAsync`, `CalculateCredits`)

## 6) Settlement (refund + final charge)

After provider result:

- `SettleReservationAsync` compares `reserved_credits` vs `charged_credits`
- if reserved > charged: refund difference (`ai_reserve_refund`)
- if charged > reserved: deduct overage
- writes charge entry `ai_charge` with metadata:
  - `charged_credits`
  - `overage_credits`
- updates wallet final balance

Reference:
- `services/backend-api/Features/Ai/AiCreditBillingService.cs` (`SettleReservationAsync`)

## Credit Formula

Final charge formula:

```text
charged_credits =
  max(
    minimum_charge_credits,
    round(
      (
        (input_tokens / 1000) * input_credits_per_1k +
        (output_tokens / 1000) * output_credits_per_1k
      ) * usage_multiplier,
      2
    )
  )
```

Current production defaults:

- `InputCreditsPer1KTokens = 1.0`
- `OutputCreditsPer1KTokens = 3.0`
- `MinimumChargeCredits = 1.0`
- `ReserveSafetyMultiplier = 1.35`
- Usage multipliers:
  - `quick_insights = 1.0`
  - `advanced_analysis = 1.8`
  - `smart_reports = 3.0`

Reference:
- `services/backend-api/appsettings.Production.json` (`AiInsights`)
- `services/backend-api/Features/Ai/AiInsightService.cs` (`CalculateCredits`, `ResolveUsagePolicy`)

## Why Wallet Shows a Single `-1.6` Charge

Internally, one request may produce reserve/refund/charge rows.  
User-facing ledger intentionally hides reserve/refund artifacts for AI request settlement and shows a clean charge delta.

Behavior:

- reserve entries are excluded
- AI reserve-refund artifacts are hidden from customer view
- charge row displays `-charged_credits` using metadata value

So if total charged credits were `1.6`, UI shows one line like:

- type: `AI Credit Spend`
- description: `ai_charge`
- credits: `-1.6`
- balance after: `98.4` (from `100 - 1.6`)

Reference:
- `services/backend-api/Features/Ai/AiCreditBillingService.cs` (`GetLedgerAsync`, `ShouldExposeLedgerEntry`, `MapLedgerDelta`)
- `services/backend-api/tests/SmartPos.Backend.IntegrationTests/AiInsightsCreditFlowTests.cs`

## Purchased Credits vs OpenAI Dollar Spend

Wallet credits are an app-defined unit and are not direct 1:1 passthrough of OpenAI USD billing.

App credit packs are configured as:

- `pack_100`: 100 credits for USD 5.00
- `pack_500`: 500 credits for USD 20.00
- `pack_2000`: 2000 credits for USD 70.00

Order settlement credits wallet with purchase ledger description `ai_credit_order_settlement`.

Reference:
- `services/backend-api/appsettings.Production.json` (`AiInsights:CreditPacks`)
- `services/backend-api/Features/Licensing/LicenseService.cs` (`CreateOwnerAiCreditInvoiceAsync`, `SettleAiCreditOrderAsync`)

## AI Chat Uses the Same Credit Engine

AI Chat delegates message generation to `AiInsightService.GenerateInsightAsync`, so chat spending follows the same reserve/charge/refund logic and multipliers.

Reference:
- `services/backend-api/Features/AiChat/AiChatService.cs` (`PostMessageAsync`)

