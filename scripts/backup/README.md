# Backup Scripts

This folder contains backup and restore smoke-test scripts for SmartPOS.

## Files

- `backup-db.sh`: Creates SQLite or Postgres backup packages with metadata, checksum, retention pruning, and optional encryption/offsite upload.
- `restore-smoke-test.sh`: Restores a backup package into a smoke environment and writes RPO/RTO metrics.
- `preflight-report.sh`: Validates backup/restore prerequisites and source safety before enabling scheduler jobs.
- `repair-sqlite-source.sh`: Repairs SQLite index-level corruption on a copy (`REINDEX` + optional `VACUUM`) and re-validates integrity.
- `ci-smoke-test.sh`: Runs syntax, preflight, backup, restore, and repair checks in an isolated temp SQLite workflow.
- `backup.env.example`: Example environment variables for both scripts.
- `schedulers/`: `cron` and `systemd` templates for daily backup and weekly restore smoke jobs.

## Quick Start

1. Load environment values:

```bash
cp scripts/backup/backup.env.example .env.backup.local
set -a
source .env.backup.local
set +a
```

2. Run preflight (recommended before scheduler setup):

```bash
bash scripts/backup/preflight-report.sh
```

3. Create a backup:

```bash
bash scripts/backup/backup-db.sh
```

4. Run restore smoke test:

```bash
bash scripts/backup/restore-smoke-test.sh <path-to-backup-file>
```

## Backup Modes

- `BACKUP_MODE=sqlite`
  - Uses `sqlite3 .backup` when available.
  - Falls back to file copy if `sqlite3` command is unavailable.
  - If `sqlite3` is unavailable but Python is available, preflight validation and restore smoke checks use Python's built-in `sqlite3` module.
  - By default, rejects empty/corrupt SQLite sources before backup:
    - `SQLITE_REQUIRE_APP_TABLES=true`
    - `SQLITE_REQUIRE_INTEGRITY_CHECK=true`
  - Emergency override is available by setting either flag to `false`.
- `BACKUP_MODE=postgres`
  - Uses `pg_dump --format=custom`.
  - Requires either `POSTGRES_URL` or postgres environment variables.
- `BACKUP_MODE=auto`
  - Uses postgres mode when `POSTGRES_URL`/`PGHOST` is available; otherwise sqlite mode.

## Retention

The backup script stores archives under:

`$BACKUP_ROOT/<tier>/YYYY/MM/`

Where `tier` is determined by current UTC date:

- `daily` default
- `weekly` on Sunday
- `monthly` on day 1 of month

Retention pruning is controlled by:

- `RETENTION_DAILY` (default `30`)
- `RETENTION_WEEKLY` (default `12`)
- `RETENTION_MONTHLY` (default `12`)

## Encryption and Offsite

- Enable archive encryption with:
  - `ENABLE_ENCRYPTION=true`
  - `BACKUP_ENCRYPTION_PASSPHRASE` set
- Offsite upload options:
  - `OFFSITE_UPLOAD=aws_s3` with `AWS_S3_URI`
  - `OFFSITE_UPLOAD=rclone` with `RCLONE_REMOTE`

## Restore Smoke Metrics

`restore-smoke-test.sh` appends one JSON line per run to:

- `METRICS_FILE` (default `./backups/metrics/restore_metrics.jsonl`)

Each record includes mode, status, RTO, RPO (if backup metadata has timestamp), and basic row-count checks.

## Windows Path Handling

- Backup scripts normalize Windows-style paths (for example `C:\...`) when running under Git Bash/MSYS.
- This allows API-launched recovery jobs to pass absolute Windows paths while scripts operate with POSIX-compatible paths internally.

## Suggested Scheduling

- Daily backup cron:

```cron
15 1 * * * cd /path/to/repo && set -a && source .env.backup.local && set +a && bash scripts/backup/backup-db.sh >> logs/backup.log 2>&1
```

- Weekly restore smoke cron:

```cron
30 2 * * 0 cd /path/to/repo && set -a && source .env.backup.local && set +a && bash scripts/backup/restore-smoke-test.sh "$(find backups/daily -type f \( -name '*.tar.gz' -o -name '*.tar.gz.enc' \) | sort -r | head -n 1)" >> logs/restore-smoke.log 2>&1
```

## Scheduler Templates

- `scripts/backup/schedulers/cron.example`
- `scripts/backup/schedulers/systemd/*.service`
- `scripts/backup/schedulers/systemd/*.timer`

These are templates. Update paths/env file locations for your deployment.

## CI Smoke

Use the local CI-equivalent check:

```bash
bash scripts/backup/ci-smoke-test.sh
```

GitHub Actions workflow:

- `.github/workflows/backup-smoke.yml`

## Repairing SQLite Backup Source

When preflight fails due SQLite integrity errors, repair on a copy first:

```bash
bash scripts/backup/repair-sqlite-source.sh services/backend-api/smartpos-dev.db /secure/path/smartpos-dev.backup-safe.db
```

Then set:

```bash
SQLITE_DB_PATH=/secure/path/smartpos-dev.backup-safe.db
```

If you must repair in place (higher risk), set:

```bash
IN_PLACE=true bash scripts/backup/repair-sqlite-source.sh /path/to/db.sqlite3
```
