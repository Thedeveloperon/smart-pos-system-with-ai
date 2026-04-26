# POS Chatbot Implementation Checklist

Date: 2026-04-26

Status note:
- [x] Implementation complete in code
- [x] Automated build and targeted integration checks passed
- [x] Repo-scoped validation now covers the backend, relay path, POS frontend, and cloud proxy

## Scope

- [x] Keep the plan aligned with the current relay architecture
- [x] Treat the `.docx` and external markdown audit as reference material, not source of truth
- [x] Validate all chatbot changes against the current local backend, relay path, and POS frontend

## Phase 1: Multi-Turn Context

Goal: make follow-up questions work in the same session.

### Implementation

- [x] Update `services/backend-api/Features/AiChat/AiChatService.cs` to load the last 8-10 prior chat messages for the active session
- [x] Exclude failed or empty assistant messages from prompt history
- [x] Change `BuildAiPrompt()` to accept conversation history in addition to the current message and grounding snapshot
- [x] Append a `Conversation history` section to the prompt in chronological order
- [x] Keep the current grounding snapshot logic intact

### Validation

- [x] Ask an initial stock question
- [x] Ask a follow-up question such as `which of those needs reorder first?`
- [x] Confirm the second answer uses prior session context
- [x] Check token usage impact is still acceptable

## Phase 2: Remove Unsupported FAQ Categories

Goal: stop exposing UI actions that the backend intentionally rejects.

### Implementation

- [x] Remove the `Customers` category from `apps/pos-app/src/data/posChatbotFaq.ts`
- [x] Remove the `Alerts & Exceptions` category from `apps/pos-app/src/data/posChatbotFaq.ts`
- [x] Leave unsupported backend handling unchanged in the intent pipeline
- [x] Leave existing unsupported-category integration tests intact unless expected UI behavior changes require test updates

### Validation

- [x] Open the FAQ browser and confirm the removed categories are no longer shown
- [x] Confirm existing supported categories still send questions correctly
- [x] Confirm unsupported free-text questions still return the explicit V1 limitation message

## Phase 3: Language Support

Goal: separate UI localization coverage from AI reply-language behavior.

### Part A: FAQ Template Coverage

- [x] Add Tamil translations for all FAQ question templates in `apps/pos-app/src/data/posChatbotFaq.ts`
- [x] Verify category labels remain localized for English, Sinhala, and Tamil
- [x] Verify placeholder labels remain localized for English, Sinhala, and Tamil

### Part B: Chat Reply Language

- [x] Keep shop-profile language as the default fallback behavior
- [x] Detect the preferred reply language from the current user message in `AiChatService`
- [x] Add an explicit chat language override path from `AiChatService` into `AiInsightService`
- [x] Ensure chat requests can override the default shop-profile language without changing non-chat AI behavior
- [x] Update AI system/prompt instructions so chat replies follow the resolved chat language
- [x] Define fallback behavior for mixed-language or ambiguous messages

### Validation

- [x] Send an English question and confirm the reply is in English
- [x] Send a Sinhala-script question and confirm the reply is in Sinhala
- [x] Send a Tamil-script question and confirm the reply is in Tamil
- [x] Verify FAQ content renders correctly in Tamil UI mode

## Phase 4: Markdown Rendering Improvements

Goal: improve assistant-message readability.

### Implementation

- [x] Extend `SimpleMarkdown()` in `apps/pos-app/src/components/chatbot/ChatConversation.tsx` to support headings
- [x] Add inline code rendering support
- [x] Add fenced code block rendering support
- [x] Preserve existing escaping for unsafe HTML characters
- [x] Preserve current tables, bullet lists, ordered lists, and emphasis behavior

### Validation

- [x] Render a message with headings and confirm visual hierarchy is clear
- [x] Render a message with inline code and confirm formatting is correct
- [x] Render a message with fenced code blocks and confirm layout is readable
- [x] Confirm existing table rendering still works

## Phase 5: Chat UX Improvement Without Streaming

Goal: improve responsiveness before streaming redesign.

### Implementation

- [x] Optimistically append the user message in `apps/pos-app/src/components/pos/AiInsightsDialog.tsx` before the network response returns
- [x] Keep the typing indicator behavior for pending assistant responses
- [x] Reconcile the optimistic user message with the persisted backend response to avoid duplicates
- [x] Ensure failed sends clean up or mark temporary UI state appropriately

### Validation

- [x] Send a message and confirm the user bubble appears immediately
- [x] Confirm the assistant response still appears after the request completes
- [x] Confirm no duplicate user bubbles appear after reconciliation
- [x] Confirm error handling is still visible if the request fails

## Phase 6: Streaming Redesign

Goal: support true streaming assistant responses end-to-end.

### Design Prerequisites

- [x] Confirm the target streaming contract for relay-enabled deployments
- [x] Decide whether the chat API will stream raw text, structured events, or both
- [x] Decide how structured blocks and citations will be emitted during or after the stream
- [x] Confirm how final persisted assistant messages will be assembled from streamed content

### Backend and Relay Work

- [x] Update `services/backend-api/Features/Ai/AiInsightService.cs` to support streaming from the Responses API
- [x] Update `services/backend-api/Features/AiChat/AiChatEndpoints.cs` to expose a streaming chat endpoint
- [x] Redesign `services/backend-api/Features/Ai/AiCreditCloudRelayService.cs` so it does not buffer the full upstream response with `ReadAsStringAsync()`
- [x] Update `apps/cloud-portal/src/app/api/_upstreamProxy.ts` so it forwards streamed bodies instead of buffering `text()`
- [x] Confirm the cloud relay path preserves streamed status codes and headers

### Frontend Work

- [x] Add a streaming fetch path for chat sends in the POS frontend
- [x] Incrementally append assistant content into the active message bubble
- [x] Keep the final stored assistant message consistent with the streamed text
- [x] Handle cancel, timeout, and partial-stream failure states

### Validation

- [x] Confirm assistant content appears token-by-token
- [x] Confirm relay-enabled environments stream successfully
- [x] Confirm final citations and structured blocks still render correctly
- [x] Confirm credit accounting and persisted message history remain correct

## Regression Checklist

- [x] Existing chat session creation still works
- [x] Existing chat history loading still works
- [x] Existing wallet balance refresh still works
- [x] Supported structured blocks still render correctly
- [x] Unsupported free-text categories still return the intended limitation message
- [x] No regression in credit deduction and remaining-credit display

## Exit Criteria

- [x] Multi-turn context works
- [x] Unsupported FAQ categories are removed from the UI
- [x] Tamil FAQ coverage is complete
- [x] Chat replies follow the intended resolved language
- [x] Markdown rendering is improved without regressions
- [x] Optimistic user-bubble behavior works
- [x] Streaming design is either implemented fully or explicitly tracked as a separate follow-up
