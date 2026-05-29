# Chatbot — Shopping Agent (LangGraph + Groq) — design

**Date:** 2026-05-19
**Status:** Approved (pending implementation)
**Branch:** `feat/chatbot-shopping-agent`
**Scope:** Conversational shopping agent that replaces the system-conversation echo. Covers 5 chatbot scenarios from `chatbot.xlsx`: KB 1 (NL search), KB 2 (consult/compare), KB 3 (cart/wishlist actions), KB 4 (place/cancel order with confirmation), KB 9 (upsell/cross-sell).

## Goal

Khi buyer chat với bot trong `kind='system'` conversation, bot hiểu ý đồ từng query, gọi đến các service hiện có (products / cart / wishlist / orders), yêu cầu thông tin còn thiếu, yêu cầu xác nhận trước khi đặt hàng, và trả về câu trả lời streaming kèm rich content (product list, confirm card, action chips) qua WebSocket.

## Non-goals (v1)

- Policy/FAQ agent với RAG (sprint sau, sub-project B).
- Notification agent / cart abandonment / restock alerts (sub-project C).
- Anonymous (chưa login) chat — bot chỉ phục vụ buyer đã login.
- Seller dashboard agent.
- Vector / semantic embedding search (tool interface giữ nguyên để sau swap).
- Persistent LangGraph checkpointer (v1 dùng `MemorySaver` in-process).

## Decisions

| # | Decision | Lý do |
|---|----------|-------|
| 1 | Bot ở conversation `kind='system'` (replace echo) | Đã có dedup `(buyer, system)` và route 1-1; không cần migrate enum. |
| 2 | Authenticated buyer only | Cart/order vốn cần auth; chat hiện cũng yêu cầu JWT. |
| 3 | `@langchain/langgraph` JS embed trong NestJS | Cùng process với services, inject DI trực tiếp, 1 ngôn ngữ. |
| 4 | Streaming token qua WebSocket | UX ChatGPT-style; hạ tải perceived latency. |
| 5 | Memory = sliding window 20 message gần nhất | Đủ cho 5-10 turn shopping; preorder state đẩy qua `interrupt()`. |
| 6 | UI carousel = vertical list row | Đọc spec/giá/rating tốt nhất, không phụ thuộc gesture vuốt ngang. |
| 7 | Confirm UI = Yes/No buttons + edit chips | Structured action (không cần LLM re-parse) + linh hoạt edit. |
| 8 | Topology = ReAct agent + order subgraph với `interrupt()` | Đơn giản cho intent thường, rõ ràng cho flow 2 bước đặt hàng. |
| 9 | Model = `openai/gpt-oss-120b` qua Groq | User chỉ định; tool calling đủ tốt; latency thấp trên Groq. |
| 10 | App + bot dùng English (theo CLAUDE.md) | Spec/communication giữa team tiếng Việt; mọi string user-facing tiếng Anh. |
| 11 | Fallback uncertainty = polite text + gợi ý self-serve | Sprint này chưa có CSKH agent. Không auto-escalate sang store. |

## Architecture

### Backend layout

```
backend/src/ai/
├── ai.module.ts                  # imports ProductsModule, CartModule, WishlistModule,
│                                 # OrdersModule, ChatsModule (forwardRef for emit)
├── ai.service.ts                 # entrypoint: respond(userId, conversationId, userMessage)
├── ai.logger.ts                  # structured per-turn logger
├── graph/
│   ├── build-graph.ts            # StateGraph wiring (nodes, edges, interrupt point)
│   ├── state.ts                  # GraphState type + reducers
│   ├── nodes/
│   │   ├── agent.node.ts         # ReAct LLM node, ChatGroq.bindTools(...)
│   │   ├── tools.node.ts         # ToolNode wrapping all DynamicStructuredTools
│   │   └── order-subgraph.ts     # preorder_build → interrupt → resume → finalize/cancel
│   └── tools/                    # one file per tool; each is a small factory(services) → tool
│       ├── search-products.tool.ts
│       ├── compare-products.tool.ts
│       ├── add-to-cart.tool.ts
│       ├── remove-from-cart.tool.ts
│       ├── toggle-wishlist.tool.ts
│       ├── create-preorder.tool.ts
│       ├── confirm-order.tool.ts
│       ├── cancel-order.tool.ts
│       ├── lookup-order.tool.ts
│       └── suggest-similar.tool.ts
├── prompts/
│   └── system.en.ts              # English system prompt
└── rich-message.ts               # ContentBlock union type
```

