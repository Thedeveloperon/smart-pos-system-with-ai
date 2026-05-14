# POS Chatbot Backend Implementation Plan

## Context

This backend plan is based on:

- the adopted frontend chatbot flow now integrated into `frontend`
- [POS_CHATBOT_IMPLEMENTATION_REVIEW_AND_PLAN_2026-04-06.md](/c:/Users/User/Desktop/smart-pos-system-with-ai-main/POS_CHATBOT_IMPLEMENTATION_REVIEW_AND_PLAN_2026-04-06.md)

## Frontend Behavior Now In Place

The frontend now provides:

- a floating chatbot launcher in the POS app
- an FAQ browser grouped by business category
- placeholder inputs for questions like `{item name}`, `{brand}`, `{supplier}`
- a chat conversation view for assistant replies
- reuse of the existing `/api/ai/chat` session and message endpoints

Important current frontend contract:

- the frontend still sends plain text questions to the backend
- it does not yet send structured metadata such as `template_id`, `category_id`, or extracted entities
- the backend therefore still needs to infer intent from the final question text

## Backend Goal

Turn the existing `AiChatService` into a grounded POS question-answering service that can answer the FAQ-driven frontend reliably without fabricating data.

The backend should:

1. detect the question intent
2. resolve referenced entities such as product, brand, supplier, category, and date range
3. load deterministic POS data for that intent
4. build grounded context plus citations
5. ask OpenAI to summarize only that grounded data
6. return explicit unsupported-data responses where the system cannot answer reliably

## Keep These Parts As-Is

Do not replace these unless necessary:

- `backend/Features/AiChat/AiChatEndpoints.cs`
- `backend/Features/AiChat/AiChatContracts.cs`
- `backend/Features/Ai/AiInsightService.cs`
- credit reservation, settlement, idempotency, and replay behavior
- persistence through `AiConversation` and `AiConversationMessage`

These are already working and already integrated with the frontend.

## Phase 1. Refactor Chat Grounding Into An Intent Pipeline

### Objective

Replace the current keyword-based `BuildGroundingSnapshotAsync` logic with a handler-based design.

### Suggested backend structure

- `AiChatIntentClassifier`
- `AiChatGroundingOrchestrator`
- `IAiChatGroundingHandler`
- `AiChatEntityResolver`
- `AiChatUnsupportedResponseBuilder`

### Initial flow

1. `PostMessageAsync` receives the user text.
2. Classifier selects one or more candidate intents.
3. Entity resolver extracts references from the text.
4. Matching grounding handler loads POS data.
5. Handler returns:
   - context text
   - citations
   - confidence
   - missing data list
6. `AiInsightService` generates the final answer from grounded context.

## Phase 2. Add V1 Intent Handlers

These handlers should match the frontend FAQ categories already visible to users.

### Stock & Inventory

Handlers:

- item stock count
- low stock summary
- low stock by brand
- low stock by supplier
- out of stock
- zero-sales-with-stock
- stock value by item
- stock value by brand

Likely data sources:

- product catalog
- inventory records
- low stock reports
- top/worst item reports

### Sales

Handlers:

- best-selling items today
- best-selling items this week
- worst-selling items this month
- sales by item
- sales by brand
- sales by category
- total sales today
- average bill value today
- transaction count today
- cashier highest sales today
- busiest sales hours
- compare today vs yesterday
- compare this week vs last week
- highest revenue products

Likely data sources:

- daily sales report
- transactions report
- top items report
- worst items report
- new comparison query methods

### Purchasing & Suppliers

Handlers:

- reorder suggestions
- supplier for item
- low stock by supplier
- last purchase date of item
- last purchase price of item
- recent purchase history for item
- purchases from supplier this month
- highest purchase value suppliers

Likely data sources:

- `ProductSupplier`
- `PurchaseBill`
- `PurchaseBillItem`
- low stock reports

### Pricing & Profit

Handlers:

- selling price by item
- cost price by item
- profit margin by item
- highest margin items
- lowest margin items
- below-expected-margin items
- profit earned today
- profit by brand this month

Likely data sources:

