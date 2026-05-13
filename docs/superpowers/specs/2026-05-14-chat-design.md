# Chat — Design

**Date:** 2026-05-14
**Status:** Draft for review
**Scope:** Functional buyer↔store messaging, buyer↔system echo bot, real-time delivery via Socket.IO, and a redesigned `FloatingChatbot` widget with bottom tabs + fixed height.

## Goal

Turn the existing mock-only chat UI into a working feature:

1. **Buyer ↔ store** — buyers message a seller's store; the seller sees and replies on `/store/messages`.
2. **Buyer ↔ system** — a system "bot" that echoes the buyer's message back (`"Thanks, we received your message: …"`). No LLM.
3. **Real-time** — Socket.IO push so the counterpart sees a message within ~200ms, plus typing and read indicators.
4. **`FloatingChatbot` redesign** — three tabs (System / Stores / FAQ) **at the bottom**, fixed window height, scrollable content inside.

## Out of scope

- Real LLM (Claude API) — system bot is pure echo.
- File / image attachments (button shown but disabled).
- Voice / video.
- Push notifications when widget is closed.
- Backend `/faqs` endpoint — FAQ is hardcoded in the frontend.
- Group chats — every conversation has exactly two parties.
- Multi-device read-state perfect sync.

## Data model

### `conversations` — new

```
id                    bigint PK
kind                  enum('system','store')         -- counterpart kind
buyer_id              bigint FK → users.id  (cascade)
store_id              char(36) FK → stores.id  NULL  -- only when kind='store'
buyer_last_read_at    timestamp NULL
store_last_read_at    timestamp NULL                 -- always NULL for kind='system'
created_at, updated_at
```

