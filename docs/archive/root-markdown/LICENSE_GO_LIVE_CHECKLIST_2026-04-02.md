# License Control Go-Live Checklist (2026-04-02)

## Engineering

- [x] Super-admin action plane implemented (activate/deactivate/revoke/reactivate/extend/transfer).
- [x] Manual overrides require `reason_code` + `actor_note`.
- [x] High-risk step-up approval enabled (long grace, mass revoke).
- [x] Emergency signed command envelopes enabled (issue + execute with nonce/expiry).
- [x] Audit export endpoint/UI enabled (CSV/JSON).
- [x] Integration and frontend tests passing for implemented scope.

## Security

- [x] Sensitive mutation proof-of-possession in place.
- [x] Replay/nonce/expiry checks enforced for command envelopes.
- [x] Anomaly signals and support triage counters in place.
- [x] Fraud response runbook documented.

## Support/Operations

- [x] Top-10 license ticket playbook documented.
- [x] Manual QA matrix documented.
- [x] No-DB-edit operational path documented.

## Legal/Product

- [x] Legal/EULA checklist documented.
- [ ] Product owner sign-off recorded.
- [ ] Engineering owner sign-off recorded.
- [ ] Security owner sign-off recorded.
- [ ] Support owner sign-off recorded.

## Sign-off

- Source of truth: `LICENSE_OWNER_SIGNOFF_2026-04-02.md`
- Completion rule: all four owner rows in the sign-off register must be marked `Approved`.
- Product owner: TBD
- Engineering owner: TBD
- Security owner: TBD
- Support owner: TBD
- Target go-live date: TBD
