# Portal Security Hardening Runbook (W9)

Last updated: 2026-04-08

## Scope

This runbook defines the W9 portal-security baseline:
- login throttling and account lockout
- active session and device revocation
- suspicious login response workflow
- email change verification workflow

## Enforced Backend Controls

Auth controls (`AuthSecurity`):
- `EnableLoginLockout`: `true`
- `MaxFailedLoginAttempts`: `5`
- `FailedLoginAttemptWindowMinutes`: `15`
- `LockoutDurationMinutes`: `15`
- `FailureThrottleDelayMilliseconds`: `300` (test override: `10`)
- `EnforceSessionRevocation`: `true`

Session revocation model:
- each device session carries `auth_session_version` in JWT claims
- revocation increments `Device.AuthSessionVersion`
- middleware rejects tokens whose `auth_session_version` no longer matches device record
- revoked cookies are deleted server-side during rejection

## Suspicious Login Response Flow

Trigger sources:
- anomaly events (`auth_anomaly_impossible_travel`, `auth_anomaly_concurrent_devices`)
- repeated failed login attempts and lockout events
- manual support signal from owner

Operator flow:
1. Owner reviews active sessions from `GET /api/auth/sessions`.
2. Owner revokes suspicious device: `POST /api/auth/sessions/{device_code}/revoke`.
3. If broad compromise is suspected, owner revokes all other sessions: `POST /api/auth/sessions/revoke-others`.
4. Owner rotates password (follow-up product task for explicit password-reset UX).
5. Support reviews audit events: `auth_login_failed`, `auth_login_lockout_triggered`, `auth_session_revoked`, `auth_session_revoke_others`.

## Email Change Verification Flow (Portal Policy)

Current status:
- policy finalized for implementation
- explicit email-change endpoints and token UX are next-step tasks

Required verification sequence:
1. User submits `new_email` request from authenticated portal session.
2. System requires step-up confirmation (password re-entry + current session check).
3. Verification link or OTP is sent to current email.
4. Verification link or OTP is sent to new email.
5. Change is applied only after both verifications are complete and unexpired.
6. All other active sessions are revoked automatically.
7. Security audit event includes actor, previous email hash, new email hash, source fingerprint.

Support override policy:
- allowed only for support or security admin scope
- mandatory reason code and immutable audit log
- high-risk override must capture second approver

## Audit Event Catalog (W9 Additions)

- `auth_login_failed`
- `auth_login_failed_unknown_user`
- `auth_login_blocked_lockout`
- `auth_login_lockout_triggered`
- `auth_session_revoked`
- `auth_session_revoke_others`

## Validation Checklist

- lockout blocks valid credentials until lockout window expires
- revoked session token receives deterministic `401` with auth-session error code
- revoke-others keeps current device active and invalidates all peer sessions
- audit events are present for lockout and session revocation actions
