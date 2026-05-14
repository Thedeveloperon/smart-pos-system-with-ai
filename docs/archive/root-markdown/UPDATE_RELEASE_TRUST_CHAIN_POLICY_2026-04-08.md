# Update and Release Trust Chain Policy (W10)

Last updated: 2026-04-08

## Scope

This policy defines the minimum trust chain for POS desktop update delivery:
- release channel policy (`stable`, `beta`, `internal`)
- installer metadata trust requirements (download URL, checksum, signature hash)
- rollback guardrails
- build-time installer trust verification process

## Release Channel Policy

Configured channels:
- `stable`: production customer rollout
- `beta`: pre-production pilot rollout
- `internal`: internal QA/support rollout

Cloud APIs:
- `GET /cloud/v1/releases/latest?channel=<stable|beta|internal>`
- `GET /cloud/v1/releases/min-supported?channel=<stable|beta|internal>`

Defaults:
- `DefaultReleaseChannel = stable`
- `RequireInstallerChecksumInReleaseMetadata = true`
- `RequireInstallerSignatureInReleaseMetadata = true`
- `AllowRollbackToPreviousStable = true`

Unknown channel behavior:
- HTTP `404`
- error code: `RELEASE_CHANNEL_NOT_FOUND`

Incomplete trust metadata behavior:
- HTTP `503`
- error code: `RELEASE_TRUST_METADATA_INCOMPLETE`

## Release Metadata Trust Requirements

Per channel metadata includes:
- `latest_pos_version`
- `minimum_supported_pos_version`
- `installer_download_url`
- `installer_checksum_sha256`
- `installer_signature_sha256`
- `installer_signature_algorithm`
- optional `release_notes_url`
- optional `rollback_target_version`

Trust acceptance:
- installer URL must be present
- checksum hash must be present when checksum requirement enabled
- signature hash must be present when signature requirement enabled

## Rollback Policy

Policy controls:
- rollback target cannot exceed latest version
- rollback target should not be below `MinimumRollbackTargetVersion` when configured
- when rollback is allowed, channel metadata should publish `rollback_target_version`

## Build and Pipeline Verification

Script:
- `scripts/verify-installer-trust-chain.ps1`

Validations:
- SHA-256 checksum generation and optional equality check against expected hash
- Authenticode signature status validation (when required)
- optional signer thumbprint allowlist verification
- manifest generation for build evidence

Build integration:
- `scripts/build-installer.ps1` supports:
  - `-VerifyTrustChain`
  - `-RequireAuthenticodeSignature`
  - `-ExpectedInstallerSha256`
  - `-AllowedSignerThumbprints`
  - `-TrustManifestPath`
  - `-ReleaseChannel`
  - `-ReleaseNotesUrl`
  - optional `-SignTool` pass-through for Inno Setup signing

Inno Setup integration:
- `installer/SmartPOS.iss` enables `SignTool` and `SignedUninstaller` when `SignTool` define is provided.

## Evidence and Validation

Primary code references:
- `backend/Security/CloudApiCompatibilityOptions.cs`
- `backend/Features/Licensing/CloudV1Endpoints.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudApiVersionCompatibilityMiddlewareTests.cs`
- `scripts/verify-installer-trust-chain.ps1`
- `scripts/build-installer.ps1`
- `installer/SmartPOS.iss`
