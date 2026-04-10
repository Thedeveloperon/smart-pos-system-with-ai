#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${SMARTPOS_BACKEND_URL:-http://127.0.0.1:5102}"
ADMIN_USERNAME="${SMARTPOS_ADMIN_USERNAME:-support_admin}"
ADMIN_PASSWORD="${SMARTPOS_ADMIN_PASSWORD:-support123}"
ADMIN_MFA_CODE="${SMARTPOS_ADMIN_MFA_CODE:-}"
ADMIN_MFA_SECRET="${SMARTPOS_ADMIN_MFA_SECRET:-support-admin-mfa-secret-2026}"
MFA_STEP_SECONDS="${SMARTPOS_MFA_STEP_SECONDS:-30}"
DEVICE_CODE="${SMARTPOS_DEVICE_CODE:-offline-licensing-cli}"
DEVICE_NAME="${SMARTPOS_DEVICE_NAME:-Offline Licensing CLI}"
SHOP_CODE="${SMARTPOS_SHOP_CODE:-default}"
COUNT="${SMARTPOS_BATCH_COUNT:-10}"
MAX_ACTIVATIONS="${SMARTPOS_MAX_ACTIVATIONS:-1000000}"
TTL_DAYS="${SMARTPOS_TTL_DAYS:-3650}"
ALLOW_IF_EXISTING_BATCH="${SMARTPOS_ALLOW_EXISTING_BATCH:-false}"
OUTPUT_DIR="${SMARTPOS_OUTPUT_DIR:-./secure/licensing}"
ACTOR="${SMARTPOS_BATCH_ACTOR:-offline-licensing-operator}"
REASON_CODE="${SMARTPOS_BATCH_REASON_CODE:-offline_activation_batch_generated}"
ACTOR_NOTE="${SMARTPOS_BATCH_ACTOR_NOTE:-manual offline activation key batch generation}"

if [[ "$COUNT" != "10" ]]; then
  echo "SMARTPOS_BATCH_COUNT must be exactly 10. Current value: $COUNT" >&2
  exit 1
fi

for command in curl jq mktemp; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command '$command' is not installed." >&2
    exit 1
  fi
done

if [[ -z "${ADMIN_MFA_CODE}" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "SMARTPOS_ADMIN_MFA_CODE is required when python3 is unavailable." >&2
    exit 1
  fi

  ADMIN_MFA_CODE="$(
    python3 - "$ADMIN_MFA_SECRET" "$MFA_STEP_SECONDS" <<'PY'
import hashlib
import hmac
import sys
import time

secret = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
step_seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 30
step_seconds = max(15, step_seconds)
counter = int(time.time()) // step_seconds
counter_bytes = counter.to_bytes(8, "big", signed=False)
digest = hmac.new(secret.encode("utf-8"), counter_bytes, hashlib.sha1).digest()
offset = digest[-1] & 0x0F
binary_code = ((digest[offset] & 0x7F) << 24) | ((digest[offset + 1] & 0xFF) << 16) | ((digest[offset + 2] & 0xFF) << 8) | (digest[offset + 3] & 0xFF)
print(f"{binary_code % 1_000_000:06d}")
PY
  )"
fi

if command -v uuidgen >/dev/null 2>&1; then
  IDEMPOTENCY_KEY="$(uuidgen | tr '[:upper:]' '[:lower:]')"
else
  IDEMPOTENCY_KEY="$(date +%s)-$$-$RANDOM"
fi

umask 077
mkdir -p "$OUTPUT_DIR"
TIMESTAMP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
CSV_PATH="$OUTPUT_DIR/offline-activation-codes-$TIMESTAMP_UTC.csv"

COOKIE_JAR="$(mktemp)"
LOGIN_BODY_FILE="$(mktemp)"
API_BODY_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$LOGIN_BODY_FILE" "$API_BODY_FILE"' EXIT

LOGIN_PAYLOAD="$(jq -n \
  --arg username "$ADMIN_USERNAME" \
  --arg password "$ADMIN_PASSWORD" \
  --arg device_code "$DEVICE_CODE" \
  --arg device_name "$DEVICE_NAME" \
  --arg mfa_code "$ADMIN_MFA_CODE" \
  '{
      username: $username,
      password: $password,
      device_code: $device_code,
      device_name: $device_name,
      mfa_code: $mfa_code
    }')"

