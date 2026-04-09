# Stripe Billing Incident Runbook

Scope: Stripe checkout + webhook incidents affecting license delivery.

## Incident Types

1. Delayed webhooks.
2. Failed invoice payment.
3. Canceled subscription.
4. Disputed payment/chargeback.

## 1) Delayed Webhooks

### Detection
- Checkout success returned by Stripe but account access not ready.
- Stripe status endpoint shows `checkout complete` and `payment_status=paid` but local invoice/subscription not updated.

### Actions
1. Check webhook endpoint health and signature failures.
2. Verify event stored in billing webhook table and retry counters.
3. Replay event from Stripe Dashboard if not received.
4. If event is in dead-letter state, inspect last error and reprocess after fix.

### Recovery Criteria
- Invoice status marked paid.
- Subscription status active.
- Account portal shows latest entitlement.

## 2) Failed Invoice

### Detection
- Stripe sends `invoice.payment_failed`.
- Subscription transitions to `past_due` or `unpaid`.

### Actions
1. Confirm customer payment method validity in Stripe.
2. Notify customer with payment update instructions.
3. Keep access policy aligned with grace-period rules.
4. If resolved, wait for `invoice.paid` and verify local update.

## 3) Canceled Subscription

### Detection
- `customer.subscription.deleted` or explicit cancellation.

### Actions
1. Verify cancellation reason (customer requested vs delinquency).
2. Confirm local subscription status transition.
3. Apply license policy (no new activations after cancellation unless grace/override).
4. Document exception approvals for temporary restorations.

## 4) Disputed Payment

### Detection
- Charge dispute/chargeback in Stripe.

### Actions
1. Flag account for risk review.
2. Suspend new activations pending resolution.
3. Preserve evidence: invoice, payment, activation/device audit logs.
4. Coordinate with finance and support for customer communication.

## Secrets Rotation and Environment Hygiene

1. Keep `STRIPE_SECRET_KEY` and webhook signing secret in env vars only.
2. Never expose secret key in website bundle; use server proxies only.
3. Rotate keys on schedule and immediately after incident suspicion.
4. Validate new secrets in staging before production cutover.

## Severity and Escalation

- SEV-1: multi-shop outage in checkout/webhook processing.
- SEV-2: single-shop inability to complete paid onboarding.
- SEV-3: delayed but recoverable event with no customer block.

Escalate to engineering on:
- Signature verification failures spike.
- Dead-letter queue growth.
- Repeated status mismatch between Stripe and local billing state.
