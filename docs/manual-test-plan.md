# AmaZara — Manual Smoke Test Plan

Quick, happy-path checks: "does the feature work?" only. Run after
`./setup.sh` (or `docker compose up -d` + seed) on a clean DB. Each
checkbox is one click-through. Skip the failure cases — those belong
in unit / e2e tests.

> **Tip.** Keep the browser DevTools Network tab open. Most real bugs
> surface as a non-2xx response even when the UI looks fine.

---

## 0. Setup

- [ ] `./setup.sh` (or `docker compose up -d` then `docker compose exec backend npm run seed:all`)
- [ ] Backend health: `curl http://localhost:3000/health` → `{"status":"ok"}`
- [ ] Frontend reachable at <http://localhost:5173>
- [ ] MySQL on `localhost:3306` accepting connections
- [ ] Open browser DevTools → clear Local Storage for `localhost:5173` (avoid stale tokens)

---

## 1. Auth

- [ ] **Register** a new buyer (e.g. `buyer1@a.local` / `pass1234pass`) — redirected to home, navbar shows the user's name.
- [ ] **Logout** → navbar shows "Sign in" again.
- [ ] **Login** with the same credentials → back in.
- [ ] **Wrong password** shows an inline error and stays on `/auth`.
- [ ] **Refresh page** while logged in → still logged in (token persisted in `localStorage`).

---

## 2. Products catalog

- [ ] Home `/` shows a grid of products with images, names, prices.
- [ ] Click any product card → `/product/<id>` opens detail page with image gallery, description, rating.
- [ ] Header search bar → type "bluetooth" → `/search?q=bluetooth` shows results.
- [ ] Filters/sort on `/search` actually change the list (e.g. price ascending).

---

## 3. Wishlist

- [ ] On a product detail page, tap the heart icon → button toggles "saved".
- [ ] Open `/wishlist` → product appears.
- [ ] Tap heart again (on detail page or in `/wishlist`) → removed.

---

## 4. Cart

- [ ] On a product detail page, tap **Add to cart** → cart icon badge increments.
- [ ] Open `/cart` → product listed with qty 1, correct price.
- [ ] Increase qty → subtotal updates.
- [ ] Remove the item → cart shows empty state.

---

## 5. Addresses

- [ ] `/account/addresses` → list view (empty on first run).
- [ ] **Add** a new address (label, recipient, phone, line1, city, region, postal, country) → row appears.
- [ ] **Mark default** on the new row → `Default` chip appears.
- [ ] **Edit** the address → changes saved.
- [ ] **Delete** the address → row removed.

---

## 6. Profile

- [ ] `/account` → profile form pre-filled with name/phone.
- [ ] Change full name → save → success message.
- [ ] Reload → updated name persists.

---

## 7. Orders (buyer)

> Needs ≥1 product in cart + ≥1 default address.

- [ ] From `/cart` → **Checkout** → review page shows items, address, total.
- [ ] Place order → redirect to order success / `/orders/<id>` with status `Paid`.
- [ ] `/orders` lists the new order.
- [ ] Click into the order → detail page shows items + shipping fields you entered.
- [ ] **Cancel** a Paid order from the detail page → status flips to `Cancelled`.

---

## 8. Chat (buyer ↔ store)

> Needs a seller account (seeded via `seed:all`) and a buyer who placed
> an order from that seller's store.

- [ ] Open `/messages` → conversations list includes both **AmaZara Assistant** (system) and at least one store.
- [ ] Click a store chat → send "hello" → message appears immediately on your side.
- [ ] (Optional, requires 2nd browser as seller) Seller side → `/store/messages` → message arrives without refresh.

---

## 9. Seller — products & inventory

> Log in as a seller account from the seeded data (or register a new
> seller via `/auth`).

- [ ] `/store/products/new` → fill name, price, stock, upload an image → save → redirect to inventory.
- [ ] `/store/inventory` → new product visible, stock count correct.
- [ ] Edit the product → change price → save → list reflects new price.
- [ ] Bulk import: open the import modal, drop a small CSV → preview shows rows → confirm → products appear.

---

## 10. Seller — orders

- [ ] `/store/orders` → orders containing this seller's items show up.
- [ ] Update an order status (Paid → Shipped → Delivered) → row updates without refresh after navigating away and back.

---

## 11. Reviews

> Needs a delivered order containing the product.

- [ ] On product detail page, scroll to Reviews → write a 5★ review → submit.
- [ ] Reload page → review appears in list, average rating updated.
- [ ] Edit your review → comment/star change persists.
- [ ] Delete your review → it disappears from the list.

---

