# Support Playbook: Top 10 Licensing Tickets (No DB Edits)

Last updated: 2026-04-02

## Rule

Do not perform direct database edits. Use API/UI super-admin controls only.

## Ticket Playbooks

1. Device cannot checkout after reinstall
- Check `/api/license/status` for state.
- If unprovisioned, activate with entitlement key.

2. Customer says paid but still blocked
- Check manual payment status.
- Verify payment as billing role with reason code + actor note.

3. Wrong branch seat assignment
- Use `transfer-seat` to move device to target shop.

4. Lost/stolen device still active
- Use one-click `lock_device` emergency action.

5. Suspected token theft/session hijack
- Use `revoke_token` emergency action.

6. Need immediate identity refresh on endpoint
- Use `force_reauth` emergency action.

7. Seat limit reached after hardware replacement
- Deactivate old device (self-service or admin).
- Activate replacement.

8. Temporary billing delay but trusted customer
- Apply grace extension.
- If long extension, include step-up approval fields.

9. Multiple devices compromised in incident
- Use `mass-revoke` endpoint with step-up approval.

10. Compliance/audit request from finance/legal
- Export audit logs (CSV/JSON) from admin audit export.

## Escalation

Escalate to security/admin if:
- repeated replay/signature failures
- impossible travel + concurrent-device anomalies
- payment approval conflict indicates potential insider misuse
