# License Manual QA Matrix (2026-04-02)

Environment date: 2026-04-02

## Scenarios

| Scenario | Steps | Expected Result |
|---|---|---|
| Fresh install + activation | New device -> `provision_activate` | Device status `active`, token issued |
| Paid activation (manual billing) | Create invoice -> record payment -> verify payment | Subscription `active`, entitlement issued |
| Expired billing -> enforcement | Move period end to past due / run reconciliation | state `grace` then `suspended` on protected routes |
| Stolen installer on unauthorized PC | Attempt protected APIs without activation | blocked with machine-readable licensing error |
| Seat transfer | Transfer active device seat to target shop | device shop changed, target seat limits enforced |
| High-risk grace extension | Extend grace with 10+ days | step-up approval required |
| Emergency lock device | issue + execute `lock_device` envelope | device revoked/locked immediately |
| Emergency token revoke | issue + execute `revoke_token` envelope | token sessions revoked |
| Emergency force reauth | issue + execute `force_reauth` envelope | token sessions revoked and re-auth required path triggered |
| Audit export | export CSV/JSON from admin audit view | downloadable artifacts generated |

## Automation Evidence

Validated with integration and frontend tests:
- `LicensingFlowTests` (admin controls, emergency envelopes, audit export, immutable chain)
- `LicensingManualBillingFlowTests` (cash/bank payment lifecycle + approval rules)
- `LicensingBillingStateReconciliationTests`
- frontend `vitest` + production build
