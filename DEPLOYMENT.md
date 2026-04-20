# Lanka POS Deployment

## 1. Build portable client package (folder + zip)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-client.ps1
```

Output:
- `release/lanka-pos-win-x64/`
- `release/lanka-pos-win-x64.zip`

## 2. Build Windows installer (.exe) with Inno Setup

Prerequisites:
- Inno Setup 6 installed (contains `ISCC.exe`)
- Optional: set `ISCC_PATH` if `ISCC.exe` is in a custom location

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1 -AppVersion 1.0.0
```

Output:
- `release/installer/Lanka POS-Setup-1.0.0.exe`

## 3. Installer behavior

- Installs to: `%LOCALAPPDATA%\Lanka POS` (per-user, no admin required)
- Adds Start Menu shortcuts (`Start Lanka POS`, `Stop Lanka POS`)
- Optional desktop shortcut
- Optional post-install app launch

## 4. Client runtime settings

Inside install folder, create `client.env` (or edit from `client.env.example`) to set:
- Local name-based suggestions are enabled by default (no API key needed)
- `OPENAI_API_KEY=` only if you switch provider to OpenAI
- Or use your own vision/model endpoint:
  - `AiSuggestions__Provider=Custom`
  - `AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions`
  - `AiSuggestions__CustomSuggestionField=suggestion` (or your response field)
  - `AiSuggestions__RequestTimeoutMs=25000`
  - `CUSTOM_AI_API_KEY=` (if your endpoint needs auth)
- `ASPNETCORE_URLS=` if you want a different local port

## 5. Default seeded users

- `owner / owner123`
- `manager / manager123`
- `cashier / cashier123`

## 6. Custom AI endpoint contract

When `AiSuggestions__Provider=Custom`, backend sends `POST` JSON like:

```json
{
  "target": "name",
  "model": "gpt-5.4-mini",
  "system_prompt": "...",
  "user_prompt": "...",
  "context": {
    "name": "Brown Rice",
    "sku": "SKU-001",
    "barcode": "",
    "image_url": "",
    "category_name": "",
    "category_options": ["Groceries", "Beverages"],
    "unit_price": 190,
    "cost_price": 180
  }
}
```

Supported response shapes:
- `{ "suggestion": "..." }` (default)
- `{ "response": "..." }` or `{ "text": "..." }`
- OpenAI-style `{ "output_text": "..." }`

If your API uses a different field, set `AiSuggestions__CustomSuggestionField=<fieldName>`.

## 7. Built-in local vision service (no OpenAI required)

Repository includes `scripts/vision-service` for OCR + barcode + image-content based suggestions.

Run:

```bash
cd scripts/vision-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8091
```

Then run backend with:

```ini
AiSuggestions__Provider=Custom
AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions
AiSuggestions__CustomSuggestionField=suggestion
AiSuggestions__RequestTimeoutMs=25000
```

## 8. Offline-local licensing defaults (2026-04-09)

Backend now defaults to local-first licensing policy:

- `Licensing:Mode=LocalOffline`
- `Licensing:RequireActivationEntitlementKey=true`
- `Licensing:CloudLicensingEndpointsEnabled=false`
- `Licensing:CloudRelayEnabled=false` (must stay off when `Mode=LocalOffline`)

Effects:
- POS activation always requires an activation entitlement key.
- Cloud billing/licensing public surfaces (`/api/license/public/*`, webhooks, cloud v1 compatibility entry points) return `503` with `CLOUD_LICENSING_DISABLED`.
- License status and heartbeat continue to work locally against backend + local DB.

## 9. Operator batch key generation

Use the local script to generate the locked policy batch (`count=10`) and write secure CSV output:

```bash
./scripts/licensing/generate-offline-activation-codes.sh
```

Optional environment overrides:
- `SMARTPOS_BACKEND_URL` (default `http://127.0.0.1:5080`)
- `SMARTPOS_ADMIN_USERNAME`
- `SMARTPOS_ADMIN_PASSWORD`
- `SMARTPOS_ADMIN_MFA_CODE`
- `SMARTPOS_SHOP_CODE`
- `SMARTPOS_OUTPUT_DIR` (default `./secure/licensing`)

Security behavior:
- Script prints plaintext keys once to console.
- CSV is created with restrictive permissions (`umask 077`, `chmod 600`).

## 10. Support runbook pointers

- Primary support workflow: [docs/OFFLINE_LOCAL_LICENSING_SUPPORT_RUNBOOK.md](docs/OFFLINE_LOCAL_LICENSING_SUPPORT_RUNBOOK.md)
- Incident escalation for fraud/high-risk actions: `docs/archive/root-markdown/LICENSE_FRAUD_RESPONSE_RUNBOOK.md`

## 11. Rollback and hosted override path

If a hosted environment must temporarily re-enable cloud licensing flows:

1. Set:
   - `Licensing:Mode=CloudCompatible`
   - `Licensing:CloudLicensingEndpointsEnabled=true`
   - `Licensing:RequireActivationEntitlementKey=false` (optional, policy-driven)
2. If cloud relay is required, set:
   - `Licensing:CloudRelayEnabled=true`
3. Restart backend and verify:
   - `GET /cloud/v1/health` returns non-disabled status
   - `/api/license/public/payment-request` accepts requests
4. Keep this as time-boxed override; revert to offline defaults after incident window closes.

Local-offline rollback (to strict mode) is the inverse:
- `Mode=LocalOffline`
- `RequireActivationEntitlementKey=true`
- `CloudLicensingEndpointsEnabled=false`
- `CloudRelayEnabled=false`

CSV retention policy:
- Keep generated activation CSV files in restricted storage for maximum 90 days.
- Rotate to encrypted archive or securely delete after reconciliation window closes.
