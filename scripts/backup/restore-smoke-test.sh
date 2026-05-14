#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_FILE="${1:-${BACKUP_FILE:-}}"
RESTORE_MODE="${RESTORE_MODE:-auto}"
WORK_ROOT="${WORK_ROOT:-$REPO_ROOT/backups/restore-smoke}"
METRICS_FILE="${METRICS_FILE:-$REPO_ROOT/backups/metrics/restore_metrics.jsonl}"
POSTGRES_RESTORE_URL="${POSTGRES_RESTORE_URL:-}"

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

BACKUP_FILE="$(normalize_path_for_shell "$BACKUP_FILE")"
WORK_ROOT="$(normalize_path_for_shell "$WORK_ROOT")"
METRICS_FILE="$(normalize_path_for_shell "$METRICS_FILE")"

log() {
  printf '[restore] %s\n' "$1"
}

fail() {
  printf '[restore][error] %s\n' "$1" >&2
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

sqlite_query_scalar() {
  local db_path="$1"
  local query="$2"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db_path" "$query"
    return
  fi

  local python_cmd
  python_cmd="$(find_python_cmd)"
  [ -n "$python_cmd" ] || return 1
  local python_path
  python_path="$(to_python_path "$db_path")"

  "$python_cmd" - "$python_path" "$query" <<'PY' | tr -d '\r'
import sqlite3
import sys

db_path = sys.argv[1]
query = sys.argv[2]
with sqlite3.connect(db_path) as conn:
    row = conn.execute(query).fetchone()
if row is None:
    print("")
else:
    print(row[0])
PY
}

sqlite_count_if_table_exists() {
  local db_path="$1"
  local table_name="$2"
  local exists

  exists="$(sqlite_query_scalar "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table_name';")"
  if [ "$exists" -gt 0 ]; then
    sqlite_query_scalar "$db_path" "SELECT COUNT(*) FROM \"$table_name\";"
    return
  fi

  printf '%s' "null"
}

postgres_count_if_table_exists() {
  local db_url="$1"
  local table_name="$2"
  local exists

  exists="$(psql "$db_url" -tAc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  if [ "$exists" = "t" ]; then
    psql "$db_url" -tAc "SELECT COUNT(*) FROM \"$table_name\";"
    return
  fi

  printf '%s' "null"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

to_epoch_utc() {
  local iso_value="$1"

  if date -u -d "$iso_value" +%s >/dev/null 2>&1; then
    date -u -d "$iso_value" +%s
    return
  fi

  if date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso_value" +%s >/dev/null 2>&1; then
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso_value" +%s
    return
  fi

  printf '%s' ""
}

[ -n "$BACKUP_FILE" ] || fail "Backup file is required. Use: restore-smoke-test.sh <backup-file>"
[ -f "$BACKUP_FILE" ] || fail "Backup file not found: $BACKUP_FILE"

start_epoch="$(date +%s)"
start_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$WORK_ROOT" "$(dirname "$METRICS_FILE")"

scratch_dir="$(mktemp -d "${TMPDIR:-/tmp}/smartpos-restore-XXXXXX")"
cleanup() {
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

package_file="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.enc ]]; then
  require_cmd openssl
  [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] || fail "BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backups"

  package_file="$scratch_dir/decrypted-backup.tar.gz"
  log "Decrypting backup package"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "$BACKUP_FILE" \
    -out "$package_file" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE
fi

tar -xzf "$package_file" -C "$scratch_dir"

metadata_file="$scratch_dir/metadata.env"
created_at_utc=""
artifact_file=""
mode_from_backup=""

if [ -f "$metadata_file" ]; then
  # shellcheck disable=SC1090
  source "$metadata_file"
  created_at_utc="${created_at_utc:-}"
  artifact_file="${artifact_file:-}"
  mode_from_backup="${mode:-}"
fi

artifact_path=""
if [ -n "$artifact_file" ] && [ -f "$scratch_dir/$artifact_file" ]; then
  artifact_path="$scratch_dir/$artifact_file"
else
  extracted_data_files=()
  while IFS= read -r found_file; do
    extracted_data_files+=("$found_file")
  done < <(find "$scratch_dir" -type f \( -name '*.sqlite3' -o -name '*.db' -o -name '*.dump' \) | sort)
  [ "${#extracted_data_files[@]}" -gt 0 ] || fail "No restorable artifact found in backup package"
  artifact_path="${extracted_data_files[0]}"
fi

resolved_mode="$RESTORE_MODE"
if [ "$resolved_mode" = "auto" ]; then
  if [ -n "$mode_from_backup" ]; then
    resolved_mode="$mode_from_backup"
  elif [[ "$artifact_path" == *.dump ]]; then
    resolved_mode="postgres"
  else
    resolved_mode="sqlite"
  fi
fi

status="success"
users_count="null"
products_count="null"
notes=""

if [ "$resolved_mode" = "sqlite" ]; then
  if ! command -v sqlite3 >/dev/null 2>&1 && [ -z "$(find_python_cmd)" ]; then
    fail "sqlite3 or python is required for SQLite restore smoke tests."
  fi

  sqlite_restore_dir="$WORK_ROOT/sqlite"
  mkdir -p "$sqlite_restore_dir"

  restore_db_path="$sqlite_restore_dir/restore-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
  cp "$artifact_path" "$restore_db_path"

  integrity_result="$(sqlite_query_scalar "$restore_db_path" 'PRAGMA integrity_check;')"
  if [ "$integrity_result" != "ok" ]; then
    fail "SQLite integrity check failed: $integrity_result"
  fi

  table_count="$(sqlite_query_scalar "$restore_db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")"
  [ "$table_count" -gt 0 ] || fail "SQLite restore smoke failed: no application tables found."

  users_count="$(sqlite_count_if_table_exists "$restore_db_path" "users")"
  if [ "$users_count" = "null" ]; then
    users_count="$(sqlite_count_if_table_exists "$restore_db_path" "shops")"
  fi

  products_count="$(sqlite_count_if_table_exists "$restore_db_path" "products")"
  if [ "$products_count" = "null" ]; then
    products_count="$(sqlite_count_if_table_exists "$restore_db_path" "inventory")"
  fi

  notes="sqlite_restore_db=$restore_db_path;tables=$table_count"
  log "SQLite restore smoke test passed"
elif [ "$resolved_mode" = "postgres" ]; then
  require_cmd pg_restore
  require_cmd psql
  [ -n "$POSTGRES_RESTORE_URL" ] || fail "POSTGRES_RESTORE_URL is required for Postgres restore"

  log "Restoring Postgres dump into target database"
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$POSTGRES_RESTORE_URL" "$artifact_path"

  table_count="$(psql "$POSTGRES_RESTORE_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")"
  [ "$table_count" -gt 0 ] || fail "Postgres restore smoke failed: no public tables found."

  users_count="$(postgres_count_if_table_exists "$POSTGRES_RESTORE_URL" "users")"
  if [ "$users_count" = "null" ]; then
    users_count="$(postgres_count_if_table_exists "$POSTGRES_RESTORE_URL" "shops")"
  fi

  products_count="$(postgres_count_if_table_exists "$POSTGRES_RESTORE_URL" "products")"
  if [ "$products_count" = "null" ]; then
    products_count="$(postgres_count_if_table_exists "$POSTGRES_RESTORE_URL" "inventory")"
  fi

  notes="postgres_restore_url=$POSTGRES_RESTORE_URL;tables=$table_count"
  log "Postgres restore smoke test passed"
else
  fail "Invalid RESTORE_MODE '$resolved_mode'. Use auto|sqlite|postgres."
fi

end_epoch="$(date +%s)"
end_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rto_seconds="$((end_epoch - start_epoch))"
rpo_seconds="null"

if [ -n "$created_at_utc" ]; then
  backup_epoch="$(to_epoch_utc "$created_at_utc")"
  if [ -n "$backup_epoch" ]; then
    rpo_seconds="$((end_epoch - backup_epoch))"
  fi
fi

record_line=$(printf '{"timestamp_utc":"%s","status":"%s","mode":"%s","backup_file":"%s","created_at_utc":"%s","rto_seconds":%s,"rpo_seconds":%s,"users_count":%s,"products_count":%s,"notes":"%s"}' \
  "$end_iso" \
  "$status" \
  "$resolved_mode" \
  "$(json_escape "$BACKUP_FILE")" \
  "$(json_escape "$created_at_utc")" \
  "$rto_seconds" \
  "$rpo_seconds" \
  "$users_count" \
  "$products_count" \
  "$(json_escape "$notes")")

printf '%s\n' "$record_line" >> "$METRICS_FILE"

log "Restore smoke test completed"
log "Mode: $resolved_mode"
log "RTO (seconds): $rto_seconds"
log "RPO (seconds): $rpo_seconds"
log "Metrics appended: $METRICS_FILE"
