# Product APIs — Design Spec

**Date:** 2026-05-12
**Scope:** Backend APIs for product catalog, wishlist, cart, orders, and store
(seller) management, seeded from `products.enriched.csv`. Frontend integration
follows in a separate plan after the backend lands.

## Goals

- Replace the frontend's mock-backed `services/products.js`, `wishlist`, `cart`,
  `orders`, and `inventory` with real REST endpoints.
- Persist cart and wishlist on the server so they survive cross-device.
- Expose a meaningful seller side: each store in the CSV maps to a real seller
  account that can manage its products, inventory, and orders.
- Keep the existing per-domain NestJS module style (`auth/`, `users/`) so
  each commit ships one focused module.

## Non-goals

- No SKU/variant model in cart/orders (color and size selection is captured by
  the catalog but not carried through purchase yet).
- No real payment integration — `POST /orders/checkout` records the order and
  decrements stock, nothing more.
- No real-time stock or pricing updates pushed to the frontend.
- No fuzzy / relevance-ranked search. Keyword search is a LIKE match.

## Key decisions (locked with the user)

1. **Data ingest** — one-time seed command (`npm run seed:products`) reads
   `products.enriched.csv` from the repo root and upserts into MySQL. CSV stays
   the source of truth in git; DB is the runtime store.
2. **Cart and wishlist storage** — server-side, persisted per user, behind
   `JwtAuthGuard`. Frontend Context hydrates from the API on login and mutates
   via the API.
3. **Store ownership** — seed creates one seller account per unique `store_id`,
   linked as the store's `ownerId`. Login credentials surfaced in the feature
   doc so manual QA can sign in.
4. **Search semantics** — case-insensitive `LIKE` across `name`, `brand`, and
   the `tags` JSON column. No FULLTEXT, no external search service.

## Architecture

### Module map

Following the existing `auth/` + `users/` pattern, add five domain modules and
one script:

```
backend/src/
  stores/         Store entity + StoresService (used by other modules)
  products/       Product entity + public catalog APIs + seller write APIs
  wishlist/       WishlistItem entity + /me/wishlist endpoints
  cart/           CartItem entity + /me/cart endpoints
  orders/         Order + OrderItem entities + checkout, buyer & seller views
  common/
    guards/seller-store.guard.ts   resolves the seller's store, 403 if none
backend/scripts/
  seed-products.ts                 CSV → MySQL upsert
```

Each module follows the project convention:
`*.entity.ts`, `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/*.ts`.
Cross-module needs go through the providing module's exported service (e.g.
`OrdersModule` imports `ProductsModule` to read stock; `StoreController` lives
in `ProductsModule` / `OrdersModule` and uses `StoresService` for the lookup).

### Entities

| Entity | Key fields | Notes |
|--------|-----------|-------|
| `Store` | `id` (UUID, PK — value from CSV), `name`, `slug` (unique), `ownerId` → `users.id`, `createdAt` | One row per distinct CSV `store_id`. |
| `Product` | `id` (UUID, PK — value from CSV), `name`, `brand`, `category`, `storeId`, `price` (decimal), `discount` (smallint, %), `stock` (int), `imageFirst`, `shortDescription`, `longDescription`, `highlights` (JSON), `color` (JSON), `availableColors` (JSON), `availableSizes` (JSON), `material`, `targetGender` (enum: `men`/`women`/`unisex`/`kids`), `targetAgeGroup`, `tags` (JSON), timestamps | Mirrors the CSV. JSON columns stay as JSON; service layer parses on read where needed. |
| `WishlistItem` | `id` (auto), `userId`, `productId`, `createdAt`. Unique on `(userId, productId)` | Thin join. |
| `CartItem` | `id` (auto), `userId`, `productId`, `quantity` (int ≥ 1), `createdAt`, `updatedAt`. Unique on `(userId, productId)` | Increment on re-add. |
| `Order` | `id` (UUID), `buyerId`, `subtotal`, `shipping`, `tax`, `total` (decimals), `status` (`Processing`/`Shipped`/`Delivered`/`Cancelled`), `createdAt` | One status field for the whole order in v1. |
| `OrderItem` | `id` (auto), `orderId`, `productId`, `storeId`, `nameSnapshot`, `priceSnapshot`, `quantity` | `storeId` lets the seller dashboard filter without joining `products`. Snapshots make order history stable. |

### API surface

Paths are unprefixed (matches current `main.ts`). Auth column is `Public` /
`JWT` (buyer or seller) / `Seller` (JWT + `SellerStoreGuard`).

#### Products (public)

