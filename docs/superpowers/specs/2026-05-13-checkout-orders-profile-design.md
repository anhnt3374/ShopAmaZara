# Checkout, Orders, and Profile — Design

**Date:** 2026-05-13
**Status:** Draft for review
**Scope:** Buyer-side Payment (checkout) page, Order Management list, Order Detail, Profile + Addresses. References `frontend/new_design/Payment/`, `OrderManagement/`, `OrderDetail/`, `ProfilePage/`.

## Goal

Ship the four buyer-side flows the new mockups cover, plus the backend they need:

1. **Payment / Checkout** — pick a saved address, pick a shipping method, fake-pay, place the order.
2. **Order Management** — list of the buyer's own orders, filterable by status, with reorder.
3. **Order Detail** — timeline + items + shipping/payment snapshot + cancel.
4. **Profile** — personal info, addresses (CRUD), and links into orders.

Payment processing is mocked end-to-end (no gateway). The chosen card / e-wallet / bank-transfer fields are captured for display only; the order jumps straight to `Paid` on checkout.

## Out of scope

- Real payment integration (Stripe / VNPay / etc.).
- Refunds and returns (button hidden).
- PDF invoice generation (button hidden).
- Contact Support routing (button hidden).
- Promo / discount codes (input hidden).
- Order export, filter dropdowns (hidden).
- Security / 2FA card on profile (hidden).
- Avatar upload pipeline — users paste a public URL.
- Internationalisation — `preferred_language` is stored but the UI only offers `English`.

## Data model

### `users` — extended

| New column | Type | Notes |
|---|---|---|
| `phone` | varchar(32) NULL | Free-form. |
| `avatar_url` | varchar(512) NULL | Public URL only. |
| `biography` | text NULL | Optional. |
| `preferred_language` | varchar(16) default `'en'` | Fixed `en` in UI. |

### `user_addresses` — new

```
id              bigint PK auto-increment
user_id         bigint FK → users.id  ON DELETE CASCADE  (indexed)
label           varchar(64)               -- "Home", "Office", …
recipient_name  varchar(255)
phone           varchar(32)
line1           varchar(255)
line2           varchar(255) NULL
city            varchar(128)
region          varchar(128)              -- state / province
postal_code     varchar(32)
country         varchar(128)
is_default      boolean default 0
created_at, updated_at
```

Invariant: at most one row per `user_id` has `is_default = 1`. Enforced inside the service via a transaction (`UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND id <> ?`).

### `orders` — extended

**Status enum** rename: `'Processing'` → `'Paid'`. Final values: `'Paid' | 'Shipped' | 'Delivered' | 'Cancelled'`.

| New / changed column | Type | Notes |
|---|---|---|
| `shipping_method` | enum `'Standard' \| 'Express'` | Drives cost. |
| `shipping` | decimal(10,2) | Now 5.00 or 15.00 (was flat 12.50). |
| `shipping_recipient` | varchar(255) | Snapshot of address at checkout. |
| `shipping_phone` | varchar(32) | |
| `shipping_line1` | varchar(255) | |
| `shipping_line2` | varchar(255) NULL | |
| `shipping_city` | varchar(128) | |
| `shipping_region` | varchar(128) | |
| `shipping_postal` | varchar(32) | |
| `shipping_country` | varchar(128) | |
| `payment_method` | enum `'card' \| 'ewallet' \| 'bank'` | |
| `payment_last4` | varchar(4) NULL | Only for `card`. |
| `payment_txn_id` | varchar(64) | Generated as `MOCK-<uuid>`. |
| `paid_at` | timestamp NULL | Set on checkout. |
| `shipped_at` | timestamp NULL | Set when seller marks shipped. |
| `delivered_at` | timestamp NULL | Set when seller marks delivered. |
| `cancelled_at` | timestamp NULL | Set on buyer cancel. |

