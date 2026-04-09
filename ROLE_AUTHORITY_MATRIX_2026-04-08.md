# Role Authority Matrix (Cloud + Local POS)

Last updated: 2026-04-08

## Purpose

Define finalized role authority boundaries for W5 across cloud portal, licensing, AI wallet, and local POS runtime.

## Roles

- `owner`: shop/business account owner (portal + POS manager-level rights)
- `manager`: local operational manager (shared AI usage, no cloud billing admin rights)
- `cashier`: local checkout operator (no AI usage, no cloud wallet/license management)
- `support_admin`: operational support override role
- `billing_admin`: billing and wallet correction role
- `security_admin`: security override and fraud containment role
- `super_admin`: full administrative authority

## Authority Matrix

| Capability | owner | manager | cashier | support_admin | billing_admin | security_admin | super_admin |
|---|---|---|---|---|---|---|---|
| Local checkout/sales | allow | allow | allow | allow | allow | allow | allow |
| AI usage (`/api/ai/insights`, `/api/ai/chat/*`) | allow | allow | deny | allow | allow | allow | allow |
| AI wallet read (`/api/ai/wallet`) | allow | allow | deny | allow | allow | allow | allow |
| License portal read (`/api/license/account/licenses`) | allow | allow | deny | allow | allow | allow | allow |
| Manual AI wallet correction (`/api/admin/licensing/shops/{shop_code}/ai-wallet/correct`) | deny | deny | deny | allow | allow | deny | allow |
| Device fraud lock (`/api/admin/licensing/devices/{device_code}/fraud-lock`) | deny | deny | deny | allow | deny | allow | allow |
| Emergency device commands (`/api/admin/licensing/devices/{device_code}/emergency/*`) | deny | deny | deny | allow | deny | allow | allow |

## Policy Mapping

- `manager_or_owner`
  - effective roles: `owner`, `manager`, and admin scopes
  - cashier excluded
- `support_or_billing`
  - effective scopes: `super_admin`, `support`, `billing_admin`
  - `security_admin` excluded
- `support_or_security`
  - effective scopes: `super_admin`, `support`, `security_admin`
  - `billing_admin` excluded

## Test Evidence

- `backend/tests/SmartPos.Backend.IntegrationTests/AiInsightsCreditFlowTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AiChatFlowTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/LicensingRoleMatrixPolicyTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/SupportAlertCatalogEndpointTests.cs`
