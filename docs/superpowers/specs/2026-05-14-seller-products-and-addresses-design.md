# Seller Products + Addresses Re-skin — Design

**Date:** 2026-05-14
**Status:** Draft for review
**Scope:** Seller-side product CRUD (list / add / edit / archive / bulk-import) with multi-image upload, plus a visual re-skin of the buyer `/account/addresses` page. References designs in `frontend/new_design_1/` (ListProduct, AddProduct, ProductEdit, ImportProductModal, AddressManager).

## Goal

1. Give sellers a working UI to manage their catalog: list with KPI tiles, tabs, search, paginated table, "Add Product", per-row actions, "Add Product" form, "Edit Product" form with archive/restore, and bulk CSV/XLS import.
2. Replace URL-only image input with a real upload pipeline (Multer, local disk, Nest static serve).
3. Add a `Draft` / `Published` lifecycle to products so public catalog can hide drafts.
4. Re-skin the existing `/account/addresses` page to match the AddressManager card-grid mock.

## Out of scope

- Product variants (multi-SKU per product).
- Cloudinary / S3 / cloud storage; orphan cleanup of unreferenced uploaded files.
- Sales-channel toggles in AddProduct (cosmetic only).
- Per-variant inventory in ProductEdit's "Inventory & Variants" panel (rendered as one read-only row).
- "Đăng ký giao hàng ưu tiên?" promo banner from AddressManager.
- Vietnamese localization — UI stays English per CLAUDE.md.
- Address `label` enum migration — stays free-text.
- StoreLayout sidebar items beyond Orders / Inventory / Messages.

## Data model

### `products` — extend

| Column | Type | Notes |
|---|---|---|
| `images` | json NULL | Array of URL strings, e.g. `["/static/products/abc.jpg", …]`. `imageFirst` auto-mirrors `images[0]` on save. |
| `is_published` | boolean default `true` | Active vs Draft. Public `/products` filters `is_published = 1`; `/store/products` and `/store/inventory` return both. |
| `sku` | varchar(64) NULL, indexed | Seller-facing identifier. `UNIQUE(store_id, sku)` allowing NULL (MySQL allows multiple NULLs in a UNIQUE index). Auto-generated `NX-<storeShortId>-<6random>` on create when blank. |
| `sale_price` | decimal(10,2) NULL | When set and `< price`, treated as the discounted price. `discount` (existing percent column) becomes derived on save: `round((price - sale_price) / price * 100)`. |
| `track_inventory` | boolean default `true` | When `false`, stock checks during checkout are skipped (always-available). |
| `model` | varchar(128) NULL | Maps to AddProduct "Product Model" input. |

TypeORM `synchronize: true` handles the column additions in dev. The existing `originalPrice = Infinity when discount = 100` bug is fixed in the same pass — read path becomes `originalPrice = sale_price ? Number(price) : null`.

### `user_addresses` — unchanged

Re-skin only. No schema changes.

## API

### Uploads (new)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/uploads/product-image` | `multipart/form-data` with `file` | Authenticated seller only. Multer disk storage, 5 MB cap, mimetype `image/(png\|jpe?g\|webp)`. Returns `{ url: '/static/products/<uuid>.<ext>' }`. |

Static serving wired in `main.ts` via `app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/static/' })`. Folder `backend/uploads/` is gitignored.

### Seller products

| Method | Path | Notes |
|---|---|---|
| GET | `/store/products` (extended) | New query: `?status=all\|published\|drafts` (default `all`), `q=`, `page=`, `limit=`. Response gains `kpi: { total, inStock, lowStock, outOfStock }`. |
| POST | `/store/products` (extended) | DTO accepts `images: string[]`, `sku?: string`, `model?: string`, `salePrice?: number`, `trackInventory?: boolean`, `isPublished?: boolean`. SKU auto-generated if missing or blank. |
| PATCH | `/store/products/:id` (extended) | Same new fields are patchable. Used by Archive (`isPublished: false`) and Restore. |
| DELETE | `/store/products/:id` (unchanged) | |
| POST | `/store/products/bulk` (new) | `multipart/form-data` with `file` (`.csv` / `.xls` / `.xlsx`). Memory storage, 10 MB / 500 rows cap. Returns `{ created: number, skippedRows: [{ row, reason }] }`. |
| GET | `/store/products/bulk/template` (new) | Streams `text/csv` with header row + 1 example row. |

### Public catalog (existing route, behavior change)

`GET /products` and `GET /products/:id` add an implicit `is_published = 1` filter. Drafts return 404 from `/products/:id`.

### Inventory (existing)

`GET /store/inventory` keeps shape. KPI is computed in `GET /store/products` instead so the InventoryKpiCards bento doesn't need its own endpoint.

### Validation rules

- `body.body` (chat) is reused pattern: trimmed strings, max-length per column.
- Product `name` 1-255, `category` 1-255, `brand` 1-255, `price ≥ 0`, `stock ≥ 0`, `salePrice` optional but if present must be `≥ 0` and `< price`.
- Bulk: required columns (case-insensitive header) `name`, `sku`, `category`, `price`, `stock`. Optional `brand`, `salePrice`, `model`, `description`, `imageUrl`, `isPublished`.

