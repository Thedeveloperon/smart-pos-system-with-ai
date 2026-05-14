# Scheduler Templates

This folder contains starter templates for scheduling backup jobs.

## Included Templates

- `cron.example`
- `systemd/smartpos-backup.service`
- `systemd/smartpos-backup.timer`
- `systemd/smartpos-restore-smoke.service`
- `systemd/smartpos-restore-smoke.timer`

## Usage Notes

- Replace `/opt/smartpos` with your repo path.
- Store backup environment values in a secure file (example: `/etc/smartpos/backup.env`).
- Run preflight before enabling schedulers:

```bash
cd /opt/smartpos
set -a
source /etc/smartpos/backup.env
set +a
bash scripts/backup/preflight-report.sh
```

- For restore smoke timers, ensure the service has access to a latest backup archive and required restore credentials.
