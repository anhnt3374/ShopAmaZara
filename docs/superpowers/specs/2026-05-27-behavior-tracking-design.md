# Behavior tracking — design (sub-project 4 of 5)

## Context

Fourth of five sub-projects. SP1–SP3 built the embedding services, the Qdrant product index, and
weighted semantic search. This sub-project **records weighted user-behavior events** so SP5 can
aggregate them into per-user preference vectors and a profile. SP4 only writes events; SP5 reads
them.

Decisions locked in brainstorming:
- **Idempotent views**: one `view` event per (user, product) — first view `+1`, repeats ignored.
- **Append-only log + review upsert**: purchase / wishlist-add / wishlist-remove / view are
  immutable appended rows; `review` is a single upserted row per (user, product) reflecting the
  current rating (deleted when the review is deleted). SP5 just `SUM(weight)`.
- **Dedicated authenticated endpoint** `POST /me/events/view` for views.
- **Frontend trigger included**: `ProductDetailPage` fires the view (authenticated buyers only).

## Goal

A `user_product_events` table + `BehaviorService` that records weighted events, wired into the
order/wishlist/review write paths and a new view endpoint, with the frontend firing views. No
aggregation (that's SP5).

## Architecture

```
backend/src/behavior/
  behavior-event.entity.ts   UserProductEvent  (table user_product_events)
  behavior.service.ts        recordPurchase / recordWishlistAdd / recordWishlistRemove /
                             recordReview / removeReview / recordView
  behavior.controller.ts     POST /me/events/view  (JwtAuthGuard, @CurrentUser)
  behavior.module.ts         TypeOrm[UserProductEvent]; provides + exports BehaviorService
backend/src/app.module.ts    register UserProductEvent in the TypeORM entities list + BehaviorModule
+ orders/cart/wishlist/reviews modules import BehaviorModule; their services fire events (@Optional)
frontend/src/services/events.js          recordView(productId)
frontend/src/pages/ProductDetailPage.jsx fire recordView on mount when authed buyer
```

Wiring (no cycles): `OrdersModule` / `CartModule` / `WishlistModule` / `ReviewsModule` import `BehaviorModule`;
`BehaviorModule` imports only `TypeOrmModule.forFeature([UserProductEvent])` (+ the auth guard
plumbing its controller needs). It does not import those modules back.

## Table `user_product_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | char(36) PK | uuid |
| `user_id` | bigint unsigned | matches users.id / reviews.user_id |
| `product_id` | char(36) | |
| `type` | enum(`purchase`,`add_to_cart`,`remove_from_cart`,`add_to_wishlist`,`remove_wishlist`,`review`,`view`) | |
| `weight` | int (signed) | resolved at write time |
| `created_at` | timestamp | |

Indexes: `(user_id, product_id)` (SP5 aggregation + lookups) and `(user_id, product_id, type)`
(view/review lookups). **Append-only** except: `view` is idempotent (insert only if no view row
exists for the pair) and `review` is a single upserted row per pair (both enforced in
`BehaviorService`, since MySQL lacks partial unique indexes). `purchase` rows are NOT unique — buying
the same product in two orders appends two `+5` events.

## Weights

`purchase +5 · add_to_cart +4 · remove_from_cart -2 · add_to_wishlist +3 · remove_wishlist -2 · view +1`
(cart-add is one notch above wishlist-add to reflect stronger purchase intent). Review weight by rating:
`5 → +4`, `4 → +3`, `3 → +1`, `2 → -3`, `1 → -3`. A `reviewWeight(rating)` helper:
`rating >= 5 ? 4 : rating === 4 ? 3 : rating === 3 ? 1 : -3`. Fixed weights live in a `WEIGHTS`
constant.

## `BehaviorService`

All methods are safe no-ops on error in the calling context (callers fire-and-forget); the service
itself just performs the DB write.

- `recordPurchase(userId, productIds: string[])` — one `purchase` row per product id (dedup the
  input array first). Empty array → no-op.
- `recordCartAdd(userId, productId)` / `recordCartRemove(userId, productId)` — append.
- `recordWishlistAdd(userId, productId)` / `recordWishlistRemove(userId, productId)` — append.
- `recordReview(userId, productId, rating)` — find the existing `review` row for the pair; update
  its `weight` to `reviewWeight(rating)` if present, else insert.
- `removeReview(userId, productId)` — delete the `review` row for the pair (no-op if absent).
- `recordView(userId, productId)` — if a `view` row exists for the pair, no-op; else insert `+1`.

## Write hooks (async best-effort)

Each calling service injects `@Optional() BehaviorService` and fires through a `fireAndForget`
helper (`Promise.resolve().then(fn).catch(log)`), so a tracking failure never affects the request.

- `OrdersService.checkout` and `createFromPreorder`: after the order + items are saved, call
  `recordPurchase(buyerId, productIds)` with the order's product ids.
- `CartService.add` → only when a **new** row is created (the `existing` is null branch), fire
  `recordCartAdd` (a qty increment is not a new add); `CartService.remove` and the
  `CartService.update` `quantity === 0` deletion branch → `recordCartRemove`. `CartService.clear`
  (and checkout's cart cleanup) do **not** fire a remove event — they are not a disinterest signal.
- `WishlistService.add` → on `created === true`, `recordWishlistAdd`; `remove` → `recordWishlistRemove`.
- `ReviewsService.create` → `recordReview(userId, productId, rating)`; `update` →
  `recordReview(userId, review.productId, review.rating)`; `remove` → `removeReview(userId, productId)`.
  (SP2's `refreshStats` Qdrant hook remains — both fire.)
- `BehaviorController` `POST /me/events/view { productId }` (JwtAuthGuard): `recordView(userId, productId)`,
  return `204`. Errors are caught + logged, still `204` (tracking must not error the client).

## Frontend view trigger

- `frontend/src/services/events.js`: `recordView(productId)` → `POST /me/events/view` via the `api`
  wrapper; swallow failures.
- `ProductDetailPage.jsx`: in an effect keyed on the product id, when `isAuthenticated && user.role === 'buyer'`,
  call `recordView(id)` once per mount. Guests/sellers do not track.

## Error handling / gating

Behavior tracking is independent of `EMBEDDINGS_ENABLED` — plain DB writes feeding SP5. No new env
flag. The `@Optional()` injection + fire-and-forget pattern means hooks are inert if `BehaviorModule`
is absent and never propagate errors into checkout/wishlist/review/view.

## Testing

- **Jest units (`BehaviorService`):** `reviewWeight` mapping (5/4/3/2/1); `recordView` idempotency
  (skip when a view row exists; insert when not); `recordReview` insert-vs-update; `removeReview`;
  `recordPurchase` inserts one row per (deduped) product, no-op on `[]`. Mock the repo.
- **Hook firing:** verified by mocking `BehaviorService` in the order/wishlist/review service unit
  tests (assert the right `record*` is called after a successful write).
- **View endpoint:** a light controller test (calls `recordView` with the authed user + body productId,
  returns 204).
- **Manual (end-to-end):** as a buyer, purchase / wishlist add+remove / review / open a product →
  `user_product_events` shows rows with the expected weights; viewing the same product twice adds
  only one `view` row.

## Scope boundary

SP4 only **records** events. **No** aggregation, **no** per-user preference vectors, **no** profile
(color/size counts, order-price totals), **no** re-ranking — all of that is sub-project 5, which
consumes this table.