## 12. Chatbot — shopping agent (LangGraph + Groq)

> Needs `GROQ_API_KEY` set in `backend/.env` and `AI_FEATURE_ENABLED=true`.
> Test in BOTH the full chat page (`/messages` → AmaZara Assistant) and
> the floating chat (bottom-right FAB on any page).

### KB1 — Natural-language search

- [ ] Send: `find me red shoes`
- [ ] Bot reply text: 1 short sentence (NO markdown table of products).
- [ ] Below the text: a vertical list of product cards with image, name, price, and three action buttons.
- [ ] Floating chat: same list but with **icon-only** buttons (heart / info / cart-plus).

### KB2 — Compare products

- [ ] Send: `compare the first two`
- [ ] Bot calls `compare_products`; you see a `compare`-mode product list (same UI, different intent).
- [ ] Bot's text reply summarizes which is better at something (e.g. battery, price).

### KB3 — Add to cart / wishlist from chat

- [ ] After a search result, send: `add the first one to my cart`
- [ ] Inline **toast** block appears: "Added <product name> to your cart".
- [ ] Open `/cart` in a new tab → that product is present.
- [ ] Send: `save the second one to wishlist` → toast confirms; product appears in `/wishlist`.

### KB4 — Order placement with confirmation

> Needs ≥1 default address on the user.

- [ ] Send: `order Soundcore Q20` (or whatever product the bot has shown)
- [ ] Bot replies with a **Confirm card**: order ID, item line(s), shipping address, total, two buttons (Confirm / Cancel) + edit chips.
- [ ] Tap **Confirm order** → after a moment, a green **Order placed** block appears with a link to `/orders/<id>`.
- [ ] Open `/orders` → new order is listed with status `Paid`.
- [ ] Repeat the flow but tap **Cancel** instead → bot acknowledges, NO order appears in `/orders`.

### KB4b — Order cancellation via chat

- [ ] After placing an order via chat, send: `cancel order #<orderId>`
- [ ] Bot toast confirms cancellation.
- [ ] `/orders/<id>` shows status `Cancelled`; stock restored on the product.

### KB9 — Upsell after add-to-cart

- [ ] Fresh add-to-cart turn (any product). In the same message or follow-up: `anything else I might like?`
- [ ] Bot calls `suggest_similar` → upsell product list appears beneath the bot's text.

### KB — lookup orders

- [ ] Send: `show my orders`
- [ ] Bot returns an orders list block with status + total + link per order.

### Click "Details" on a product card

- [ ] From any product card in chat, tap the **info** icon (floating) or **Details** button (full chat) → opens `/product/<id>` correctly (no 404).

### Streaming UX

- [ ] During a multi-tool turn, you should see the bot's text appear **token-by-token** with a blinking cursor, then snap into the final bubble with content blocks.
- [ ] Streaming bubble disappears after the final `message:new` arrives.

### Floating chat behavior

- [ ] FAB visible bottom-right.
- [ ] Open chat → FAB **disappears**, panel takes its slot (no dead space below the panel).
- [ ] Send a message → on first open, the conversation auto-scrolls to the bottom.
- [ ] Tap X in panel header → panel closes, FAB reappears.
- [ ] Reopen the panel → still auto-scrolls to the latest message.
- [ ] Resize the browser to a narrow window (~360px) → panel does not overflow horizontally; never gets hidden behind the site header.

### Fallback

- [ ] Set `AI_FEATURE_ENABLED=false` in `backend/.env`, restart backend container, send any message → bot replies "Thanks, we received your message." (no tool calls).
- [ ] Restore to `true`.

### Sentinel hygiene

- [ ] The bubble for `[action:confirm_order:PRE-XXXXXX]` (the buyer-side action message the frontend emits when you click Confirm) must NOT render as a visible text bubble. Only the bot's response should be visible.

---

## 13. Support / policy pages

- [ ] `/policy` → Support Center sidebar with 5 sections (Privacy, Terms, Shipping, Seller, Support).
- [ ] Click each section → URL updates to `/policy/<id>` and the right pane shows the section content **in English**.

---

## 14. Cross-cutting

- [ ] Reload any page while logged in → app does NOT log you out.
- [ ] Open DevTools → Network → no request returns 401 immediately after login (catches the persist-race that previously broke `/me/chats`, `/me/wishlist`, `/me/cart`).
- [ ] Open DevTools → Console → no red errors during a normal browsing → chat → cart → checkout flow.

---

## When something fails

1. Capture the failing request's status + response body from Network tab.
2. `docker compose logs backend | tail -60`.
3. Note browser + viewport size (mobile-only bugs are common).
4. File an issue with reproduction steps.
