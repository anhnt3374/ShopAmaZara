# Semantic Search Ranking Implementation Plan (sub-project 3/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank products for a text query by `0.55·desc + 0.25·attr + 0.10·image + 0.10·boost` (app-side fusion over the Qdrant index) and wire it into `ProductsService.list` with a LIKE fallback, so the storefront and chatbot both search semantically.

**Architecture:** A new `SearchService` embeds the query twice (BGE for desc/attr, FG-CLIP text for image), ANN-queries the 3 named vectors in Qdrant, unions candidates, retrieves their vectors+payload, and fuses the weighted blend + a review-damped catalog boost in Node. `ProductsService.list` calls it when `q` is present (relevance sort, falling back to the existing LIKE query on disable/error/empty).

**Tech Stack:** NestJS 10, `@qdrant/js-client-rest`, `@nestjs/config`, TypeORM, Jest. Spec: `docs/superpowers/specs/2026-05-27-semantic-search-ranking-design.md`. Builds on SP1 (`embeddings/`) + SP2 (`search/qdrant.service.ts`, `search/product-indexer.service.ts`, `SearchModule`).

**Verification notes:** Jest via `cd backend && npm test -- <pattern>`; full suite `cd backend && npm test`. Compile gate `cd backend && npx tsc -p tsconfig.build.json --noEmit` (ignore non-zero exit; only `error TS` lines matter — `nest build` is blocked by a root-owned `dist`). Real Qdrant + relevance verified at the user's end-to-end pass.

---

## File Structure

**Create:**
- `backend/src/search/search.constants.ts` — `DEFAULT_WEIGHTS`, `DEFAULT_CANDIDATE_K`, `DEFAULT_RESULT_CAP`.
- `backend/src/search/search.filter.ts` — `SearchFilters` type + `buildFilter(filters)` (pure).
- `backend/src/search/search.service.ts` — `SearchService.search(params)` + `SearchParams`/`RankedHit` types.
- `backend/src/search/search.filter.spec.ts`, `backend/src/search/search.service.spec.ts`.
- `backend/src/products/products.search.spec.ts` — list integration tests.

**Modify:**
- `backend/src/search/qdrant.service.ts` — add `searchVector` + `retrieveWithVectors` (+ `RetrievedPoint` type, extend `QdrantLike`).
- `backend/src/search/qdrant.service.spec.ts` — tests for the two new methods.
- `backend/src/search/search.module.ts` — provide + export `SearchService`.
- `backend/src/products/products.service.ts` — `@Optional() search`/`config`; `list` semantic branch + `listSql`.
- `backend/.env.example` — search weight/limit env vars.

---

### Task 1: QdrantService search + retrieve

**Files:**
- Modify: `backend/src/search/qdrant.service.ts`, `backend/src/search/qdrant.service.spec.ts`

- [ ] **Step 1: Extend `QdrantLike` and add a `RetrievedPoint` type + `extractVectors`**

In `qdrant.service.ts`, add to the `QdrantLike` interface (after `delete`):
```ts
  query(name: string, body: unknown): Promise<{ points: Array<{ id: string | number }> }>;
  retrieve(
    name: string,
    body: unknown,
  ): Promise<Array<{ id: string | number; payload?: Record<string, unknown> | null; vector?: unknown }>>;
```
Add an exported interface near `ProductPoint`:
```ts
export interface RetrievedPoint {
  id: string;
  payload: Record<string, unknown>;
  vectors: ProductVectors;
}
```
Add a module-level helper (next to `pruneVectors`):
```ts
function extractVectors(vector: unknown): ProductVectors {
  if (!vector || typeof vector !== 'object') return {};
  const v = vector as Record<string, unknown>;
  const out: ProductVectors = {};
  if (Array.isArray(v[DESC_VECTOR])) out.desc = v[DESC_VECTOR] as number[];
  if (Array.isArray(v[ATTR_VECTOR])) out.attr = v[ATTR_VECTOR] as number[];
  if (Array.isArray(v[IMAGE_VECTOR])) out.image = v[IMAGE_VECTOR] as number[];
  return out;
}
```

- [ ] **Step 2: Add the two methods to `QdrantService`** (after `deletePoint`)

