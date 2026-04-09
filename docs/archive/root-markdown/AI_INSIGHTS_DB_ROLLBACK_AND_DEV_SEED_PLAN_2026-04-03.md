# AI Insights DB Rollback and Dev Seed Plan

Created: 2026-04-03

## Rollback plan (AI schema only)

Use this only when a deployment must roll back AI insights + credits tables.

### SQLite

```sql
DROP TABLE IF EXISTS "ai_credit_payment_webhook_events";
DROP TABLE IF EXISTS "ai_credit_payments";
DROP TABLE IF EXISTS "ai_credit_ledger";
DROP TABLE IF EXISTS "ai_insight_requests";
DROP TABLE IF EXISTS "ai_credit_wallets";
```

### PostgreSQL

```sql
DROP TABLE IF EXISTS ai_credit_payment_webhook_events;
DROP TABLE IF EXISTS ai_credit_payments;
DROP TABLE IF EXISTS ai_credit_ledger;
DROP TABLE IF EXISTS ai_insight_requests;
DROP TABLE IF EXISTS ai_credit_wallets;
```

## Local dev seed plan

Target users: `manager`, `billing_admin`.

### SQLite seed (quick wallet credits)

```sql
INSERT INTO "ai_credit_wallets" ("Id","UserId","AvailableCredits","CreatedAtUtc","UpdatedAtUtc")
SELECT lower(hex(randomblob(16))), u."Id", 250.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
WHERE u."Username" IN ('manager','billing_admin')
  AND NOT EXISTS (
    SELECT 1 FROM "ai_credit_wallets" w WHERE w."UserId" = u."Id"
  );

UPDATE "ai_credit_wallets"
SET "AvailableCredits" = 250.0,
    "UpdatedAtUtc" = CURRENT_TIMESTAMP
WHERE "UserId" IN (
  SELECT "Id" FROM "users" WHERE "Username" IN ('manager','billing_admin')
);
```

### PostgreSQL seed (quick wallet credits)

```sql
INSERT INTO ai_credit_wallets ("Id","UserId","AvailableCredits","CreatedAtUtc","UpdatedAtUtc")
SELECT gen_random_uuid(), u."Id", 250.0, NOW(), NOW()
FROM users u
WHERE u."Username" IN ('manager','billing_admin')
  AND NOT EXISTS (
    SELECT 1 FROM ai_credit_wallets w WHERE w."UserId" = u."Id"
  );

UPDATE ai_credit_wallets
SET "AvailableCredits" = 250.0,
    "UpdatedAtUtc" = NOW()
WHERE "UserId" IN (
  SELECT "Id" FROM users WHERE "Username" IN ('manager','billing_admin')
);
```

## Verification queries

```sql
SELECT u."Username", w."AvailableCredits", w."UpdatedAtUtc"
FROM users u
LEFT JOIN ai_credit_wallets w ON w."UserId" = u."Id"
WHERE u."Username" IN ('manager','billing_admin');
```
