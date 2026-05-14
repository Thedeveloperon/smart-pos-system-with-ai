# W2 Staging Restore Drill Evidence (2026-04-08)

## Objective

Execute a staging-style W2 recovery drill end-to-end through backend APIs:
- `POST /api/admin/recovery/preflight/run`
- `POST /api/admin/recovery/backup/run`
- `POST /api/admin/recovery/restore-smoke/run`
- `GET /api/admin/recovery/status`

## Execution Snapshot

- Run date: 2026-04-08
- Environment: local staging-style run (`Development`) with live command execution (`RecoveryOps:DryRun=false`)
- Shell runner: `C:\Program Files\Git\bin\bash.exe`
- Drill source DB: `artifacts/tmp/w2-recovery-api/w2-recovery-source.db`
- Backup root: `artifacts/tmp/w2-recovery-api/backups`
- Metrics file: `artifacts/tmp/w2-recovery-api/metrics/restore_metrics.jsonl`

## Results

- Preflight: `completed`
- Backup: `completed`
- Restore smoke: `completed`
- Restore resolved backup file:
  - `C:\Users\User\Desktop\smart-pos-system-with-ai-main\artifacts\tmp\w2-recovery-api\backups\daily\2026\04\smartpos-sqlite-backup-20260408T140119Z.tar.gz`
- Restore API duration: `1333 ms`
- Latest restore metric:
  - `status=success`
  - `mode=sqlite`
  - `rto_seconds=1`
  - `rpo_seconds=2`
  - `users_count=3`
  - `products_count=4`
- Recovery status after drill:
  - `drill_health.status=healthy`
  - `drill_health.issues=[]`

## Artifacts

- `artifacts/tmp/w2-recovery-api/preflight-response.json`
- `artifacts/tmp/w2-recovery-api/backup-response.json`
- `artifacts/tmp/w2-recovery-api/restore-response.json`
- `artifacts/tmp/w2-recovery-api/status-before.json`
- `artifacts/tmp/w2-recovery-api/status-after.json`
- `artifacts/tmp/w2-recovery-api/summary.json`
- `artifacts/tmp/w2-recovery-api/metrics/restore_metrics.jsonl`

## Implementation Notes Captured During Drill

- `RecoveryOpsService` now passes resolved backup root/metrics paths into script environment for all operations, aligning:
  - status lookup paths,
  - backup write paths,
  - restore discovery paths.
- Backup scripts now support Windows-host execution without `sqlite3` CLI by falling back to Python SQLite for validation/restore checks.
