# Personalization Implementation Plan (sub-project 5/5, finale)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personalize semantic search for logged-in buyers using per-user preference vectors (recency-decayed weighted sum of liked products' embeddings) blended into ranking, plus a `GET /me/profile` (color/size/price hints).

**Architecture:** A `PreferenceService` computes + caches per-user preference vectors and a profile (shared Qdrant retrieve). `SearchService.search` accepts an optional `userPreference` and blends `final = (1-α)·query + α·personalization` — the *caller* passes the vectors, so SearchModule never depends on PersonalizationModule (no cycle). `ProductsService.list(dto, userId?)` fetches the vectors; the storefront threads the user via an `OptionalJwtAuthGuard`, the chatbot via `ctx.userId`.

**Tech Stack:** NestJS 10 + `@nestjs/passport` + TypeORM (MySQL) + `@nestjs/config` + Jest. Spec: `docs/superpowers/specs/2026-05-28-personalization-design.md`. Builds on SP2 (`QdrantService.retrieveWithVectors`, `ProductVectors`), SP3 (`SearchService`), SP4 (`user_product_events`).

**Verification notes:** Jest via `cd backend && npm test -- <pattern>`; full suite `cd backend && npm test`. Compile gate `cd backend && npx tsc -p tsconfig.build.json --noEmit` (ignore non-zero exit; only `error TS` lines matter — `nest build` is blocked by a root-owned `dist`). Real personalization verified at the user's end-to-end pass.

---

## File Structure

**Create:**
- `backend/src/auth/optional-jwt-auth.guard.ts` — `OptionalJwtAuthGuard`.
- `backend/src/auth/optional-jwt-auth.guard.spec.ts`.
- `backend/src/personalization/preference.service.ts` — `PreferenceService`, `UserProfile` type.
- `backend/src/personalization/personalization.controller.ts` — `GET /me/profile`.
- `backend/src/personalization/personalization.module.ts`.
- `backend/src/personalization/preference.service.spec.ts`.
- `docs/features/semantic-search-personalization.md` (Task 5).

**Modify:**
- `backend/src/search/search.service.ts` — `userPreference` in `SearchParams` + blend + `alpha`.
- `backend/src/search/search.service.spec.ts` — blend tests.
- `backend/src/app.module.ts` — register `PersonalizationModule`.
- `backend/src/products/products.service.ts` — `list(dto, userId?)` + `@Optional() PreferenceService`.
- `backend/src/products/products.controller.ts` — `OptionalJwtAuthGuard` on `list`, pass `req.user?.id`.
- `backend/src/products/products.module.ts` — import `PersonalizationModule`.
- `backend/src/ai/graph/tools/search-products.tool.ts` — pass `ctx.userId` to `list`.
- `backend/src/products/products.search.spec.ts` — userId→preference test.
- `docs/README.md` — completed-features row (Task 5).

---

### Task 1: OptionalJwtAuthGuard

**Files:**
- Create: `backend/src/auth/optional-jwt-auth.guard.ts`, `backend/src/auth/optional-jwt-auth.guard.spec.ts`

- [ ] **Step 1: Write the failing test `optional-jwt-auth.guard.spec.ts`**

```ts
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard.handleRequest', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when authentication succeeded', () => {
    const user = { id: '7' };
    expect(guard.handleRequest(null, user, null, {} as any)).toBe(user);
  });

  it('returns undefined (never throws) when there is no/invalid token', () => {
    expect(guard.handleRequest(null, false, { message: 'No auth token' }, {} as any)).toBeUndefined();
  });

  it('returns undefined even when passport reports an error', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false, null, {} as any)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `optional-jwt-auth.guard.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Like JwtAuthGuard but never rejects: a valid token attaches req.user; a
// missing/invalid token lets the request through anonymously (req.user undefined).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | undefined {
    return user || undefined;
  }
}
```

- [ ] **Step 3: Verify**

Run: `cd backend && npm test -- optional-jwt-auth.guard` → expect 3 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/optional-jwt-auth.guard.ts backend/src/auth/optional-jwt-auth.guard.spec.ts
git commit -m "feat(be): OptionalJwtAuthGuard (attaches user if present, never rejects)"
```

