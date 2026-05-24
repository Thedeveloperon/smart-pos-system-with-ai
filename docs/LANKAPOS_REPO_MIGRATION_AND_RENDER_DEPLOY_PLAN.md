# LankaPOS Repository Migration and Render Deployment Plan

## Summary
This runbook defines how to migrate the current codebase into a new private repository named `LankaPOS` and deploy it to a different Render account with these fixed constraints:

- No access to the old Render account
- No Stripe/webhook/licensing integration keys available at first deployment
- Full DNS control is available
- Fresh empty Postgres database on new Render account
- Immediate cutover after validation

## Implementation Status (Repo Side)
- `render.yaml` is aligned to restricted first deployment defaults.
- Manual account-side steps are listed in:
  - `docs/LANKAPOS_RENDER_MANUAL_EXECUTION_CHECKLIST.md`

## Locked Decisions and Assumptions
- Repository strategy: Fresh repository (new history), `main` snapshot only
- Repository visibility/location: Personal GitHub account, private
- Render deployment method: Blueprint import from `render.yaml`
- Service scope: Deploy all services in `render.yaml`
- Database baseline: Fresh empty database
- Secret source: Recover from local configuration/docs and regenerate missing keys
- Integration mode at go-live: Restricted mode (no live Stripe/webhook/licensing side effects)
- URL strategy: Validate Render `onrender.com` URLs first, then switch DNS immediately

## Repository Migration Procedure
1. Confirm source repository `main` is up to date and stable.
2. Create a new private repository named `LankaPOS` in your personal GitHub account.
3. Copy the current `main` snapshot into the new repo (single fresh commit history).
4. Push `main` to `LankaPOS`.
5. Recreate baseline branch settings (default branch, branch protection, collaborator access).

## Render Deployment Procedure (New Account)
1. In the new Render account, create a Blueprint deployment from `LankaPOS`.
2. Ensure all services from `render.yaml` are provisioned:
   - `smartpos-backend`
   - `smartpos-pos-frontend`
   - `smartpos-marketing-website`
   - `smartpos-postgres`
3. Ensure backend and Render Postgres are in the same region/workspace.
4. Confirm service creation and first build status before any traffic switch.

## Secrets Strategy (No Old Render Access)
Do not depend on secret export from the old account. Use local docs/config and rotation.

### Secret Recovery Approach
1. Collect available values from local secure notes, `.env` references, and deployment documentation.
2. For any missing or uncertain secret, generate/rotate a new value.
3. Add all required values directly in the new Render service settings.

### Mandatory Backend Secrets to Set or Regenerate
- `SMARTPOS_JWT_SECRET`
- `SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM`
- `SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY`
- `Licensing__VerificationPublicKeyPem`
- `Licensing__AccessSuccessPageBaseUrl`

### Required Non-secret Runtime Config
- `Database__Provider=Postgres`
- `ConnectionStrings__Postgres` from the new Render database binding
- `ASPNETCORE_ENVIRONMENT=Production`
- Portal URL bindings:
  - `SMARTPOS_BACKEND_API_URL`
  - `NEXT_PUBLIC_SITE_URL`
- POS upstream binding from backend Render URL (`BACKEND_UPSTREAM`)

## Integration Strategy (Restricted First Deployment)
Live external integrations are intentionally restricted for first deployment.

### Disabled/Sandboxed at First Go-Live
- Stripe live payment processing
- Production webhook side effects
- Live cloud licensing/payment side effects requiring unavailable keys

### Enablement Criteria for Later Activation
Enable each integration only after both conditions are met:
1. Required key/secret is available and verified in Render env
2. Endpoint verification passes in staging-safe checks

Per integration:
- Stripe: live keys configured + successful checkout callback and status validation
- Webhooks: endpoint secret configured + signed webhook replay test passes
- Licensing cloud flows: signing/encryption/verification keys validated + licensing health and success flow tested

## Cutover and Rollback
## Cutover (Immediate After Validation)
1. Validate all new services on Render default URLs.
2. Confirm health and smoke tests pass (see checklist below).
3. Switch DNS/custom domains to new Render services immediately.
4. Re-run smoke tests on final domain URLs.

## Rollback (Without Old Render Access)
Since old Render is inaccessible, rollback uses DNS and local-runtime fallback:
1. Revert DNS changes to the previous known-working endpoint (if retained) or temporary maintenance target.
2. Keep local installer/runtime fallback available for critical store operations.
3. Disable unstable integration toggles in new Render until issue resolution.
4. Re-validate backend and POS health before retrying cutover.

## Validation Checklist
## Pre-cutover Validation (Render URLs)
- Backend health endpoint returns 200 (`/health`)
- POS health endpoint returns 200 (`/health`)
- POS landing page loads
- Inventory Manager route loads at `/inventory-manager/`
- Cloud portal home and admin login load
- Authentication flow works for at least one admin user
- Restricted-mode validation:
  - No live Stripe checkout execution
  - No live webhook-triggered side effects
  - No unintended live licensing cloud side effects

## Post-cutover Validation (Custom Domains)
- Backend health stable over repeated checks
- POS app loads and basic sale flow works
- Inventory Manager overview and tab navigation work
- Cloud portal basic admin and account pages load
- No critical errors in Render logs during first monitoring window

## Acceptance Criteria
- New private `LankaPOS` repository exists and contains current `main` snapshot
- New Render account has all blueprint services healthy
- Fresh Postgres DB is connected and backend starts successfully
- Secrets are sourced from local docs/env or regenerated (no old Render dependency)
- First deployment runs in restricted integration mode without live side effects
- DNS cutover completes and core health/smoke checks pass on final domains
- Rollback procedure is documented and executable without old Render account access
