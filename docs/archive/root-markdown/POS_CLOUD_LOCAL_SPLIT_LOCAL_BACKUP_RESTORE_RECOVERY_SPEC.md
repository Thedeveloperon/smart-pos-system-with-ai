# POS Local Backup, Restore, and Recovery Spec

Last updated: 2026-04-08
Owner: POS runtime lead

## 1. Objective

Guarantee local POS operational continuity for data-loss events and hardware replacement while preserving cloud license/device integrity.

## 2. Backup Policy

Schedule:
- automatic encrypted backup every 6 hours
- forced backup before upgrade install
- optional on-demand backup from local admin tools

Retention:
- 14 daily snapshots
- 8 weekly snapshots

Storage:
- primary local encrypted backup directory
- optional secondary removable or network destination per store policy

## 3. Recovery Targets

- RPO default <= 6 hours
- RTO default <= 60 minutes

## 4. Restore Workflow

1. Select backup snapshot
- choose latest successful snapshot before incident

2. Validate snapshot
- checksum verification
- decrypt test
- metadata compatibility check (schema version, app version)

3. Quarantine restore
- restore backup into temporary local database path
- run integrity and business sanity checks

4. Cutover
- stop local runtime
- switch active DB pointer to restored DB
- start local runtime

5. Post-restore validation
- local user login check
- latest sales and inventory checkpoint verification
- cloud heartbeat and device validation

## 5. Device Replacement Flow

1. Install local POS runtime on replacement machine.
2. Restore latest valid backup.
3. Re-register or reactivate device token with cloud.
4. Validate license state and protected feature access.
5. Verify local cashier and manager credentials continue to work.

## 6. Failure Modes and Handling

Backup failure:
- retry backup once immediately
- if repeated failure: create critical support event and keep last known good snapshot

Restore validation failure:
- abort cutover
- keep current runtime state unchanged
- attempt previous backup snapshot

Device reactivation failure:
- trigger support workflow for manual device reset with audit trail

## 7. Operational Runbook References

- baseline runbook: `BACKUP_DR_RUNBOOK.md`
- support procedures: `DESKTOP_LICENSE_SUPPORT_RUNBOOK.md`

## 8. Drill Plan

Drill cadence:
- weekly restore smoke test in staging-like environment
- monthly store-level dry-run rehearsal with support observer

Pass criteria:
- restore completes within RTO target
- no critical data mismatch on validation checklist
- heartbeat succeeds after restore
- post-restore cashier operations function normally

## 9. Tracking Checklist

- [ ] backup scheduler configured on pilot stores
- [ ] encrypted backup retention policy enforced
- [ ] restore utility script validated
- [ ] device replacement runbook approved by support
- [ ] drill metrics logged for last 4 weeks

