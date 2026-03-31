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
