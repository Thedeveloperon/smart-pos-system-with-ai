# POS Chatbot Implementation Review And Plan

## Purpose

This note reviews the current chatbot-related implementation in the SmartPOS system and proposes the next implementation steps for a broader POS chatbot based on the FAQ templates in `pos_chatbot_faq_templates.json`.

Assumption: the request refers to the OpenAI API, not the OpenAPI specification. The current codebase is already wired to the OpenAI Responses API on the backend.

## Current Implementation

### 1. Existing AI backend is already in place

The project already has a server-side AI integration and does not call OpenAI directly from the frontend.

Current implementation points:

- `backend/Features/Ai/AiInsightService.cs`
  - Calls the OpenAI `/responses` API from the backend.
  - Enforces provider/model rules.
  - Applies moderation and prompt/output guardrails.
  - Handles token estimation, credit reservation, charge settlement, replay by idempotency key, and failure refunds.
- `backend/Program.cs`
  - Registers `AiInsightService` and `AiChatService`.
  - Enforces OpenAI provider policy at startup.
- `backend/appsettings*.json`
  - Already contains AI settings and model configuration.

This means the base AI infrastructure is not the main missing piece. The main missing piece is domain-specific grounding and orchestration for chatbot questions.

### 2. There is already an internal AI chat feature

The system already contains a chat-style feature for POS staff:

- `backend/Features/AiChat/AiChatEndpoints.cs`
  - `POST /api/ai/chat/sessions`
  - `POST /api/ai/chat/sessions/{id}/messages`
  - `GET /api/ai/chat/sessions/{id}`
  - `GET /api/ai/chat/history`
- `backend/Features/AiChat/AiChatService.cs`
  - Creates chat sessions.
  - Stores user and assistant messages.
  - Replays responses safely with idempotency.
  - Builds grounded context before sending the prompt to `AiInsightService`.
- `backend/Domain/Models.cs`
  - Persists chat sessions in `AiConversation`.
  - Persists messages in `AiConversationMessage`.
- `frontend/src/components/pos/AiInsightsDialog.tsx`
  - Already provides chat UI, session history, prompt box, starter prompts, citations, and credit visibility.
- `frontend/src/components/pos/AiInsightsFab.tsx`
  - Floating button to open the assistant.
- `frontend/src/pages/Index.tsx`
  - Integrates the assistant into the POS app.

Important limitation: this chatbot currently exists inside the POS frontend only. There is no separate website chatbot flow in the `website/` app.

### 3. Current grounding is narrow

The current chat feature is not a general POS question-answering engine yet. It only grounds answers with a small set of report buckets inside `backend/Features/AiChat/AiChatService.cs`.

Current grounded buckets:

- Low stock
- Top-selling items
- Worst-selling items
- Monthly sales forecast

The service decides which buckets to include by doing simple keyword checks on the user message. It then builds a prompt like:

- user question
- selected grounded report data
- instructions to only use grounded values

This is a good base, but it is not enough for the FAQ set you attached.

### 4. Existing reports and data sources are broader than the chatbot currently uses

The report layer already exposes more usable business data than the current chatbot consumes.

Available reports:

- `backend/Features/Reports/ReportEndpoints.cs`
  - daily sales
  - transactions
  - payment breakdown
  - top items
  - worst items
  - monthly forecast
  - low stock
  - low stock by brand
  - low stock by supplier

Relevant data already in the domain model:

- `backend/Domain/Models.cs`
  - products, categories, brands, suppliers
  - product-supplier mappings
  - cost price and selling price
  - inventory levels and reorder levels
  - sales, sale items, payments, refunds
  - cash sessions
  - purchase bills and purchase bill items

So the system has enough raw data to support more chatbot answers, but the chat service does not yet query and package most of it.

### 5. Tests already exist for the current chat flow

There is already backend integration coverage for the current assistant:

- `backend/tests/SmartPos.Backend.IntegrationTests/AiChatFlowTests.cs`

Current tested behavior includes:

- grounded citations are returned
- credits are charged
- idempotent replay does not double-charge
- worst-items and monthly-forecast reports are accessible

This is useful because the next chatbot work can extend an existing tested path instead of creating a new one from scratch.

## FAQ Coverage Assessment

Below is the practical status of the FAQ template categories in `pos_chatbot_faq_templates.json`.

### Already supported or close to supported

- Low stock questions
- Low stock by supplier
- Low stock by brand
- Best-selling items
- Worst-selling items
- Monthly sales trend / forecast
- Daily sales summary
- Total sales and transaction summaries
- Cash/card payment breakdown
- Basic refund-related summaries

### Partially supported in data, but not wired into chat yet

- Current stock count of a specific item
- Selling price / cost price of an item
- Profit margin of an item
- Supplier for an item
- Last purchase date / last purchase price of an item
- Recent purchase history of an item
- Cashier-based sales ranking
- Current cash session state
- Drawer balance questions
- Compare date ranges such as today vs yesterday or this week vs last week

These are feasible with current domain models, but they need explicit grounding handlers and usually dedicated query/report methods.

### Not supported yet because data or tracking is missing

- Customer purchase history and top customers
- Pending customer payments
- Expiring and expired stock
- Stock movement history
- Recent price changes
- Discount audit / suspicious discounts
- Pending supplier orders
- Overstock analysis
- Frequent returns analysis
- Manual stock adjustments as a first-class report
- Fast-moving anomaly detection / unusual sales activity

These need either new tables, new event logs, or new reporting logic before the chatbot can answer them reliably.

## Main Gaps In The Current Chatbot

### 1. No intent layer

The current chatbot uses keyword checks only. It does not have a proper intent-to-query mapping for questions like:

