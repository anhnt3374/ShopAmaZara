# Product embedding index — design (sub-project 2 of 5)

## Context

Second of five sub-projects adding semantic search + personalization to AmaZara.
Sub-project 1 (done) stands up two embedding services + the NestJS `EmbeddingsModule`
(`TextEmbeddingClient`, `ImageEmbeddingClient`). This sub-project **stores and maintains**
the per-product vectors so sub-project 3 can search them.

Decisions locked during brainstorming:
- **Vector store: a Qdrant server** (docker-compose service), accessed from the NestJS
  backend via `@qdrant/js-client-rest`. (The reference project uses Qdrant in local-file mode
  inside a Python process; Node can't embed Qdrant, so we run a server container.)
- **On-CRUD indexing is async best-effort** (after the DB commit, `queueMicrotask`, never blocks
  or fails the request), gated by the existing `EMBEDDINGS_ENABLED` flag.
- **Attribute text is labeled key-value**, skipping empty fields.
- **Backfill is a standalone script** (`npm run index:products`), independent of `seed:all`.

## Goal

A Qdrant `products` collection holding 3 named vectors + a filter/boost payload per product,
kept up to date by a backfill script and by async hooks on product/review writes. No search yet.

## Architecture

```
docker-compose.yml          + qdrant service (volume-backed) + backend QDRANT_URL env
backend/src/search/
  qdrant.constants.ts        COLLECTION, vector names + dims, payload index fields
  qdrant.service.ts          client wrapper: ensureCollection / upsert / upsertMany /
                             setPayload / deletePoint
  product-indexer.service.ts buildDescText / buildAttrText / buildPayload, indexProduct,
                             indexProducts (batch), refreshStats, removeProduct
  search.module.ts           imports EmbeddingsModule + TypeOrm[Review]; provides + exports
                             QdrantService, ProductIndexerService
backend/scripts/index-products.ts   batched backfill; npm script "index:products"
```

Wiring (no circular deps): `ProductsModule` imports `SearchModule`; `ReviewsModule` imports
`SearchModule`. `SearchModule` imports `EmbeddingsModule` and `TypeOrmModule.forFeature([Review])`
but not `ProductsModule`/`ReviewsModule`.

## Qdrant collection `products`

- Named vectors (all `Distance.Cosine`; SP1 already returns L2-normalized vectors):

  | Name | Dim | Source |
  |------|-----|--------|
  | `desc` | 384 | BGE text of the product description |
  | `attr` | 384 | BGE text of the product attributes |
  | `image` | 768 | FG-CLIP image embedding of `imageFirst` |

- **Point id = product id** (uuid).
- **`image` is optional per point.** Text vectors (`desc`/`attr`) essentially never fail; the
  image requires a URL fetch. If the image embedding fails (in `failed[]`), the point is upserted
  with only `desc`+`attr` — Qdrant permits partial named vectors, so it simply won't be a
  candidate on the image vector.
- Payload: `storeId, category, brand, name, image, price (number), discount (number),
  rating (number), reviewCount (number), targetGender, targetAgeGroup, color, sizes, material,
  isPublished (bool), createdAt`.
- Payload indexes (created idempotently in `ensureCollection`): keyword on
  `category, brand, storeId, targetGender`; float on `price`; bool on `isPublished`.

## Vector inputs

- **desc** (BGE, passage / `isQuery=false`):
  `name: <name> | short description: <shortDescription> | description: <longDescription>`
  — omit any segment whose value is empty/null.
- **attr** (BGE, passage):
  `color: <colors> | sizes: <availableSizes> | material: <material> | gender: <targetGender> | age: <targetAgeGroup>`
  — omit empty segments; array fields (colors, sizes) joined with `, `.
- **image** (FG-CLIP): `imageFirst` URL → `ImageEmbeddingClient.embedImages([url])`.

`buildDescText` / `buildAttrText` are pure functions (unit-tested). If both desc and attr text
come out empty (no data), the product is still indexed (image vector + payload) — but in practice
`name` is always present so `desc` is non-empty.

## Indexing paths

1. **Backfill** — `backend/scripts/index-products.ts`, run via `npm run index:products`:
   - Bootstraps a Nest application context; requires Qdrant + both embedding services reachable.
   - `QdrantService.ensureCollection()`.
   - One `GROUP BY product_id` query over `reviews` → `{ rating, reviewCount }` map.
   - Iterate published+unpublished products in batches (e.g. 64): build desc/attr texts + image
     URLs for the batch, call `TextEmbeddingClient.embed` (desc batch, then attr batch) and
     `ImageEmbeddingClient.embedImages` (image batch), assemble points, `QdrantService.upsertMany`.
   - Log per-batch progress and any failures; continue on error.

2. **On product CRUD** — in `ProductsService` (`createForStore`, `updateForStore`,
   `createManyForStore`, `deleteForStore`): after the DB write succeeds, schedule indexing with
   `queueMicrotask`. Create/update → `ProductIndexerService.indexProduct(product)`; delete →
   `removeProduct(id)`; bulk → `indexProducts(products)`. Wrapped in try/catch that only logs;
   never throws into the request. No-op when `EMBEDDINGS_ENABLED=false`.

3. **On review change** — in `ReviewsService` (create/update/delete): async best-effort
   `ProductIndexerService.refreshStats(productId)` — recompute `rating`/`reviewCount` and do a
   **payload-only** Qdrant update (`setPayload`, no re-embedding). Keeps boost data fresh cheaply.

`ProductIndexerService.indexProduct(product, stats?)` computes `{rating, reviewCount}` from the
`Review` repo when `stats` is not supplied (CRUD path); the backfill passes precomputed stats.

## Config

| Var | Default | Notes |
|-----|---------|-------|
| `QDRANT_URL` | `http://qdrant:6333` | backend → Qdrant server |
| `QDRANT_COLLECTION` | `products` | collection name |
| `EMBEDDINGS_ENABLED` | `true` | (existing) when `false`, all indexing paths are no-ops |

`docker-compose.yml`: a `qdrant` service (image `qdrant/qdrant`), a named volume for
`/qdrant/storage`, ports `6333` (REST) / `6334` (gRPC). Backend gets `QDRANT_URL=http://qdrant:6333`.
Backend does not hard-`depends_on` Qdrant for startup correctness, but a `depends_on: qdrant`
(without health gating) is acceptable so it's up for indexing.

## Error handling

- On-CRUD/review hooks never propagate errors to the API — they log and drop (the backfill is the
  recovery path).
- `QdrantService` surfaces clear errors to the backfill script (which logs + continues per item).
- Image-embed failures degrade to a point without the `image` vector (see above), not a hard error.

## Testing

- **Unit (Jest):**
  - `buildDescText` / `buildAttrText`: format correctness, empty-field skipping, array joining.
  - `ProductIndexerService.indexProduct`: with mocked `TextEmbeddingClient` /
    `ImageEmbeddingClient` / `QdrantService`, assert it builds the right texts, requests the
    embeddings, and upserts a point with `desc`+`attr` (+`image` only when the embed succeeded)
    and the expected payload. A second case: image in `failed[]` → point upserted without `image`.
  - `refreshStats`: mocked repo + Qdrant, asserts a payload-only `setPayload` with recomputed
    rating/reviewCount.
- **Manual / end-to-end (user runs after the full feature):** `docker compose up qdrant text-embed
  image-embed backend`, `npm run index:products`, then inspect the collection
  (`GET http://localhost:6333/collections/products`) for point count and vector config.

## Out of scope (later sub-projects)

- Search / query embedding / weighted ranking (0.55/0.25/0.10/0.10) / `/products` + chatbot
  integration — sub-project 3.
- Behavior events + weights — sub-project 4.
- User preference vectors + profile (color/size counts, order-price totals) + re-ranking —
  sub-project 5.