### Frontend layout

```
frontend/src/
├── services/
│   ├── chatSocket.js              # + on('message:delta'|'message:done'|'message:error')
│   └── chat.js                    # + sendAction(conversationId, action, payload)
├── pages/Chat/
│   ├── ConversationView.jsx       # render content_blocks when sender_kind='system'
│   └── ConversationView.css
└── components/chat/                # NEW
    ├── MessageBubble.jsx           # dispatcher by block type
    ├── ProductListBlock.jsx        # vertical list row (layout C)
    ├── ConfirmCardBlock.jsx        # summary + Yes/No + edit chips
    ├── OrderSuccessBlock.jsx
    ├── OrdersListBlock.jsx
    ├── ToastBlock.jsx
    └── StreamingBubble.jsx         # placeholder while message:delta is flowing
```

### Existing files changed

- `backend/src/chats/chats.service.ts` — `sendBuyerMessage()` for `kind='system'`: persist user msg as today, then `aiService.respond(...)` (fire-and-forget). No more echo.
- `backend/src/chats/chats.gateway.ts` — emit `message:delta`, `message:done`, `message:error`; accept client event `message:action`.
- `backend/src/chats/dto/*` — new DTO for action message.
- `backend/src/app.module.ts` — register `AiModule`.
- `backend/.env.example` — add `GROQ_*`, `AI_*` vars.

## Graph topology

### State

```ts
import { MessagesAnnotation, Annotation } from '@langchain/langgraph';

const ContentBlocksAnnotation = Annotation<ContentBlock[]>({
  reducer: (a, b) => [...a, ...b],
  default: () => [],
});

const PendingPreorderAnnotation = Annotation<PendingPreorder | null>({
  reducer: (_prev, next) => next,
  default: () => null,
});

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  contentBlocks: ContentBlocksAnnotation,
  pendingPreorder: PendingPreorderAnnotation,
});

type PendingPreorder = {
  preorderId: string;
  items: { productId: number; qty: number; unitPrice: number; name: string }[];
  addressId: number;
  paymentMethod: 'COD' | 'card';
  totalAmount: number;
  expiresAt: number;  // ms epoch
};
```

`userId` and `conversationId` are passed via `RunnableConfig.configurable`, not state — they are tenant context, not graph data.

### Nodes & edges

```
START
  │
  ▼
[agent] ── if last AIMessage has tool_calls ──▶ [tools] ──▶ back to [agent]
  │ else
  ▼
END

[tools] dispatches each tool call. Most tools run inline. The
`create_preorder` tool routes the graph into [order_subgraph] instead of
returning to [agent].
```

**Order subgraph (entered via `create_preorder` tool call):**

```
[preorder_build] ─▶ validate items, resolve address, compute totals,
  │                 set state.pendingPreorder, push ConfirmCard to contentBlocks,
  │                 emit a short bot text "Please review and confirm below."
  ▼
   interrupt()      ─▶ graph pauses; ai.service persists this turn's bot
                       message and returns control to chats.service.
                       Checkpointer (MemorySaver, thread_id=conversationId)
                       holds the paused state.
  ▲
  │   On next user turn:
  │     • ai.service sees a checkpoint exists for this thread.
  │     • If the new buyer message has body matching `[action:confirm_order]`,
  │       `[action:cancel_order]`, or `[action:edit_*]`, ai.service calls
  │       `graph.invoke(new Command({ resume: { action, payload } }), {thread_id})`.
  │     • If the new message is free-form text instead, the user effectively
  │       abandoned the preorder: ai.service clears the checkpoint and starts
  │       a fresh invocation (the agent sees the previous ConfirmCard in
  │       message history and can offer to redo if relevant).
  ▼
[resume_decision] ─▶ branches on the resume payload:
  │                    • confirm_order → [finalize]
  │                    • cancel_order  → [cancel] (clear pendingPreorder)
  │                    • edit_*        → back to [agent] with a synthetic
  │                                      system instruction
  ▼
[finalize]       ─▶ check pendingPreorder.expiresAt; if expired, push toast
                    "That order session expired" and END. Otherwise call
                    OrdersService.createFromPreorder() inside a DB tx, push
                    OrderSuccess block, clear pendingPreorder.
                    → END
```