Dedupe: at most one row per `(buyer_id, kind, store_id)`. Enforced inside `ChatsService` via a transaction (`SELECT … FOR UPDATE` → insert if missing). No DB-level UNIQUE constraint (MySQL treats `NULL` as not-equal so a unique index on `(buyer_id, kind, store_id)` wouldn't prevent two `kind='system'` rows anyway).

Indexes: `(buyer_id, updated_at DESC)`, `(store_id, updated_at DESC)`.

### `messages` — new

```
id                bigint PK
conversation_id   bigint FK → conversations.id  (cascade delete, indexed)
sender_kind       enum('buyer','store','system')
sender_id         varchar(64)                   -- buyer userId / storeId / '' for system
body              text
created_at        timestamp
```

Index: `(conversation_id, created_at DESC)` for paginated loads.

`conversation.updated_at` is touched in the same transaction as the message insert so the list view sort stays cheap.

## API — REST

### Buyer side (`@UseGuards(JwtAuthGuard)`)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/me/chats` | — | Buyer's conversations, newest first. Each row: `{ id, kind, counterpart: { name, avatar, id }, lastMessage, updatedAt, unread }`. |
| POST | `/me/chats/system` | — | Idempotent. Returns the buyer's system conversation, creating it if missing. |
| POST | `/me/chats/store/:storeId` | — | Idempotent. Returns the `(buyer, store)` conversation. 404 if store doesn't exist. |
| GET | `/me/chats/:id/messages` | `?before=<msgId>&limit=50` | Newest-first within page. 403 if not the buyer. |
| POST | `/me/chats/:id/messages` | `{ body }` | Sends as `sender_kind='buyer'`. If conversation `kind='system'`, server immediately inserts an echo message `"Thanks, we received your message: <trimmed>"` (200-char trim) and emits both on WS. |
| PATCH | `/me/chats/:id/read` | — | Sets `buyer_last_read_at = now()`. Emits `read` event. |

### Store side (`@UseGuards(JwtAuthGuard, SellerStoreGuard)`)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/store/chats` | — | All `kind='store'` conversations where `store_id = req.store.id`. |
| GET | `/store/chats/:id/messages` | `?before=&limit=` | 403 if conversation's `store_id ≠ req.store.id`. |
| POST | `/store/chats/:id/messages` | `{ body }` | `sender_kind='store'`, `sender_id = storeId`. |
| PATCH | `/store/chats/:id/read` | — | Sets `store_last_read_at = now()`. |

### Validation
- `body` is required, length 1-2000 after trim. 400 on empty.

## API — WebSocket

**Namespace / path:** `/ws/chat` (Socket.IO over the same HTTP server).

**Handshake:**
- Client passes `auth: { token: <JWT> }` when calling `io()`.
- `ChatsGateway.handleConnection` verifies via the existing `JwtService`. Invalid → `socket.disconnect(true)`.
- Every socket joins `user:<userId>`. If the user owns a store (`StoresService.findByOwnerId` returns one), also joins `store:<storeId>`.

**Server → client events:**

| Event | Payload | Sent to |
|---|---|---|
| `message:new` | `{ conversationId, message }` | `user:<buyerId>` + (`store:<storeId>` if kind='store') after every message insert. |
| `typing:start` / `typing:stop` | `{ conversationId, party: 'buyer'\|'store' }` | Only the *other* party's room. |
| `read` | `{ conversationId, party, at }` | Only the *other* party's room. |

**Client → server events:**

| Event | Payload | Behavior |
|---|---|---|
| `typing:start` / `typing:stop` | `{ conversationId }` | Gateway verifies that the JWT user is a participant, then forwards as above. Coalesces repeated `typing:start` within a 1s window per socket. |

**Fan-out timing:** server emits **after** the DB transaction commits, so the recipient won't fetch a not-yet-visible message.

**Catch-up on reconnect:** Socket.IO's built-in reconnect handles transport. On the client side, when the socket reconnects, the currently-open conversation re-runs `GET /me/chats/:id/messages` to fill any gap from while the socket was down.

## Frontend

### Services

**Rewrite `src/services/chat.js`** to live API only (drop the `USE_MOCKS` branch and the `../mocks/chat.js` import):

```js
listChats()                             // GET /me/chats
openSystemChat()                        // POST /me/chats/system
openStoreChat(storeId)                  // POST /me/chats/store/:storeId
listMessages(id, { before, limit } = {})
sendMessage(id, body)
markRead(id)

// store-side (used only by /store/messages)
listStoreChats()
listStoreMessages(id, params)
sendStoreMessage(id, body)
markStoreRead(id)
```

**New `src/services/chatSocket.js`** — a thin Socket.IO client wrapper:

```js
connect(token)         // lazy, idempotent; reuses the singleton
disconnect()
onMessage(handler)     // returns cleanup fn
onTyping(handler)
onRead(handler)
emitTyping(conversationId, start)
```

### Context

**`ChatContext` — extended.** Becomes the single source of truth for the buyer perspective across the floating widget AND `UserChatPage`. Shape:

```jsx
{
  // widget state (existing)
  open, view, setView, openChat, closeChat, toggleChat,
  // new — chat data
  chats,                          // ChatSummary[]
  refreshChats(),
  messagesByChat,                 // { [conversationId]: Message[] }
  loadMessages(conversationId, { before } = {}),
  sendMessage(conversationId, body),
  markRead(conversationId),
  unreadTotal,                    // for the FAB badge
  typingByChat,                   // { [conversationId]: bool }
  // entry-point helpers
  ensureSystemChat(),             // returns id
  ensureStoreChat(storeId),       // returns id
}
```

The provider:
- Mounts a socket on `AuthContext.token` change (drops the old one on logout).
- Listens for `message:new`, `typing:*`, `read`; updates the maps; bumps `chat.updatedAt` and unread counts.
- Caches messages locally; `loadMessages` short-circuits if already loaded (with a force-refresh option).

**Store-side gets its own minimal hook `useStoreChat()`** living next to `StoreChatPage` — same socket, but the store-scoped REST endpoints. Keeps `ChatContext` focused on the buyer experience.

### Entry points

- `ProductDetailPage` "Contact seller" → `const id = await ensureStoreChat(product.storeId); navigate('/messages/' + id);`
- `CartPage` "Ask about this item" → same `ensureStoreChat(item.storeId)` flow (replaces the current `/messages`-only link).
- `FloatingChatbot` Stores tab → "+ New chat" button → in-widget store picker (cart items + recent order stores, deduped) → `ensureStoreChat(storeId)` → widget switches to that thread.

### `FloatingChatbot` UI (the redesign)

Window box: `w-[380px] h-[600px]` on desktop, `w-[calc(100vw-1rem)] h-[calc(100vh-6rem)]` on mobile. **Never resizes with tab switches.**

Single flex column:

```
┌─────────────────────────────────────────┐
│ HEADER  (context-aware title + ×)       │  fixed
├─────────────────────────────────────────┤
│ CONTENT  flex-1 min-h-0 overflow-y-auto │  the only flexible region
│                                         │
├─────────────────────────────────────────┤
│ INPUT BAR  (sticky, conditional)        │  visible only in a chat thread
├─────────────────────────────────────────┤
│ TAB BAR  (sticky, always visible)       │
│ [💬 System] [🏪 Stores] [❓ FAQ]        │
└─────────────────────────────────────────┘
```

**Tab bar styling:** `flex border-t border-outline-variant bg-surface`. Each tab is `flex-1 py-3 flex flex-col items-center gap-0.5` (icon + tiny label). Active tab gets `text-primary` plus `border-t-2 border-primary` so the indicator sits above the tab (mirroring how the design has it at the top). Stores tab shows a small badge for `unreadTotal` if `> 0`.

**Tab contents (inside the single scrollable middle):**

- **System** — scrolling message thread. Auto-scroll to bottom on new message only if the user is already near the bottom (`scrollHeight - scrollTop - clientHeight < 80`) — avoids stealing scroll.
- **Stores (list mode)** — scrollable list (avatar / store name / last message / unread badge). Sticky `+ New chat` button at the top. Click a row → switches to thread mode.
- **Stores (thread mode)** — message thread for the selected conversation. A `← Back to stores` link sits at the top of the scrolling area. Clicking it returns to list mode without unmounting the widget.
- **FAQ** — accordion list of hardcoded items. Input bar hidden.

**Header context:**
- System → `AmaZara Assistant` + green online dot.
- Stores list → `Messages` + "<unreadTotal> unread" subtitle.
- Stores thread → store name + "typing…" or "online".
- FAQ → `Help & FAQ`.

**Typing indicator:** a tiny row pinned just above the input bar (inside the scroll container's bottom) when the counterpart's `typing:start` is active. Auto-clears on `typing:stop` or 4s timeout.

**Read receipts:** outgoing bubbles show `✓` (sent) or `✓✓` (read) under the timestamp. Toggles when the other party's `read` event arrives.

**Anonymous behavior:**
- Tab bar shows all three tabs (consistent layout).
- System tab content: a centered empty state — lock icon + "Sign in to chat with our assistant" + button → `/auth`.
- Stores tab: same pattern.
- FAQ tab: fully functional.

**Reconnect pill:** when `socket.connected === false`, a "Reconnecting…" pill sits above the input bar.

## Server → service flow for a buyer message

1. `POST /me/chats/:id/messages` arrives. Validate `body`, 1-2000 chars after trim.
2. Open transaction.
3. Load conversation; 403 if not owner.
4. Insert buyer message; `UPDATE conversations SET updated_at = now() WHERE id = ?`.
5. **If kind = 'system':** insert the echo message in the same transaction.
6. Commit.
7. After commit, gateway emits `message:new` (twice if system, once otherwise) to `user:<buyerId>` (and `store:<storeId>` if applicable).
8. Respond 201 with the buyer message (echo arrives via WS, not in the response body).

## Edge cases

- **Empty body** after trim → 400.
- **Cross-party access** → 403 + frontend forces a `refreshChats()`.
- **Store / user deletion** → `ON DELETE CASCADE` on `buyer_id` / `store_id` foreign keys drops conversations + messages.
- **Two parallel `ensureStoreChat` calls** → service-side `SELECT … FOR UPDATE` inside a transaction yields one row.
- **Unread badge on multi-device** — we accept that reading on one device doesn't instantly clear another device's badge (next refresh / next `read` event reconciles it).
- **Socket auth refresh** — on token change, disconnect + reconnect; in-flight events lost are not critical (REST is the source of truth).
- **Anonymous user clicks "Contact seller"** → existing auth guard on the page redirects to `/auth` (no change needed).

## Testing

**Backend Jest unit (`chats.service.spec.ts`):**
- `openSystemChat` is idempotent (two calls → same row).
- `openStoreChat` is idempotent.
- `sendMessage` to a system chat creates buyer message + echo, in order, both with same conversation_id.
- `sendMessage` updates `conversation.updated_at`.
- `markRead` on a system chat updates `buyer_last_read_at` only.
- 403 paths for cross-buyer access.

**Backend e2e (`backend/test/chats.e2e-spec.ts`):**
- Buyer A → POST system → POST message "hello" → GET messages → list contains buyer msg + echo.
- Buyer A → POST store-1 → POST message; seller-1 → GET store chats → sees the conversation, retrieves messages, replies; buyer A re-fetches and sees reply.
- Buyer B fails to read buyer A's chat with 403.
- Foreign seller (store-2) fails to reply on buyer A's store-1 chat with 403.

**Frontend manual (no harness):**
- Open browser tab 1 as buyer, tab 2 as seller of store-1. Send "hi" from buyer → tab 2 receives in <300ms via WS. Typing in tab 1 shows "is typing…" in tab 2.
- Close tab 2's socket via DevTools, send "second" from tab 1, reopen tab 2's network → catch-up fetch fills the missing message.
- Anonymous: open widget → System and Stores tabs show the "Sign in to chat" empty state; FAQ works.
- Switch between the three tabs → window dimensions don't change.
- Inside Stores tab, switch from list to thread to list → window dimensions don't change.

## Files touched

**Backend — new:**
- `backend/src/chats/conversation.entity.ts`
- `backend/src/chats/message.entity.ts`
- `backend/src/chats/chats.module.ts`
- `backend/src/chats/chats.service.ts`
- `backend/src/chats/chats.service.spec.ts`
- `backend/src/chats/chats.gateway.ts`
- `backend/src/chats/chats.controller.ts`
- `backend/src/chats/store-chats.controller.ts`
- `backend/src/chats/dto/send-message.dto.ts`
- `backend/test/chats.e2e-spec.ts`

**Backend — modified:**
- `backend/src/app.module.ts` — register `ChatsModule`, add `Conversation` + `Message` to entities.
- `backend/test/setup-e2e.ts` — truncate `messages`, `conversations`.
- `backend/package.json` — add `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`.

**Frontend — new:**
- `frontend/src/services/chatSocket.js`

**Frontend — modified:**
- `frontend/src/services/chat.js` — full rewrite, mocks dropped.
- `frontend/src/context/ChatContext.jsx` — major extension.
- `frontend/src/components/FloatingChatbot.jsx` — full UI rewrite (bottom tabs, fixed height, scrollable content).
- `frontend/src/pages/UserChatPage.jsx` — wire to `ChatContext` instead of direct service calls.
- `frontend/src/pages/store/StoreChatPage.jsx` — wire to live data + a new `useStoreChat()` hook.
- `frontend/src/pages/ProductDetailPage.jsx` — "Contact seller" wiring.
- `frontend/src/pages/CartPage.jsx` — "Ask about this item" wiring.
- `frontend/package.json` — add `socket.io-client`.

**Frontend — deleted:**
- `frontend/src/mocks/chat.js`

**Docs:**
- `docs/features/chat.md` (new)
- `docs/README.md` (new row)
