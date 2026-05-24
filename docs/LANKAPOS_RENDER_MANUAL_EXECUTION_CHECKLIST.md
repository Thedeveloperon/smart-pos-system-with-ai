# LankaPOS Render Manual Execution Checklist

## What Was Implemented in Repo
These restricted-mode defaults are now set in `render.yaml` for first deployment safety:

- `Licensing__CloudLicensingEndpointsEnabled=false`
- `Licensing__CloudRelayEnabled=false`
- `Licensing__Stripe__Enabled=false`
- `AiInsights__CloudAiRelayEndpointsEnabled=false`
- `AiInsights__CloudRelayEnabled=false`
- `Licensing__MarketingManualBillingFallbackEnabled=true`

This keeps first go-live free from live Stripe/webhook/cloud-licensing side effects until keys are verified.

## Manual Changes Required in Render Account
You must perform these manually in your new Render account:

1. Create new private GitHub repo `LankaPOS` and push current code.
2. In Render, create Blueprint from `render.yaml` in `LankaPOS`.
3. Confirm services are created:
   - `smartpos-backend`
   - `smartpos-pos-frontend`
   - `smartpos-marketing-website`
   - `smartpos-postgres`
4. Set backend mandatory secrets:
   - `SMARTPOS_JWT_SECRET`
   - `SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM`
   - `SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY`
   - `Licensing__VerificationPublicKeyPem`
   - `Licensing__AccessSuccessPageBaseUrl`
5. Set portal bindings:
   - `SMARTPOS_BACKEND_API_URL`
   - `NEXT_PUBLIC_SITE_URL`
6. Verify backend DB binding (`ConnectionStrings__Postgres`) is injected from `smartpos-postgres`.
7. Deploy all services and wait for healthy status.

## Pre-Cutover Validation (Render URLs)
1. Backend: `GET /health` returns 200.
2. POS: `GET /health` returns 200.
3. POS page loads.
4. Inventory manager route loads: `/inventory-manager/`.
5. Cloud portal home + admin login load.
6. Restricted-mode checks:
   - No live Stripe checkout is active.
   - No live webhook side effects are triggered.
   - No live cloud-licensing relay side effects occur.

## DNS Cutover (Immediate)
1. Point your production DNS to new Render services.
2. Validate on final domain:
   - backend health
   - POS load + basic sale flow
   - inventory manager overview + tab navigation
   - cloud portal account/admin pages

## Rollback Without Old Render Access
1. Revert DNS to previous known endpoint (or maintenance endpoint).
2. Use local installer/runtime fallback for critical operation continuity.
3. Keep restricted-mode flags disabled until issue is fixed.
4. Re-run smoke checks and then retry cutover.

## Enabling Integrations Later
Enable each integration only after key + endpoint verification:

1. Stripe:
   - add live keys and webhook secrets
   - set `Licensing__Stripe__Enabled=true`
   - verify checkout success/cancel/status flow
2. Licensing cloud relay:
   - set signing/encryption/verification keys
   - set `Licensing__CloudRelayEnabled=true`
   - set `Licensing__CloudLicensingEndpointsEnabled=true`
   - verify licensing access success callback
3. AI cloud relay:
   - set OpenAI and AI relay configs
   - set `AiInsights__CloudRelayEnabled=true`
   - set `AiInsights__CloudAiRelayEndpointsEnabled=true`
   - verify relay health and request flow