**Why `interrupt()` instead of treating every turn as a fresh invocation:**
the order flow has a meaningful pause point that we want to encode in graph
structure (so it's testable in isolation and the order code reads linearly).
`interrupt()` + checkpointer is the LangGraph-idiomatic primitive for "wait
for user input mid-flow." The checkpointer is `MemorySaver` for v1 (process-
local, acceptable given 10-min preorder TTL and single-instance deploy).

### Tools (10)

| Tool | Input (Zod) | Calls | Returns to LLM | Pushes ContentBlock |
|------|-------------|-------|----------------|---------------------|
| `search_products` | `{ query: string, maxPrice?: number, minPrice?: number, category?: string, limit?: number=8 }` | `ProductsService.search` (new) | JSON of up to 8 products (id, name, price, rating) | `{type:'products', mode:'list', items}` |
| `compare_products` | `{ productIds: number[] }` (2–4) | `ProductsService.findManyByIds` | Comparison table (price, rating, key specs) | `{type:'products', mode:'compare', items}` |
| `add_to_cart` | `{ productId: number, qty?: number=1 }` | `CartService.addItem(userId, …)` | `{ok, cartCount}` or `{error}` | `{type:'toast', kind:'success', text}` |
| `remove_from_cart` | `{ productId: number }` | `CartService.removeItem` | `{ok}` | `{type:'toast', kind:'info', text}` |
| `toggle_wishlist` | `{ productId, action: 'add'\|'remove' }` | `WishlistService.add` / `.remove` | `{ok, state}` | `{type:'toast'}` |
| `create_preorder` | `{ items: {productId, qty}[], addressId?, paymentMethod?: 'COD'\|'card' }` | `OrdersService.buildPreorder` (new, pure) | preorder summary | `{type:'confirm_card', payload}` + set `state.pendingPreorder` |
| `confirm_order` | `{ preorderId: string }` | `OrdersService.createFromPreorder` | `{orderId, total}` | `{type:'order_success', orderId, total}` |
| `cancel_order` | `{ orderId: number, reason?: string }` | `OrdersService.cancel` | `{ok}` or `{error}` | `{type:'toast'}` |
| `lookup_order` | `{ orderId?: number, status?: string }` | `OrdersService.listForUser` / `findOne` | order list/detail | `{type:'orders', items}` |
| `suggest_similar` | `{ seedProductIds: number[], mode: 'similar'\|'complementary' }` | `ProductsService.suggest` (new) | up to 6 products | `{type:'products', mode:'upsell', items}` |

**Backend service additions:**
- `ProductsService.search(query, filters)` — keyword LIKE on name/description + price/category filter (v1).
- `ProductsService.suggest(seedIds, mode)` — same-category for `similar`; adjacent-category stub for `complementary`.
- `OrdersService.buildPreorder(userId, items, addressId, paymentMethod)` — validation-only, no DB write.
- `OrdersService.createFromPreorder(userId, preorderDto)` — wraps existing order create logic.

**Security:** `userId` is taken from `RunnableConfig.configurable`, never from LLM input. Auth enforced at NestJS service layer (same as REST endpoints).

## Rich message protocol

### `ContentBlock` union

