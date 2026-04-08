# Cloud v1 Version Compatibility Policy

Last updated: 2026-04-08

## Scope

Applies to SmartPOS cloud write calls protected by idempotency and device headers:
- `/api/provision/*`
- `/api/license/heartbeat`
- `/cloud/v1/device/challenge`
- `/cloud/v1/device/activate`
- `/cloud/v1/device/deactivate`
- `/cloud/v1/license/heartbeat`
- `/api/security/challenge`
- `/api/ai/insights`
- `/api/ai/chat/sessions`

## Required Headers

- `Idempotency-Key`
- `X-Device-Id`
- `X-POS-Version`

## Enforcement Rules

1. If `CloudApi:EnforceMinimumSupportedPosVersion=true`, protected writes require `X-POS-Version` to be parseable as semantic version text.
2. If parse fails, API returns:
- `400`
- code: `POS_VERSION_INVALID`
3. If version is lower than `CloudApi:MinimumSupportedPosVersion`, API returns:
- `426`
- code: `POS_VERSION_UNSUPPORTED`
4. Non-protected routes are not blocked by this policy.

## Legacy Route Deprecation Window

Legacy licensing routes under `/api/provision/*`, `/api/license/status`, and `/api/license/heartbeat` remain available during migration, but now return deprecation metadata:
- `Deprecation` header
- `Sunset` header
- `Link` header with successor `/cloud/v1/*` route and migration guide URL

Configured default window:
- deprecation start: `2026-04-08T00:00:00Z`
- sunset target: `2026-07-08T00:00:00Z`

## Cloud v1 Metadata Endpoints

- `GET /cloud/v1/health`
- `GET /cloud/v1/meta/version-policy`
- `GET /cloud/v1/meta/contracts`
- `GET /cloud/v1/releases/latest?channel=<stable|beta|internal>`
- `GET /cloud/v1/releases/min-supported?channel=<stable|beta|internal>`
- `POST /cloud/v1/device/challenge`
- `POST /cloud/v1/device/activate`
- `POST /cloud/v1/device/deactivate`
- `GET /cloud/v1/license/status`
- `POST /cloud/v1/license/heartbeat`
- `GET /cloud/v1/license/feature-check`

Use these endpoints for POS client compatibility checks and integration diagnostics.

## Release Trust Chain Contract

Release channels:
- `stable`
- `beta`
- `internal`

Trust metadata required per channel:
- `installer_download_url`
- `installer_checksum_sha256` (when checksum enforcement is enabled)
- `installer_signature_sha256` (when signature enforcement is enabled)

Error contracts:
- unknown channel: `404 RELEASE_CHANNEL_NOT_FOUND`
- incomplete trust metadata: `503 RELEASE_TRUST_METADATA_INCOMPLETE`

Rollback contract:
- `rollback_target_version` must not be greater than `latest_pos_version`
- optional minimum rollback floor is controlled by `CloudApi:MinimumRollbackTargetVersion`

## Config Keys

Section: `CloudApi`
- `ApiVersion`
- `EnforceMinimumSupportedPosVersion`
- `MinimumSupportedPosVersion`
- `LatestPosVersion`
- `RequiredWriteHeaders`
