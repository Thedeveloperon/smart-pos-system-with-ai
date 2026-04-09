#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_MODE="${BACKUP_MODE:-auto}"
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/backups}"
RETENTION_DAILY="${RETENTION_DAILY:-30}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-12}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-12}"
ENABLE_ENCRYPTION="${ENABLE_ENCRYPTION:-false}"
OFFSITE_UPLOAD="${OFFSITE_UPLOAD:-none}"
IMMUTABLE_COPY_DIR="${IMMUTABLE_COPY_DIR:-}"
SQLITE_DB_PATH="${SQLITE_DB_PATH:-}"
SQLITE_REQUIRE_APP_TABLES="${SQLITE_REQUIRE_APP_TABLES:-true}"
SQLITE_REQUIRE_INTEGRITY_CHECK="${SQLITE_REQUIRE_INTEGRITY_CHECK:-true}"
POSTGRES_URL="${POSTGRES_URL:-}"

AWS_S3_URI="${AWS_S3_URI:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
SQLITE_VALIDATE_ERROR=""

is_windows_path() {
  [[ "$1" =~ ^[A-Za-z]:[\\/].* ]]
}

normalize_path_for_shell() {
  local path="$1"
  if [ -z "$path" ]; then
    printf '%s\n' ""
    return
  fi

  if command -v cygpath >/dev/null 2>&1 && is_windows_path "$path"; then
    cygpath -u "$path"
    return
  fi

  printf '%s\n' "$path"
}

BACKUP_ROOT="$(normalize_path_for_shell "$BACKUP_ROOT")"
SQLITE_DB_PATH="$(normalize_path_for_shell "$SQLITE_DB_PATH")"
IMMUTABLE_COPY_DIR="$(normalize_path_for_shell "$IMMUTABLE_COPY_DIR")"

log() {
  printf '[backup] %s\n' "$1"
}

fail() {
  printf '[backup][error] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

find_python_cmd() {
  if command -v python >/dev/null 2>&1 && python --version >/dev/null 2>&1; then
    printf '%s\n' "python"
    return
  fi

  if command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return
  fi

  printf '%s\n' ""
}

to_python_path() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$path"
    return
  fi

  printf '%s\n' "$path"
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return
  fi

  fail "Neither sha256sum nor shasum is available."
}

validate_bool_flag() {
  local value="$1"
  case "$value" in
    true|false)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

sqlite_app_table_count() {
  local path="$1"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    return
  fi

  local python_cmd
  python_cmd="$(find_python_cmd)"
  [ -n "$python_cmd" ] || return 1
  local python_path
  python_path="$(to_python_path "$path")"

  "$python_cmd" - "$python_path" <<'PY' | tr -d '\r'
import sqlite3
import sys

db_path = sys.argv[1]
with sqlite3.connect(db_path) as conn:
    value = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
    ).fetchone()[0]
print(value)
PY
}

sqlite_integrity_check() {
  local path="$1"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$path" "PRAGMA integrity_check;"
    return
  fi

  local python_cmd
  python_cmd="$(find_python_cmd)"
  [ -n "$python_cmd" ] || return 1
  local python_path
  python_path="$(to_python_path "$path")"

  "$python_cmd" - "$python_path" <<'PY' | tr -d '\r'
import sqlite3
import sys

db_path = sys.argv[1]
with sqlite3.connect(db_path) as conn:
    value = conn.execute("PRAGMA integrity_check;").fetchone()[0]
print(value)
PY
}