| Method | Path | Auth | Body / query | Returns |
|--------|------|------|--------------|---------|
| GET | `/products` | Public | `q`, `category[]`, `brand[]`, `storeId[]`, `minPrice`, `maxPrice`, `gender`, `ageGroup`, `sort` (`featured`/`price-asc`/`price-desc`/`newest`), `page` (default 1), `limit` (default 24, max 60) | `{ items: ProductSummary[], total, page, limit }` |
| GET | `/products/:id` | Public | — | `ProductDetail` (full row, parsed JSON) |
| GET | `/products/facets` | Public | optional `q` | `{ categories: string[], brands: string[], priceRange: { min, max } }` |

`ProductSummary` projection (camelCase JSON):

```
id, name, subtitle (= shortDescription), brand, category, storeId,
price, discount, originalPrice (= round(price / (1 - discount/100), 2) when discount > 0),
image (= imageFirst), inStock (= stock > 0), stock,
colors (= availableColors.map(c => c.hex))
```

`ProductDetail` adds: `longDescription` (as `description`), `images` (array — for
v1 the CSV only has `imageFirst`, so this is `[imageFirst]`; field is kept as
an array so the frontend gallery code keeps working unchanged), `highlights`,
`availableColors`, `availableSizes`, `material`, `targetGender`,
`targetAgeGroup`, `tags`.

