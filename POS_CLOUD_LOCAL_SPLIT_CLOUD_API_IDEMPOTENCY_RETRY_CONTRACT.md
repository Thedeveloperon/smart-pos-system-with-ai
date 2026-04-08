# POS Cloud API Idempotency and Retry Contract

Last updated: 2026-04-08
Owner: API lead

## 1. Required Headers

All cloud write APIs must include:
- `Idempotency-Key`
- `X-Device-Id`
- `X-POS-Version`

Validation defaults:
- `Idempotency-Key` max length 128
- accepted character set: alphanumeric + `_` + `-` + `.`
- idempotency retention window: 72 hours

## 2. Endpoint Matrix

Write endpoints under `/cloud/v1/*`:

1. `POST /cloud/v1/auth/signup`
- idempotency scope: owner-email + tenant seed payload
- duplicate behavior: return original owner-account result

2. `POST /cloud/v1/devices/activate`
- idempotency scope: tenant + branch + device id + activation payload
- duplicate behavior: return existing registration and do not consume additional seat

3. `POST /cloud/v1/devices/heartbeat`
- idempotency scope: device + heartbeat window bucket
- duplicate behavior: update last-seen once per accepted bucket

4. `POST /cloud/v1/devices/token/refresh`
- idempotency scope: device + prior token jti
- duplicate behavior: return same replacement token metadata; do not issue multiple active refresh chains

5. `POST /cloud/v1/devices/{id}/deactivate`
- idempotency scope: tenant + device id + action reason
- duplicate behavior: return deactivated state without side effects

6. `POST /cloud/v1/license/validate`
- idempotency scope: request hash + policy version
- duplicate behavior: return same validation decision

7. `POST /cloud/v1/features/check`
- idempotency scope: device + feature + policy version
- duplicate behavior: return same allow or deny result

8. `POST /cloud/v1/ai/authorize`
- idempotency scope: tenant + feature + local request id
- duplicate behavior: return same authorization reference; do not reserve twice

9. `POST /cloud/v1/ai/settle`
- idempotency scope: authorization reference + final usage hash
- duplicate behavior: return same settlement and do not double charge

10. `POST /cloud/v1/ai/refund`
- idempotency scope: authorization reference + refund reason
- duplicate behavior: return same refund and do not double refund

11. `POST /cloud/v1/account/ai-topups/checkout`
- idempotency scope: tenant + pack + checkout request
- duplicate behavior: return original checkout session reference

## 3. Duplicate Response Rules

For replayed idempotency key:
- status code remains same as original successful write
- response body is deterministic and identical except server trace metadata
- no secondary audit entries that imply additional side effects

For conflicting payload with same key:
- return `409` with deterministic error code `IDEMPOTENCY_CONFLICT`
- include original request hash and first-seen timestamp

## 4. Retry Policy (POS Client)

Retry strategy for transient failures:
- attempts: 5 maximum
- backoff: 1s, 3s, 9s, 27s, 60s
- jitter: +/- 20 percent

Retriable conditions:
- network timeout
- `429`
- `502`, `503`, `504`

Do not retry:
- `400`, `401`, `403`, `404`, `409` idempotency conflict

## 5. Reconciliation Jobs

Required jobs:
- orphan authorization closure:
  - locate AI authorizations without settle or refund after SLA window
  - mark as expired or auto-refund based on policy
- duplicate event compaction:
  - consolidate duplicate provider callbacks against idempotency keys

SLA defaults:
- authorization-to-settle SLA: 30 minutes
- reconciliation execution cadence: every 5 minutes

## 6. Test Cases

1. Replayed activation does not consume extra seat.
2. Replayed AI authorize does not reserve credits twice.
3. Replayed AI settle does not double charge.
4. Replayed AI refund does not double refund.
5. Same key with different payload returns `409 IDEMPOTENCY_CONFLICT`.
6. Retry on transient 5xx eventually returns single committed outcome.

