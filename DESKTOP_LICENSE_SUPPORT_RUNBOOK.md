# Desktop License Support Runbook

Scope: customer-facing incidents for hosted account access and local device activation.

## A) Customer Cannot Access `My Account`

### Symptoms
- Login fails on `/[locale]/account`.
- Session appears to log out immediately.
- Account page loads but license portal section is blocked.

### Triage Checklist
1. Confirm username and role from backend auth (`/api/auth/me` via website proxy `/api/account/me`).
2. Verify role is `owner` or `manager`.
3. Confirm cookie/session settings in production:
- `TokenCookieEnabled=true`
- `TokenCookieSecure=true`
- `TokenCookieSameSite=Lax`
4. Check website proxy response status and backend response body for:
- `401` session expired
- `403` role/authorization blocked
5. Confirm backend and marketing site clocks are synchronized.

### Fix Actions
1. If role is `cashier`, instruct customer to sign in using owner/manager account.
2. If session expired, clear cookies and sign in again.
3. If auth cookie not set, verify domain and HTTPS setup.
4. If repeated login failures, reset owner password via admin workflow.

### Customer Message Template
"Please sign in using your owner or manager account on the My Account page. Cashier accounts cannot manage license keys or devices."

## B) Customer Cannot Activate on Local Device

### Symptoms
- Activation fails with key errors.
- Device shows seat limit exceeded.
- Activation succeeded before but now fails on replacement device.

### Triage Checklist
1. Validate key via `/api/license/access/success`.
2. Confirm entitlement status is active and not expired/revoked.
3. Check activations used vs max activations.
4. Check current active seats from `/api/license/account/licenses`.
5. Confirm device code uniqueness and local system time.

### Fix Actions
1. If seat limit reached, deactivate old device from account portal.
2. If deactivation daily limit reached, perform admin override and document reason.
3. If key expired/revoked, issue a new entitlement after billing verification.
4. If installer link expired, refresh account page and generate new signed link.

## C) Evidence to Capture Before Escalation

1. Shop code and username.
2. Device code and local timestamp.
3. Error code/message shown to customer.
4. Last successful activation timestamp (if any).
5. Relevant audit actions:
- `activation_entitlement_issued`
- `self_service_device_deactivate`
- `marketing_installer_download_tracked`

## D) Escalation Conditions

Escalate to engineering if:
- Multiple shops fail login/activation within 15 minutes.
- Rate limit errors persist for valid usage.
- Signed installer links fail with valid non-expired token.