validate_sqlite_candidate() {
  local path="$1"
  SQLITE_VALIDATE_ERROR=""

  if ! command -v sqlite3 >/dev/null 2>&1; then
    local python_cmd
    python_cmd="$(find_python_cmd)"
    if [ -z "$python_cmd" ] && { [ "$SQLITE_REQUIRE_APP_TABLES" = "true" ] || [ "$SQLITE_REQUIRE_INTEGRITY_CHECK" = "true" ]; }; then
      SQLITE_VALIDATE_ERROR="sqlite3 command is required when SQLite validation guards are enabled unless Python is available."
      return 1
    fi
  fi

  if [ "$SQLITE_REQUIRE_APP_TABLES" = "true" ]; then
    local table_count
    table_count="$(sqlite_app_table_count "$path" 2>/dev/null || printf '%s' "")"
    if [ -z "$table_count" ] || ! [[ "$table_count" =~ ^[0-9]+$ ]]; then
      SQLITE_VALIDATE_ERROR="could not read table metadata."
      return 1
    fi
    if [ "$table_count" -le 0 ]; then
      SQLITE_VALIDATE_ERROR="database has no non-system tables."
      return 1
    fi
  fi

  if [ "$SQLITE_REQUIRE_INTEGRITY_CHECK" = "true" ]; then
    local integrity_check_result
    integrity_check_result="$(sqlite_integrity_check "$path" 2>/dev/null || printf '%s' "")"
    if [ "$integrity_check_result" != "ok" ]; then
      SQLITE_VALIDATE_ERROR="PRAGMA integrity_check failed (${integrity_check_result:-unknown error})."
      return 1
    fi
  fi

  return 0
}

