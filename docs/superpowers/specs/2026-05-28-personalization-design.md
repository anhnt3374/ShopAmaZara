# Personalization — design (sub-project 5 of 5, finale)

## Context

Final sub-project. It ties together SP2 (Qdrant product vectors), SP3 (semantic search + fusion),
and SP4 (weighted behavior events). It turns a user's behavior into a personalized search
experience: a per-user **preference vector** triple that nudges search ranking toward their taste,
and a **profile** (color/size counts, order-price range) the UI/chatbot can use as filter hints.

Decisions locked in brainstorming:
- **Recency decay**: event weights decay exponentially with age (configurable half-life, default 30 days).
- **Positive-net only**: preference vectors aggregate only products whose decayed net weight is `> 0`
  (the products the user *likes*); net-negative products simply don't contribute.
- **Profile is exposed via API** (`GET /me/profile`) for filter hints; it does **not** affect ranking.
  Ranking personalization is the preference vectors alone.
- **Cached per user** with a TTL, lazily recomputed.
- **Both surfaces**: storefront `GET /products` (optional auth) and the chatbot are personalized.

## Goal

A `PreferenceService` (preference vectors + profile, cached), a `GET /me/profile` endpoint, and a
personalization blend in `SearchService` so a logged-in buyer's semantic search re-ranks toward
their taste. Guests / users with no history get unchanged results.

## Architecture

```
backend/src/personalization/
  preference.service.ts        getPreferenceVectors(userId) + getProfile(userId); per-user TTL cache
  personalization.controller.ts  GET /me/profile  (JwtAuthGuard)
  personalization.module.ts    imports SearchModule (QdrantService) + TypeOrm[UserProductEvent, Order]
backend/src/auth/optional-jwt-auth.guard.ts   attaches req.user if a valid token is present, else passes anonymous
+ search.service.ts            search() gains optional params.userPreference → blend
+ products.service.ts          list(dto, userId?) → fetch prefVectors (@Optional PreferenceService), pass to search
+ products.controller.ts       GET /products uses OptionalJwtAuthGuard, passes req.user?.id to list
+ ai/.../search-products.tool.ts  passes ctx.userId to list
```

**No circular import**: `SearchService` does not depend on `PreferenceService` — the *caller*
(`ProductsService.list`) fetches the preference vectors and passes them into `search`.
`PersonalizationModule` imports `SearchModule` (for `QdrantService`); `SearchModule` never imports
`PersonalizationModule`. `ProductsModule` imports both.

Types:
```
PreferenceVectors = { desc?: number[]; attr?: number[]; image?: number[] }   // each L2-normalized
UserProfile = {
  topColors: Array<{ value: string; count: number }>;
  topSizes:  Array<{ value: string; count: number }>;
  orderPrice: { min: number; max: number; avg: number; count: number };
}
```

## Preference vectors — `getPreferenceVectors(userId): Promise<PreferenceVectors>`

1. **Decayed affinity (one SQL query)** over `user_product_events`:
   ```sql
   SELECT product_id,
          SUM(weight * EXP(-GREATEST(0, TIMESTAMPDIFF(SECOND, created_at, NOW())) / :tauSeconds)) AS score
   FROM user_product_events
   WHERE user_id = :userId
   GROUP BY product_id
   HAVING score > 0
   ORDER BY score DESC
   LIMIT :topN
   ```
   `tauSeconds = halfLifeDays * 86400 / ln(2)` (so `EXP(-age/τ) = 2^(-age/halfLife)`); `topN` default 50.
   Positive-net only (`HAVING score > 0`).
2. If no rows → return `{}` (no personalization).
3. `retrieveWithVectors(productIds)` (SP2) → each product's `{ desc?, attr?, image? }` + payload.
4. For each `k ∈ {desc, attr, image}`: `prefVec_k = L2normalize(Σ_i score_i · productVec_i)` summed over
   products that have vector `k`. If no product has `k`, that pref vector is omitted. A zero-sum
   vector (norm 0) is omitted (clamp guard).
5. Return the (1–3) normalized vectors.

## Profile — `getProfile(userId): Promise<UserProfile>`

- **topColors / topSizes**: tally the `color` and `sizes` payload strings of the same top-N positive
  products from step 3 (split `sizes` on `,`), count occurrences, sort desc, keep the top few.
- **orderPrice**: `SELECT MIN(total) min, MAX(total) max, AVG(total) avg, COUNT(*) count FROM orders WHERE buyer_id = :userId`
  (numbers; `{0,0,0,0}` when no orders).
