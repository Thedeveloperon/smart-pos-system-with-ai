#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '[backup-ci] %s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[backup-ci][error] missing command: %s\n' "$1" >&2
    exit 1
  }
}

require_cmd bash
require_cmd sqlite3
require_cmd find

cd "$REPO_ROOT"

log "Running shell syntax checks"
bash -n scripts/backup/backup-db.sh
bash -n scripts/backup/restore-smoke-test.sh
bash -n scripts/backup/preflight-report.sh
bash -n scripts/backup/repair-sqlite-source.sh

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smartpos-backup-ci-XXXXXX")"
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

SOURCE_DB="$TMP_ROOT/source.sqlite3"
REPAIRED_DB="$TMP_ROOT/repaired.sqlite3"
BACKUP_ROOT="$TMP_ROOT/backups"
METRICS_FILE="$TMP_ROOT/metrics/restore_metrics.jsonl"

log "Preparing temporary SQLite database"
sqlite3 "$SOURCE_DB" <<SQL
CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO users(name) VALUES ('alice'), ('bob');
INSERT INTO products(name) VALUES ('milk'), ('soap'), ('pen');
SQL

log "Running preflight with explicit safe SQLite source"
BACKUP_MODE=sqlite \
SQLITE_DB_PATH="$SOURCE_DB" \
BACKUP_ROOT="$BACKUP_ROOT" \
OFFSITE_UPLOAD=none \
ENABLE_ENCRYPTION=false \
RESTORE_MODE=sqlite \
METRICS_FILE="$METRICS_FILE" \
bash scripts/backup/preflight-report.sh

log "Running backup"
BACKUP_MODE=sqlite \
SQLITE_DB_PATH="$SOURCE_DB" \
BACKUP_ROOT="$BACKUP_ROOT" \
OFFSITE_UPLOAD=none \
ENABLE_ENCRYPTION=false \
bash scripts/backup/backup-db.sh

LATEST_BACKUP="$(find "$BACKUP_ROOT/daily" -type f \( -name '*.tar.gz' -o -name '*.tar.gz.enc' \) | sort -r | head -n 1)"
[ -n "$LATEST_BACKUP" ] || {
  printf '[backup-ci][error] no backup archive generated\n' >&2
  exit 1
}

log "Running restore smoke test"
RESTORE_MODE=sqlite \
METRICS_FILE="$METRICS_FILE" \
bash scripts/backup/restore-smoke-test.sh "$LATEST_BACKUP"

log "Running SQLite repair utility on a copy"
bash scripts/backup/repair-sqlite-source.sh "$SOURCE_DB" "$REPAIRED_DB"

log "Re-validating repaired copy in preflight"
BACKUP_MODE=sqlite \
SQLITE_DB_PATH="$REPAIRED_DB" \
BACKUP_ROOT="$BACKUP_ROOT" \
OFFSITE_UPLOAD=none \
ENABLE_ENCRYPTION=false \
RESTORE_MODE=sqlite \
METRICS_FILE="$METRICS_FILE" \
bash scripts/backup/preflight-report.sh

log "Backup CI smoke test completed successfully"
