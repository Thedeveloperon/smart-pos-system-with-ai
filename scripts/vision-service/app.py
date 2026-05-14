from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import threading
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageFilter, ImageOps
from pydantic import BaseModel, Field

try:
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover
    pytesseract = None

try:
    from pyzbar.pyzbar import decode as zbar_decode  # type: ignore
except Exception:  # pragma: no cover
    zbar_decode = None

try:
    from transformers import pipeline  # type: ignore
except Exception:  # pragma: no cover
    pipeline = None


SERVICE_MODEL = os.getenv("VISION_SERVICE_MODEL", "smartpos-vision-local-v1")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("VISION_REQUEST_TIMEOUT_SECONDS", "15"))
MAX_IMAGE_BYTES = int(os.getenv("VISION_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
CACHE_TTL_SECONDS = int(os.getenv("VISION_CACHE_TTL_SECONDS", "300"))
CACHE_MAX_ITEMS = int(os.getenv("VISION_CACHE_MAX_ITEMS", "128"))
OCR_LANG = os.getenv("VISION_OCR_LANG", "eng")
OCR_CONFIG = os.getenv("VISION_OCR_CONFIG", "--oem 3 --psm 6")
OCR_MIN_WORD_CONFIDENCE = float(os.getenv("VISION_OCR_MIN_WORD_CONFIDENCE", "55"))
ENABLE_IMAGE_CLASSIFIER = os.getenv("VISION_ENABLE_CLASSIFIER", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
IMAGE_CLASSIFIER_MODEL = os.getenv(
    "VISION_IMAGE_CLASSIFIER_MODEL",
    "google/vit-base-patch16-224",
)

GENERIC_TOKENS = {
    "capture",
    "camera",
    "download",
    "file",
    "image",
    "img",
    "item",
    "new",
    "photo",
    "scan",
    "screenshot",
    "upload",
    "www",
    "http",
    "https",
    "com",
    "net",
    "org",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "heic",
    "heif",
    "bmp",
    "tif",
    "tiff",
    "avif",
    "jfif",
}

CATEGORY_KEYWORDS = {
    "beverage": {
        "water",
        "tea",
        "coffee",
        "juice",
        "cola",
        "soda",
        "drink",
        "milk",
        "pepsi",
        "coke",
        "cocacola",
        "sprite",
        "fanta",
        "sevenup",
        "7up",
    },
    "grocery": {"rice", "flour", "sugar", "salt", "dhal", "lentil", "grain", "food", "noodle"},
    "snack": {"chips", "biscuit", "cookie", "chocolate", "candy"},
    "personal": {"soap", "shampoo", "toothpaste", "lotion", "cream", "hygiene"},
    "household": {"detergent", "bleach", "cleaner", "dishwash", "tissue"},
    "stationery": {"book", "pen", "pencil", "notebook", "paper"},
}

STOPWORDS = {
    "and",
    "for",
    "from",
    "the",
    "with",
    "lanka",
    "made",
    "product",
    "retail",
    "shop",
}

KNOWN_BRAND_ALIASES = {
    "pepsi": "Pepsi",
    "cocacola": "Coca Cola",
    "coke": "Coca Cola",
    "sprite": "Sprite",
    "fanta": "Fanta",
    "sevenup": "7UP",
    "7up": "7UP",
    "mirinda": "Mirinda",
    "mountaindew": "Mountain Dew",
    "redbull": "Red Bull",
    "nestle": "Nestle",
    "elephanthouse": "Elephant House",
    "munchee": "Munchee",
    "maliban": "Maliban",
}


class ContextPayload(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    image_hint: Optional[str] = None
    category_name: Optional[str] = None
    category_options: list[str] = Field(default_factory=list)
    unit_price: Optional[float] = None
    cost_price: Optional[float] = None


class SuggestionPayload(BaseModel):
    target: str = "name"
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None
    context: ContextPayload = Field(default_factory=ContextPayload)


class SuggestionResponse(BaseModel):
    suggestion: str
    model: str
    source: str
    confidence: Optional[float] = None


@dataclass
class AnalysisResult:
    name: str
    sku: str
    barcode: str
    category: str
    ocr_text: str
    ocr_tokens: list[str]
    labels: list[str]
    confidence: float


_cache_lock = threading.Lock()
_analysis_cache: dict[str, tuple[float, AnalysisResult]] = {}
_classifier_lock = threading.Lock()
_classifier = None
_classifier_error = None

app = FastAPI(title="SmartPOS Vision Service", version="1.0.0")


def collapse_spaces(value: str) -> str:
    return " ".join((value or "").split()).strip()


def tokenize(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (value or "").lower())
    result: list[str] = []
    for token in tokens:
        if len(token) <= 1:
            continue
        if token in STOPWORDS or token in GENERIC_TOKENS:
            continue
        if token.isdigit():
            continue
        if re.fullmatch(r"(pic|img|dsc|pxl|photo)\d+", token):
            continue
        if re.fullmatch(r"\d+x\d+(q\d+)?", token):
            continue
        if re.fullmatch(r"[a-f0-9]{12,}", token):
            continue
        digit_count = sum(ch.isdigit() for ch in token)
        letter_count = sum(ch.isalpha() for ch in token)
        if len(token) >= 12 and digit_count >= 4 and letter_count >= 4:
            continue
        result.append(token)
    return result


def to_title_case(value: str) -> str:
    parts = [part for part in collapse_spaces(value).split(" ") if part]
    return " ".join(part[:1].upper() + part[1:].lower() for part in parts)


def normalize_compact_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def is_plausible_name_token(token: str) -> bool:
    if not token:
        return False
    if token in KNOWN_BRAND_ALIASES:
        return True
    if len(token) < 3 or len(token) > 18:
        return False
    if token.isdigit():
        return False
    if re.fullmatch(r"\d+x\d+(q\d+)?", token):
        return False
    if token in STOPWORDS or token in GENERIC_TOKENS:
        return False

    alpha_count = sum(ch.isalpha() for ch in token)
    digit_count = sum(ch.isdigit() for ch in token)
    if alpha_count < 2:
        return False
    if digit_count > 0 and alpha_count < digit_count:
        return False

    vowels = sum(ch in "aeiou" for ch in token)
    vowel_ratio = vowels / max(alpha_count, 1)
    if vowel_ratio < 0.18:
        return False

    return True


def extract_size_text(source: str) -> str:
    if not source:
        return ""
    match = re.search(r"\b(\d{2,4})\s?(ml|l|g|kg)\b", source, flags=re.IGNORECASE)
    if not match:
        return ""
    value = match.group(1)
    unit = match.group(2).lower()
    return f"{value}{unit.upper() if unit == 'l' else unit}"


def sanitize_hint(value: str) -> str:
    tokens = tokenize(value)
    alpha_tokens = [token for token in tokens if any(ch.isalpha() for ch in token)]
    if not alpha_tokens:
        return ""
    if len(alpha_tokens) == 1 and alpha_tokens[0] in GENERIC_TOKENS:
        return ""
    return to_title_case(" ".join(alpha_tokens[:4]))


def build_ean13(seed_digits: str) -> str:
    digits = re.sub(r"\D", "", seed_digits or "")
    first_twelve = digits[:12].rjust(12, "0")
    checksum = 0
    for idx, char in enumerate(first_twelve):
        digit = int(char)
        checksum += digit if idx % 2 == 0 else digit * 3
    check_digit = (10 - (checksum % 10)) % 10
    return f"{first_twelve}{check_digit}"


def build_sku(name: str) -> str:
    tokens = [token.upper()[:8] for token in tokenize(name) if any(ch.isalpha() for ch in token)]
    if not tokens:
        return "ITEM-001"
    return "-".join(tokens[:3])[:24].rstrip("-")


def build_barcode(name: str, decoded_barcode: str) -> str:
    decoded_digits = re.sub(r"\D", "", decoded_barcode or "")
    if len(decoded_digits) == 13:
        return decoded_digits
    if len(decoded_digits) >= 8:
        return build_ean13(decoded_digits)

    normalized = re.sub(r"[^A-Z0-9]", "", (name or "").upper()) or "NEWITEM"
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    seed_digits = "".join(str(int(ch, 16) % 10) for ch in digest[:12])
    return build_ean13(seed_digits)


def parse_data_url(url: str) -> bytes:
    if "," not in url:
        raise ValueError("Invalid data URL.")
    _, encoded = url.split(",", 1)
    return base64.b64decode(encoded)


def read_image_bytes(image_url: str) -> bytes:
    raw = (image_url or "").strip()
    if not raw:
        raise ValueError("Image URL is required.")

    if raw.startswith("data:"):
        image_bytes = parse_data_url(raw)
    elif raw.startswith("http://") or raw.startswith("https://"):
        response = requests.get(raw, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        image_bytes = response.content
    else:
        raise ValueError("Unsupported image URL. Use data URL or http/https URL.")

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("Image is too large for analysis.")

    return image_bytes


def load_pil_image(image_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def run_ocr(image: Image.Image) -> str:
    if pytesseract is None:
        return ""

    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.MedianFilter(size=3))
    ocr_configs = [OCR_CONFIG, "--oem 3 --psm 11"]
    angles = [0, 90, 270]

    best_text = ""
    best_score = -1.0
    for config in ocr_configs:
        for angle in angles:
            candidate = gray if angle == 0 else gray.rotate(angle, expand=True)
            try:
                text = collapse_spaces(pytesseract.image_to_string(candidate, lang=OCR_LANG, config=config))
            except Exception:
                continue

            if not text:
                continue

            alpha_count = sum(ch.isalpha() for ch in text)
            digit_count = sum(ch.isdigit() for ch in text)
            token_count = len(tokenize(text))
            score = token_count * 5 + alpha_count * 0.2 - digit_count * 0.1

            if score > best_score:
                best_score = score
                best_text = text

    return best_text


def run_ocr_tokens(image: Image.Image) -> dict[str, float]:
    if pytesseract is None:
        return {}

    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.MedianFilter(size=3))
    ocr_configs = [OCR_CONFIG, "--oem 3 --psm 11", "--oem 3 --psm 7"]
    angles = [0, 90, 270]

    token_scores: dict[str, float] = defaultdict(float)
    for config in ocr_configs:
        for angle in angles:
            candidate = gray if angle == 0 else gray.rotate(angle, expand=True)
            try:
                data = pytesseract.image_to_data(
                    candidate,
                    lang=OCR_LANG,
                    config=config,
                    output_type=pytesseract.Output.DICT,
                )
            except Exception:
                continue

            texts = data.get("text", [])
            confidences = data.get("conf", [])
            for index, text in enumerate(texts):
                raw = collapse_spaces(str(text))
                if not raw:
                    continue

                try:
                    confidence = float(confidences[index])
                except Exception:
                    confidence = -1

                if confidence < OCR_MIN_WORD_CONFIDENCE:
                    continue

                token = normalize_compact_token(raw)
                if not is_plausible_name_token(token):
                    continue

                token_scores[token] += confidence

    return dict(token_scores)


def run_barcode_decode(image: Image.Image) -> str:
    if zbar_decode is None:
        return ""

    variants = [image, ImageOps.grayscale(image), ImageOps.grayscale(image).point(lambda p: 255 if p > 120 else 0)]
    for variant in variants:
        decoded_items = zbar_decode(np.array(variant))
        for item in decoded_items:
            raw = item.data.decode("utf-8", errors="ignore").strip()
            if raw:
                return raw
    return ""


def get_classifier():
    global _classifier
    global _classifier_error

    if not ENABLE_IMAGE_CLASSIFIER:
        return None
    if pipeline is None:
        return None

    with _classifier_lock:
        if _classifier is not None:
            return _classifier
        if _classifier_error is not None:
            return None

        try:
            _classifier = pipeline(
                "image-classification",
                model=IMAGE_CLASSIFIER_MODEL,
            )
        except Exception as error:  # pragma: no cover
            _classifier_error = str(error)
            _classifier = None

    return _classifier


def classify_image(image: Image.Image) -> list[str]:
    classifier = get_classifier()
    if classifier is None:
        return []

    try:
        predictions = classifier(image)
    except Exception:
        return []

    labels: list[str] = []
    for item in predictions[:5]:
        label = collapse_spaces(str(item.get("label", "")))
        if label:
            labels.append(label)
    return labels


def choose_name(
    ocr_text: str,
    ocr_token_scores: dict[str, float],
    image_hint: str,
    labels: list[str],
) -> tuple[str, float]:
    sorted_tokens = [
        token
        for token, _ in sorted(
            ocr_token_scores.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ]

    all_tokens = [normalize_compact_token(token) for token in sorted_tokens]
    all_tokens.extend(tokenize(ocr_text))
    token_set = {token for token in all_tokens if token}

    brand_hits = [KNOWN_BRAND_ALIASES[token] for token in token_set if token in KNOWN_BRAND_ALIASES]
    if brand_hits:
        brand_name = brand_hits[0]
        size_text = extract_size_text(ocr_text)
        if not size_text:
            size_text = extract_size_text(image_hint)
        if size_text:
            return f"{brand_name} {size_text}", 0.86
        return brand_name, 0.82

    strong_tokens = [
        token
        for token, score in sorted(
            ocr_token_scores.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if is_plausible_name_token(token) and score >= 140
    ]
    plausible_tokens = strong_tokens[:3]
    if plausible_tokens:
        title_tokens = [to_title_case(token) for token in plausible_tokens[:3]]
        if title_tokens:
            return " ".join(title_tokens), 0.62

    lines = [collapse_spaces(line) for line in re.split(r"[\r\n]+", ocr_text) if collapse_spaces(line)]
    best_line = ""
    best_score = 0.0

    for line in lines:
        alpha_count = sum(ch.isalpha() for ch in line)
        digit_count = sum(ch.isdigit() for ch in line)
        if alpha_count < 3:
            continue
        if len(line) > 64:
            continue

        line_tokens = [normalize_compact_token(token) for token in re.findall(r"[A-Za-z0-9]+", line)]
        valid_line_tokens = [token for token in line_tokens if is_plausible_name_token(token)]
        if not valid_line_tokens:
            continue

        score = alpha_count * 0.3 + min(8, len(line.split()))
        if digit_count > alpha_count:
            score -= 4
        if "www" in line.lower():
            score -= 4
        if len(valid_line_tokens) == 1:
            score -= 1.5
        if score > best_score:
            best_score = score
            best_line = " ".join(valid_line_tokens[:4])

    if best_line:
        return to_title_case(best_line), min(0.95, 0.55 + best_score / 30.0)

    hint_name = sanitize_hint(image_hint)
    if hint_name:
        return hint_name, 0.45

    label_tokens = tokenize(" ".join(labels))
    if label_tokens:
        return to_title_case(" ".join(label_tokens[:3])), 0.35

    return "New Item", 0.2


def choose_category(
    category_options: list[str],
    name: str,
    ocr_text: str,
    image_hint: str,
    labels: list[str],
) -> tuple[str, float]:
    if not category_options:
        return "", 0.0

    evidence_tokens = tokenize(" ".join([name, ocr_text, image_hint, " ".join(labels)]))
    if not evidence_tokens:
        return "", 0.0
    token_set = set(evidence_tokens)
    best_option = ""
    best_score = -1

    for option in category_options:
        clean_option = collapse_spaces(option)
        if not clean_option:
            continue

        option_tokens = tokenize(clean_option)
        score = 0

        for token in option_tokens:
            if token in token_set:
                score += 6

        option_lower = clean_option.lower()
        for group_token, keywords in CATEGORY_KEYWORDS.items():
            if group_token in option_lower:
                score += sum(3 for keyword in keywords if keyword in token_set)

        if clean_option.lower() in (name or "").lower():
            score += 8

        if score > best_score:
            best_score = score
            best_option = clean_option

    if not best_option:
        return "", 0.0

    if best_score < 4:
        return "", 0.0

    confidence = min(0.95, 0.45 + best_score / 30.0)
    return best_option, confidence


def cache_key(image_url: str, image_hint: str, category_options: list[str]) -> str:
    source = f"{image_url}|{image_hint}|{'|'.join(category_options)}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def get_cached_result(key: str) -> Optional[AnalysisResult]:
    now = time.time()
    with _cache_lock:
        cached = _analysis_cache.get(key)
        if not cached:
            return None
        expires_at, result = cached
        if expires_at < now:
            _analysis_cache.pop(key, None)
            return None
        return result


def put_cached_result(key: str, result: AnalysisResult) -> None:
    now = time.time()
    with _cache_lock:
        if len(_analysis_cache) >= CACHE_MAX_ITEMS:
            oldest = min(_analysis_cache.items(), key=lambda item: item[1][0])[0]
            _analysis_cache.pop(oldest, None)
        _analysis_cache[key] = (now + CACHE_TTL_SECONDS, result)


def analyze_payload(payload: SuggestionPayload) -> AnalysisResult:
    image_url = (payload.context.image_url or "").strip()
    image_hint = (payload.context.image_hint or "").strip()
    category_options = payload.context.category_options or []
    key = cache_key(image_url, image_hint, category_options)
    cached = get_cached_result(key)
    if cached is not None:
        return cached

    ocr_text = ""
    ocr_token_scores: dict[str, float] = {}
    labels: list[str] = []
    decoded_barcode = ""

    if image_url:
        try:
            image_bytes = read_image_bytes(image_url)
            image = load_pil_image(image_bytes)
            ocr_text = run_ocr(image)
            ocr_token_scores = run_ocr_tokens(image)
            decoded_barcode = run_barcode_decode(image)
            labels = classify_image(image)
        except Exception:
            # Fallback to hint-based analysis.
            pass

    name, name_confidence = choose_name(
        ocr_text=ocr_text,
        ocr_token_scores=ocr_token_scores,
        image_hint=image_hint,
        labels=labels,
    )
    category, category_confidence = choose_category(
        category_options=category_options,
        name=name,
        ocr_text=ocr_text,
        image_hint=image_hint,
        labels=labels,
    )
    sku = build_sku(name)
    barcode = build_barcode(name, decoded_barcode)
    confidence = max(name_confidence, category_confidence)

    result = AnalysisResult(
        name=name,
        sku=sku,
        barcode=barcode,
        category=category,
        ocr_text=ocr_text,
        ocr_tokens=[
            token
            for token, _ in sorted(
                ocr_token_scores.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:8]
        ],
        labels=labels,
        confidence=round(confidence, 3),
    )
    put_cached_result(key, result)
    return result


def suggestion_for_target(payload: SuggestionPayload, analysis: AnalysisResult) -> str:
    target = (payload.target or "").strip().lower()
    if target == "name":
        return analysis.name
    if target == "sku":
        return analysis.sku
    if target == "barcode":
        return analysis.barcode
    if target == "category":
        return analysis.category
    if target == "image_url":
        return (payload.context.image_url or "").strip()
    if target == "product_from_image":
        return analysis.name
    return analysis.name


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/suggestions")
def create_suggestion(payload: SuggestionPayload) -> dict[str, object]:
    analysis = analyze_payload(payload)
    suggestion = suggestion_for_target(payload, analysis)

    target = (payload.target or "").strip().lower()
    if target == "product_from_image":
        return {
            "model": SERVICE_MODEL,
            "source": "custom-vision-local",
            "name": analysis.name,
            "sku": analysis.sku,
            "barcode": analysis.barcode,
            "category": analysis.category,
            "suggestion": analysis.name,
        }

    if not suggestion:
        raise HTTPException(status_code=400, detail="Could not generate suggestion from image.")

    response = SuggestionResponse(
        suggestion=suggestion,
        model=SERVICE_MODEL,
        source="custom-vision-local",
        confidence=analysis.confidence,
    )
    return response.model_dump()