Status enum migration: a one-shot idempotent SQL on backend bootstrap (`UPDATE orders SET status = 'Paid' WHERE status = 'Processing'`), so existing test data flips cleanly. Synchronize handles the column additions.

## API

### Profile

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/me` | — | Auth required. Returns `{ id, email, fullName, phone, avatarUrl, biography, preferredLanguage, role }`. |
| PATCH | `/me` | `{ fullName?, phone?, avatarUrl?, biography?, preferredLanguage? }` | Email + role immutable here. |

### Addresses

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/me/addresses` | — | Default first, then newest. |
| POST | `/me/addresses` | `{ label, recipientName, phone, line1, line2?, city, region, postalCode, country, isDefault? }` | First saved address auto-becomes default. |
| PATCH | `/me/addresses/:id` | Partial body | 403 if not owner. Setting `isDefault: true` unsets others atomically. |
| DELETE | `/me/addresses/:id` | — | 403 if not owner. If it was default, promote the next most-recent row. |

### Orders

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/orders/checkout` (**changed**) | `{ productIds: string[], addressId: string, shippingMethod: 'Standard' \| 'Express', payment: { method: 'card' \| 'ewallet' \| 'bank', cardLast4?: string } }` | Same transactional flow as today, plus: looks up + snapshots the address, picks the shipping cost, persists payment snapshot, sets `status = 'Paid'`, `paid_at = now()`, generates `payment_txn_id`. |
| GET | `/me/orders` (**extended**) | `?status=` optional | Now returns shipping + payment snapshot + 4 timestamps so OrderManagement can render thumbnails / status / Reorder. |
| GET | `/me/orders/:id` (**extended**) | — | Full snapshot for OrderDetail. |
| PATCH | `/me/orders/:id/cancel` (**new**) | — | 403 if not owner; 409 if status `∈ {Shipped, Delivered, Cancelled}`. Sets `status='Cancelled'`, `cancelled_at`, restores product stock in a transaction. |

### Seller (existing, minor)

`GET /store/orders` and `PATCH /store/orders/:id` keep working unchanged at the URL level. Their DTOs need to accept the renamed `'Paid'` status value (replacing `'Processing'`). On `PATCH`, the service also sets the matching timestamp: `Shipped → shipped_at`, `Delivered → delivered_at`, `Cancelled → cancelled_at`. Transitioning to `Cancelled` from the seller side also restores stock (same logic as the buyer cancel transaction).

## Frontend

### Routes (all under `UserLayout`)

| Path | Component | Notes |
|---|---|---|
| `/checkout` | `pages/CheckoutPage.jsx` | Replaces the inline cart-checkout flow. |
| `/orders` | `pages/OrderManagementPage.jsx` | Buyer's order list. |
| `/orders/:id` | `pages/OrderDetailPage.jsx` | Timeline + items + cancel. |
| `/account` | `pages/ProfilePage.jsx` | Profile header, bento, personal info form. |
| `/account/addresses` | `pages/AddressesPage.jsx` | Address CRUD. |

### CartPage change

"Checkout Selected" no longer calls the checkout API. It collects `selectedItems` and `navigate('/checkout', { state: { productIds } })`. Unauthenticated users still get bounced to `/auth`.

### CheckoutPage

- Reads `productIds` from router state (falls back to cart's `selectedItems` if state is missing — e.g. user refreshed).
- Fetches `/me/addresses`; if empty, inline `<AddressForm>` blocks place-order until the user saves one.
- Layout matches the mockup: address grid (click to select), shipping method radio, payment-method tabs (card / e-wallet / bank), sticky Order Summary on the right reflecting live shipping choice.
- Payment fields (card number, expiry, CVC for `card`) are required-by-format only; nothing is sent except `method` and `cardLast4`.
- "Place Order" → `POST /orders/checkout` → success: `cart.clearSelected()`, toast, `navigate('/orders/:id')`.
- Promo, Contact Support, Help, etc. removed from JSX.

### OrderManagementPage

- Sidebar: Profile / Orders / Addresses + a "View Dashboard" link only if `user.role === 'seller'`.
- Header: title + subtitle (no Filter / Export — hidden).
- Tabs: `All | Paid | Shipped | Delivered | Cancelled`. (No "Pending Payment" because mock checkout never produces that state.)
- Each order card: id badge `#<order.id>` (numeric, no `NX-` prefix — keeps us aligned with backend ids), ordered date, status pill (color by status), up-to-3 item thumbnails with `+N` overflow tile, `Total Amount`, two CTAs:
  - **View Details** → `/orders/:id`.
  - **Reorder** → for each line, look up the live product (via existing `/products/:id`); if found, `cart.addItem(product, qty)`, else toast and skip. Then `navigate('/cart')`.