- product prices
- current margin calculation
- daily sales and product revenue

### Cashier & Operations

Handlers:

- who opened cashier session today
- is cashier session open
- current drawer cash balance
- total cash sales today
- total card sales today
- refund summary today
- refunded items today
- cashier with most transactions

Likely data sources:

- cash sessions
- payment breakdown
- transactions report
- refunds

### Reports & Summaries

Handlers:

- today's sales summary
- today's stock changes summary
- today's business performance
- weekly key insights
- restock suggestions based on recent sales
- products needing attention today
- current inventory issues summary

Likely data sources:

- existing reports
- outputs from other handlers combined into summary handlers

## Phase 3. Add Entity Resolution

### Required entity types

- product name
- brand name
- supplier name
- category name
- customer name
- cashier name
- relative date ranges such as:
  - today
  - yesterday
  - this week
  - last week
  - this month

### Recommended approach

Use deterministic matching first:

- exact and normalized product name lookup
- SKU/barcode lookup where relevant
- normalized brand/supplier/category name match
- explicit date-range parsing from known phrases

Use AI only as fallback for fuzzy interpretation, not as the source of business facts.

## Phase 4. Expand Report And Query Services

Several frontend questions require new backend query methods even though the underlying data exists.

Add or extend service methods for:

- stock count by product
- stock value by product / brand
- sales by product / brand / category and date range
- average bill value
- busiest hours
- cashier leaderboard
- purchase history by item
- latest purchase snapshot by item
- supplier purchase totals
- daily profit calculations
- refund item summaries
- drawer summary from current cash session

Recommended location:

- keep aggregate report logic in `ReportService`
- add specialized lookup methods in a dedicated chatbot query service if `ReportService` becomes too broad

## Phase 5. Add Unsupported And Partial-Support Responses

The frontend now exposes categories that the backend cannot truthfully answer yet. Those cases must be handled explicitly.

Examples:

- customer purchase history
- pending customer payments
- expiring / expired stock
- stock movement history
- price change history
- suspicious discounts
- supplier orders pending
- unusual sales activity
- frequent returns

For these, return a grounded message that clearly states the limitation instead of improvising.

## Phase 6. Optional API Upgrade After V1

The current frontend sends only text. That is acceptable for V1.

After the first backend rollout, consider extending the request contract with optional fields such as:

- `category_id`
- `template_id`
- `entities`
- `source = faq | freeform`

This is not required for the current frontend to work, but it would improve intent accuracy and analytics.

## Phase 7. Testing Plan

### Integration tests

Add tests per intent family:

- stock
- sales
- supplier / purchasing
- pricing / profit
- cashier / operations
- reports / summaries

### Negative tests

- unsupported customer questions
- unsupported expiry questions
- ambiguous product name resolution
- missing entity values
- idempotent replay
- low-credit behavior
- insufficient-data grounded response

### Regression tests

Keep the current `AiChatFlowTests` and extend them rather than replacing them.

## Recommended Delivery Order

### Sprint 1

- refactor intent pipeline
- add entity resolver
- implement stock + sales handlers
- add tests for stock + sales

### Sprint 2

- implement purchasing + pricing handlers
- implement cashier + reports handlers
- add unsupported-response framework
- add tests for those groups

### Sprint 3

- add optional structured request metadata
- improve fuzzy entity matching
- add analytics for FAQ usage and unsupported query frequency

## Practical V1 Definition

Backend V1 should fully support the frontend for these groups:

- Stock & Inventory
- Sales
- Purchasing & Suppliers
- Pricing & Profit
- Cashier & Operations
- Reports & Summaries

Backend V1 should explicitly mark these as unsupported:

- Customers
- expiry/expiration queries
- price history queries
- pending supplier order queries
- anomaly-detection queries

## Final Recommendation

Build the backend to serve the adopted frontend as a grounded POS copilot, not as a generic chat endpoint.

The frontend is now ready to drive a much richer chatbot experience, but the backend should unlock that capability by adding deterministic intent handlers and entity-aware grounding on top of the existing `AiChatService`, not by bypassing it.
