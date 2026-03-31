# SmartPOS Custom Vision Service

This service provides **true image-content suggestions** for SmartPOS by analyzing uploaded images with:
- OCR (product text / brand text)
- barcode decode
- optional image-classification labels

It is designed for `AiSuggestions.Provider=Custom`.

## 1. Install prerequisites

### System packages
- Tesseract OCR
- ZBar (for barcode decode used by `pyzbar`)

Examples:
- macOS: `brew install tesseract zbar`
- Ubuntu: `sudo apt-get install -y tesseract-ocr libzbar0`

### Python packages

```bash
cd scripts/vision-service
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Notes:
- Python `3.9+` is supported.
- `numpy` is pinned with environment markers so Python 3.9 installs `2.0.2`, while newer Python installs `2.1.3`.

## 2. Run the service

```bash
cd scripts/vision-service
source .venv/bin/activate
python -m uvicorn app:app --host 127.0.0.1 --port 8091
```

Health check:

```bash
curl http://127.0.0.1:8091/health
```

## 3. Wire SmartPOS backend

Set these environment/config values for backend:

```ini
AiSuggestions__Provider=Custom
AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions
AiSuggestions__CustomSuggestionField=suggestion
AiSuggestions__RequestTimeoutMs=25000
```

## 4. Optional classifier

The service can additionally run image-classification labels if enabled.

```bash
export VISION_ENABLE_CLASSIFIER=true
export VISION_IMAGE_CLASSIFIER_MODEL=google/vit-base-patch16-224
```

This requires installing `transformers` (commented in `requirements.txt`) and may download model weights on first run.

## 5. Request contract

Backend calls:

```json
{
  "target": "name",
  "context": {
    "image_url": "data:image/jpeg;base64,...",
    "image_hint": "captured image",
    "category_options": ["Groceries", "Beverages", "Stationery"]
  }
}
```

Response:

```json
{
  "suggestion": "American Water 500ml",
  "model": "smartpos-vision-local-v1",
  "source": "custom-vision-local"
}
```
