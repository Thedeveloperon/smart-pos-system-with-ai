# Security Manual QA Evidence (2026-04-01)

Environment date: 2026-04-01

## 1) Fresh activation, heartbeat renewal, revoke/reactivate, offline recovery

Executed backend integration scenarios (NET 8 runtime):

```bash
DOTNET_ROOT=$HOME/.dotnet8 PATH=$DOTNET_ROOT:$PATH dotnet test backend/tests/SmartPos.Backend.IntegrationTests/SmartPos.Backend.IntegrationTests.csproj \
  --filter "FullyQualifiedName~LicensingFlowTests.Activation_Heartbeat_Deactivation_ShouldTransitionStates|FullyQualifiedName~LicensingFlowTests.AdminRevokeAndReactivate_ShouldRoundTripDeviceState|FullyQualifiedName~SyncEngineTests.SyncSaleEvent_WithOfflineGrant_ShouldEnforceCheckoutLimit"
```

Observed result: `Passed` (selected tests all green).

Coverage mapping:
- `Activation_Heartbeat_Deactivation_ShouldTransitionStates` => fresh activation + heartbeat renewal.
- `AdminRevokeAndReactivate_ShouldRoundTripDeviceState` => admin revoke/reactivate endpoint flow.
- `SyncSaleEvent_WithOfflineGrant_ShouldEnforceCheckoutLimit` => offline event sync with valid grant (sync path) and limit handling.

## 2) Tampered signature, challenge replay, token replay, clock rollback

Executed backend and frontend scenarios:

```bash
DOTNET_ROOT=$HOME/.dotnet8 PATH=$DOTNET_ROOT:$PATH dotnet test backend/tests/SmartPos.Backend.IntegrationTests/SmartPos.Backend.IntegrationTests.csproj \
  --filter "FullyQualifiedName~SensitiveActionDeviceProofTests.SensitiveMutation_WithValidProof_ShouldSucceed_AndReplayShouldFail|FullyQualifiedName~SensitiveActionDeviceProofTests.SensitiveMutation_WithTamperedProof_ShouldReturnInvalidDeviceProof|FullyQualifiedName~LicensingDeviceKeyBindingTests.Activation_WithReplayedChallenge_ShouldReturnChallengeConsumed|FullyQualifiedName~LicensingTokenReplayProtectionTests.Status_WithRotatedToken_ShouldAllowWithinOverlap_ThenRejectAfterWindow"

cd frontend && npm test -- src/components/licensing/licenseCache.test.ts
```

Observed result:
- Backend selected abuse/replay tests: `Passed`.
- Frontend clock rollback/drift tests: `6/6 passed`.

Coverage mapping:
- Tampered signature => `SensitiveMutation_WithTamperedProof_ShouldReturnInvalidDeviceProof`.
- Challenge replay => both API action challenge replay and activation challenge replay tests.
- Token replay => rotated token replay rejection test.
- Clock rollback/drift => license cache rollback/drift guard tests.

## 3) Browser validation (Chrome-oriented)

Executed licensing gate E2E on Chrome profiles:

```bash
cd frontend && npm run test:e2e:license
cd frontend && npx playwright test tests/e2e/license-gate.spec.js --project=mobile-chrome
```

Observed result:
- Desktop Chrome project: `5/5 passed`.
- Mobile Chrome profile: `5/5 passed`.

Note:
- Microsoft Edge channel was not available on this host during this run.
- Edge behavior is expected to align for this flow because it uses the same Chromium engine.

## 4) Re-validation after secret-hygiene hardening

Executed focused backend replay/tamper/licensing checks after env-var-first secret resolution updates:

```bash
DOTNET_ROOT=$HOME/.dotnet8 PATH=$DOTNET_ROOT:$PATH dotnet test backend/tests/SmartPos.Backend.IntegrationTests/SmartPos.Backend.IntegrationTests.csproj \
  --filter "FullyQualifiedName~LicensingFlowTests.AdminRevokeAndReactivate_ShouldRoundTripDeviceState|FullyQualifiedName~SensitiveActionDeviceProofTests.SensitiveMutation_WithValidProof_ShouldSucceed_AndReplayShouldFail|FullyQualifiedName~SensitiveActionDeviceProofTests.SensitiveMutation_WithTamperedProof_ShouldReturnInvalidDeviceProof|FullyQualifiedName~LicensingDeviceKeyBindingTests.Activation_WithReplayedChallenge_ShouldReturnChallengeConsumed|FullyQualifiedName~LicensingTokenReplayProtectionTests.Status_WithRotatedToken_ShouldAllowWithinOverlap_ThenRejectAfterWindow|FullyQualifiedName~LicensingFlowTests.Activation_Heartbeat_Deactivation_ShouldTransitionStates|FullyQualifiedName~LicensingFlowTests.BillingWebhook_WithInvalidSignature_ShouldRejectAndNotMutateState"
```

Observed result: `Passed` (`6/6` selected tests).

Executed focused frontend security cache + sync queue tests:

```bash
cd frontend && npm test -- src/components/licensing/licenseCache.test.ts src/lib/offlineSyncQueue.test.ts
```

Observed result: `Passed` (`9/9` tests).