## Image upload — flow

**Single image (`POST /uploads/product-image`):**

1. Multer disk-storage saves to `backend/uploads/products/<crypto.randomUUID()>.<orig-ext>`.
2. Only the extension is taken from the original filename; basename is fully random.
3. Returns `{ url: '/static/products/<uuid>.<ext>' }`. No DB write — URL is a hanging asset until referenced by a product save.

**Client (`ImageUploader` component):**

1. Drag-drop or click-to-pick. Multi-file accepted.
2. Per-file client-side validation: mimetype + size. Reject visually with red toast.
3. Pending tile rendered immediately; `uploadProductImage(file)` fires in parallel with concurrency cap 3.
4. On success, replace pending tile with returned URL preview, push URL into form state's `images: string[]`.
5. On failure, tile turns red with inline Retry. Doesn't block other uploads.
6. Drag-and-drop within the grid reorders. First tile is the primary (becomes `imageFirst` on save).

**Orphan cleanup:** not implemented in v1. Accepted tech debt — users who upload then discard leak a small file.

## Bulk import — flow

1. Modal opens. "Download template" link triggers a normal navigation to `/store/products/bulk/template`.
2. User drops/picks a file. Client checks size ≤ 10 MB and extension `.csv` / `.xls` / `.xlsx` before sending.
3. `FormData` POST to `/store/products/bulk`.
4. Server `FileInterceptor` (Multer memory storage, 10 MB cap) hands the buffer to a parser dispatcher:
   - `.csv` → `csv-parse/sync` with `columns: true, skip_empty_lines: true, trim: true`.
   - `.xls`/`.xlsx` → `xlsx` with `read(buffer, { type: 'buffer' })`, take `Sheets[SheetNames[0]]`, `sheet_to_json` with `defval: ''`.
   Both yield `Array<Record<string, string>>`.
5. Server lowercase-trims headers, validates row-by-row, dedupes against existing `(store_id, sku)` AND against earlier rows in the same upload. Auto-generates SKU when blank.
6. Valid rows inserted inside one transaction in chunks of 100. Skipped rows accumulate with row numbers and reasons.
7. Response: `{ created, skippedRows }`.
8. Modal renders summary; success closes modal and refetches the inventory list.

**Skip reasons:** `"Missing name"`, `"Invalid price"`, `"Invalid stock"`, `"Duplicate SKU"`, `"Sale price not less than price"`.

## Frontend

### Routes (under `StoreLayout`)

| Path | Component | Notes |
|---|---|---|
| `/store/inventory` | `pages/store/StoreInventoryPage.jsx` (rewrite) | New layout: KPI cards row, tabs (All / Published / Drafts), search input, paginated table, "Add Product" CTA. |
| `/store/products/new` | `pages/store/StoreProductFormPage.jsx` | Create mode. |
| `/store/products/:id` | `pages/store/StoreProductFormPage.jsx` | Edit mode. Detects `:id` and switches to ProductEdit layout. |

Buyer route `/account/addresses` re-skinned in place (no new route).

### Components

- `pages/store/ProductForm.jsx` — shared form body. Sections: General Information / Product Media (uses `ImageUploader`) / Pricing & Inventory / Categorization / Visibility. Pure state-in / event-out — page owns save/discard.
- `pages/store/ImageUploader.jsx` — drag-drop multi-image. Output: `string[]` URLs. Manages reorder + delete.
- `pages/store/ImportProductModal.jsx` — bulk-import modal. Drop area + download template + result summary with scrollable skipped-rows list.
- `pages/store/InventoryKpiCards.jsx` — 4-tile KPI bento; data from the list response.
- `components/AddressCard.jsx` — re-skinned address card; props `{ address, onEdit, onDelete, onSetDefault }`.

### Services

- `services/uploads.js` (new) — `uploadProductImage(file)`. Wraps `fetch` with `FormData` (since `services/api.js` assumes JSON).
- Extend `services/inventory.js`:
  - `listStoreProducts({ status, q, page, limit })`
  - `createStoreProduct(payload)`
  - `updateStoreProduct(id, payload)`
  - `deleteStoreProduct(id)`
  - `bulkImport(file)`
  - `downloadTemplateUrl()`
  Drop the `USE_MOCKS` + `mocks/inventory.js` branch.

### Form UX

- Save Product disabled until: `name`, `category`, `price ≥ 0`, `stock ≥ 0`, and `images.length ≥ 1`. Sale price optional but if set must be `< price`.
- Discard prompts a `confirm()` when the form is dirty.
- After Save Product (create), navigate to the edit page `/store/products/:id`.
- Edit header: "View on Store" opens `/product/:id` in a new tab. "Archive" PATCHes `isPublished: false` then refetches; button switches to "Restore". "Update Product" PATCHes the form delta then navigates back to `/store/inventory`.

### AddressesPage re-skin

- Card grid (responsive: 3-col desktop, 2-col tablet, 1-col mobile).
- Each card: recipient name + phone (top-left), label chip (top-right), full address, action row at the bottom (Edit / Set as default / Delete; "Set as default" hidden on the current default).
- Default card highlighted with primary border + small badge.
- Dashed "+ Add new address" tile appears as the last grid cell.
- "Add address" reveals the existing `AddressForm` in an inline section above the grid (same component, no new form).

