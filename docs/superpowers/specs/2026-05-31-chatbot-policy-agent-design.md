# Chatbot Policy Agent — design

**Date:** 2026-05-31
**Status:** approved (brainstorm), pending implementation plan
**Scenario:** "Policy Agent" from `chatbot.xlsx` — *answer questions about policies & conditions*.

## Problem

The in-app shopping assistant (`backend/src/ai/`, LangGraph + Groq) currently **refuses** policy questions: Rule 7 of `system.en.ts` tells it to say store policies are out of scope and point to a page. The `chatbot.xlsx` design lists a **Policy Agent** scenario that should instead answer questions about shipping, privacy, terms, seller policy, and contacting support.

The policy content already exists, but only in the frontend: `frontend/src/pages/PolicyPage.jsx` hardcodes 5 sections (Privacy, Terms, Shipping, Seller, Support), 2 short paragraphs each — roughly **~600 words / under 1k tokens total**.

## RAG decision: not needed

`chatbot.xlsx`'s Policy Agent note reads *"Dữ liệu tĩnh, RAG nếu cần thiết (quá nhiều dữ liệu)"* — static data, RAG only if the corpus is too large. At ~10 short paragraphs the corpus fits trivially in a single LLM context. Retrieval (chunking, embeddings, a Qdrant collection, an indexing pipeline) would add latency and a mis-routing failure mode to solve a problem we don't have. **Decision: load the entire policy text into the model; no retrieval layer.** RAG only becomes worthwhile when the knowledge base is too big to fit in context or large enough that irrelevant text degrades answers (dozens of pages) — we are ~100× below that.

## Architecture

The chatbot is a single LangGraph ReAct agent (`agent ↔ tools` loop). **The agent LLM's tool selection is the message→scenario classifier** — there is no separate classifier node. Each `chatbot.xlsx` scenario maps to a tool. The Policy Agent scenario is implemented as one new tool, `get_policies`, alongside the existing 10 shopping tools. No RAG, no new service, no DB, no new HTTP route, no new WebSocket event.

Because the corpus is tiny, the tool **returns the entire policy text** — no `topic` argument, no filtering, no retrieval (filtering at this size only adds a mis-route failure mode; returning everything is simpler and strictly more reliable).

## Components

### 1. `backend/src/ai/knowledge/policies.ts` (new)

Canonical policy data as structured TS, mirroring the 5 sections of `PolicyPage.jsx`:

```ts
export type PolicySection = {
  id: string;        // 'privacy' | 'terms' | 'shipping' | 'vendor' | 'support'
  title: string;     // 'Privacy Policy', ...
  path: string;      // '/policy/<id>'
  paragraphs: { heading: string; body: string }[];
};

export const POLICY_SECTIONS: PolicySection[] = [ /* the 5 sections */ ];
export const SUPPORT_CONTACT = 'support@amazara.com';

export function formatPoliciesForLLM(): string { /* labeled text block, see below */ }
```

`formatPoliciesForLLM()` renders all sections into a compact labeled string, e.g.:

```
## Shipping Guide  (page: /policy/shipping)
Delivery areas: AmaZara ships to 63 provinces ...
Shipping fees: Domestic orders over 500,000 VND ship free ...
```

A comment at the top of this file and at the `sections` array in `PolicyPage.jsx` cross-references the other, so a future policy edit keeps both copies in sync. (Two copies is the accepted tradeoff for static policy text — chosen over a shared API endpoint to keep this change small.)

### 2. `backend/src/ai/graph/tools/get-policies.tool.ts` (new)

A `DynamicStructuredTool` named `get_policies`:

- **Schema:** empty (`z.object({})`) — no args; the agent calls it whenever a policy/support question arises.
- **No deps injected** (unlike the service-backed tools) — it only reads the static constant.
- **Does NOT push a content block** — policy answers are plain text, not cards. (Contrast: `search_products` pushes a `products` block.)
- **Returns** a JSON string: the formatted policy text plus a steering note instructing the agent to answer **only** from this text, cite the relevant `/policy/<section>` page, and — if the question isn't covered — say so and direct the user to `support@amazara.com` (the Human Handoff fallback).

### 3. `backend/src/ai/ai.module.ts`

Register `makeGetPoliciesTool()` in the `tools` array of the `AI_GRAPH` factory. No new injected dependency.

### 4. `backend/src/ai/prompts/system.en.ts`

- Add `get_policies` to the CAPABILITIES list.
- **Rewrite Rule 7.** Today: refuse store-policy questions. New behavior: for questions about shipping, privacy, terms, seller/commission policy, or contacting support, call `get_policies`; answer concisely **only** from what it returns; include the relevant `/policy/<section>` link; if the topic isn't in the returned text, say it isn't published and point to `support@amazara.com`. Genuinely off-topic, non-policy requests (e.g. changing account settings) keep the existing polite redirect.

## Data flow

```
buyer policy question
  → AiService.respond → graph.invoke
  → agent node: LLM classifies as policy scenario, emits get_policies tool call
  → tools node: get_policies returns full policy text (no block pushed)
  → agent node: LLM writes a grounded 1–2 sentence answer + /policy/<section> link
  → ChatsService.appendBotMessage (text only, contentBlocks = null)
  → ChatsGateway.fanOutMessages → WS message:new
```

Identical persistence/fan-out path to every other turn; the only difference is the answer is text-only.

## Error handling

- Tool cannot throw on input (no args, static data). If the agent loop itself errors, the existing `AiService.respond` try/catch emits the standard fallback message and records an `error` turn — unchanged.
- Out-of-corpus questions are handled by the prompt rule (admit + point to support), not by code.

## Testing

- `backend/src/ai/graph/tools/get-policies.tool.spec.ts`:
  - returns a string containing content from each of the 5 sections;
  - pushes **no** content block (assert a `pushBlock` spy is never called / output has no block);
  - callable with no args (`tool.invoke({}, config)`).
- `backend/src/ai/knowledge/policies.spec.ts`:
  - `formatPoliciesForLLM()` includes all 5 `/policy/<id>` paths and the support contact.
- Confirm existing `build-graph.spec.ts` / `agent.node.spec.ts` don't assert a fixed tool count (they don't appear to — verify during implementation; adjust only if one does).

Frontend has no test harness — no FE tests. Manual smoke: ask the assistant "how long does domestic shipping take?" → expect a 1–2 sentence answer citing `/policy/shipping`; ask "what's your return window?" → expect an "not published, contact support@amazara.com" reply.

## Docs

- New `docs/features/chatbot-policy-agent.md` describing the Policy Agent scenario, the no-RAG rationale, and the `get_policies` tool.
- Update `docs/features/chatbot.md`: move "Policy/FAQ RAG agent" out of the "Out of scope" list, add a scenario row (Policy Agent), bump the tool count (10 → 11) and add a `get_policies` row to the tools table.
- Add a row to `docs/README.md`'s completed-features table.

## Out of scope

- Sharing policy text via a backend API endpoint (single source of truth) — deferred; two static copies accepted.
- Notification Agent and Human Handoff to a live human (separate scenarios).
- Topic-filtered / paginated policy retrieval — unnecessary at this corpus size.