LOGIN_STATUS="$(curl -sS \
  -o "$LOGIN_BODY_FILE" \
  -w "%{http_code}" \
  -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD" \
  -c "$COOKIE_JAR")"

if [[ "$LOGIN_STATUS" -lt 200 || "$LOGIN_STATUS" -ge 300 ]]; then
  echo "Login failed (HTTP $LOGIN_STATUS)." >&2
  echo "Tip: verify backend URL ($BACKEND_URL), admin credentials, and MFA code/secret env vars." >&2
  jq -r '.error.message // .message // "Unknown login error."' "$LOGIN_BODY_FILE" 2>/dev/null || cat "$LOGIN_BODY_FILE" >&2
  exit 1
fi

BATCH_PAYLOAD="$(jq -n \
  --arg shop_code "$SHOP_CODE" \
  --argjson count "$COUNT" \
  --argjson max_activations "$MAX_ACTIVATIONS" \
  --argjson ttl_days "$TTL_DAYS" \
  --arg actor "$ACTOR" \
  --arg reason_code "$REASON_CODE" \
  --arg actor_note "$ACTOR_NOTE" \
  --arg allow_if_existing_batch "$ALLOW_IF_EXISTING_BATCH" \
  '{
      shop_code: $shop_code,
      count: $count,
      max_activations: $max_activations,
      ttl_days: $ttl_days,
      actor: $actor,
      reason_code: $reason_code,
      actor_note: $actor_note,
      allow_if_existing_batch: ($allow_if_existing_batch | ascii_downcase | test("^(1|true|yes)$"))
    }')"

API_STATUS="$(curl -sS \
  -o "$API_BODY_FILE" \
  -w "%{http_code}" \
  -X POST "$BACKEND_URL/api/admin/licensing/offline/activation-entitlements/batch-generate" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -b "$COOKIE_JAR" \
  -d "$BATCH_PAYLOAD")"

if [[ "$API_STATUS" -lt 200 || "$API_STATUS" -ge 300 ]]; then
  echo "Batch generation failed (HTTP $API_STATUS)." >&2
  jq -r '.error.message // .message // "Unknown API error."' "$API_BODY_FILE" 2>/dev/null || cat "$API_BODY_FILE" >&2
  exit 1
fi

{
  echo "entitlement_id,activation_entitlement_key,status,max_activations,activations_used,issued_at,expires_at,source,source_reference"
  jq -r '.entitlements[]
    | [
        .entitlement_id,
        .activation_entitlement_key,
        .status,
        .max_activations,
        .activations_used,
        .issued_at,
        .expires_at,
        .source,
        .source_reference
      ]
    | @csv' "$API_BODY_FILE"
} > "$CSV_PATH"

chmod 600 "$CSV_PATH"

echo "Offline activation code batch generated successfully."
echo "Backend URL: $BACKEND_URL"
echo "Shop code: $(jq -r '.shop_code' "$API_BODY_FILE")"
echo "Generated count: $(jq -r '.generated_count' "$API_BODY_FILE")"
echo "Source reference: $(jq -r '.source_reference' "$API_BODY_FILE")"
echo
echo "Activation keys (plaintext shown once):"
jq -r '.entitlements | to_entries[] | "\(.key + 1). \(.value.activation_entitlement_key)"' "$API_BODY_FILE"
echo
echo "CSV written to: $CSV_PATH"
echo
echo "Usage:"
echo "1. Hand each key to the intended operator securely."
echo "2. On POS activation screen, enter key and activate."
echo "3. Store CSV in restricted access storage only."