```ts
  async searchVector(
    vectorName: string,
    vector: number[],
    filter: unknown,
    limit: number,
  ): Promise<string[]> {
    const res = await this.client.query(this.collection, {
      query: vector,
      using: vectorName,
      limit,
      filter,
      with_payload: false,
      with_vector: false,
    });
    return (res.points ?? []).map((p) => String(p.id));
  }

  async retrieveWithVectors(ids: string[]): Promise<RetrievedPoint[]> {
    if (ids.length === 0) return [];
    const recs = await this.client.retrieve(this.collection, {
      ids,
      with_payload: true,
      with_vector: [DESC_VECTOR, ATTR_VECTOR, IMAGE_VECTOR],
    });
    return recs.map((r) => ({
      id: String(r.id),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      vectors: extractVectors(r.vector),
    }));
  }
```

- [ ] **Step 3: Add tests to `qdrant.service.spec.ts`**

Extend `makeClient()` to include the two new methods — change it to:
```ts
function makeClient() {
  return {
    createCollection: jest.fn().mockResolvedValue(undefined),
    createPayloadIndex: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    setPayload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ points: [] }),
    retrieve: jest.fn().mockResolvedValue([]),
  };
}
```
Add these tests inside the `describe('QdrantService', ...)` block:
```ts
  it('searchVector returns the point ids as strings', async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ points: [{ id: 'a' }, { id: 2 }] });
    const svc = new QdrantService(client as any, makeConfig());
    const ids = await svc.searchVector('desc', [1, 2], { must: [] }, 50);
    expect(ids).toEqual(['a', '2']);
    const [name, body] = client.query.mock.calls[0];
    expect(name).toBe('products');
    expect(body).toMatchObject({ using: 'desc', limit: 50, query: [1, 2] });
  });

  it('retrieveWithVectors maps payload + named vectors, [] for no ids', async () => {
    const client = makeClient();
    expect(await new QdrantService(client as any, makeConfig()).retrieveWithVectors([])).toEqual([]);
    client.retrieve.mockResolvedValue([
      { id: 'p1', payload: { category: 'shoes' }, vector: { desc: [1], attr: [2], image: [3] } },
      { id: 'p2', payload: null, vector: { desc: [4] } },
    ]);
    const out = await new QdrantService(client as any, makeConfig()).retrieveWithVectors(['p1', 'p2']);
    expect(out[0]).toEqual({ id: 'p1', payload: { category: 'shoes' }, vectors: { desc: [1], attr: [2], image: [3] } });
    expect(out[1]).toEqual({ id: 'p2', payload: {}, vectors: { desc: [4] } });
  });
```

- [ ] **Step 4: Verify**

Run: `cd backend && npm test -- qdrant.service` → expect 9 passed (7 prior + 2 new).
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 5: Commit**

```bash
git add backend/src/search/qdrant.service.ts backend/src/search/qdrant.service.spec.ts
git commit -m "feat(be): QdrantService searchVector + retrieveWithVectors (SP3)"
```

---

### Task 2: Search constants + filter builder

**Files:**
- Create: `backend/src/search/search.constants.ts`, `backend/src/search/search.filter.ts`, `backend/src/search/search.filter.spec.ts`

- [ ] **Step 1: Create `search.constants.ts`**

```ts
export const DEFAULT_WEIGHTS = { desc: 0.55, attr: 0.25, image: 0.1, boost: 0.1 };
export const DEFAULT_CANDIDATE_K = 100;
export const DEFAULT_RESULT_CAP = 200;
```

- [ ] **Step 2: Write the failing test `search.filter.spec.ts`**

```ts
import { buildFilter } from './search.filter';

describe('buildFilter', () => {
  it('always requires isPublished=true', () => {
    const f = buildFilter({});
    expect(f.must).toContainEqual({ key: 'isPublished', match: { value: true } });
    expect(f.must).toHaveLength(1);
  });

  it('adds MatchAny for category/brand/storeId and value match for gender/age', () => {
    const f = buildFilter({
      category: ['Shoes', 'Bags'],
      brand: ['Acme'],
      storeId: ['s1'],
      gender: 'women',
      ageGroup: 'adult',
    });
    expect(f.must).toContainEqual({ key: 'category', match: { any: ['Shoes', 'Bags'] } });
    expect(f.must).toContainEqual({ key: 'brand', match: { any: ['Acme'] } });
    expect(f.must).toContainEqual({ key: 'storeId', match: { any: ['s1'] } });
    expect(f.must).toContainEqual({ key: 'targetGender', match: { value: 'women' } });
    expect(f.must).toContainEqual({ key: 'targetAgeGroup', match: { value: 'adult' } });
  });

  it('adds a price range with gte/lte when provided', () => {
    expect(buildFilter({ minPrice: 10, maxPrice: 50 }).must).toContainEqual({ key: 'price', range: { gte: 10, lte: 50 } });
    expect(buildFilter({ minPrice: 10 }).must).toContainEqual({ key: 'price', range: { gte: 10 } });
    expect(buildFilter({ maxPrice: 50 }).must).toContainEqual({ key: 'price', range: { lte: 50 } });
  });

  it('omits empty arrays', () => {
    const f = buildFilter({ category: [], brand: undefined });
    expect(f.must).toHaveLength(1); // only isPublished
  });
});
```