- `What is the current stock count of Anchor milk powder?`
- `Which supplier provides Sunlight soap?`
- `Which cashier handled the most transactions today?`

### 2. No parameter extraction

The FAQ templates contain placeholders like:

- `{item name}`
- `{brand}`
- `{supplier}`
- `{category}`
- `{customer name}`

The current chat service does not extract these values and use them in backend queries.

### 3. No structured grounding adapters for most business questions

Most chatbot answers should come from deterministic business queries first, then be summarized by the model. That adapter layer does not exist yet for most FAQ categories.

### 4. No support matrix or fallback policy

The chatbot currently does not explicitly distinguish:

- supported question
- partially supported question
- unsupported question because data does not exist

That will matter for production behavior.

### 5. No FAQ-driven UI

The attached FAQ file is not used by the frontend yet. There is no category picker, quick template list, or variable-filling UX for common questions.

## Recommended Implementation Direction

Do not build this as a pure "send user text to ChatGPT" feature. The current system is already stronger than that. The correct direction is:

1. Determine the question intent.
2. Run deterministic POS queries for that intent.
3. Build a grounded context payload with citations.
4. Ask OpenAI to summarize or explain only that grounded data.
5. Return a constrained answer with citations and a clear unsupported-data message when needed.

This keeps answers factual and makes the chatbot auditable.

## Phased Implementation Plan

### Phase 1. Reuse the existing chat feature as the base

Goal: extend the current `AiChatService`, not replace it.

Work:

- Keep the existing session/message persistence model.
- Keep the existing chat endpoints.
- Keep `AiInsightService` as the OpenAI gateway.
- Refactor `AiChatService.BuildGroundingSnapshotAsync` into a pluggable intent-based pipeline.

Expected result:

- Existing chat UI and API remain stable.
- New chatbot capabilities can be added incrementally.

### Phase 2. Add an intent registry and grounding handlers

Create a layer such as:

- `AiChatIntentClassifier`
- `AiChatGroundingOrchestrator`
- `IAiChatGroundingHandler`

Suggested first handler set:

- stock item lookup
- low stock summary
- low stock by brand
- low stock by supplier
- top items
- worst items
- sales summary
- payment breakdown
- cashier performance
- purchase history by item
- supplier lookup by item
- price and margin lookup
- cash session summary

Expected result:

- A question maps to one or more deterministic data loaders.
- Citations become meaningful and reusable.

### Phase 3. Add entity extraction for placeholders

For the FAQ templates, add extraction for:

- product name
- brand name
- supplier name
- category name
- date range
- cashier name

Recommended approach:

- start with deterministic matching against existing catalog/supplier/brand data
- use AI only as fallback normalization, not as the primary source of truth

Expected result:

- Questions like `What are the low stock items of Nestle?` can be resolved reliably.

### Phase 4. Expand reports and query services for missing but feasible questions

Add service methods and report contracts for the "partially supported" questions, for example:

- stock count by product
- stock value by product / brand
- sales by product / brand / category / date range
- average bill value
- busiest sales hours
- cashier sales leaderboard
- supplier purchase history
- last purchase price and date
- current drawer and cash session summary
- refund summary by date / item

Expected result:

- Most stock, sales, supplier, pricing, and cashier FAQ templates become answerable.

### Phase 5. Add unsupported-data handling

For categories that are not yet supported, the chatbot should answer explicitly, for example:

- `This system does not currently track customer purchase history.`
- `Expiry dates are not stored yet, so I cannot answer expiring-stock questions reliably.`

This should be driven by a support matrix, not left to model improvisation.

Expected result:

- Safer behavior.
- No fabricated answers.

### Phase 6. Wire the FAQ template file into the UI

Use `pos_chatbot_faq_templates.json` as a frontend quick-start source.

Suggested UI features:

- category list
- question chips under each category
- click-to-fill prompt
- placeholder replacement inputs for `{item name}`, `{brand}`, `{supplier}`, and similar fields

This can be added to the existing `AiInsightsDialog.tsx` first.

Expected result:

- Faster user adoption.
- More consistent query patterns.

### Phase 7. Add tests per intent

Add integration tests for each supported intent family:

- stock
- sales
- suppliers
- pricing
- cash session
- refunds

Also add negative tests:

- unsupported customer questions
- missing item/entity resolution
- ambiguous brand or supplier matches
- insufficient data fallback

Expected result:

- Production-safe rollout.

## Suggested V1 Scope

A practical V1 should focus on the categories that are already feasible with current data:

- Stock & Inventory
- Sales
- Purchasing & Suppliers
- Pricing & Profit
- Cashier & Operations
- Reports & Summaries

Defer these to V2 or later unless the underlying data model is added first:

- Customers
- Expiry-based inventory
- stock movement history
- suspicious discounts
- unusual sales anomalies
- pending supplier orders

## Recommended Immediate Next Steps

1. Convert `AiChatService` grounding from keyword buckets into intent handlers.
2. Implement the first 8-12 deterministic handlers using existing reports and product/supplier/purchase/cash-session data.
3. Add placeholder/entity extraction for item, brand, supplier, category, and date range.
4. Load `pos_chatbot_faq_templates.json` in the frontend and expose it as quick prompt templates.
5. Add a support matrix and explicit unsupported-question responses.
6. Add integration tests for each supported FAQ group before rollout.

## Final Recommendation

The project already has the right foundation:

- backend OpenAI integration
- chat sessions and persistence
- credits and idempotency
- report endpoints
- assistant UI in the POS app

So this should be treated as an expansion of the existing grounded AI assistant, not a brand-new chatbot project.

The critical implementation decision is to keep answers grounded in deterministic POS data and use OpenAI mainly for summarization, explanation, and response wording. That is the safest and most scalable path for the FAQ set you attached.
