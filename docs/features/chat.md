# Chat

Real-time messaging between buyers, sellers, and a stubbed system bot.

## Endpoints

### Buyer

| Method | Path | Notes |
|--------|------|-------|
| GET | `/me/chats` | List buyer conversations (system + per-store). |
| POST | `/me/chats/system` | Idempotent. Returns the buyer's system conversation. |
| POST | `/me/chats/store/:storeId` | Idempotent. 404 if the store doesn't exist. |
| GET | `/me/chats/:id/messages` | `?before=&limit=` paginated, oldest-first within page. |
| POST | `/me/chats/:id/messages` | `{ body }` (1-2000 chars trimmed). For system chats, also inserts an echo message. |
| PATCH | `/me/chats/:id/read` | Sets `buyer_last_read_at = now()`. |

### Seller

| Method | Path | Notes |
|--------|------|-------|
| GET | `/store/chats` | List conversations targeting the seller's store. |
| GET | `/store/chats/:id/messages` | Same pagination as the buyer side. |
| POST | `/store/chats/:id/messages` | `{ body }`. |
| PATCH | `/store/chats/:id/read` | Sets `store_last_read_at = now()`. |

## WebSocket

Path: `/ws/chat` (Socket.IO).

- Handshake auth: `auth: { token: <JWT> }`. Server joins `user:<id>` and (for sellers) `store:<storeId>`.
- Server emits: `message:new`, `typing:start`, `typing:stop`, `read`.
- Client emits: `typing:start`, `typing:stop` (server validates room membership).

## Tables

- `conversations(id, kind enum('system','store'), buyer_id, store_id NULL, buyer_last_read_at, store_last_read_at, …)`
- `messages(id, conversation_id, sender_kind enum('buyer','store','system'), sender_id, body, created_at)`

Dedupe of `(buyer, kind, store_id)` is enforced inside the service via
transactional lookup-or-create (MySQL NULL semantics make a UNIQUE constraint
unreliable for system rows).

## System bot

Pure echo: when a buyer posts to a `kind='system'` conversation, the server
inserts a `sender_kind='system'` reply `"Thanks, we received your message: <first 200 chars>"`
in the same transaction.