### OrderDetailPage

- Breadcrumb `Account › Orders › #<id>`.
- Bento grid:
  - **Timeline card** (8 cols): four nodes — `Ordered` (always done, `created_at`), `Paid` (`paid_at`), `Shipped` (`shipped_at`), `Delivered` (`delivered_at`). If `status === 'Cancelled'`, replace with a red banner "Cancelled on \<date\>".
  - **Shipping address card** + **Payment method card** (4 cols, stacked).
  - **Items list** (8 cols).
  - **Order summary** (4 cols, sticky on desktop).
- **Cancel button** shown only when `status === 'Paid'`. Confirms inline, calls `PATCH /me/orders/:id/cancel`, refetches the order.
- Return/Refund, Download Invoice, Contact Support buttons are removed from JSX.

### ProfilePage

- Header card: circular avatar image (falls back to a default illustration if `avatar_url` is empty); a small "edit" pencil opens a popover with a single URL input that persists via `PATCH /me`. Name + email displayed beside. The `Pro Member` / `Verified Account` chips are static visual decoration only (no underlying data).
- 2-card bento (Security card hidden):
  - **My Orders** → `/orders`. Subtitle shows count of orders.
  - **Addresses** → `/account/addresses`. Subtitle shows count of saved addresses.
- **Personal Information** form: full name, email (`disabled`), phone, preferred language (`<select>` with only `English (US)` for now), biography. Save Changes → `PATCH /me`.

### AddressesPage

- List of addresses, default tagged with a chip.
- "Add address" reveals an inline `<AddressForm>`.
- Each card has Edit / Delete / Set as default.
- Form fields match the table 1:1.

### Services / context changes

- New: `services/addresses.js`, `services/profile.js`.
- Extend `services/orders.js`: `cancelOrder(id)`, types/fields for new snapshot data.
- `AuthContext`: on mount, re-fetch `/me` if a token exists (already does); on profile save, update the cached `user` so the TopNavBar avatar updates without reload.
- Reuse `ToastContext` for success/error feedback.

## Checkout transaction (server)

1. Open DB transaction.
2. Load cart rows for `userId + productIds`. Empty → `400 Bad Request`.
3. For each row, decrement stock with the existing guarded update (`UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`). `affectedRows !== 1` → `409 Conflict`.
4. Load the chosen `user_addresses` row; missing → `404`; not owner → `403`.
5. Compute totals: subtotal from `price × qty`, `shipping = 5 or 15`, `tax = round(subtotal * 0.08, 2)`, `total = subtotal + shipping + tax`.
6. Insert `orders` row: `status='Paid'`, `paid_at=now()`, payment + shipping snapshot, `payment_txn_id='MOCK-<uuid>'`.
7. Insert `order_items` rows (existing snapshot pattern).
8. `DELETE FROM cart_items WHERE user_id = ? AND product_id IN (...)`.
9. Commit. Return `{ orderId, total, status: 'Paid' }`.

## Cancel transaction (server)

