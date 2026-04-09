# Desktop License Architecture Decisions (2026-04-07)

Purpose: finalize architecture and product decisions for hosted account access plus local-first SmartPOS runtime.

## 1) Distribution Mode

Decision: Desktop installer is the primary production channel. PWA is optional and positioned as a secondary channel for evaluation, lightweight usage, and emergency access.

Reason:
- Desktop runtime gives stronger local storage durability and offline behavior for stores.
- PWA install support differs by platform/browser and has weaker background/offline guarantees on iOS.

## 2) Canonical Customer Journey

Decision: canonical path is:
1. Pricing plan selection on marketing site.
2. Stripe checkout and webhook confirmation.
3. Customer signs in to `/[locale]/account`.
4. Customer sees activation key and installer link.
5. Customer installs desktop app and activates first device.

Fallback path:
- Manual cash/bank flow remains available only when `Licensing:MarketingManualBillingFallbackEnabled=true`.

## 3) Session/Auth Model Between Marketing Site and Backend

Decision:
- Marketing website uses server-side proxy routes for auth + account APIs.
- Backend issues signed auth cookie (`smartpos_auth`) and licensing token cookie (`smartpos_license`) with `SameSite=Lax` and secure flag in production.
- CORS remains locked to trusted website origins.

Reason:
- Reduces direct browser exposure to backend host details.
- Preserves existing backend authorization and role checks.

## 4) Account Owner Identity Model

Decision:
- Use existing POS account credentials (username/password) and backend auth session.
- Owner/manager roles can access license portal; cashier role is blocked.
- MFA remains optional at login request layer.

Reason:
- Avoids parallel identity stores.
- Keeps entitlement management tied to operationally trusted roles.

## 5) Local Data Strategy

Decision:
- Production recommendation: desktop runtime with local database/files on store device.
- PWA channel stores local data in browser storage and is not the default production recommendation.
- Hosted services are used for licensing activation, heartbeats, billing/account visibility, and support workflows only.

## 6) Local Runtime Target

Decision:
- Daily POS operation must not depend on hosted POS URL.
- App continues operating locally with offline grace when licensing checks cannot be refreshed.

## 7) Installer Delivery Policy

Decision:
- Protected signed installer links are the default production policy.
- Account UI must display link expiry and checksum verification guidance.

## 8) Billing Fallback Policy

Decision:
- Stripe is primary gateway.
- Manual fallback is feature-flagged and disabled by default in production (`MarketingManualBillingFallbackEnabled=false`).
- Manual fallback can be enabled as controlled break-glass path during Stripe outage windows.

## 9) Open Decision Closures

Closed on 2026-04-07:
- Desktop shell mandatory for production recommendation: Yes.
- Authentication method for owners: existing POS credentials with optional MFA.
- Account route host: marketing website account page with backend proxy APIs.
- Installer delivery: protected signed links for production.
- Stripe outage handling: feature-flagged manual fallback + runbook.

## 10) Local Database Lifecycle

Decision:
- Local database is created on first successful app bootstrap.
- Schema migrations run on app startup before POS modules are unlocked.
- Backup and restore follow documented store-operations policy (daily backup with verified restore drill).

Operational rules:
- Store migration version in local metadata table.
- Block normal checkout if migration fails and present explicit recovery instructions.
- Keep backup format versioned and compatible with current migration chain.

## 11) Hosted Dependency Boundary

Decision:
- Day-to-day POS operations run against local runtime and local data only.
- Hosted endpoints are required for activation, periodic license heartbeat/renewal, billing/account views, and support controls.

## 12) Offline Grace and Reconnection

Decision:
- Local POS continues within configured offline grace when remote licensing checks are temporarily unavailable.
- On reconnect, app must reconcile license status and refresh tokens before extending grace.
- If grace expires and no reconnect occurred, block privileged operations per licensing policy.