```ts
type ContentBlock =
  | { type: 'products'; mode?: 'list'|'compare'|'upsell';
      items: ProductItem[] }
  | { type: 'confirm_card'; preorderId: string;
      title: string; lines: { label: string; value: string }[];
      total: { label: string; value: string };
      primary: { label: string; action: 'confirm_order' };
      secondary: { label: string; action: 'cancel_order' };
      chips: { label: string; action: 'edit_address'|'edit_qty'|'edit_payment' }[] }
  | { type: 'order_success'; orderId: number; total: string }
  | { type: 'orders'; items: { id: number; status: string; total: string; createdAt: string }[] }
  | { type: 'toast'; kind: 'success'|'info'|'warn'; text: string };

type ProductItem = {
  id: number; name: string; price: string;
  image: string | null; rating?: number; storeName?: string;
  stock?: 'in_stock'|'low'|'out';
  actions: Array<'view'|'wishlist'|'add_to_cart'>;
};
```

### Persisted message shape

```ts
{
  id, conversation_id,
  sender_kind: 'buyer'|'store'|'system',  // bot reuses 'system'
  sender_id,                              // null for bot
  body: string | null,                    // bot's plain text reply
  content_blocks: ContentBlock[] | null,  // only for bot messages with rich content
  created_at,
}
```

DB changes:
```sql
ALTER TABLE messages MODIFY body TEXT NULL;
ALTER TABLE messages ADD COLUMN content_blocks JSON NULL;
```

### WebSocket events (`/ws/chat`)

| Direction | Event | Payload | Purpose |
|-----------|-------|---------|---------|
| S→C | `message:new` (existing) | full message row | human + final bot row |
| S→C | `message:delta` (new) | `{ conversationId, requestId, textDelta }` | streaming bot text |
| S→C | `message:done` (new) | `{ conversationId, requestId, messageId }` | end of stream |
| S→C | `message:error` (new) | `{ conversationId, requestId, code, text }` | bot failure (final) |
| C→S | `message:action` (new) | `{ conversationId, action, preorderId, payload? }` | button/chip click → persisted as buyer msg with `body='[action:<action>]'` |
| C→S | `typing:start/stop` (existing) | — | unchanged |

### Turn lifecycle

```
buyer POST /me/chats/:id/messages
  chats.service:
    1. persist user msg (kind='buyer') in tx
    2. emit message:new
    3. if conversation.kind = 'system' → enqueue ai.service.respond(...)
       (HTTP returns immediately with the buyer message)

  ai.service.respond:
    1. determine invocation kind:
       a. If user msg body matches `[action:<name>]` AND a checkpoint exists
          for thread_id=conversationId with a pending interrupt:
            → resume = graph.invoke(new Command({resume: {action, payload}}), {thread_id})
       b. Otherwise (fresh user text, or action without matching checkpoint):
            → load last AI_MAX_HISTORY messages → BaseMessage[]
            → invoke = graph.streamEvents({messages}, {configurable: {userId, conversationId, thread_id: conversationId}})
            → clear stale checkpoint if any
    2. for each LLM token event → emit message:delta(textDelta)
    3. collect state.contentBlocks
    4. persist bot message {body: streamed text, content_blocks}
    5. emit message:new (full row), then message:done

  on error:
    1. persist bot fallback msg
    2. emit message:error + message:new + message:done
```

## Frontend rendering

```jsx
function MessageBubble({ message }) {
  if (message.sender_kind !== 'system') return <TextBubble body={message.body} />;
  const blocks = message.content_blocks ?? [];
  return (
    <BotBubble>
      {message.body && <TextBlock body={message.body} />}
      {blocks.map((b, i) => <BlockDispatcher key={i} block={b} />)}
    </BotBubble>
  );
}
```

`BlockDispatcher` switches on `block.type` to one of the renderers. Each renderer is dumb (presentational), emitting clicks back via `chatSocket.sendAction(...)`.

Streaming:
- User send → buyer bubble + `StreamingBubble` placeholder pinned at bottom ("Typing…").
- `message:delta` appends `textDelta` to placeholder.
- `message:new` for the bot arrives → swap placeholder with real bubble (now renders `content_blocks` too).
- `message:done` cleans up local streaming state.

Action click (confirm):
```
ConfirmCardBlock.onConfirm()
  → chatSocket.sendAction(conversationId, 'confirm_order', { preorderId })
  → server persists buyer msg with body='[action:confirm_order]'
  → ai.service.respond: checkpoint exists → graph.invoke(new Command({resume: {action:'confirm_order', preorderId}}))
  → order subgraph [resume_decision] → [finalize]
  → frontend receives message:new with order_success block; ConfirmCardBlock disables buttons
```