- [ ] **Step 3: Implement `search.filter.ts`**

```ts
export interface SearchFilters {
  category?: string[];
  brand?: string[];
  storeId?: string[];
  minPrice?: number;
  maxPrice?: number;
  gender?: string;
  ageGroup?: string;
}

export interface QdrantFilter {
  must: Array<Record<string, unknown>>;
}

export function buildFilter(f: SearchFilters): QdrantFilter {
  const must: Array<Record<string, unknown>> = [{ key: 'isPublished', match: { value: true } }];
  if (f.category?.length) must.push({ key: 'category', match: { any: f.category } });
  if (f.brand?.length) must.push({ key: 'brand', match: { any: f.brand } });
  if (f.storeId?.length) must.push({ key: 'storeId', match: { any: f.storeId } });
  if (f.gender) must.push({ key: 'targetGender', match: { value: f.gender } });
  if (f.ageGroup) must.push({ key: 'targetAgeGroup', match: { value: f.ageGroup } });
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (f.minPrice !== undefined) range.gte = f.minPrice;
    if (f.maxPrice !== undefined) range.lte = f.maxPrice;
    must.push({ key: 'price', range });
  }
  return { must };
}
```

- [ ] **Step 4: Verify**

Run: `cd backend && npm test -- search.filter` → expect 4 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 5: Commit**

```bash
git add backend/src/search/search.constants.ts backend/src/search/search.filter.ts backend/src/search/search.filter.spec.ts
git commit -m "feat(be): search weights + Qdrant filter builder (SP3)"
```

---

### Task 3: SearchService

**Files:**
- Create: `backend/src/search/search.service.ts`, `backend/src/search/search.service.spec.ts`
- Modify: `backend/src/search/search.module.ts`, `backend/.env.example`

- [ ] **Step 1: Write the failing test `search.service.spec.ts`**

```ts
import { SearchService } from './search.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as any;
}

function deps(retrieved: any[]) {
  const text = { embed: jest.fn().mockResolvedValue([[1, 0]]) }; // qBge = [1,0]
  const image = { embedText: jest.fn().mockResolvedValue([[0, 1]]) }; // qClip = [0,1]
  const qdrant = {
    searchVector: jest.fn().mockResolvedValue(retrieved.map((r) => r.id)),
    retrieveWithVectors: jest.fn().mockResolvedValue(retrieved),
  };
  return { text, image, qdrant };
}

describe('SearchService.search', () => {
  it('embeds query twice, fuses the weighted blend, sorts desc', async () => {
    // p1: perfect desc match (desc=[1,0] -> dot with qBge[1,0] = 1); p2: perfect image match only.
    const retrieved = [
      { id: 'p1', payload: { discount: 0, rating: 0, reviewCount: 0 }, vectors: { desc: [1, 0], attr: [1, 0], image: [0, 0] } },
      { id: 'p2', payload: { discount: 0, rating: 0, reviewCount: 0 }, vectors: { desc: [0, 0], attr: [0, 0], image: [0, 1] } },
    ];
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'red shoes' });

    expect(text.embed).toHaveBeenCalledWith(['red shoes'], { isQuery: true });
    expect(image.embedText).toHaveBeenCalledWith(['red shoes']);
    expect(qdrant.searchVector).toHaveBeenCalledTimes(3);
    // p1: 0.55*1 + 0.25*1 + 0.10*0 + 0.10*0 = 0.80 ; p2: 0.10*1 = 0.10
    expect(hits[0].id).toBe('p1');
    expect(hits[0].score).toBeCloseTo(0.8, 5);
    expect(hits[1].id).toBe('p2');
    expect(hits[1].score).toBeCloseTo(0.1, 5);
  });

  it('treats a missing named vector as 0 contribution', async () => {
    const retrieved = [{ id: 'p1', payload: {}, vectors: { desc: [1, 0] } }]; // no attr/image
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'x' });
    expect(hits[0].score).toBeCloseTo(0.55, 5); // only desc contributes
  });

  it('boost: review damping lowers a 1-review 5-star vs a 200-review 5-star', async () => {
    const mk = (id: string, reviewCount: number) => ({
      id,
      payload: { discount: 0, rating: 5, reviewCount },
      vectors: { desc: [0, 0], attr: [0, 0], image: [0, 0] },
    });
    const retrieved = [mk('few', 1), mk('many', 200)];
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'x' });
    const few = hits.find((h) => h.id === 'few')!;
    const many = hits.find((h) => h.id === 'many')!;
    expect(many.components.boost).toBeGreaterThan(few.components.boost);
  });

  it('returns [] when no candidates', async () => {
    const { text, image, qdrant } = deps([]);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    expect(await svc.search({ query: 'x' })).toEqual([]);
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('throws when query embedding is empty', async () => {
    const text = { embed: jest.fn().mockResolvedValue([]) };
    const image = { embedText: jest.fn().mockResolvedValue([]) };
    const qdrant = { searchVector: jest.fn(), retrieveWithVectors: jest.fn() };
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    await expect(svc.search({ query: 'x' })).rejects.toThrow(/embedding/);
  });
});
```

