# Chatbot — shopping agent

LangGraph + Groq powered assistant that replaces the `kind='system'` echo conversation. Covers 5 in-chat shopping scenarios from `chatbot.xlsx`:

| KB | What the user types | What the bot does |
|----|---------------------|-------------------|
| 1 | "find bluetooth headphones under 1m" | semantic-ish search via `ProductsService.list` → product list block |
| 2 | "compare these two" / "which has better battery" | `compare_products` → side-by-side block |
| 3 | "add the first to my cart" / "save this to wishlist" | `add_to_cart` / `toggle_wishlist` → toast block |
| 4 | "order this now" → click Confirm | `create_preorder` (confirm card) → user confirms → `confirm_order` → order success block |
| 9 | "I added headphones, anything else?" | `suggest_similar` after `add_to_cart` → upsell block |

## Architecture (one-liner)

`buyer text → ChatsService.sendBuyerMessage → queueMicrotask → AiService.respond → LangGraph (ReAct: agent ↔ tools) → ChatsService.appendBotMessage → ChatsGateway.fanOutMessages → WS message:new with content_blocks`

Order flow is a two-turn pause: turn 1 produces a confirm card and leaves a preorder draft in the per-thread checkpointer; the user's click sends a `message:action` WS event that is persisted as an `[action:confirm_order:<preorderId>]` sentinel and runs through the same `sendBuyerMessage → AiService.respond` path. The agent then sees the pending preorder in state and calls `confirm_order` to finalize.

## Endpoints

Inherits existing chat endpoints — no new HTTP routes:

- `POST /me/chats/system` (idempotent), `GET /me/chats/:id/messages`, `POST /me/chats/:id/messages`.

## WebSocket events (additions)

| Direction | Event | Payload | Status |
|-----------|-------|---------|--------|
| S→C | `message:new` (existing) | `{ conversationId, message: { id, conversationId, senderKind, senderId, body, contentBlocks, createdAt } }` | extended with `contentBlocks` |
| S→C | `message:delta` | `{ conversationId, requestId, textDelta }` | stub (streaming deferred) |
| S→C | `message:done` | `{ conversationId, requestId, messageId }` | stub (streaming deferred) |
| S→C | `message:error` | `{ conversationId, requestId, code, text }` | stub (streaming deferred) |
| C→S | `message:action` | `{ conversationId, action, preorderId?, payload? }` | implemented |

## Rich content (`messages.content_blocks` JSON)

Type union lives in `backend/src/ai/rich-message.ts`. Frontend dispatcher: `frontend/src/components/chat/BlockDispatcher.jsx`.

- `products` (mode: `list` / `compare` / `upsell`) — vertical list with image, name, price, rating, stock badge, Save/Details/+Add buttons.
- `confirm_card` — preorder summary with Confirm/Cancel buttons + edit chips (`edit_address`, `edit_qty`, `edit_payment`).
- `order_success` — green success row with link to order detail.
- `orders` — order lookup list with status + total.
- `toast` — inline success/info/warn notice.

## Tools (10)

`backend/src/ai/graph/tools/*`. Each wraps an existing service; `userId` is injected via `RunnableConfig.configurable`, never from LLM input.

| Tool | Calls | Pushes |
|------|-------|--------|
| `search_products` | `ProductsService.list` | products block |
| `compare_products` | `ProductsService.findManyByIds` | products (compare) |
| `add_to_cart` | `CartService.add` | toast |
| `remove_from_cart` | `CartService.remove` | toast |
| `toggle_wishlist` | `WishlistService.add` / `.remove` | toast |
| `create_preorder` | `OrdersService.buildPreorder` (pure) | confirm_card + sets state.pendingPreorder |
| `confirm_order` | `OrdersService.createFromPreorder` | order_success |
| `cancel_order` | `OrdersService.cancelForBuyer` | toast |
| `lookup_order` | `OrdersService.listForBuyer` / `findOneForBuyer` | orders |
| `suggest_similar` | `ProductsService.suggest` | products (upsell) |

## Environment

| Var | Default | Notes |
|-----|---------|-------|
| `GROQ_API_KEY` | — | required when AI_FEATURE_ENABLED=true |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | |
| `AI_MAX_HISTORY` | `20` | sliding window |
| `AI_RECURSION_LIMIT` | `8` | agent ↔ tools loop bound |
| `AI_REQUEST_TIMEOUT_MS` | `20000` | (reserved — model timeout TBD) |
| `AI_FEATURE_ENABLED` | `true` | kill switch — when `false` AiService falls back to "Thanks, we received your message." |

## Local smoke test

```bash
cp backend/.env.example backend/.env        # fill in GROQ_API_KEY
docker compose up -d
# log in as a buyer in the SPA
# open the system conversation (AmaZara Assistant)
# send: "find bluetooth headphones under 1 million"
```

Expected: bot reply with a vertical list of products and Save/+Add buttons. Try "order the first one" → confirm card → click Confirm → success block.

## Manual checklist (post-deploy gate)

- [ ] KB1 search returns a products block.
- [ ] KB2 comparison produces a compare-mode block.
- [ ] KB3 "add the second one" hits `add_to_cart` and toast appears.
- [ ] KB4 happy path: preorder → confirm → order_success → DB has new Paid order with shipping fields + correct storeId on items.
- [ ] KB4 cancel branch: secondary button leaves no Order rows.
- [ ] KB9 upsell follows an add_to_cart turn.
- [ ] Bot reply when `AI_FEATURE_ENABLED=false` is the polite ack.

## Out of scope (separate sub-projects)

- Policy/FAQ RAG agent (sub-project B).
- Notification agent for cart abandonment / price drop / restock (sub-project C, event-driven).
- Token streaming over WS (delta/done/error stubs are emitted by the gateway but `AiService.respond` is currently single-shot — UX nice-to-have for a follow-up).
- E2E tests for KB1/2/3/4/9 against a `FakeChatModel` — planned, not yet wired.

## Known caveats (v1)

- `MemorySaver` checkpointer is process-local; if the backend restarts mid-preorder the draft is lost and the user must redo. Preorder TTL is 10 min anyway.
- The `_reason` parameter of `cancel_order` is accepted but not persisted (Order entity has no `cancel_reason` column).
- `OrdersService.buildPreorder` requires a default address or an explicit `addressId` — the LLM is prompted to ask before placing a preorder when no default exists.
