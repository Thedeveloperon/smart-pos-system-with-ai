#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_MODE="${BACKUP_MODE:-auto}"
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/backups}"
SQLITE_DB_PATH="${SQLITE_DB_PATH:-}"
SQLITE_REQUIRE_APP_TABLES="${SQLITE_REQUIRE_APP_TABLES:-true}"
SQLITE_REQUIRE_INTEGRITY_CHECK="${SQLITE_REQUIRE_INTEGRITY_CHECK:-true}"
POSTGRES_URL="${POSTGRES_URL:-}"
ENABLE_ENCRYPTION="${ENABLE_ENCRYPTION:-false}"
OFFSITE_UPLOAD="${OFFSITE_UPLOAD:-none}"
AWS_S3_URI="${AWS_S3_URI:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RESTORE_MODE="${RESTORE_MODE:-auto}"
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

BACKUP_ROOT="$(normalize_path_for_shell "$BACKUP_ROOT")"
SQLITE_DB_PATH="$(normalize_path_for_shell "$SQLITE_DB_PATH")"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

report_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[preflight][PASS] %s\n' "$1"
}

report_warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf '[preflight][WARN] %s\n' "$1"
}

report_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '[preflight][FAIL] %s\n' "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

find_python_cmd() {
  if has_cmd python && python --version >/dev/null 2>&1; then
    printf '%s\n' "python"
    return
  fi

  if has_cmd python3 && python3 --version >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return
  fi

  printf '%s\n' ""
}

to_python_path() {
  local path="$1"
  if has_cmd cygpath; then
    cygpath -w "$path"
    return
  fi

  printf '%s\n' "$path"
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

sqlite_app_table_count() {
  local path="$1"
  if has_cmd sqlite3; then
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
  if has_cmd sqlite3; then
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

check_sqlite_candidate() {
  local path="$1"
  local label="$2"
  local mode="${3:-strict}"

  if [ ! -f "$path" ]; then
    if [ "$mode" = "candidate" ]; then
      report_warn "$label does not exist: $path"
    else
      report_fail "$label does not exist: $path"
    fi
    return 1
  fi

  if ! has_cmd sqlite3; then
    local python_cmd
    python_cmd="$(find_python_cmd)"
    if [ -z "$python_cmd" ] && { [ "$SQLITE_REQUIRE_APP_TABLES" = "true" ] || [ "$SQLITE_REQUIRE_INTEGRITY_CHECK" = "true" ]; }; then
      if [ "$mode" = "candidate" ]; then
        report_warn "sqlite3 and python are unavailable while SQLite validation guards are enabled."
      else
        report_fail "sqlite3 and python are unavailable while SQLite validation guards are enabled."
      fi
      return 1
    fi

    if [ -n "$python_cmd" ]; then
      report_warn "sqlite3 not found; using Python sqlite fallback for validation."
    else
      report_warn "sqlite3 not found; backup will fall back to file copy for SQLite."
      report_pass "$label exists: $path"
      return 0
    fi
  fi

  if [ "$SQLITE_REQUIRE_APP_TABLES" = "true" ]; then
    local table_count
    table_count="$(sqlite_app_table_count "$path" 2>/dev/null || printf '%s' "")"
    if [ -z "$table_count" ] || ! [[ "$table_count" =~ ^[0-9]+$ ]]; then
      if [ "$mode" = "candidate" ]; then
        report_warn "$label metadata unreadable: $path"
      else
        report_fail "$label metadata unreadable: $path"
      fi
      return 1
    fi
    if [ "$table_count" -le 0 ]; then
      if [ "$mode" = "candidate" ]; then
        report_warn "$label has no non-system tables: $path"
      else
        report_fail "$label has no non-system tables: $path"
      fi
      return 1
    fi
  fi

  if [ "$SQLITE_REQUIRE_INTEGRITY_CHECK" = "true" ]; then
    local integrity_check
    integrity_check="$(sqlite_integrity_check "$path" 2>/dev/null || printf '%s' "")"
    if [ "$integrity_check" != "ok" ]; then
      if [ "$mode" = "candidate" ]; then
        report_warn "$label failed PRAGMA integrity_check: ${integrity_check:-unknown error}"
      else
        report_fail "$label failed PRAGMA integrity_check: ${integrity_check:-unknown error}"
      fi
      return 1
    fi
  fi

  report_pass "$label is backup-safe: $path"
  return 0
}

printf '[preflight] SmartPOS backup preflight started\n'
printf '[preflight] Repository: %s\n' "$REPO_ROOT"

if ! validate_bool_flag "$SQLITE_REQUIRE_APP_TABLES"; then
  report_fail "Invalid SQLITE_REQUIRE_APP_TABLES '$SQLITE_REQUIRE_APP_TABLES' (expected true|false)."
fi
if ! validate_bool_flag "$SQLITE_REQUIRE_INTEGRITY_CHECK"; then
  report_fail "Invalid SQLITE_REQUIRE_INTEGRITY_CHECK '$SQLITE_REQUIRE_INTEGRITY_CHECK' (expected true|false)."
fi
if ! validate_bool_flag "$ENABLE_ENCRYPTION"; then
  report_fail "Invalid ENABLE_ENCRYPTION '$ENABLE_ENCRYPTION' (expected true|false)."
fi

resolved_mode="$BACKUP_MODE"
if [ "$resolved_mode" = "auto" ]; then
  if [ -n "$POSTGRES_URL" ] || [ -n "${PGHOST:-}" ]; then
    resolved_mode="postgres"
  else
    resolved_mode="sqlite"
  fi
fi

case "$resolved_mode" in
  sqlite|postgres)
    report_pass "Backup mode resolved to '$resolved_mode'."
    ;;
  *)
    report_fail "Invalid BACKUP_MODE '$BACKUP_MODE' (resolved '$resolved_mode'). Use auto|sqlite|postgres."
    ;;