resolve_sqlite_path() {
  if [ -n "$SQLITE_DB_PATH" ]; then
    [ -f "$SQLITE_DB_PATH" ] || fail "Configured SQLITE_DB_PATH not found: $SQLITE_DB_PATH"

    if ! validate_sqlite_candidate "$SQLITE_DB_PATH"; then
      fail "Configured SQLITE_DB_PATH is not backup-safe: $SQLITE_VALIDATE_ERROR"
    fi

    printf '%s\n' "$SQLITE_DB_PATH"
    return
  fi

  local candidates=(
    "$REPO_ROOT/services/backend-api/smartpos.db"
    "$REPO_ROOT/services/backend-api/smartpos-dev.db"
    "$REPO_ROOT/smartpos.db"
    "$REPO_ROOT/smartpos-dev.db"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      if validate_sqlite_candidate "$candidate"; then
        printf '%s\n' "$candidate"
        return
      fi

      printf '[backup] Skipping SQLite candidate %s: %s\n' "$candidate" "$SQLITE_VALIDATE_ERROR" >&2
    fi
  done

  fail "Could not locate a backup-safe SQLite database file. Set SQLITE_DB_PATH or relax SQLITE validation flags explicitly."
}

prune_tier() {
  local tier="$1"
  local keep="$2"
  local tier_dir="$BACKUP_ROOT/$tier"

  if [ ! -d "$tier_dir" ]; then
    return 0
  fi

  local files=()
  local file
  while IFS= read -r file; do
    files+=("$file")
  done < <(find "$tier_dir" -type f \( -name '*.tar.gz' -o -name '*.tar.gz.enc' \) | sort -r)

  if [ "${#files[@]}" -le "$keep" ]; then
    return
  fi

  local idx
  for ((idx=keep; idx<${#files[@]}; idx++)); do
    rm -f "${files[$idx]}" "${files[$idx]}.sha256"
  done

  find "$tier_dir" -type d -empty -delete >/dev/null 2>&1 || true
}

now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
now_compact="$(date -u +%Y%m%dT%H%M%SZ)"
weekday="$(date -u +%u)"
dom="$(date -u +%d)"
year_month_dir="$(date -u +%Y/%m)"

validate_bool_flag "$SQLITE_REQUIRE_APP_TABLES" || fail "Invalid SQLITE_REQUIRE_APP_TABLES '$SQLITE_REQUIRE_APP_TABLES'. Use true|false."
validate_bool_flag "$SQLITE_REQUIRE_INTEGRITY_CHECK" || fail "Invalid SQLITE_REQUIRE_INTEGRITY_CHECK '$SQLITE_REQUIRE_INTEGRITY_CHECK'. Use true|false."

tier="daily"
if [ "$weekday" = "7" ]; then
  tier="weekly"
fi
if [ "$dom" = "01" ]; then
  tier="monthly"
fi

resolved_mode="$BACKUP_MODE"
if [ "$resolved_mode" = "auto" ]; then
  if [ -n "$POSTGRES_URL" ] || [ -n "${PGHOST:-}" ]; then
    resolved_mode="postgres"
  else
    resolved_mode="sqlite"
  fi
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/smartpos-backup-XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

target_dir="$BACKUP_ROOT/$tier/$year_month_dir"
mkdir -p "$target_dir"

artifact_path=""
source_label=""

if [ "$resolved_mode" = "sqlite" ]; then
  source_label="$(resolve_sqlite_path)"
  artifact_path="$work_dir/smartpos-sqlite-$now_compact.sqlite3"

  if command -v sqlite3 >/dev/null 2>&1; then
    log "Creating SQLite consistent backup using sqlite3 .backup"
    sqlite3 "$source_label" <<SQL
.timeout 10000
.backup '$artifact_path'
SQL
  else
    log "sqlite3 command not found; falling back to file copy"
    cp "$source_label" "$artifact_path"
  fi
elif [ "$resolved_mode" = "postgres" ]; then
  require_cmd pg_dump
  artifact_path="$work_dir/smartpos-postgres-$now_compact.dump"
  source_label="${POSTGRES_URL:-postgres_env}"

  log "Creating Postgres backup using pg_dump (custom format)"
  if [ -n "$POSTGRES_URL" ]; then
    pg_dump --format=custom --no-owner --no-privileges --file "$artifact_path" "$POSTGRES_URL"
  else
    pg_dump --format=custom --no-owner --no-privileges --file "$artifact_path"
  fi
else
  fail "Invalid BACKUP_MODE '$resolved_mode'. Use auto|sqlite|postgres."
fi

artifact_sha256="$(sha256_file "$artifact_path")"
artifact_name="$(basename "$artifact_path")"

cat > "$work_dir/metadata.env" <<EOF_META
created_at_utc=$now_iso
tier=$tier
mode=$resolved_mode
source=$source_label
artifact_file=$artifact_name
artifact_sha256=$artifact_sha256
EOF_META

cat > "$work_dir/README.txt" <<EOF_README
SmartPOS backup package
Generated at: $now_iso
Mode: $resolved_mode
Tier: $tier
EOF_README

package_file="$target_dir/smartpos-${resolved_mode}-backup-${now_compact}.tar.gz"
tar -czf "$package_file" -C "$work_dir" .

final_file="$package_file"

if [ "$ENABLE_ENCRYPTION" = "true" ]; then
  require_cmd openssl
  [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || fail "BACKUP_ENCRYPTION_PASSPHRASE is required when ENABLE_ENCRYPTION=true"

  encrypted_file="${package_file}.enc"
  log "Encrypting backup archive with OpenSSL"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$package_file" \
    -out "$encrypted_file" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE

  rm -f "$package_file"
  final_file="$encrypted_file"
fi

final_sha="$(sha256_file "$final_file")"
sha_file="${final_file}.sha256"
printf '%s  %s\n' "$final_sha" "$(basename "$final_file")" > "$sha_file"

if [ -n "$IMMUTABLE_COPY_DIR" ]; then
  immutable_tier_dir="$IMMUTABLE_COPY_DIR/$tier"
  mkdir -p "$immutable_tier_dir"

  cp -n "$final_file" "$immutable_tier_dir/" || true
  cp -n "$sha_file" "$immutable_tier_dir/" || true
fi

case "$OFFSITE_UPLOAD" in
  none)
    ;;
  aws_s3)
    require_cmd aws
    [ -n "$AWS_S3_URI" ] || fail "AWS_S3_URI is required when OFFSITE_UPLOAD=aws_s3"

    log "Uploading backup to S3"
    aws s3 cp "$final_file" "$AWS_S3_URI/$tier/$(basename "$final_file")"
    aws s3 cp "$sha_file" "$AWS_S3_URI/$tier/$(basename "$sha_file")"
    ;;
  rclone)
    require_cmd rclone
    [ -n "$RCLONE_REMOTE" ] || fail "RCLONE_REMOTE is required when OFFSITE_UPLOAD=rclone"

    log "Uploading backup with rclone"
    rclone copy "$final_file" "$RCLONE_REMOTE/$tier/"
    rclone copy "$sha_file" "$RCLONE_REMOTE/$tier/"
    ;;
  *)
    fail "Invalid OFFSITE_UPLOAD '$OFFSITE_UPLOAD'. Use none|aws_s3|rclone."
    ;;
esac

prune_tier daily "$RETENTION_DAILY"
prune_tier weekly "$RETENTION_WEEKLY"
prune_tier monthly "$RETENTION_MONTHLY"

log "Backup completed"
log "Mode: $resolved_mode"
log "Tier: $tier"
log "Output: $final_file"
log "Checksum: $final_sha"