- [ ] **Step 2: Implement `search.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextEmbeddingClient } from '../embeddings/text-embedding.client';
import { ImageEmbeddingClient } from '../embeddings/image-embedding.client';
import { QdrantService } from './qdrant.service';
import { ATTR_VECTOR, DESC_VECTOR, IMAGE_VECTOR } from './qdrant.constants';
import { DEFAULT_CANDIDATE_K, DEFAULT_RESULT_CAP, DEFAULT_WEIGHTS } from './search.constants';
import { buildFilter, SearchFilters } from './search.filter';

export interface SearchParams extends SearchFilters {
  query: string;
}
export interface RankedHit {
  id: string;
  score: number;
  components: { desc: number; attr: number; image: number; boost: number };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function boostScore(payload: Record<string, unknown>): number {
  const discount = Number(payload.discount ?? 0) / 100;
  const rating = Number(payload.rating ?? 0) / 5;
  const reviewCount = Number(payload.reviewCount ?? 0);
  const conf = Math.min(1, Math.log1p(reviewCount) / Math.log(50));
  const v = 0.5 * discount + 0.5 * rating * conf;
  return Math.max(0, Math.min(1, v));
}

@Injectable()
export class SearchService {
  private readonly log = new Logger('SearchService');
  private readonly weights: typeof DEFAULT_WEIGHTS;
  private readonly candidateK: number;
  private readonly resultCap: number;

  constructor(
    private readonly text: TextEmbeddingClient,
    private readonly image: ImageEmbeddingClient,
    private readonly qdrant: QdrantService,
    config: ConfigService,
  ) {
    const num = (key: string, def: number): number => {
      const n = Number(config.get<string>(key, String(def)));
      return Number.isFinite(n) ? n : def;
    };
    this.weights = {
      desc: num('SEARCH_WEIGHT_DESC', DEFAULT_WEIGHTS.desc),
      attr: num('SEARCH_WEIGHT_ATTR', DEFAULT_WEIGHTS.attr),
      image: num('SEARCH_WEIGHT_IMAGE', DEFAULT_WEIGHTS.image),
      boost: num('SEARCH_WEIGHT_BOOST', DEFAULT_WEIGHTS.boost),
    };
    this.candidateK = num('SEARCH_CANDIDATE_K', DEFAULT_CANDIDATE_K);
    this.resultCap = num('SEARCH_RESULT_CAP', DEFAULT_RESULT_CAP);
  }

  async search(params: SearchParams): Promise<RankedHit[]> {
    const [bgeVecs, clipVecs] = await Promise.all([
      this.text.embed([params.query], { isQuery: true }),
      this.image.embedText([params.query]),
    ]);
    const qBge = bgeVecs[0];
    const qClip = clipVecs[0];
    if (!qBge || !qClip) throw new Error('query embedding produced no vector');

    const filter = buildFilter(params);
    const [descIds, attrIds, imageIds] = await Promise.all([
      this.qdrant.searchVector(DESC_VECTOR, qBge, filter, this.candidateK),
      this.qdrant.searchVector(ATTR_VECTOR, qBge, filter, this.candidateK),
      this.qdrant.searchVector(IMAGE_VECTOR, qClip, filter, this.candidateK),
    ]);
    const ids = [...new Set([...descIds, ...attrIds, ...imageIds])];
    if (ids.length === 0) return [];

    const points = await this.qdrant.retrieveWithVectors(ids);
    const hits: RankedHit[] = points.map((p) => {
      const sDesc = p.vectors.desc ? Math.max(0, dot(qBge, p.vectors.desc)) : 0;
      const sAttr = p.vectors.attr ? Math.max(0, dot(qBge, p.vectors.attr)) : 0;
      const sImage = p.vectors.image ? Math.max(0, dot(qClip, p.vectors.image)) : 0;
      const sBoost = boostScore(p.payload);
      const score =
        this.weights.desc * sDesc +
        this.weights.attr * sAttr +
        this.weights.image * sImage +
        this.weights.boost * sBoost;
      return { id: p.id, score, components: { desc: sDesc, attr: sAttr, image: sImage, boost: sBoost } };
    });
    hits.sort((a, b) => b.score - a.score);
    const capped = hits.slice(0, this.resultCap);
    this.log.debug(`q=${JSON.stringify(params.query)} cands=${ids.length} kept=${capped.length}`);
    return capped;
  }
}
```