Edit chip (e.g. edit_address):
```
sendAction('edit_address', { preorderId })
  → server persists buyer msg body='[action:edit_address]'
  → ai.service: checkpoint exists → graph.invoke(new Command({resume: {action:'edit_address'}}))
  → order subgraph [resume_decision] → back to [agent] with synthetic instruction
  → text reply listing saved addresses; pendingPreorder stays in state for the next confirm
```

## Error handling & limits

| Error | Bot behavior |
|-------|--------------|
| Groq 5xx / timeout | Retry once with 500ms backoff, then fallback text. |
| Context length exceeded | Trim history to N=10 and retry once; else fallback. |
| Tool throws | Return `{ok:false, error}` ToolMessage; agent explains to user. |
| Tool input invalid | LangChain auto-returns tool error; agent self-corrects. |
| Preorder expired (>10 min) | `confirm_order` returns `{error:'expired'}`; agent offers to redo. |
| Stock disappeared at confirm | `createFromPreorder` throws; agent apologizes + offers alternatives. |

| Limit | Value |
|-------|-------|
| Max graph steps/turn | `AI_RECURSION_LIMIT=8` |
| Max tokens/response | 1024 (Groq param) |
| Max history | `AI_MAX_HISTORY=20` |
| Request timeout | `AI_REQUEST_TIMEOUT_MS=20000` |
| Rate limit | 30 bot turns / 5 min per user on `kind='system'` |
| Preorder TTL | 10 min |

## Observability

- One INFO log per turn: `{userId, conversationId, requestId, durationMs, tokensIn, tokensOut, toolsCalled, outcome}`.
- Tool errors at WARN with stack.
- No PII (user/bot message text not logged).
- In-memory per-tool counters; admin endpoint deferred.

## Testing

**Unit (`*.spec.ts` next to source):**
- Each tool: mock injected service, assert call shape + returned JSON + ContentBlock pushed.
- `agent.node`: mock `ChatGroq.invoke` → canned `AIMessage`; verify edge routing.
- Order flow: drive preorder → confirm-action turn → finalize; same for cancel, expired.
- `ai.service`: load 20, stream emit ordering, persist final.
- `chats.service`: system convo no longer echoes; invokes ai.service.

**Integration (`backend/test/ai.e2e-spec.ts`):**
- Real DB (`amazara_test`), real services, real WS clients. Only `ChatGroq` mocked via `FakeChatModel` returning scripted tool-call sequences.
- One scenario per KB: 1 (search), 2 (compare), 3 (add to cart), 4 (order happy + cancel + expired), 9 (upsell).

**Frontend:** no harness (per project state). Manual checklist in `docs/features/chatbot.md` after build.

## Config

`backend/.env.example` additions:
```
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
AI_MAX_HISTORY=20
AI_RECURSION_LIMIT=8
AI_REQUEST_TIMEOUT_MS=20000
AI_FEATURE_ENABLED=true
```

When `AI_FEATURE_ENABLED=false`, `chats.service` for `kind='system'` falls back to the current echo. Acts as a kill switch.

## Migration

`backend/src/migrations/<ts>-AddContentBlocksToMessages.ts`:
```sql
ALTER TABLE messages MODIFY body TEXT NULL;
ALTER TABLE messages ADD COLUMN content_blocks JSON NULL;
```

TypeORM `synchronize` is on in dev so the schema change applies automatically; the explicit migration exists for prod safety and review trail.

## Open questions / deferred

- Persistent checkpointer (MySQL-backed) — defer until multi-instance.
- Action message dedicated `sender_kind='action'` — defer; using `body='[action:...]'` sentinel for v1.
- Semantic / vector search — defer; tool interface stable for swap.
- Admin metrics endpoint — defer.
- Policy RAG (sub-project B) and Notification agent (sub-project C) — separate specs.

## Documentation deliverable

After implementation: `docs/features/chatbot.md` (per project convention) and a new row in `docs/README.md`.