- Exposed by `GET /me/profile`. Not used in ranking.

## Search blend — `SearchService.search`

`SearchParams` gains optional `userPreference?: PreferenceVectors`. After the existing per-candidate
query `score`, when `userPreference` is present:
- `pers = (Σ_k w_k · max(0, dot(prefVec_k, productVec_k))) / (Σ_k w_k)` over `k` present on **both**
  the preference and the product (reusing the `desc`/`attr`/`image` weight proportions; vectors are
  L2-normalized so dot == cosine).
- `final = (1 - α) · score + α · pers`, `α = PERSONALIZATION_ALPHA` (default `0.25`).
- When `userPreference` is absent or yields no comparable vectors → `final = score` (unchanged).

Re-sort by `final`, cap at `RESULT_CAP` as before. `components` keeps the query parts; an optional
`pers` component may be logged but is not surfaced (scores stay internal, per SP3).

## userId threading

- **`OptionalJwtAuthGuard`** (`backend/src/auth/optional-jwt-auth.guard.ts`): verifies the bearer
  token if present and sets `req.user = { id }`; if absent/invalid, it does **not** throw — the
  request proceeds anonymously (`req.user` undefined). `GET /products` (and `/products/facets`)
  use it; `req.user?.id` is passed to `list`.
- **Chatbot**: the `search_products` tool passes `ctx.userId` into `list`.
- **`ProductsService.list(dto, userId?)`**: when `userId` + `dto.q` + embeddings enabled and a
  `PreferenceService` is injected, fetch `getPreferenceVectors(userId)` and pass it to
  `search.search({ ..., userPreference })`. Any error → unpersonalized search; empty hits → LIKE
  fallback (SP3 behavior unchanged). `@Optional()` `PreferenceService`.

## Caching / config

- In-memory `Map<userId, { vectors, profile, expiresAt }>`; lazy recompute when missing/expired.
  TTL `PERSONALIZATION_TTL_MS` (default `600000`). A single cache entry holds both the vectors and
  the profile (computed together, sharing the one Qdrant retrieve).
- Env: `PERSONALIZATION_ALPHA` (0.25), `PERSONALIZATION_HALF_LIFE_DAYS` (30), `PERSONALIZATION_TOP_N`
  (50), `PERSONALIZATION_TTL_MS` (600000). All gated by `EMBEDDINGS_ENABLED` (off → `getPreferenceVectors`
  returns `{}`, `getProfile` still works from orders/events with empty vector-derived tallies).

## Error handling

`PreferenceService` failures never break search or `/products` — `list` catches and falls through to
unpersonalized/LIKE. `GET /me/profile` returns a best-effort profile (empty arrays / zeros on error).
The optional guard never rejects on a bad token (it just yields anonymous).

## Testing

- **Jest units:**
  - `PreferenceService.getPreferenceVectors`: decayed-affinity SQL params + positive-only mapping
    (mock query result), weighted-normalized aggregation (two products with known vectors/scores →
    expected unit vector), missing-image handling, empty-history → `{}`, cache hit vs expiry (TTL).
  - `getProfile`: color/size tallying from payloads + order-price stats (mock repos/Qdrant); empty user.
  - `SearchService` blend: with `userPreference`, `final = 0.75·score + 0.25·pers`; without it,
    unchanged; product missing a pref-compared vector contributes 0 to `pers`.
  - `ProductsService.list`: `userId` present → fetches prefVectors and forwards as `userPreference`;
    PreferenceService error → unpersonalized search still returns; no `userId`/no service → unchanged.
  - `OptionalJwtAuthGuard`: valid token → `req.user` set, returns true; missing/invalid token →
    returns true with no `req.user` (never throws).
  - `GET /me/profile` controller test.
- **Manual (end-to-end):** a buyer with history searches → ranking shifts toward their taste vs a
  fresh account; `GET /me/profile` returns plausible colors/sizes/price range; guest results match SP3.

## Scope

SP5 personalizes the **semantic search path** (`q` present) on storefront + chatbot, and exposes the
profile. **Out of scope**: a standalone "recommended for you" feed, personalizing the q-absent
default-browse (pure-SQL) path, and profile-driven ranking boosts.

## Feature docs (end of the 5-part feature)

This is the last sub-project. After it lands, add the deferred `docs/features/*` page(s) covering the
whole semantic-search-+-personalization feature (SP1–SP5) and a row in `docs/README.md`, per the
project convention (deferred during SP1–SP4 since the surface only becomes user-visible now).