**Fields the frontend mocks expose but the CSV does not include:**
`rating`, `reviewCount`, `discountLabel`, `features`, `reviews`. These will be
omitted from API responses. Frontend pages that read them already use optional
chaining or render conditionally; if a page hard-fails on `undefined`, that's a
frontend-side fix outside this backend scope. (A later commit may add a
`features` / `reviews` derivation, but it isn't part of this spec.)

#### Wishlist (JWT)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/me/wishlist` | — | `{ items: ProductSummary[] }` |
| POST | `/me/wishlist` | `{ productId }` | `{ item: WishlistItem }` — idempotent (201 new, 200 existing) |
| DELETE | `/me/wishlist/:productId` | — | `204` |

#### Cart (JWT)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/me/cart` | — | `{ items: CartItemView[], subtotal }` where `CartItemView` hydrates `product` |
| POST | `/me/cart` | `{ productId, quantity }` | `{ item: CartItemView }` — adds or increments |
| PATCH | `/me/cart/:productId` | `{ quantity }` | `{ item }` if `quantity > 0`, `204` if `quantity === 0` (deletes row) |
| DELETE | `/me/cart/:productId` | — | `204` |
| DELETE | `/me/cart` | — | `204` (clear) |

#### Orders (JWT, buyer)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/orders/checkout` | `{ productIds: string[] }` (subset of cart) | `{ orderId, total }` |
| GET | `/me/orders` | — | `{ items: OrderSummary[] }` |
| GET | `/me/orders/:id` | — | `OrderDetail` (items + snapshots) |

#### Store (JWT + `SellerStoreGuard`)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/store/me` | — | `{ store: Store }` |
| GET | `/store/products` | optional `q`, `page`, `limit` | `{ items, total, page, limit }` |
| POST | `/store/products` | `CreateProductDto` | `{ product }` |
| PATCH | `/store/products/:id` | `UpdateProductDto` | `{ product }` (403 if product's `storeId` ≠ caller's store) |
| DELETE | `/store/products/:id` | — | `204` |
| GET | `/store/orders` | optional `status`, `q` | `{ items: StoreOrderView[] }` |
| PATCH | `/store/orders/:id` | `{ status }` | `{ order }` (403 if no items from caller's store) |
| GET | `/store/inventory` | optional `q` | `{ items: InventoryRow[] }` — same as `/store/products` reshaped to match the existing `StoreInventoryPage` (`sku`, `name`, `category`, `stock`, `price`, `status`) |

`StoreOrderView`: `id`, `customer` (buyer.fullName), `email`, `date`,
`status`, `items` (count from this store only), `total` (sum of this store's
order items only).

### Seed script

`backend/scripts/seed-products.ts`:

1. Bootstrap Nest via `NestFactory.createApplicationContext(AppModule)` so
   TypeORM uses the same config as runtime (`.env`-driven).
2. Parse CSV with `csv-parse/sync`.
3. For each distinct `store_id`:
   - upsert a `User` (`email = seller-<first-8-of-uuid>@amazara.local`,
     `fullName = "Seller <first-5>"`, `role = 'seller'`,
     `passwordHash = bcrypt('seller123', 12)`) keyed by email,
   - upsert a `Store` keyed by `id` with `ownerId` from above.
4. Bulk-upsert `Product` rows keyed by `id`. Parse JSON columns defensively
   (CSV stores them as JSON-encoded strings). Coerce numeric columns.
5. Idempotent: rerunning is safe; the script reports rows created vs updated.
6. Add `"seed:products": "ts-node -P tsconfig.json scripts/seed-products.ts"`
   to `backend/package.json`.

### Error handling

- `400 BadRequestException` — empty `productIds` at checkout, requested
  quantity < 1, oversell at add-to-cart time.
- `403 ForbiddenException` — seller acting on a product or order they don't
  own; buyer fetching another buyer's order.
- `404 NotFoundException` — unknown product / order / cart row.
- `409 ConflictException` — stock changed mid-checkout (transaction detects it
  via `UPDATE … WHERE stock >= :qty` returning zero affected rows).

Checkout runs inside `dataSource.transaction(...)`:

1. Load cart rows for the buyer matching `productIds`.
2. For each row, `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty`.
3. If any update affects zero rows → throw 409, transaction rolls back.
4. Insert `Order`, insert `OrderItem` rows with name/price snapshots.
5. Delete the bought cart rows.
6. Return `{ orderId, total }`.

### Auth + guards

- `JwtAuthGuard` (existing) on every `/me/*` and `/store/*` route.
- `SellerStoreGuard` (new, in `common/guards/`): resolves the requesting
  user's owned `Store` once per request, attaches it to `req.store`, throws
  `403` if absent. Used to scope `/store/*` to the caller's store.
- `req.user.role === 'buyer'` is enforced implicitly: only sellers own stores;
  buyers calling `/store/*` get a 403 from the guard.

### Testing

Per existing convention (unit specs next to source, e2e in `backend/test/`):

**Unit specs**

- `products.service.spec.ts` — filter composition, pagination clamps, facet
  query shape.
- `wishlist.service.spec.ts` — idempotent add, scoping by `userId`.
- `cart.service.spec.ts` — increment on duplicate add, quantity zero deletes,
  subtotal calculation.
- `orders.service.spec.ts` — happy-path checkout, oversell triggers 409,
  ownership 403 on `/me/orders/:id`.
- `seller-store.guard.spec.ts` — 403 when no owned store, attaches store
  otherwise.

**E2E specs** (against `amazara_test`)

- `products.e2e-spec.ts` — list filters (`q`, category, price range, sort),
  pagination boundaries, detail, facets, 404.
- `cart-wishlist.e2e-spec.ts` — 401 without token, full add/update/delete
  flows, cross-user isolation.
- `orders.e2e-spec.ts` — checkout success, empty `productIds` 400, oversell
  409, ownership 403 on other buyer's order.
- `store.e2e-spec.ts` — seller can list/edit only their store's products and
  orders; cross-store mutation is 403; `/store/inventory` projects correctly.

Each suite seeds ~10 products / 2 stores / 2 sellers / 1 buyer via a small
`seedTestData()` helper. `synchronize: true` keeps schema in sync for tests.

## Per-feature delivery order (one commit per feature, as requested)

1. **`stores` module + seed script + Store entity** — foundation for everything
   else. Surfaces seeded seller credentials for manual QA.
2. **`products` module — public catalog APIs** — `GET /products`, `:id`, `facets`.
3. **`products` module — seller routes + `SellerStoreGuard`** —
   `/store/products/*`, `/store/inventory`.
4. **`wishlist` module** — `/me/wishlist/*`.
5. **`cart` module** — `/me/cart/*`.
6. **`orders` module — buyer side** — `/orders/checkout`, `/me/orders/*`.
7. **`orders` module — seller side** — `/store/orders/*`.
8. **Docs** — `docs/features/products.md` (catalog + store), `docs/features/cart.md`, `docs/features/wishlist.md`, `docs/features/orders.md`, and an updated `docs/README.md` table row per feature.

Each commit:

- adds entity + service + controller + DTOs + module wiring,
- adds unit specs co-located with the source,
- adds an e2e spec for the new module's surface,
- updates `docs/README.md` and the relevant feature page.

## Open items / explicit deferrals

- **Variant tracking in cart/orders.** Frontend doesn't carry color/size into
  cart today; we keep parity. When this is wanted, add `selectedColor` and
  `selectedSize` to `CartItem` and `OrderItem` and update the checkout flow.
- **Order status per store.** The order has a single status across stores. If
  multi-store fulfillment becomes a concern, move `status` onto `OrderItem`.
- **Payment.** Checkout is purely bookkeeping. No payment gateway, no
  shipping carrier integration.
- **Search ranking.** Keyword `LIKE` is fine at 4.7k rows. Revisit if the
  catalog grows or if relevance becomes a UX complaint.
