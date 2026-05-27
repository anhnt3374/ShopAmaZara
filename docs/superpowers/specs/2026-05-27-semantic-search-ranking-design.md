# Semantic search ranking — design (sub-project 3 of 5)

## Context

Third of five sub-projects. SP1 stood up the embedding services + NestJS clients; SP2 built and
maintains the Qdrant `products` collection (3 named vectors `desc`/`attr`/`image` + payload).
This sub-project turns a text query into ranked results using a weighted blend of those vectors
plus a catalog boost, and wires it into the existing product search so both the storefront and
the chatbot use it.

Decisions locked in brainstorming:
- **App-side fusion** (mirrors the reference `dual_ann`): ANN per named vector in Qdrant → union
  candidates → retrieve vectors+payload → fuse in Node. Needed because the boost signal is
  payload-derived (discount/rating/reviewCount), not a vector.
- **Boost** = review-confidence-damped: `0.5·(discount/100) + 0.5·(rating/5)·conf`,
  `conf = min(1, ln(1+reviewCount)/ln(50))`.
- **`q` present → semantic** via Qdrant **with fallback to the existing `LIKE` query** when
  disabled / error / zero hits. **`q` absent → unchanged SQL list.**
- **Relevance wins**: when `q` is present the `sort` param is ignored (filters still apply).
- **Scores stay internal** (logging/debug); the `/products` response DTO is unchanged.

## Goal

A `SearchService` that returns products ranked by `0.55·desc + 0.25·attr + 0.10·image + 0.10·boost`
for a query+filters, plus the `ProductsService.list` wiring (with LIKE fallback). The chatbot's
`search_products` tool inherits this through `list` with no tool change.

## Architecture

```
backend/src/search/
  search.constants.ts   WEIGHTS {desc .55, attr .25, image .10, boost .10} (env-overridable),
                        CANDIDATE_K (100), RESULT_CAP (200)
  search.filter.ts      buildFilter(filters) -> Qdrant Filter | undefined  (pure)
  search.service.ts     SearchService.search(params) -> RankedHit[]
  qdrant.service.ts     + searchVector(name, vector, filter, limit): Promise<string[]>
                        + retrieveWithVectors(ids): Promise<RetrievedPoint[]>
```

`SearchModule` already imports `EmbeddingsModule` (text+image clients) and provides `QdrantService`;
it adds `SearchService` to providers/exports. `ProductsModule` already imports `SearchModule`
(SP2), so `ProductsService` can inject `SearchService` (`@Optional()`).

Types:
```
RankedHit = { id: string; score: number; components: { desc: number; attr: number; image: number; boost: number } }
RetrievedPoint = { id: string; payload: Record<string, unknown>; vectors: { desc?: number[]; attr?: number[]; image?: number[] } }
SearchParams = { query: string; category?: string[]; brand?: string[]; storeId?: string[];
                 minPrice?: number; maxPrice?: number; gender?: string; ageGroup?: string }
```

## Data flow — `SearchService.search(params): Promise<RankedHit[]>`

1. **Embed the query twice** (parallel):
   - `qBge = (await text.embed([query], { isQuery: true }))[0]` — for `desc` + `attr`.
   - `qClip = (await image.embedText([query]))[0]` — FG-CLIP text encoder, for `image`.
2. **Build the hard filter** (`buildFilter`): `isPublished=true` (must) + MatchAny on
   `category`/`brand`/`storeId`/`targetGender` (only the keys provided) + a `price` range
   (`gte minPrice`, `lte maxPrice`) + `targetAgeGroup` match when provided.
3. **ANN** on the three named vectors via `QdrantService.searchVector`, each `limit=CANDIDATE_K`,
   same filter: `desc`+`attr` with `qBge`, `image` with `qClip`. **Union** the returned ids.
   (Run the three in parallel.)
