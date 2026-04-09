# Backend Contract Freeze Review (Frontend Kickoff)

Last updated: 2026-04-08

## Decision

Result: **PASS**

This backend contract surface is frozen for frontend integration kickoff, except for additive non-breaking changes and explicit break-glass fixes.

## Frozen Scope

### A. Marketing Website -> Backend contract

The website proxy layer currently targets these backend paths and they are frozen:
- `POST /api/license/public/payment-request`
- `POST /api/license/public/payment-submit`
- `POST /api/license/public/payment-proof-upload`
- `POST /api/license/public/stripe/checkout-session`
- `GET /api/license/public/stripe/checkout-session-status`
- `GET /api/license/public/ai-credit-order-status`
- `POST /api/license/public/download-track`
- `GET /api/license/access/success`

### B. Account Portal -> Backend contract

Frozen:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/sessions`
- `POST /api/auth/sessions/{device_code}/revoke`
- `POST /api/auth/sessions/revoke-others`
- `GET /api/license/account/licenses`
- `POST /api/license/account/licenses/devices/{device_code}/deactivate`
- `GET /api/ai/wallet`
- `GET /api/ai/credit-packs`
- `GET /api/ai/payments`
- `POST /api/ai/payments/checkout`

### C. POS Runtime -> Cloud contract

Frozen:
- `GET /cloud/v1/health`
- `GET /cloud/v1/meta/version-policy`
- `GET /cloud/v1/meta/contracts`
- `GET /cloud/v1/meta/ai-privacy-policy`
- `GET /cloud/v1/releases/latest`
- `GET /cloud/v1/releases/min-supported`
- `POST /cloud/v1/device/challenge`
- `POST /cloud/v1/device/activate`
- `POST /cloud/v1/device/deactivate`
- `GET /cloud/v1/license/status`
- `POST /cloud/v1/license/heartbeat`
- `GET /cloud/v1/license/feature-check`

Transitional legacy aliases are still supported (with deprecation headers):
- `POST /api/provision/challenge`
- `POST /api/provision/activate`
- `POST /api/provision/deactivate`
- `GET /api/license/status`
- `POST /api/license/heartbeat`

## Contract Invariants (Frozen)

1. Protected cloud writes require:
- `Idempotency-Key`
- `X-Device-Id`
- `X-POS-Version`

2. Idempotency replay behavior:
- Replay returns the original committed response.
- Replay response includes `X-Idempotency-Replayed: true`.

3. Minimum POS version behavior:
- Invalid version header: `400 POS_VERSION_INVALID`
- Below minimum supported: `426 POS_VERSION_UNSUPPORTED`

4. Legacy route deprecation behavior:
- `Deprecation`, `Sunset`, `Link`, `X-Legacy-Api-Route` headers emitted on covered legacy routes.

5. Role policy invariants:
- AI billing/usage endpoints are owner/manager only.
- Cashier access is denied (`403`) at API layer.

## Out of Freeze Scope

These are not blocking frontend kickoff and may still evolve:
- `/api/admin/licensing/*`
- `/api/admin/recovery/*`
- `/api/reports/support-*`
- internal webhook ingestion and reconciliation internals

## Verification Evidence

Command:
- `dotnet test backend/tests/SmartPos.Backend.IntegrationTests/SmartPos.Backend.IntegrationTests.csproj --filter "FullyQualifiedName~CloudV1LicensingEndpointsTests|FullyQualifiedName~CloudApiVersionCompatibilityMiddlewareTests|FullyQualifiedName~AuthSessionHardeningTests|FullyQualifiedName~AiInsightsCreditFlowTests|FullyQualifiedName~AiChatFlowTests|FullyQualifiedName~LicensingRoleMatrixPolicyTests"`

Result:
- Passed: `48`
- Failed: `0`
- Skipped: `0`

## Frontend Integration References

- `POS_CLOUD_LOCAL_SPLIT_FRONTEND_DEVELOPMENT_GUIDE_2026-04-08.md`
- `POS_CLOUD_LOCAL_SPLIT_CLOUD_API_IDEMPOTENCY_RETRY_CONTRACT.md`
- `CLOUD_V1_VERSION_COMPATIBILITY_POLICY_2026-04-08.md`
