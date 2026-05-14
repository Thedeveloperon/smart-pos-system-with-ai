# Marketing Payment + License Support Runbook

Last updated: 2026-04-02

## Scope

Use this runbook for customer issues across:
- pricing click -> onboarding
- payment proof submission
- billing verification
- installer download
- license activation success page

## Required Inputs From Customer

- shop name
- contact email/phone
- invoice number (or payment ID)
- payment method (`cash` or `bank_deposit`)
- bank reference (if bank deposit)
- activation entitlement key (if issued)
- screenshot/error text from onboarding or success page

## Triage Steps

1. Confirm invoice and payment status in super-admin billing.
2. Confirm payment verification outcome (`pending_verification`, `verified`, `rejected`).
3. If verified, confirm activation entitlement exists and is active.
4. Confirm access success URL/key is valid.
5. Confirm installer download link validity and expiry.

## Failure Modes

### 1) Payment proof upload rejected

Symptoms:
- user sees proof upload error before payment submit

Checks:
- file extension is allowed (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`)
- file size <= configured limit (`Licensing:MarketingPaymentProofMaxFileBytes`)
- malware scanner did not reject file

Resolution:
- ask customer to re-upload as PNG/JPG/PDF
- if malware scan false positive, request alternate proof and raise security review

### 2) Payment submit blocked as duplicate

Symptoms:
- API returns duplicate/invalid payment status for same invoice

Checks:
- confirm an existing non-rejected submission already exists on that invoice
- check billing payments list and timestamp

Resolution:
- do not create another payment row
- proceed with verification/rejection on existing pending payment

### 3) Payment stuck in pending verification

Checks:
- verify required payment details are present
- verify invoice due amount vs submitted amount
- check billing team queue/load

Resolution:
- billing admin verifies or rejects with reason code and actor note
- if rejected, ask customer to re-submit with corrected reference/proof

### 4) Activation key not received

Checks:
- verify payment is `verified`
- verify entitlement issuance in licensing audit logs
- check access delivery email status (`sent`, `skipped`, `failed`)

Resolution:
- if email failed/skipped, share success URL manually from admin
- optionally re-verify email configuration (`AccessDelivery*` settings)

### 5) Installer link expired

Checks:
- success response `installer_download_expires_at`
- protected download token TTL config

Resolution:
- reload success page with valid activation key to obtain fresh link
- ensure entitlement remains active and not expired/revoked

## Audit Log Events To Check

- `marketing_payment_proof_uploaded`
- `manual_payment_recorded`
- `manual_payment_verified`
- `customer_access_delivery_dispatched`
- `marketing_installer_download_tracked`
- `installer_download_redirect_issued`

## Escalation Matrix

- Billing verification disputes: Billing Ops owner
- malware/proof rejection disputes: Security owner
- entitlement/key issuance defects: Engineering owner
- repeated drop-offs/conversion issues: Product owner