4. **Retrieve** the union with `QdrantService.retrieveWithVectors(ids)` (vectors + payload).
5. **Score & fuse** each candidate (L2-normalized vectors → cosine = dot product):
   - `sDesc = max(0, dot(qBge, descVec))`; `sAttr = max(0, dot(qBge, attrVec))`;
     `sImage = max(0, dot(qClip, imageVec))`. A **missing** named vector contributes `0`.
   - `sBoost = clamp01( 0.5·(discount/100) + 0.5·(rating/5)·conf )`,
     `conf = min(1, Math.log1p(reviewCount)/Math.log(50))`.
   - `fused = W.desc·sDesc + W.attr·sAttr + W.image·sImage + W.boost·sBoost`.
6. **Sort** by `fused` desc; cap at `RESULT_CAP`; return `RankedHit[]`. Log a one-line summary
   (query, candidate count, kept) — components are for logs/debug only.

`dot(a, b)` is a plain loop (vectors are short: 384/768); no numpy needed. If both query
embeddings fail to produce a vector the method throws (caller falls back).

## Integration — `ProductsService.list`

Add `@Optional() private readonly search?: SearchService`. Branch at the top of `list`:

- **Semantic path** — when `dto.q` is set, `EMBEDDINGS_ENABLED !== 'false'`, and `this.search` is
  present:
  1. `hits = await this.search.search({ query: dto.q, category, brand, storeId, minPrice, maxPrice, gender, ageGroup })`.
  2. If `hits.length === 0` → **fall through to the LIKE path** (below).
  3. Else: `total = hits.length`; slice the ranked ids to the page (`(page-1)*limit .. +limit`);
     `findBy({ id: In(pageIds) })`; reorder rows to match the sliced ranking; map `toProductSummary`;
     return `{ items, total, page, limit }`. The `sort` param is ignored.
  4. Wrap in try/catch — any SearchService error → fall through to the LIKE path.
- **LIKE / SQL path** — the existing `list` implementation, unchanged, used when: `dto.q` absent,
  embeddings disabled, no `SearchService`, semantic error, or zero semantic hits.

To keep this readable, the current SQL body of `list` moves into a private `listSql(dto)`; the new
`list(dto)` decides semantic-vs-SQL and delegates. `listForStore` and the other methods are untouched.

The chatbot `search_products` tool calls `ProductsService.list({ q, minPrice, maxPrice, category, page, limit })`
— no change; it gets semantic results automatically.

## Config

| Var | Default |
|-----|---------|
| `SEARCH_WEIGHT_DESC` | `0.55` |
| `SEARCH_WEIGHT_ATTR` | `0.25` |
| `SEARCH_WEIGHT_IMAGE` | `0.10` |
| `SEARCH_WEIGHT_BOOST` | `0.10` |
| `SEARCH_CANDIDATE_K` | `100` |
| `SEARCH_RESULT_CAP` | `200` |
| `EMBEDDINGS_ENABLED` | `true` (existing; gates the semantic path) |

## Error handling

SearchService propagates embedding/Qdrant errors; `ProductsService.list` catches them (and empty
results) and falls back to LIKE, so storefront/chatbot search never fails because the AI stack is
down. The SP1/SP2 clients already enforce timeouts.

## Testing

- **Jest units:**
  - `buildFilter`: correct condition shapes; omits absent keys; returns `undefined` when no filters.
  - `SearchService.search` with **mocked** `QdrantService` + embedding clients: the weighted-blend
    math, missing-vector→0, the boost formula incl. review damping (e.g. rating 5 / 1 review ranks
    below rating 5 / 200 reviews), descending sort, and `RESULT_CAP`.
  - `ProductsService.list` fallback: mocked `SearchService` returning `[]` or throwing → the LIKE
    path runs; `q` absent → SQL path; happy path → ranked ids loaded + reordered.
- **Manual / end-to-end (your pass):** with Qdrant + embed services up and the index backfilled,
  `GET /products?q=bluetooth headphones under 1 million` returns relevant ranked items; the chatbot
  "find bluetooth headphones" shows a sensible list; disabling `EMBEDDINGS_ENABLED` falls back to LIKE.

## Scope boundary

SP3 = query → ranked results + `list` wiring. **No** behavior tracking (SP4); **no** user-preference
vectors, profile, or personalized re-ranking (SP5). The boost is catalog-level (discount/rating),
not user-specific.
