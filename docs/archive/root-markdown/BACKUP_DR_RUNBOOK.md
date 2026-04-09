# SmartPOS Backup and Disaster Recovery Runbook

Date: 2026-04-04

## Purpose

Define a repeatable backup + restore process with measurable RPO/RTO and clear ownership.

## Scope

- SQLite deployments
- Postgres deployments
- Backup package creation
- Offsite copy
- Weekly restore smoke tests

## Ownership

- Primary: Backend/DevOps owner
- Secondary: On-call engineer for restore drills

## Preconditions Checklist

- [ ] `scripts/backup/backup-db.sh` is executable and validated.
- [ ] `scripts/backup/restore-smoke-test.sh` is executable and validated.
- [ ] `scripts/backup/preflight-report.sh` passes with target deployment env.
- [ ] `backup.env.example` copied into secure env file and loaded by scheduler.
- [ ] SQLite validation guards are set intentionally:
  - `SQLITE_REQUIRE_APP_TABLES=true`
  - `SQLITE_REQUIRE_INTEGRITY_CHECK=true`
- [ ] Encryption passphrase is stored in secret manager (not in git).
- [ ] Offsite destination credentials are configured (S3 or rclone remote).
- [ ] Backup logs directory exists and is writable.
- [ ] Restore target (SQLite temp path or Postgres restore DB) is available.

## Backup Procedure

1. Load backup environment file.
2. Run:

```bash
bash scripts/backup/preflight-report.sh
```

3. If preflight passes, run:

```bash
bash scripts/backup/backup-db.sh
```

4. Confirm output includes:
   - mode
   - tier
   - final file path
   - checksum
5. Confirm archive and `.sha256` file exist in `backups/<tier>/YYYY/MM/`.

## Restore Smoke Procedure (Weekly)

1. Select latest backup archive.
2. Run:

```bash
bash scripts/backup/restore-smoke-test.sh <backup-file>
```

3. Validate success logs and metrics append to:
   - `backups/metrics/restore_metrics.jsonl`
4. Review recorded fields:
   - `status`
   - `mode`
   - `rto_seconds`
   - `rpo_seconds`
   - row-count sanity checks

## Target Objectives

- RPO target: <= 24 hours
- RTO target: <= 2 hours

If observed values exceed target, open an incident/task and track corrective actions.

## Failure Playbook

When backup fails:

1. Check command dependencies (`sqlite3`, `pg_dump`, `aws`, `rclone`, `openssl`).
2. Validate DB connectivity/path and credentials.
3. If SQLite backup source was rejected, inspect:
   - missing application tables
   - failed `PRAGMA integrity_check`
   - emergency override flags (`SQLITE_REQUIRE_APP_TABLES` / `SQLITE_REQUIRE_INTEGRITY_CHECK`) only when risk is accepted
   - repair path: run `scripts/backup/repair-sqlite-source.sh` on a copy and set `SQLITE_DB_PATH` to repaired file
4. Verify disk space and target directory permissions.
5. Re-run backup manually and confirm checksum artifact.

When restore smoke fails:

1. Verify backup archive integrity via `.sha256`.
2. Confirm encryption passphrase availability for `.enc` archives.
3. Validate restore target DB is reachable and clean.
4. Re-run restore with explicit `RESTORE_MODE`.
5. Escalate if repeat failures occur on latest two backups.

## Known Blockers for Full Reliability

- Missing system binaries on host (`pg_dump`, `pg_restore`, `sqlite3`, `openssl`).
- Secret rotation gaps for encryption/offsite credentials.
- No dedicated isolated Postgres restore database in some environments.
- Scheduler not yet provisioned in all target deployments.
- Offsite immutability (WORM/object lock) requires cloud policy setup outside app repo.
- CI workflow execution depends on repository-level GitHub Actions enablement and runner permissions.

## Operational Checklist (Weekly)

- [ ] Daily backups succeeded for last 7 days.
- [ ] Offsite upload succeeded for last 7 days.
- [ ] One weekly restore smoke test succeeded.
- [ ] RPO/RTO reviewed and within thresholds.
- [ ] Any failed job has incident ticket and owner.
