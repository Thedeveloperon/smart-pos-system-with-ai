# AI Privacy Governance Policy (W11)

Last updated: 2026-04-08

## Scope

This policy defines AI payload minimization, redaction, and retention controls for:

- `/api/ai/insights`
- `/api/ai/chat/*`
- Cloud metadata contract at `/cloud/v1/meta/ai-privacy-policy`

## 1. Provider Payload Allowlist

Only the following fields are allowed to enter provider-facing AI prompt envelopes:

- `customer_question`
- `verified_pos_facts_json`
- `rules`
- `output_language`

All other candidate fields are dropped before provider dispatch.

## 2. Redaction Policy

Redaction is applied in three places:

1. Before provider calls
2. Before persistence (`ai_conversation_messages.Content`, `ai_insight_requests.ResponseText`, stored error text)
3. Before logging provider/moderation body previews

Default redaction rules:

- email addresses -> `[redacted_email]`
- phone numbers -> `[redacted_phone]`
- separator-formatted card numbers -> `[redacted_card]`
- key/token assignment patterns -> `[redacted_secret]`

Config path:

- `AiInsights:Privacy:*`
- `AiInsights:Privacy:RedactionRules:*`

## 3. Retention Policy

Configured defaults:

- chat message retention: 30 days
- conversation retention: 30 days
- succeeded insight payload text retention: 30 days
- failed insight payload text retention: 14 days

Retention worker:

- service: `AiPrivacyRetentionCleanupService`
- mode: background worker with configurable interval
- actions:
  - deletes expired chat messages
  - deletes expired empty conversations
  - redacts expired insight payload text while preserving billing/token metadata rows

## 4. Provider Key Handling

- provider API keys remain cloud/backend only
- key source is environment-variable first (`AiInsights:OpenAiApiKeyEnvironmentVariable`, fallback `OPENAI_API_KEY`)
- keys are not emitted by metadata endpoints

## 5. Public Metadata Contract

Endpoint:

- `GET /cloud/v1/meta/ai-privacy-policy`

Response includes:

- redaction enabled flag
- provider payload allowlist
- enabled redaction rule names
- retention windows
- provider key source metadata (without secrets)

## 6. Evidence (Implementation)

- `backend/Features/Ai/AiPrivacyGovernanceService.cs`
- `backend/Features/Ai/AiPrivacyRetentionCleanupService.cs`
- `backend/Features/Ai/AiInsightService.cs`
- `backend/Features/AiChat/AiChatService.cs`
- `backend/Features/Licensing/CloudV1Endpoints.cs`
- `backend/Features/Ai/AiInsightOptions.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/AiPrivacyGovernanceTests.cs`
- `backend/tests/SmartPos.Backend.IntegrationTests/CloudV1LicensingEndpointsTests.cs`
