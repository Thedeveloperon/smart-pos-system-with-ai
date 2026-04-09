# Marketing Payment + License Rollout And KPI Plan

Last updated: 2026-04-02

## Rollout Plan

## Phase A (2026-04-03 to 2026-04-05): Internal QA

- run backend integration tests (after .NET 8 runtime installation)
- run frontend + website build/test pipelines
- run manual scenario matrix for:
  - starter (free) path
  - paid path with bank deposit
  - duplicate submission safeguards
  - protected installer URL expiry and refresh

Exit criteria:
- no P1/P2 defects open
- all critical flows pass in staging

## Phase B (2026-04-06 to 2026-04-09): Pilot Customers

- enable flow for 5 pilot merchants
- SLA monitor for payment verification
- support on-call during pilot window

Exit criteria:
- >= 90% successful activation in pilot
- no unresolved security incidents

## Phase C (2026-04-10 to 2026-04-15): Controlled General Release

- enable by default for all new marketing plan clicks
- monitor conversion funnel and verification queue daily
- weekly retro with product + billing + support + engineering

Exit criteria:
- stable metrics for 5 consecutive days

## KPI Definitions

- `pricing_to_request_rate`: payment requests / pricing CTA clicks
- `request_to_submit_rate`: payment submissions / payment requests
- `submit_to_verify_rate`: verified payments / payment submissions
- `verify_to_activation_rate`: successful activation entitlement use / verified payments
- `median_time_to_activation_minutes`: time from payment submit to first active device
- `verification_sla_p95_hours`: p95 time for billing verify/reject
- `proof_rejection_rate`: rejected proof uploads / proof upload attempts
- `duplicate_submission_rate`: duplicate submit blocks / submit attempts
- `installer_download_success_rate`: valid redirects / download link opens
- `support_ticket_rate_per_100_activations`

## KPI Targets (Initial)

- pricing_to_request_rate >= 30%
- request_to_submit_rate >= 65%
- submit_to_verify_rate >= 90%
- verify_to_activation_rate >= 95%
- median_time_to_activation_minutes <= 120
- verification_sla_p95_hours <= 24
- proof_rejection_rate <= 10%
- duplicate_submission_rate <= 5%
- installer_download_success_rate >= 98%
- support_ticket_rate_per_100_activations <= 8

## Ownership

- Product owner: Growth Product Lead
- Engineering owner: Platform Lead
- Billing operations owner: Billing Ops Lead
- Support owner: Customer Success Lead

