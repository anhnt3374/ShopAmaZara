# Products — catalog

Public catalog APIs backed by MySQL. Data is seeded from
`products.enriched.csv` via `npm run seed:products` in `backend/`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List with `q`, `category[]`, `brand[]`, `storeId[]`, `minPrice`, `maxPrice`, `gender`, `ageGroup`, `sort`, `page`, `limit`. |
| GET | `/products/:id` | Full detail view (parsed JSON columns). |
| GET | `/products/facets` | Distinct categories, brands, price range. Optional `q` narrows it. |

## Response shapes

`ProductSummary`: `id`, `name`, `subtitle`, `brand`, `category`, `storeId`,
`price`, `discount`, `originalPrice`, `image`, `inStock`, `stock`, `colors`.

`ProductDetail` adds `description`, `images`, `highlights`, `availableColors`,
`availableSizes`, `material`, `targetGender`, `targetAgeGroup`, `tags`.

Fields the frontend mocks use but the CSV does not include (`rating`,
`reviewCount`, `features`, `reviews`) are omitted from API responses.

## Search

Case-insensitive `LIKE` across `name`, `brand`, and the `tags` JSON column.
No FULLTEXT index yet.

## Seller routes

All require `Authorization: Bearer <token>` from a seller who owns a store.
`SellerStoreGuard` resolves `req.store` from the seller's `ownerId`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/me` | The authenticated seller's store. |
| GET | `/store/products` | Paginated list, scoped to the store. |
| POST | `/store/products` | Create a product (always pinned to the seller's store). |
| PATCH | `/store/products/:id` | Update; 403 if the product belongs to a different store. |
| DELETE | `/store/products/:id` | Delete; 403 on cross-store access. |
| GET | `/store/inventory` | Rows shaped for `StoreInventoryPage` (sku, name, category, stock, price, status). |

`status` is derived from `stock`: `Out of Stock` (0), `Low Stock` (≤ 10),
`In Stock` (> 10).

## Known follow-ups

- `originalPrice` returns `Infinity` when `discount === 100`. Should clamp to `null`.
- `GET /products` is missing e2e coverage for `category[]`, `brand[]`, `storeId[]`, `gender`, `ageGroup`, and multi-page pagination.
- `StoreProductsController.list` parses `page`/`limit` from raw query strings instead of a validated DTO.
- `ProductsService.updateForStore`'s 28-line `Object.assign` could be a single keyed loop.
- `CartService.add` is non-atomic; concurrent POSTs would surface as a 500 instead of a friendly retry.
- `OrdersService.listForStore` pairs `raw[i]` with `entities[i]` by index; safe today thanks to `GROUP BY o.id` but fragile.
- `StoreOrdersController.list` accepts arbitrary `?status=` strings without validation; bad values silently return `{ items: [] }`.
- `Product.color` JSON column is mapped from CSV but never read by any response shape. Either expose or drop.
- Multi-item checkout rollback is not exercised by an e2e test.
- Frontend is still on mocks; wiring the storefront/seller pages to these APIs is a separate plan.

## Seller product CRUD (extended)

New product columns: `sku`, `model`, `sale_price`, `track_inventory`, `is_published`, `images` (JSON).

- Public `/products` and `/products/:id` filter `is_published = 1`.
- `GET /store/products?status=all|published|drafts&q=&page=&limit=` returns paginated items plus `kpi: { total, inStock, lowStock, outOfStock }`.
- `POST /store/products`, `PATCH /store/products/:id`, `DELETE /store/products/:id` accept the new fields; SKU auto-generates when blank (`NX-<storeShortId>-<random>`); `salePrice` must be `< price`.
- `GET /store/products/:id` returns the full ProductDetail for the seller's own product (returns drafts).
- `POST /store/products/bulk` accepts a `multipart/form-data` file (`.csv`, `.xls`, `.xlsx`, up to 10 MB, 500 rows). Returns `{ created, skippedRows: [{ row, reason }] }`. Required columns: `name`, `sku`, `category`, `price`, `stock`. Optional: `brand`, `salePrice`, `model`, `description`, `imageUrl`, `isPublished`.
- `GET /store/products/bulk/template` streams a sample CSV.

## Uploads

- `POST /uploads/product-image` (seller-only, multipart `file`) returns `{ url: '/static/products/<uuid>.<ext>' }`. Files saved under `backend/uploads/products/` (gitignored). Static served at `/static/*`. Mimetype whitelist: `image/png`, `image/jpeg`, `image/webp`. 5 MB cap.
