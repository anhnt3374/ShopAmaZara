# Semantic search + personalization

End-to-end semantic product search with per-user personalization, built across five sub-projects
(specs in `docs/superpowers/specs/2026-05-27-*` + `2026-05-28-personalization-design.md`; plans
under `docs/superpowers/plans/`).

## Pieces

1. **Embedding services** (`ml/text-embed`, `ml/image-embed`) — two FastAPI microservices:
   `BAAI/bge-small-en-v1.5` (text, 384d) and `qihoo360/fg-clip2-base` (FG-CLIP 2 image, 768d), GPU by
   default (cu130). Called from NestJS via `EmbeddingsModule` (`TextEmbeddingClient`,
   `ImageEmbeddingClient`).
2. **Product index** (`backend/src/search`) — a Qdrant `products` collection with 3 named cosine
   vectors (`desc`, `attr`, `image`) + a filter/boost payload, maintained by `ProductIndexerService`.
   Backfill: `npm run index:products`; on-write async hooks keep it fresh.
3. **Search ranking** (`SearchService`) — weighted fusion `0.55·desc + 0.25·attr + 0.10·image +
   0.10·boost` (review-damped catalog boost), wired into `ProductsService.list` with a LIKE fallback;
   the chatbot `search_products` tool inherits it.
4. **Behavior tracking** (`backend/src/behavior`) — `user_product_events` records weighted events
   (purchase +5, add_to_cart +4, remove_from_cart −2, add/remove wishlist +3/−2, review
   5/4/3/1–2 → +4/+3/+1/−3, view +1) via async hooks on order/cart/wishlist/review writes and
   `POST /me/events/view`.
5. **Personalization** (`backend/src/personalization`) — per-user preference vectors (recency-decayed,
   positive-net weighted sum of liked products' embeddings) blended into ranking
   (`final = (1-α)·query + α·personalization`, α=0.25); `GET /me/profile` exposes color/size/price
   hints. Storefront search is personalized via an optional-auth guard; the chatbot via its user
   context. Guests / no-history users get unchanged ranking.

## Run it

```bash
docker compose up -d                    # mysql + backend + frontend + qdrant + text-embed + image-embed (GPU)
cd backend && npm run index:products    # backfill the Qdrant index (needs the embed services up)
```

Search a query on the storefront or in the chatbot. A logged-in buyer's ranking shifts toward their
taste once they accumulate behavior. Master switch: `EMBEDDINGS_ENABLED` (when `false`, search falls
back to SQL `LIKE` and personalization is a no-op). Tuning knobs (`SEARCH_*`, `PERSONALIZATION_*`) and
model/device settings are in `backend/.env.example`.

## Key endpoints

- `GET /products?q=…` — semantic search (optional auth → personalized for logged-in buyers).
- `POST /me/events/view { productId }` — record a product view (buyers).
- `GET /me/profile` — color/size/order-price hints for the current buyer.

## Query cache
`SearchService` holds an in-memory exact-match cache: ranked hits keyed by the
normalized query + filters + personalization (anonymous / no-history requests
share one entry; personalized results are keyed per user). A repeated query is
served without re-embedding or re-querying Qdrant, and because pagination only
slices the cached hits in `ProductsService.list`, **paging never re-calls the
embed/Qdrant pipeline**. Only the hit list (ids + scores) is cached — product
rows are still fetched fresh from MySQL per page, so prices/stock stay current.
Entries expire after `SEARCH_CACHE_TTL_MS` (default 60000; `0` disables) with an
LRU cap of `SEARCH_CACHE_MAX` (default 500); staleness self-heals via the TTL.

## Notes / future work
- The boost and preference vectors are catalog- and behavior-driven; there is no standalone
  "recommended for you" feed, and the q-absent default-browse path is not personalized.
- Embedding services require a GPU (or `EMBED_DEVICE=cpu`) and download model weights on first run.