esac

if mkdir -p "$BACKUP_ROOT" >/dev/null 2>&1; then
  report_pass "Backup root writable: $BACKUP_ROOT"
else
  report_fail "Backup root is not writable: $BACKUP_ROOT"
fi

if [ "$resolved_mode" = "sqlite" ]; then
  if [ -n "$SQLITE_DB_PATH" ]; then
    check_sqlite_candidate "$SQLITE_DB_PATH" "Configured SQLITE_DB_PATH" "strict"
  else
    candidates=(
      "$REPO_ROOT/services/backend-api/smartpos.db"
      "$REPO_ROOT/services/backend-api/smartpos-dev.db"
      "$REPO_ROOT/smartpos.db"
      "$REPO_ROOT/smartpos-dev.db"
    )

    found_safe=0
    candidate_path=""
    for candidate_path in "${candidates[@]}"; do
      if [ -f "$candidate_path" ] && check_sqlite_candidate "$candidate_path" "Auto candidate" "candidate"; then
        found_safe=1
        break
      fi
    done

    if [ "$found_safe" -eq 1 ]; then
      report_pass "Auto candidate selected: $candidate_path"
    else
      report_fail "No backup-safe SQLite auto candidate found. Set SQLITE_DB_PATH or relax SQLite guard flags explicitly."
    fi
  fi
fi

if [ "$resolved_mode" = "postgres" ]; then
  if has_cmd pg_dump; then
    report_pass "pg_dump is available."
  else
    report_fail "pg_dump is required for postgres backups."
  fi

  if [ -n "$POSTGRES_URL" ] || [ -n "${PGHOST:-}" ]; then
    report_pass "Postgres connection info is configured (POSTGRES_URL/PGHOST)."
  else
    report_warn "No explicit Postgres connection info found. pg_dump will use local defaults."
  fi
fi

if [ "$ENABLE_ENCRYPTION" = "true" ]; then
  if has_cmd openssl; then
    report_pass "OpenSSL is available for encryption."
  else
    report_fail "OpenSSL is required when ENABLE_ENCRYPTION=true."
  fi

  if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
    report_pass "BACKUP_ENCRYPTION_PASSPHRASE is set."
  else
    report_fail "BACKUP_ENCRYPTION_PASSPHRASE is required when ENABLE_ENCRYPTION=true."
  fi
fi

case "$OFFSITE_UPLOAD" in
  none)
    report_pass "Offsite upload disabled."
    ;;
  aws_s3)
    if has_cmd aws; then
      report_pass "aws CLI is available."
    else
      report_fail "aws CLI is required when OFFSITE_UPLOAD=aws_s3."
    fi

    if [ -n "$AWS_S3_URI" ]; then
      report_pass "AWS_S3_URI is configured."
    else
      report_fail "AWS_S3_URI is required when OFFSITE_UPLOAD=aws_s3."
    fi
    ;;
  rclone)
    if has_cmd rclone; then
      report_pass "rclone is available."
    else
      report_fail "rclone is required when OFFSITE_UPLOAD=rclone."
    fi

    if [ -n "$RCLONE_REMOTE" ]; then
      report_pass "RCLONE_REMOTE is configured."
    else
      report_fail "RCLONE_REMOTE is required when OFFSITE_UPLOAD=rclone."
    fi
    ;;
  *)
    report_fail "Invalid OFFSITE_UPLOAD '$OFFSITE_UPLOAD'. Use none|aws_s3|rclone."
    ;;
esac

resolved_restore_mode="$RESTORE_MODE"
if [ "$resolved_restore_mode" = "auto" ]; then
  if [ "$resolved_mode" = "postgres" ]; then
    resolved_restore_mode="postgres"
  else
    resolved_restore_mode="sqlite"
  fi
fi

  case "$resolved_restore_mode" in
  sqlite)
    if has_cmd sqlite3 || [ -n "$(find_python_cmd)" ]; then
      if has_cmd sqlite3; then
        report_pass "sqlite3 is available for restore smoke tests."
      else
        report_warn "sqlite3 not found; restore smoke test will use Python sqlite fallback."
      fi
    else
      report_fail "sqlite3 or python is required for SQLite restore smoke tests."
    fi
    ;;
  postgres)
    if has_cmd pg_restore; then
      report_pass "pg_restore is available."
    else
      report_fail "pg_restore is required for Postgres restore smoke tests."
    fi

    if has_cmd psql; then
      report_pass "psql is available."
    else
      report_fail "psql is required for Postgres restore smoke tests."
    fi

    if [ -n "$POSTGRES_RESTORE_URL" ]; then
      report_pass "POSTGRES_RESTORE_URL is configured."
    else
      report_fail "POSTGRES_RESTORE_URL is required for Postgres restore smoke tests."
    fi
    ;;
  *)
    report_fail "Invalid RESTORE_MODE '$RESTORE_MODE' (resolved '$resolved_restore_mode'). Use auto|sqlite|postgres."
    ;;
esac

printf '[preflight] Summary: pass=%s warn=%s fail=%s\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