1. Load order, check ownership, check `status === 'Paid'`.
2. For each item: `UPDATE products SET stock = stock + quantity WHERE id = ?` (no guard — we're returning units).
3. Set `status='Cancelled'`, `cancelled_at=now()`. Commit.

## Edge cases

- Empty cart selection on `/checkout` → redirect to `/cart` with a toast.
- No saved addresses → checkout blocks place-order until one is added inline.
- Address deleted mid-checkout → backend `404` → frontend reloads the list and shows a toast.
- Order belongs to another user (`GET /me/orders/:id`) → `403` page redirects to `/orders`.
- Cancel after Shipped → `409` toast "Already shipped".
- Reorder where a product was deleted → skip that line with a per-item toast, still navigate to `/cart`.
- Default address invariant — handled by service transaction on create/update/delete.

## Testing

**Backend Jest:**
- `addresses.service.spec.ts` — CRUD, default invariant on create/update/delete.
- `orders.service.spec.ts` — extend: checkout with address + shipping method affects totals correctly; cancel restores stock; cancel on `Shipped` throws 409.
- `users.service.spec.ts` — extend: PATCH /me updates allowed fields, rejects email/role mutation.

**Backend E2E (`backend/test`):**
- One happy-path: register → add address → cart → checkout → list orders → get detail → cancel → list orders sees `Cancelled`.

**Frontend:** no test harness yet, so manual verification on the dev server:
- Cart → Checkout → place order → land on detail page.
- Reorder from list → cart shows items.
- Cancel from detail → detail re-renders as `Cancelled`, stock visible again on PDP.
- Profile edit → reload → values persist; avatar URL change reflects in TopNavBar.
- Address CRUD including default switching.

## Files touched

**Backend (new):**
- `src/users/dto/update-profile.dto.ts`
- `src/addresses/address.entity.ts`
- `src/addresses/addresses.module.ts`
- `src/addresses/addresses.service.ts`
- `src/addresses/addresses.controller.ts`
- `src/addresses/dto/*.dto.ts`
- `src/addresses/addresses.service.spec.ts`
- `src/orders/dto/cancel-order.dto.ts` (if needed)
- (Maybe) `src/common/bootstrap/status-rename.ts` — idempotent enum data fix.

**Backend (changed):**
- `src/users/user.entity.ts` (new columns)
- `src/users/users.service.ts` (`updateProfile`)
- `src/users/users.controller.ts` (new `GET /me` and `PATCH /me`). The existing `GET /auth/me` stays in place; the new `/me` lives in the users module and shares the same return shape, so the frontend can phase over without breaking auth.
- `src/orders/order.entity.ts` (new columns + enum rename)
- `src/orders/orders.service.ts` (checkout signature, cancel, seller status timestamps)
- `src/orders/orders.controller.ts` (new cancel route)
- `src/orders/dto/checkout.dto.ts` (new fields)
- `src/orders/dto/update-order-status.dto.ts` (accept `Paid`)
- `src/orders/orders.service.spec.ts` (extend)
- `src/app.module.ts` (register `AddressesModule`)

**Frontend (new):**
- `src/pages/CheckoutPage.jsx`
- `src/pages/OrderManagementPage.jsx`
- `src/pages/OrderDetailPage.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/AddressesPage.jsx`
- `src/components/AccountSideNav.jsx`
- `src/components/AddressForm.jsx`
- `src/components/OrderStatusBadge.jsx`
- `src/components/OrderTimeline.jsx`
- `src/services/addresses.js`
- `src/services/profile.js`

**Frontend (changed):**
- `src/router.jsx` (new routes)
- `src/pages/CartPage.jsx` (Checkout button now navigates)
- `src/services/orders.js` (`cancelOrder`, payload shape)
- `src/context/AuthContext.jsx` (refresh-on-save plumbing)
- `src/components/TopNavBar.jsx` (account link → `/account`)

**Docs:**
- `docs/features/orders.md` (new endpoints + flow)
- `docs/features/profile.md` (new)
- `docs/features/addresses.md` (new)
- `docs/README.md` (rows)