- [ ] **Step 3: Register in `search.module.ts`**

Add `import { SearchService } from './search.service';`, add `SearchService` to `providers` and to `exports`.

- [ ] **Step 4: Add env docs to `backend/.env.example`**

Append:
```
# Semantic search ranking (sub-project 3)
SEARCH_WEIGHT_DESC=0.55
SEARCH_WEIGHT_ATTR=0.25
SEARCH_WEIGHT_IMAGE=0.10
SEARCH_WEIGHT_BOOST=0.10
SEARCH_CANDIDATE_K=100
SEARCH_RESULT_CAP=200
```

- [ ] **Step 5: Verify**

Run: `cd backend && npm test -- search.service` → expect 5 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 6: Commit**

```bash
git add backend/src/search/search.service.ts backend/src/search/search.service.spec.ts backend/src/search/search.module.ts backend/.env.example
git commit -m "feat(be): SearchService weighted fusion ranking (SP3)"
```

---

### Task 4: Wire semantic search into `ProductsService.list`

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Create: `backend/src/products/products.search.spec.ts`

- [ ] **Step 1: Imports + constructor + helpers in `products.service.ts`**

- Add to imports: `import { ConfigService } from '@nestjs/config';` and `import { SearchService } from '../search/search.service';`. Ensure `Logger` and `Optional` are imported from `@nestjs/common` (added in SP2 — verify).
- Add two constructor params AFTER the existing `@Optional() indexer?` param (so SP2's `new ProductsService(products, reviews, indexer)` still works):
```ts
    @Optional() private readonly search?: SearchService,
    @Optional() private readonly config?: ConfigService,
```
- Add a logger field near the other field(s):
```ts
  private readonly searchLog = new Logger('ProductsService:search');
```
- Add a getter:
```ts
  private get searchEnabled(): boolean {
    return this.config?.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }
```

- [ ] **Step 2: Rename the current `list` body to `listSql` and add the new `list`**

Rename the existing `async list(dto: ListProductsDto): Promise<ListResult> { ... }` to
`private async listSql(dto: ListProductsDto): Promise<ListResult> { ... }` (body unchanged).

Add a new public `list` ABOVE `listSql`:
```ts
  async list(dto: ListProductsDto): Promise<ListResult> {
    if (dto.q && this.searchEnabled && this.search) {
      try {
        const hits = await this.search.search({
          query: dto.q,
          category: dto.category,
          brand: dto.brand,
          storeId: dto.storeId,
          minPrice: dto.minPrice,
          maxPrice: dto.maxPrice,
          gender: dto.gender,
          ageGroup: dto.ageGroup,
        });
        if (hits.length > 0) {
          const page = dto.page ?? 1;
          const limit = Math.min(dto.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
          const start = (page - 1) * limit;
          const pageIds = hits.slice(start, start + limit).map((h) => h.id);
          const rows = await this.products.findBy({ id: In(pageIds) });
          const byId = new Map(rows.map((r) => [r.id, r]));
          const items = pageIds
            .map((id) => byId.get(id))
            .filter((r): r is Product => Boolean(r))
            .map(toProductSummary);
          return { items, total: hits.length, page, limit };
        }
      } catch (err) {
        this.searchLog.warn(
          `semantic search failed, falling back to LIKE: ${(err as Error).message}`,
        );
      }
    }
    return this.listSql(dto);
  }
```
(`In`, `toProductSummary`, `DEFAULT_LIMIT`, `MAX_LIMIT`, `Product` are already imported/defined in this file.)

- [ ] **Step 3: Write `products.search.spec.ts`**

```ts
import { ProductsService } from './products.service';

function qbStub() {
  const qb: any = {};
  for (const m of ['andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}
function prod(id: string): any {
  return {
    id, name: id, shortDescription: null, brand: 'B', category: 'C', storeId: 's', sku: null,
    price: '10.00', salePrice: null, discount: 0, imageFirst: '', stock: 5, isPublished: true,
    availableColors: null,
  };
}
const cfg = { get: (k: string, d?: string) => (k === 'EMBEDDINGS_ENABLED' ? 'true' : d) } as any;
const reviewsRepo = {} as any;

describe('ProductsService.list semantic routing', () => {
  it('q present -> semantic; ranked order; sort ignored; SQL not used', async () => {
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p2', score: 0.9, components: {} }, { id: 'p1', score: 0.5, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1'), prod('p2')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    const res = await svc.list({ q: 'shoes', sort: 'price-asc', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).not.toHaveBeenCalled();
    expect(res.items.map((i) => i.id)).toEqual(['p2', 'p1']);
    expect(res.total).toBe(2);
  });

  it('semantic returns [] -> falls back to SQL', async () => {
    const search = { search: jest.fn().mockResolvedValue([]) };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('semantic throws -> falls back to SQL', async () => {
    const search = { search: jest.fn().mockRejectedValue(new Error('qdrant down')) };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('q absent -> SQL path, search not called', async () => {
    const search = { search: jest.fn() };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ page: 1, limit: 24 } as any);
    expect(search.search).not.toHaveBeenCalled();
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('no SearchService injected -> SQL path', async () => {
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, undefined, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Verify**

Run: `cd backend && npm test -- products.search` → expect 5 passed.
Run: `cd backend && npm test` → FULL suite, expect all pass (incl. the SP2 `products.indexing.spec.ts`, which still constructs `new ProductsService(products, reviews, indexer)` — the new params are `@Optional()`).
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 5: Commit**

```bash
git add backend/src/products/products.service.ts backend/src/products/products.search.spec.ts
git commit -m "feat(be): semantic search in ProductsService.list with LIKE fallback (SP3)"
```

---

## Self-Review

**Spec coverage:**
- App-side fusion (ANN per vector → union → retrieve → fuse) → Task 1 (Qdrant methods) + Task 3 (SearchService). ✓
- Query embedded twice (BGE `isQuery:true` + FG-CLIP `embedText`) → Task 3 Step 2. ✓
- Hard filter (isPublished + category/brand/store/gender/age/price) → Task 2 (`buildFilter`). ✓
- Fusion `0.55/0.25/0.10/0.10`, missing vector → 0, review-damped boost → Task 3 (impl + tests). ✓
- Sort desc + RESULT_CAP → Task 3. ✓
- `ProductsService.list`: semantic when q+enabled+search; ranked-id load + reorder + paginate; sort ignored; LIKE fallback on disabled/error/empty; q-absent → SQL → Task 4. ✓
- Chatbot inherits via `list` (no tool change) — confirmed: no tool file modified. ✓
- Scores internal only (no DTO change) → SearchService returns RankedHit but `list` maps to `ProductSummary`; `/products` DTO untouched. ✓
- Config (`SEARCH_WEIGHT_*`, CANDIDATE_K, RESULT_CAP, EMBEDDINGS_ENABLED) → Task 3 + `.env.example`. ✓
- Tests for buildFilter, fusion, fallback → Tasks 2/3/4. ✓
- Scope: no SP4/SP5 — none added. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type/name consistency:** `QdrantService.searchVector(name, vector, filter, limit): Promise<string[]>` and `retrieveWithVectors(ids): Promise<RetrievedPoint[]>` (Task 1) are called with those exact signatures in `SearchService` (Task 3). `RetrievedPoint.vectors` is `ProductVectors` (`{desc?, attr?, image?}`), matching `extractVectors` and the fusion reads. `buildFilter(SearchFilters): QdrantFilter` (Task 2) is consumed by `SearchService` and `SearchParams extends SearchFilters`. `RankedHit {id, score, components}` (Task 3) is consumed in `list` via `.id` only (Task 4). Vector-name constants `DESC_VECTOR/ATTR_VECTOR/IMAGE_VECTOR` reused from SP2. Weight env keys identical across `SearchService` + `.env.example`. `ProductsService` constructor param order `(products, reviewsRepo, indexer?, search?, config?)` keeps SP2's 3-arg test valid.
