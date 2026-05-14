# Account AI Credits Top-Up Manual QA Matrix

Last updated: 2026-04-07

## Roles

1. Owner: can load wallet/packs/history and create top-ups.
2. Manager: can load wallet/packs/history and create top-ups.
3. Cashier: blocked from account license + AI billing section.

## Card Flow

1. Select pack -> `Pay with Card` -> checkout redirect shown.
2. Return with pending reference -> status polling starts.
3. Webhook success -> status `succeeded` and wallet balance increases.
4. Failed payment -> status `failed` and retry actions visible.
5. Retry card action starts new checkout with idempotency.

## Manual Fallback Flow

1. Expand `Need Bank Transfer?` section.
2. `bank_deposit` without reference/slip -> client validation error.
3. `bank_deposit` with valid reference/slip -> `pending_verification`.
4. `cash` without reference -> client validation error.
5. `cash` with reference -> `pending_verification`.
6. Billing admin verify -> wallet and history move to `succeeded`.

## Security and Abuse Controls

1. Repeat checkout requests exceed rate limit -> 429.
2. Repeat payment status reads exceed rate limit -> 429.
3. Idempotency mismatch on same key -> rejected with anomaly record.
4. Failed webhook events produce security anomaly signals.

## Supportability Checks

1. Audit logs include `ai_payment_checkout_created`.
2. Audit logs include `ai_payment_manual_verified` when verified.
3. Audit logs include `ai_payment_failed` for failed webhook settlement.
4. External reference is visible in history and checkout status panel.

## Browsers

1. Chrome desktop latest.
2. Firefox desktop latest.
3. Safari desktop latest.
4. Mobile Chrome/Safari responsive verification for account page.
