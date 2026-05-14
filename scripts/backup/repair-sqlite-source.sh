#!/usr/bin/env bash
set -euo pipefail

SOURCE_DB="${1:-}"
TARGET_DB="${2:-}"
IN_PLACE="${IN_PLACE:-false}"
REQUIRE_APP_TABLES="${REQUIRE_APP_TABLES:-true}"
RUN_VACUUM="${RUN_VACUUM:-true}"

log() {
  printf '[sqlite-repair] %s\n' "$1"
}

fail() {
  printf '[sqlite-repair][error] %s\n' "$1" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

validate_bool_flag() {
  case "$1" in
    true|false)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

sqlite_integrity_check() {
  local path="$1"
  sqlite3 "$path" "PRAGMA integrity_check;"
}

sqlite_app_table_count() {
  local path="$1"
  sqlite3 "$path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
}

validate_bool_flag "$IN_PLACE" || fail "Invalid IN_PLACE '$IN_PLACE' (expected true|false)."
validate_bool_flag "$REQUIRE_APP_TABLES" || fail "Invalid REQUIRE_APP_TABLES '$REQUIRE_APP_TABLES' (expected true|false)."
validate_bool_flag "$RUN_VACUUM" || fail "Invalid RUN_VACUUM '$RUN_VACUUM' (expected true|false)."
has_cmd sqlite3 || fail "sqlite3 command is required."

[ -n "$SOURCE_DB" ] || fail "Source DB path is required. Usage: repair-sqlite-source.sh <source.db> [target.db]"
[ -f "$SOURCE_DB" ] || fail "Source DB not found: $SOURCE_DB"

if [ "$IN_PLACE" = "true" ]; then
  WORK_DB="$SOURCE_DB"
else
  if [ -z "$TARGET_DB" ]; then
    base_name="$(basename "$SOURCE_DB")"
    parent_dir="$(dirname "$SOURCE_DB")"
    TARGET_DB="$parent_dir/${base_name%.db}.backup-safe.db"
  fi
  [ "$TARGET_DB" != "$SOURCE_DB" ] || fail "Target DB must be different from source when IN_PLACE=false."
  cp "$SOURCE_DB" "$TARGET_DB"
  WORK_DB="$TARGET_DB"
fi

log "Working database: $WORK_DB"

before_check="$(sqlite_integrity_check "$WORK_DB" 2>/dev/null || printf '%s' "")"
if [ "$before_check" = "ok" ]; then
  log "Integrity check already OK before repair."
else
  log "Integrity check before repair: ${before_check:-unknown error}"
fi

if [ "$RUN_VACUUM" = "true" ]; then
  sqlite3 "$WORK_DB" <<SQL
PRAGMA foreign_keys=OFF;
REINDEX;
VACUUM;
SQL
else
  sqlite3 "$WORK_DB" <<SQL
PRAGMA foreign_keys=OFF;
REINDEX;
SQL
fi

after_check="$(sqlite_integrity_check "$WORK_DB" 2>/dev/null || printf '%s' "")"
if [ "$after_check" != "ok" ]; then
  fail "Repair failed; integrity check is still invalid: ${after_check:-unknown error}"
fi

if [ "$REQUIRE_APP_TABLES" = "true" ]; then
  table_count="$(sqlite_app_table_count "$WORK_DB" 2>/dev/null || printf '%s' "0")"
  if ! [[ "$table_count" =~ ^[0-9]+$ ]]; then
    fail "Could not read application table count after repair."
  fi
  if [ "$table_count" -le 0 ]; then
    fail "Repaired DB has no non-system tables."
  fi
  log "Application table count: $table_count"
fi

log "Repair complete; integrity_check=ok"
log "Output DB: $WORK_DB"
