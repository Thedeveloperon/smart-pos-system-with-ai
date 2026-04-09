# AI Insights Manual QA Matrix

Created: 2026-04-03

## Critical Billing Flows

| Case ID | Scenario | Steps | Expected Result | Status | Evidence |
|---|---|---|---|---|---|
| AI-QA-001 | Purchase credits succeeds | Checkout -> webhook `payment.succeeded` -> wallet refresh | Wallet increases exactly once, `purchase` ledger entry exists | Pass | `AiPaymentWebhookSucceeded_ShouldCreditWallet_AndBeIdempotent` |
| AI-QA-002 | Webhook replay idempotency | Send same webhook event twice | First handled, second `duplicate_event`, no extra credits | Pass | `AiPaymentWebhookSucceeded_ShouldCreditWallet_AndBeIdempotent` |
| AI-QA-003 | Insight success billing | Top-up -> prompt -> successful insight | `reserve` + `charge` (+ optional `refund`) ledger entries, balance correct | Pass | `GenerateInsights_WithCredits_ShouldCreateReserveChargeAndRefundLedgerEntries` |
| AI-QA-004 | Insight failure refund | Force provider failure after reserve | Reserved credits fully refunded once | Pass | `GenerateInsights_WithProviderFailureAfterReserve_ShouldRefundCredits` |
| AI-QA-005 | Insight idempotency replay | Same `idempotency_key` retried | No duplicate request charge, same request identity returned | Pass | `GenerateInsights_WithSameIdempotencyKey_ShouldNotDuplicateCharges` |
| AI-QA-006 | Checkout race | Fire two checkout requests same idempotency key | One payment row only, same payment id returned | Pass | `Checkout_WithConcurrentSameIdempotencyKey_ShouldCreateSinglePayment` |
| AI-QA-007 | Canary deny path | Canary enabled, user not in allow list | `403 Forbidden` on AI insights/payment endpoints | Pass | `Estimate_WithUserOutsideCanaryAllowList_ShouldReturnForbidden` |
| AI-QA-008 | Canary allow path | Canary enabled, pilot user in allow list | AI endpoints work normally | Pass | `Estimate_WithCanaryAllowedUser_ShouldSucceed` |

## Signoff

- QA owner: Backend integration automation
- Date: 2026-04-03
- Notes: Scenarios were validated by integration tests with real DB writes and ledger assertions.