## Edge cases

- **SKU collision within store on bulk import** → row skipped with reason `"Duplicate SKU"`. Against existing row → same reason.
- **CSV with a trailing empty row** → silently ignored (no `name` → not surfaced as "skipped").
- **Excel with multiple sheets** → first sheet only.
- **Image dimensions / quality** → not validated. Mock copy "Recommended: 1000×1000px" is advisory.
- **Same filename uploaded twice** → fine (UUID basenames can't collide).
- **Discard with dirty form / close bulk modal mid-upload** → `confirm()` dialog.
- **Archived product** → still in `/store/inventory` and the KPI bucket it belongs to; hidden from public catalog and `/product/:id`.
- **Sale price ≥ regular price** → form and server both reject.
- **Deleting a product with order history** → `await this.products.remove(product)` succeeds; `order_items.product_id` is just a UUID string (no FK), so historical orders keep their snapshot fields. Accepted (same behavior as today).
- **AddressesPage**: grid breaks to 1-col on narrow screens; dashed tile is always the last cell.

## Testing

**Backend Jest unit:**
- `products.service.spec.ts` — extend: `createForStore` auto-generates SKU when blank; `salePrice < price` accepted, `≥ price` throws 400; `isPublished` defaults to `true`.
- `products.bulk.service.spec.ts` (new) — header case-insensitivity; rejects rows missing required fields; dedupes within upload; respects 500-row cap.

**Backend e2e (`backend/test/store-products.e2e-spec.ts` — extend):**
- Upload 3-row CSV → `{ created: 3, skippedRows: [] }`.
- Upload with 1 duplicate SKU row → `{ created: 2, skippedRows: [{ row: 2, reason: 'Duplicate SKU' }] }`.
- Upload with missing-price row → row appears in `skippedRows` with `reason: "Invalid price"`.
- `POST /store/products` → defaults to `is_published = true`; PATCH to `false`; `GET /products` (public) no longer returns it.
- `POST /uploads/product-image` with a valid PNG fixture → 201 + `{ url }`; with `application/pdf` → 415.

**Frontend (manual on dev server, no harness):**
- Inventory page: tabs filter, search filters, KPI counts match the table.
- Add Product: fill → upload 2 images → Save → land on edit page with images visible.
- Edit Product: Archive → reload → "Draft" status badge; Restore → "Active".
- Bulk import: upload 5-row CSV (1 row missing price) → modal shows "4 created, 1 skipped: row 3 Invalid price".
- AddressesPage re-skin: visually matches AddressManager mock, default chip on the right card, all CRUD still works, dashed Add tile shows up.

## Files touched

**Backend — new:**
- `backend/src/uploads/uploads.module.ts`
- `backend/src/uploads/uploads.controller.ts`
- `backend/src/products/products.bulk.service.ts`
- `backend/src/products/products.bulk.service.spec.ts`
- `backend/src/products/dto/list-store-products.dto.ts`
- `backend/test/fixtures/products-sample.csv`
- `backend/test/fixtures/products-with-duplicate.csv`
- `backend/test/fixtures/products-missing-price.csv`
- `backend/test/fixtures/sample.png` (small binary, for upload test)

**Backend — modified:**
- `backend/src/products/product.entity.ts`
- `backend/src/products/products.service.ts`
- `backend/src/products/products.service.spec.ts`
- `backend/src/products/products.controller.ts`
- `backend/src/products/store-products.controller.ts`
- `backend/src/products/dto/create-product.dto.ts`
- `backend/src/products/dto/update-product.dto.ts`
- `backend/src/products/dto/product-views.ts`
- `backend/src/products/products.module.ts` (register bulk service + multer)
- `backend/src/main.ts` (`useStaticAssets`)
- `backend/src/app.module.ts` (register `UploadsModule`)
- `backend/test/store-products.e2e-spec.ts`
- `backend/.gitignore` (or root) — `uploads/`
- `backend/package.json` — `multer`, `@types/multer`, `csv-parse`, `xlsx`

**Frontend — new:**
- `frontend/src/pages/store/StoreProductFormPage.jsx`
- `frontend/src/pages/store/ProductForm.jsx`
- `frontend/src/pages/store/ImageUploader.jsx`
- `frontend/src/pages/store/ImportProductModal.jsx`
- `frontend/src/pages/store/InventoryKpiCards.jsx`
- `frontend/src/components/AddressCard.jsx`
- `frontend/src/services/uploads.js`

**Frontend — modified:**
- `frontend/src/pages/store/StoreInventoryPage.jsx` (full rewrite)
- `frontend/src/pages/AddressesPage.jsx` (re-skin)
- `frontend/src/services/inventory.js` (drop mocks + new methods)
- `frontend/src/router.jsx` (new `/store/products/new` and `/store/products/:id`)

**Docs:**
- `docs/features/products.md` (note new fields + endpoints)
- `docs/README.md` (new row: Seller product CRUD + bulk import)