---

### Task 2: PreferenceService + module + profile endpoint

**Files:**
- Create: `backend/src/personalization/preference.service.ts`, `personalization.controller.ts`, `personalization.module.ts`, `preference.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing test `preference.service.spec.ts`**

```ts
import { PreferenceService } from './preference.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as any;
}

// events.query / orders.query are raw-SQL calls; mock per call via a queue.
function makeDeps(opts: {
  affinity?: any[];
  orderPrice?: any;
  points?: any[];
  enabled?: boolean;
}) {
  const events = { query: jest.fn().mockResolvedValue(opts.affinity ?? []) };
  const orders = { query: jest.fn().mockResolvedValue([opts.orderPrice ?? { min: null, max: null, avg: null, count: '0' }]) };
  const qdrant = { retrieveWithVectors: jest.fn().mockResolvedValue(opts.points ?? []) };
  const config = makeConfig({ EMBEDDINGS_ENABLED: opts.enabled === false ? 'false' : 'true' });
  return { events, orders, qdrant, config };
}

describe('PreferenceService.getPreferenceVectors', () => {
  it('aggregates liked products into an L2-normalized vector per named vector', async () => {
    const affinity = [
      { productId: 'a', score: '2' },
      { productId: 'b', score: '1' },
    ];
    const points = [
      { id: 'a', payload: {}, vectors: { desc: [1, 0], attr: [1, 0], image: [0, 1] } },
      { id: 'b', payload: {}, vectors: { desc: [0, 1] } }, // no attr/image
    ];
    const { events, orders, qdrant, config } = makeDeps({ affinity, points });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    const v = await svc.getPreferenceVectors('7');
    // desc = normalize(2*[1,0] + 1*[0,1]) = normalize([2,1])
    const n = Math.hypot(2, 1);
    expect(v.desc![0]).toBeCloseTo(2 / n, 5);
    expect(v.desc![1]).toBeCloseTo(1 / n, 5);
    // attr only from 'a' (b has none) = normalize([1,0]) = [1,0]
    expect(v.attr).toEqual([1, 0]);
    // image only from 'a' = normalize([0,1]) = [0,1]
    expect(v.image![0]).toBeCloseTo(0, 5);
    expect(v.image![1]).toBeCloseTo(1, 5);
  });

  it('returns {} when the user has no positive history', async () => {
    const { events, orders, qdrant, config } = makeDeps({ affinity: [] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    expect(await svc.getPreferenceVectors('7')).toEqual({});
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('returns {} (no Qdrant call) when EMBEDDINGS_ENABLED=false', async () => {
    const { events, orders, qdrant, config } = makeDeps({ enabled: false, affinity: [{ productId: 'a', score: '2' }] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    expect(await svc.getPreferenceVectors('7')).toEqual({});
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('caches the computed entry (second call does not re-query events)', async () => {
    const { events, orders, qdrant, config } = makeDeps({ affinity: [] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    await svc.getPreferenceVectors('7');
    await svc.getPreferenceVectors('7');
    expect(events.query).toHaveBeenCalledTimes(1);
  });
});

describe('PreferenceService.getProfile', () => {
  it('tallies colors/sizes from payloads and aggregates order price', async () => {
    const affinity = [{ productId: 'a', score: '2' }, { productId: 'b', score: '1' }];
    const points = [
      { id: 'a', payload: { color: 'red, black', sizes: 'M, L' }, vectors: { desc: [1, 0] } },
      { id: 'b', payload: { color: 'red', sizes: 'M' }, vectors: { desc: [0, 1] } },
    ];
    const orderPrice = { min: '10.00', max: '90.00', avg: '50.000000', count: '3' };
    const { events, orders, qdrant, config } = makeDeps({ affinity, points, orderPrice });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    const profile = await svc.getProfile('7');
    expect(profile.topColors[0]).toEqual({ value: 'red', count: 2 });
    expect(profile.topSizes.find((s) => s.value === 'M')).toEqual({ value: 'M', count: 2 });
    expect(profile.orderPrice).toEqual({ min: 10, max: 90, avg: 50, count: 3 });
  });
});
```

- [ ] **Step 2: Implement `preference.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProductEvent } from '../behavior/behavior-event.entity';
import { Order } from '../orders/order.entity';
import { ProductVectors, QdrantService, RetrievedPoint } from '../search/qdrant.service';

export interface UserProfile {
  topColors: Array<{ value: string; count: number }>;
  topSizes: Array<{ value: string; count: number }>;
  orderPrice: { min: number; max: number; avg: number; count: number };
}

interface Entry {
  vectors: ProductVectors;
  profile: UserProfile;
  expiresAt: number;
}

function aggregate(points: RetrievedPoint[], scoreById: Map<string, number>, key: keyof ProductVectors): number[] | undefined {
  let acc: number[] | null = null;
  for (const p of points) {
    const v = p.vectors[key];
    if (!v) continue;
    const s = scoreById.get(p.id) ?? 0;
    if (!acc) acc = new Array(v.length).fill(0);
    for (let i = 0; i < v.length; i++) acc[i] += s * v[i];
  }
  if (!acc) return undefined;
  const norm = Math.sqrt(acc.reduce((q, x) => q + x * x, 0));
  if (norm < 1e-12) return undefined;
  return acc.map((x) => x / norm);
}

function tally(map: Map<string, number>, raw: unknown): void {
  String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
}

function top(map: Map<string, number>): Array<{ value: string; count: number }> {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

@Injectable()
export class PreferenceService {
  private readonly log = new Logger('PreferenceService');
  private readonly enabled: boolean;
  private readonly tauSeconds: number;
  private readonly topN: number;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, Entry>();

  constructor(
    @InjectRepository(UserProductEvent) private readonly events: Repository<UserProductEvent>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly qdrant: QdrantService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
    const halfLife = Number(config.get<string>('PERSONALIZATION_HALF_LIFE_DAYS', '30')) || 30;
    this.tauSeconds = (halfLife * 86400) / Math.LN2;
    this.topN = Number(config.get<string>('PERSONALIZATION_TOP_N', '50')) || 50;
    this.ttlMs = Number(config.get<string>('PERSONALIZATION_TTL_MS', '600000')) || 600000;
  }

  async getPreferenceVectors(userId: string): Promise<ProductVectors> {
    return (await this.entry(userId)).vectors;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    return (await this.entry(userId)).profile;
  }

  private async entry(userId: string): Promise<Entry> {
    const now = Date.now();
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > now) return cached;
    const computed = await this.compute(userId);
    const entry: Entry = { ...computed, expiresAt: now + this.ttlMs };
    this.cache.set(userId, entry);
    return entry;
  }

  private async compute(userId: string): Promise<{ vectors: ProductVectors; profile: UserProfile }> {
    const orderPrice = await this.orderPriceStats(userId);
    const emptyProfile: UserProfile = { topColors: [], topSizes: [], orderPrice };
    if (!this.enabled) return { vectors: {}, profile: emptyProfile };

    const rows: Array<{ productId: string; score: string }> = await this.events.query(
      `SELECT product_id AS productId,
              SUM(weight * EXP(-GREATEST(0, TIMESTAMPDIFF(SECOND, created_at, NOW())) / ?)) AS score
       FROM user_product_events
       WHERE user_id = ?
       GROUP BY product_id
       HAVING score > 0
       ORDER BY score DESC
       LIMIT ?`,
      [this.tauSeconds, userId, this.topN],
    );
    if (rows.length === 0) return { vectors: {}, profile: emptyProfile };

    const points = await this.qdrant.retrieveWithVectors(rows.map((r) => r.productId));
    const scoreById = new Map(rows.map((r) => [r.productId, Number(r.score)]));

    const vectors: ProductVectors = {};
    const desc = aggregate(points, scoreById, 'desc');
    const attr = aggregate(points, scoreById, 'attr');
    const image = aggregate(points, scoreById, 'image');
    if (desc) vectors.desc = desc;
    if (attr) vectors.attr = attr;
    if (image) vectors.image = image;

    const colorCounts = new Map<string, number>();
    const sizeCounts = new Map<string, number>();
    for (const p of points) {
      tally(colorCounts, p.payload.color);
      tally(sizeCounts, p.payload.sizes);
    }
    return {
      vectors,
      profile: { topColors: top(colorCounts), topSizes: top(sizeCounts), orderPrice },
    };
  }

  private async orderPriceStats(userId: string): Promise<UserProfile['orderPrice']> {
    const [row]: Array<{ min: string | null; max: string | null; avg: string | null; count: string }> =
      await this.orders.query(
        'SELECT MIN(total) AS min, MAX(total) AS max, AVG(total) AS avg, COUNT(*) AS count FROM orders WHERE buyer_id = ?',
        [userId],
      );
    return {
      min: Number(row?.min ?? 0),
      max: Number(row?.max ?? 0),
      avg: Math.round(Number(row?.avg ?? 0) * 100) / 100,
      count: Number(row?.count ?? 0),
    };
  }
}
```

- [ ] **Step 3: Create `personalization.controller.ts`**

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PreferenceService } from './preference.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class PersonalizationController {
  constructor(private readonly preference: PreferenceService) {}

  @Get('profile')
  profile(@Req() req: Request & { user: { id: string } }) {
    return this.preference.getProfile(req.user.id);
  }
}
```

- [ ] **Step 4: Create `personalization.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProductEvent } from '../behavior/behavior-event.entity';
import { Order } from '../orders/order.entity';
import { SearchModule } from '../search/search.module';
import { PreferenceService } from './preference.service';
import { PersonalizationController } from './personalization.controller';

@Module({
  imports: [SearchModule, TypeOrmModule.forFeature([UserProductEvent, Order])],
  controllers: [PersonalizationController],
  providers: [PreferenceService],
  exports: [PreferenceService],
})
export class PersonalizationModule {}
```

- [ ] **Step 5: Register in `app.module.ts`**

Add `import { PersonalizationModule } from './personalization/personalization.module';` and add `PersonalizationModule` to the top-level `imports:` array (after `BehaviorModule`). (`UserProductEvent` and `Order` are already in the TypeORM entities list.)

- [ ] **Step 6: Verify**

Run: `cd backend && npm test -- preference.service` → expect 6 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add backend/src/personalization/ backend/src/app.module.ts
git commit -m "feat(be): PreferenceService (preference vectors + profile) + GET /me/profile (SP5)"
```

---

### Task 3: SearchService personalization blend

**Files:**
- Modify: `backend/src/search/search.service.ts`, `backend/src/search/search.service.spec.ts`

- [ ] **Step 1: Add the blend tests to `search.service.spec.ts`**

Add inside the existing `describe('SearchService.search', ...)` block:
```ts
  it('blends userPreference into the score: final = 0.75*query + 0.25*pers', async () => {
    // product 'p' has desc=[1,0]; query qBge=[1,0] -> sDesc=1, others 0 -> queryScore = 0.55.
    const retrieved = [{ id: 'p', payload: {}, vectors: { desc: [1, 0] } }];
    const text = { embed: jest.fn().mockResolvedValue([[1, 0]]) };
    const image = { embedText: jest.fn().mockResolvedValue([[0, 1]]) };
    const qdrant = {
      searchVector: jest.fn().mockResolvedValue(['p']),
      retrieveWithVectors: jest.fn().mockResolvedValue(retrieved),
    };
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    // preference desc = [1,0] -> cos(pref.desc, p.desc) = 1; only desc present both sides -> pers = 1.
    const hits = await svc.search({ query: 'x', userPreference: { desc: [1, 0] } });
    // final = 0.75*0.55 + 0.25*1 = 0.4125 + 0.25 = 0.6625
    expect(hits[0].score).toBeCloseTo(0.6625, 4);
  });

  it('no userPreference leaves the score unchanged (query-only)', async () => {
    const retrieved = [{ id: 'p', payload: {}, vectors: { desc: [1, 0] } }];
    const text = { embed: jest.fn().mockResolvedValue([[1, 0]]) };
    const image = { embedText: jest.fn().mockResolvedValue([[0, 1]]) };
    const qdrant = {
      searchVector: jest.fn().mockResolvedValue(['p']),
      retrieveWithVectors: jest.fn().mockResolvedValue(retrieved),
    };
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'x' });
    expect(hits[0].score).toBeCloseTo(0.55, 5);
  });
```
(`makeConfig` already exists in this spec from SP3 — it returns `{ get: (k,d) => overrides[k] ?? d }`, so `PERSONALIZATION_ALPHA` defaults to 0.25.)

- [ ] **Step 2: Implement the blend in `search.service.ts`**

Add `ProductVectors` to the qdrant import:
```ts
import { ProductVectors, QdrantService } from './qdrant.service';
```
Extend `SearchParams`:
```ts
export interface SearchParams extends SearchFilters {
  query: string;
  userPreference?: ProductVectors;
}
```
Add a module-level helper (next to `boostScore`):
```ts
function personalizationScore(
  pref: ProductVectors,
  pv: ProductVectors,
  weights: { desc: number; attr: number; image: number },
): number {
  let num = 0;
  let den = 0;
  if (pref.desc && pv.desc) { num += weights.desc * Math.max(0, dot(pref.desc, pv.desc)); den += weights.desc; }
  if (pref.attr && pv.attr) { num += weights.attr * Math.max(0, dot(pref.attr, pv.attr)); den += weights.attr; }
  if (pref.image && pv.image) { num += weights.image * Math.max(0, dot(pref.image, pv.image)); den += weights.image; }
  return den > 0 ? num / den : 0;
}
```
Add an `alpha` field, read in the constructor (alongside the existing `num()` reads):
```ts
  private readonly alpha: number;
```
```ts
    this.alpha = num('PERSONALIZATION_ALPHA', 0.25);
```
In `search`, change the per-candidate scoring so the returned `score` blends personalization when `params.userPreference` is set. Replace the `const score = ...; return { id: p.id, score, components: {...} };` block with:
```ts
      const queryScore =
        this.weights.desc * sDesc +
        this.weights.attr * sAttr +
        this.weights.image * sImage +
        this.weights.boost * sBoost;
      const score = params.userPreference
        ? (1 - this.alpha) * queryScore +
          this.alpha * personalizationScore(params.userPreference, p.vectors, this.weights)
        : queryScore;
      return { id: p.id, score, components: { desc: sDesc, attr: sAttr, image: sImage, boost: sBoost } };
```

- [ ] **Step 3: Verify**

Run: `cd backend && npm test -- search.service` → expect 8 passed (6 prior + 2 new).
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 4: Commit**

```bash
git add backend/src/search/search.service.ts backend/src/search/search.service.spec.ts
git commit -m "feat(be): blend user preference into search ranking (SP5)"
```

---

### Task 4: Thread userId + integrate preference into list

**Files:**
- Modify: `backend/src/products/products.service.ts`, `products.controller.ts`, `products.module.ts`, `ai/graph/tools/search-products.tool.ts`, `backend/src/products/products.search.spec.ts`

- [ ] **Step 1: `products.module.ts` — import `PersonalizationModule`**

Add `import { PersonalizationModule } from '../personalization/personalization.module';` and add `PersonalizationModule` to the `imports:` array (alongside `SearchModule`).

- [ ] **Step 2: `products.service.ts` — inject PreferenceService + `list(dto, userId?)`**

Add `import { PreferenceService } from '../personalization/preference.service';`. Add a constructor param AFTER the existing `@Optional() config?` (last param):
```ts
    @Optional() private readonly preference?: PreferenceService,
```
Change the `list` signature and the semantic branch to fetch + forward the preference:
```ts
  async list(dto: ListProductsDto, userId?: string): Promise<ListResult> {
    if (dto.q && this.searchEnabled && this.search) {
      try {
        let userPreference;
        if (userId && this.preference) {
          try {
            userPreference = await this.preference.getPreferenceVectors(userId);
          } catch (err) {
            this.searchLog.warn(`preference fetch failed: ${(err as Error).message}`);
          }
        }
        const hits = await this.search.search({
          query: dto.q,
          category: dto.category,
          brand: dto.brand,
          storeId: dto.storeId,
          minPrice: dto.minPrice,
          maxPrice: dto.maxPrice,
          gender: dto.gender,
          ageGroup: dto.ageGroup,
          userPreference,
        });
        // ...the rest of the existing semantic branch (hits.length>0 → page/findBy/etc.) unchanged...
```
Leave the rest of `list` (the `if (hits.length > 0)` body, the catch, and `return this.listSql(dto);`) exactly as it is.

- [ ] **Step 3: `products.controller.ts` — optional auth on `list`**

```ts
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Query() dto: ListProductsDto, @Req() req: Request & { user?: { id: string } }) {
    return this.products.list(dto, req.user?.id);
  }

  @Get('facets')
  facets(@Query('q') q?: string) {
    return this.products.facets(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
```

- [ ] **Step 4: `ai/graph/tools/search-products.tool.ts` — pass `ctx.userId`**

The tool currently calls `await deps.products.list({ ... } as any);`. Change that call to pass the user id as the second argument: `await deps.products.list({ ... } as any, ctx.userId);` (`ctx` is already obtained via `ctxFromConfig(config)` at the top of `func`).

- [ ] **Step 5: Add a routing test to `products.search.spec.ts`**

Add (the `cfg`, `reviewsRepo`, `prod`, `qbStub` helpers already exist in this file from SP3):
```ts
  it('userId present -> fetches preference vectors and forwards as userPreference', async () => {
    const pref = { desc: [1, 0] };
    const preference = { getPreferenceVectors: jest.fn().mockResolvedValue(pref) };
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p1', score: 0.9, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg, preference as any);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any, '7');
    expect(preference.getPreferenceVectors).toHaveBeenCalledWith('7');
    expect(search.search.mock.calls[0][0].userPreference).toEqual(pref);
  });

  it('preference fetch error -> unpersonalized search still returns', async () => {
    const preference = { getPreferenceVectors: jest.fn().mockRejectedValue(new Error('pref down')) };
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p1', score: 0.9, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg, preference as any);
    const res = await svc.list({ q: 'shoes', page: 1, limit: 24 } as any, '7');
    expect(res.items.map((i) => i.id)).toEqual(['p1']);
    expect(search.search.mock.calls[0][0].userPreference).toBeUndefined();
  });
```

- [ ] **Step 6: Verify**

Run: `cd backend && npm test -- products.search` → expect 7 passed (5 prior + 2 new).
Run: `cd backend && npm test` → FULL suite, all pass.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add backend/src/products/ backend/src/ai/graph/tools/search-products.tool.ts
git commit -m "feat(be): personalize storefront + chatbot search via PreferenceService (SP5)"
```

---

### Task 5: Feature docs + env example

**Files:**
- Create: `docs/features/semantic-search-personalization.md`
- Modify: `docs/README.md`, `backend/.env.example`

- [ ] **Step 1: Append personalization env to `backend/.env.example`**

```
# Personalization (sub-project 5)
PERSONALIZATION_ALPHA=0.25
PERSONALIZATION_HALF_LIFE_DAYS=30
PERSONALIZATION_TOP_N=50
PERSONALIZATION_TTL_MS=600000
```

- [ ] **Step 2: Create `docs/features/semantic-search-personalization.md`**

```markdown
# Semantic search + personalization

End-to-end semantic product search with per-user personalization, built across five sub-projects.

## Pieces
- **Embedding services** (`ml/text-embed`, `ml/image-embed`): FastAPI services for BGE-small-en-v1.5
  (text, 384d) and FG-CLIP 2 (image, 768d), called from NestJS via `EmbeddingsModule`.
- **Product index** (`backend/src/search`): a Qdrant `products` collection with 3 named vectors
  (`desc`, `attr`, `image`) + a filter/boost payload, maintained by `ProductIndexerService`
  (backfill: `npm run index:products`; async on product/review writes).
- **Search ranking** (`SearchService`): `0.55·desc + 0.25·attr + 0.10·image + 0.10·boost`
  (review-damped catalog boost), wired into `ProductsService.list` with a LIKE fallback; the chatbot
  `search_products` tool inherits it.
- **Behavior tracking** (`backend/src/behavior`): `user_product_events` records weighted events
  (purchase +5, add_to_cart +4, remove_from_cart −2, add/remove wishlist +3/−2, review 5/4/3/1–2 →
  +4/+3/+1/−3, view +1) via async hooks + `POST /me/events/view`.
- **Personalization** (`backend/src/personalization`): per-user preference vectors (recency-decayed,
  positive-net weighted sum of liked products' embeddings) blended into ranking
  (`final = (1-α)·query + α·personalization`, α=0.25); `GET /me/profile` exposes color/size/price hints.

## Run it
```bash
docker compose up -d            # mysql + backend + frontend + qdrant + text-embed + image-embed (GPU)
cd backend && npm run index:products   # backfill the Qdrant index (needs embed services up)
```
Search a query on the storefront or in the chatbot; logged-in buyers get personalized ranking after
they accumulate behavior. Config: `EMBEDDINGS_ENABLED` (master switch) + the `SEARCH_*` / `PERSONALIZATION_*`
vars in `backend/.env.example`.

## Specs & plans
`docs/superpowers/specs/2026-05-27-*` + `2026-05-28-personalization-design.md`; plans under
`docs/superpowers/plans/`.
```

- [ ] **Step 3: Add a row to `docs/README.md`**

In the completed-features table, after the last row, add:
```
| 2026-05-28 | Semantic search + personalization (embeddings, Qdrant, behavior, re-rank) | [features/semantic-search-personalization.md](features/semantic-search-personalization.md) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/features/semantic-search-personalization.md docs/README.md backend/.env.example
git commit -m "docs: document semantic search + personalization feature (SP1-5)"
```

---

## Self-Review

**Spec coverage:**
- `OptionalJwtAuthGuard` (attaches user if present, never rejects) → Task 1. ✓
- `PreferenceService.getPreferenceVectors` (decayed-affinity SQL, positive-net, top-N, retrieve, L2-normalized weighted aggregate, `{}` empty/disabled) → Task 2. ✓
- `getProfile` (color/size tally from payloads + order-price stats) + `GET /me/profile` → Task 2. ✓
- Per-user TTL cache (vectors + profile share one entry/retrieve) → Task 2 (`entry`/`compute`). ✓
- Search blend `final = (1-α)·query + α·pers`, weighted cosine, no-pref unchanged → Task 3. ✓
- userId threading: storefront `OptionalJwtAuthGuard` + `req.user?.id`; chatbot `ctx.userId`; `list(dto, userId?)` fetches + forwards, graceful on error → Task 4. ✓
- Config (`PERSONALIZATION_ALPHA/HALF_LIFE_DAYS/TOP_N/TTL_MS`, gated by `EMBEDDINGS_ENABLED`) → Tasks 2/3 + `.env.example` (Task 5). ✓
- No circular import (caller passes vectors; SearchModule ⊁ PersonalizationModule) → Task 3/4 design. ✓
- Deferred feature docs (SP1–SP5) → Task 5. ✓
- Scope: semantic path + profile only; no recommendations feed / SQL-path personalization → none added. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. Task 4 Step 2 references "the rest of the existing semantic branch unchanged" — that is an edit instruction against a known existing block (the SP3 `list` body), not a placeholder.

**Type/name consistency:** `ProductVectors` (from `qdrant.service`, `{desc?,attr?,image?}`) is reused for both `PreferenceService` output and `SearchParams.userPreference` — single shared type. `RetrievedPoint` (SP2) is the `retrieveWithVectors` element type used by `aggregate`. `getPreferenceVectors`/`getProfile`/`UserProfile` names match across `PreferenceService`, the controller, and `ProductsService`. `PERSONALIZATION_ALPHA` read in `SearchService`, the others in `PreferenceService`; all defaults match `.env.example`. `ProductsService` constructor param order `(products, reviewsRepo, indexer?, search?, config?, preference?)` keeps SP2's 3-arg and SP3's 5-arg test constructions valid.
