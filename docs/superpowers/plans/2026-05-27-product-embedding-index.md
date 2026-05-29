# Product Embedding Index Implementation Plan (sub-project 2/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and maintain 3 named vectors + a filter/boost payload per product in a Qdrant collection, populated by a backfill script and kept fresh by async hooks on product/review writes.

**Architecture:** A Qdrant server container holds collection `products` (named vectors `desc`/`attr`/`image`). A NestJS `SearchModule` wraps the Qdrant JS client (`QdrantService`) and a `ProductIndexerService` that builds texts, embeds via the SP1 clients, and upserts points. Indexing is async best-effort on CRUD/review writes, gated by `EMBEDDINGS_ENABLED`; a standalone script backfills the catalog.

**Tech Stack:** NestJS 10, `@qdrant/js-client-rest`, `@nestjs/config`, TypeORM, Jest, Docker. Spec: `docs/superpowers/specs/2026-05-27-product-embedding-index-design.md`. Builds on SP1 (`backend/src/embeddings/`).

**Verification notes:**
- Backend unit tests: `cd backend && npm test -- <pattern>` (Jest).
- Compile gate: `cd backend && npx tsc -p tsconfig.build.json --noEmit` (do NOT run `nest build` — `backend/dist` is root-owned from a prior Docker run and its clean step fails; that's environmental).
- Script compile: `cd backend && npx tsc -p scripts/tsconfig.json --noEmit`.
- Real Qdrant + embedding services are exercised at the user's end-to-end pass (`docker compose up qdrant text-embed image-embed backend` + `npm run index:products`), not in unit tests.

---

## File Structure

**Create:**
- `backend/src/search/qdrant.constants.ts` — collection default, vector names + dims.
- `backend/src/search/qdrant.service.ts` — `QdrantService` + `QDRANT_CLIENT` token + `ProductVectors`/`ProductPoint` types: `ensureCollection`, `upsert`, `upsertMany`, `setPayload`, `deletePoint`; `onApplicationBootstrap` ensures the collection.
- `backend/src/search/product-indexer.service.ts` — `ProductIndexerService`: `buildDescText`/`buildAttrText`/`buildPayload`, `indexProduct`, `indexProducts`, `refreshStats`, `removeProduct`.
- `backend/src/search/search.module.ts` — provides `QDRANT_CLIENT`, `QdrantService`, `ProductIndexerService`; imports `EmbeddingsModule` + `TypeOrmModule.forFeature([Review])`; exports the two services.
- `backend/src/search/qdrant.service.spec.ts`, `backend/src/search/product-indexer.service.spec.ts`.
- `backend/scripts/index-products.ts` — batched backfill.

**Modify:**
- `backend/package.json` — add `@qdrant/js-client-rest` dep + `index:products` script.
- `docker-compose.yml` — `qdrant` service + volume + backend `QDRANT_URL`.
- `backend/.env.example` — `QDRANT_URL`, `QDRANT_COLLECTION`.
- `backend/src/products/products.module.ts` + `products.service.ts` — import `SearchModule`, async best-effort index hooks.
- `backend/src/reviews/reviews.module.ts` + `reviews.service.ts` — import `SearchModule`, `refreshStats` hooks.

---

### Task 1: Qdrant infra + `QdrantService`

**Files:**
- Modify: `backend/package.json`, `docker-compose.yml`, `backend/.env.example`
- Create: `backend/src/search/qdrant.constants.ts`, `backend/src/search/qdrant.service.ts`, `backend/src/search/qdrant.service.spec.ts`

- [ ] **Step 1: Add the Qdrant client dependency**

In `backend/package.json`, add to `"dependencies"` (alphabetical near other `@` packages):
```json
    "@qdrant/js-client-rest": "^1.12.0",
```
Then run `cd backend && npm install` to fetch it.

- [ ] **Step 2: Add the `qdrant` service to `docker-compose.yml`**

Add under `services:` (after `image-embed`):
```yaml
  qdrant:
    image: qdrant/qdrant:latest
    container_name: amazara-qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage
```
Add `qdrant_storage:` to the bottom `volumes:` block. In the `backend` service `environment:` block append:
```yaml
      QDRANT_URL: ${QDRANT_URL:-http://qdrant:6333}
      QDRANT_COLLECTION: ${QDRANT_COLLECTION:-products}
```
Add to the `backend` service a `depends_on` entry for `qdrant` (plain, no health gating) — if `depends_on` is a list, add `- qdrant`; if it's the map form used for mysql, add `qdrant: { condition: service_started }`.

- [ ] **Step 3: Add env docs to `backend/.env.example`**

Append:
```
# Product embedding index (sub-project 2)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=products
```

- [ ] **Step 4: Create `qdrant.constants.ts`**

```ts
export const DEFAULT_COLLECTION = 'products';

export const DESC_VECTOR = 'desc';
export const ATTR_VECTOR = 'attr';
export const IMAGE_VECTOR = 'image';

export const DESC_DIM = 384;
export const ATTR_DIM = 384;
export const IMAGE_DIM = 768;
```

- [ ] **Step 5: Write the failing test `qdrant.service.spec.ts`**

```ts
import { QdrantService } from './qdrant.service';
import { ATTR_VECTOR, DESC_VECTOR, IMAGE_VECTOR } from './qdrant.constants';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    QDRANT_COLLECTION: 'products',
    EMBEDDINGS_ENABLED: 'true',
    ...overrides,
  };
  return { get: (k: string, d?: string) => values[k] ?? d } as any;
}

function makeClient() {
  return {
    createCollection: jest.fn().mockResolvedValue(undefined),
    createPayloadIndex: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    setPayload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('QdrantService', () => {
  it('ensureCollection creates the collection with 3 named cosine vectors', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.ensureCollection();
    expect(client.createCollection).toHaveBeenCalledTimes(1);
    const [name, cfg] = client.createCollection.mock.calls[0];
    expect(name).toBe('products');
    expect(Object.keys(cfg.vectors).sort()).toEqual(['attr', 'desc', 'image']);
    expect(cfg.vectors[DESC_VECTOR]).toEqual({ size: 384, distance: 'Cosine' });
    expect(cfg.vectors[IMAGE_VECTOR]).toEqual({ size: 768, distance: 'Cosine' });
    expect(client.createPayloadIndex).toHaveBeenCalled();
  });

  it('ensureCollection swallows "already exists" from createCollection', async () => {
    const client = makeClient();
    client.createCollection.mockRejectedValueOnce(new Error('already exists'));
    const svc = new QdrantService(client as any, makeConfig());
    await expect(svc.ensureCollection()).resolves.toBeUndefined();
  });

  it('upsert sends only the present named vectors (image omitted when absent)', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsert('p1', { desc: [1], attr: [2] }, { category: 'shoes' });
    const [, body] = client.upsert.mock.calls[0];
    const pt = body.points[0];
    expect(pt.id).toBe('p1');
    expect(pt.vector).toEqual({ [DESC_VECTOR]: [1], [ATTR_VECTOR]: [2] });
    expect(pt.vector[IMAGE_VECTOR]).toBeUndefined();
    expect(pt.payload).toEqual({ category: 'shoes' });
  });

  it('upsert includes image when present', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsert('p1', { desc: [1], attr: [2], image: [3] }, {});
    const pt = client.upsert.mock.calls[0][1].points[0];
    expect(pt.vector[IMAGE_VECTOR]).toEqual([3]);
  });

  it('setPayload and deletePoint call the client', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.setPayload('p1', { rating: 4.5 });
    expect(client.setPayload).toHaveBeenCalledWith('products', { payload: { rating: 4.5 }, points: ['p1'] });
    await svc.deletePoint('p1');
    expect(client.delete).toHaveBeenCalledWith('products', { points: ['p1'] });
  });

  it('upsertMany([]) is a no-op', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsertMany([]);
    expect(client.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Implement `qdrant.service.ts`**

```ts
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ATTR_DIM,
  ATTR_VECTOR,
  DEFAULT_COLLECTION,
  DESC_DIM,
  DESC_VECTOR,
  IMAGE_DIM,
  IMAGE_VECTOR,
} from './qdrant.constants';

export const QDRANT_CLIENT = 'QDRANT_CLIENT';

export interface ProductVectors {
  desc?: number[];
  attr?: number[];
  image?: number[];
}
export interface ProductPoint {
  id: string;
  vectors: ProductVectors;
  payload: Record<string, unknown>;
}

// Minimal shape of the parts of @qdrant/js-client-rest we use (keeps the service testable).
interface QdrantLike {
  createCollection(name: string, cfg: unknown): Promise<unknown>;
  createPayloadIndex(name: string, cfg: unknown): Promise<unknown>;
  upsert(name: string, body: unknown): Promise<unknown>;
  setPayload(name: string, body: unknown): Promise<unknown>;
  delete(name: string, body: unknown): Promise<unknown>;
}

const PAYLOAD_INDEXES: Array<[string, string]> = [
  ['category', 'keyword'],
  ['brand', 'keyword'],
  ['storeId', 'keyword'],
  ['targetGender', 'keyword'],
  ['price', 'float'],
  ['isPublished', 'bool'],
];

function pruneVectors(v: ProductVectors): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (v.desc) out[DESC_VECTOR] = v.desc;
  if (v.attr) out[ATTR_VECTOR] = v.attr;
  if (v.image) out[IMAGE_VECTOR] = v.image;
  return out;
}

@Injectable()
export class QdrantService implements OnApplicationBootstrap {
  private readonly log = new Logger('QdrantService');
  private readonly collection: string;
  private readonly enabled: boolean;

  constructor(
    @Inject(QDRANT_CLIENT) private readonly client: QdrantLike,
    config: ConfigService,
  ) {
    this.collection = config.get<string>('QDRANT_COLLECTION', DEFAULT_COLLECTION);
    this.enabled = config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.ensureCollection();
    } catch (err) {
      this.log.warn(`ensureCollection on bootstrap failed: ${(err as Error).message}`);
    }
  }

  async ensureCollection(): Promise<void> {
    try {
      await this.client.createCollection(this.collection, {
        vectors: {
          [DESC_VECTOR]: { size: DESC_DIM, distance: 'Cosine' },
          [ATTR_VECTOR]: { size: ATTR_DIM, distance: 'Cosine' },
          [IMAGE_VECTOR]: { size: IMAGE_DIM, distance: 'Cosine' },
        },
      });
    } catch (err) {
      // Creating an existing collection throws — treat as already-created.
      this.log.debug(`createCollection skipped: ${(err as Error).message}`);
    }
    for (const [field, schema] of PAYLOAD_INDEXES) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: schema,
        });
      } catch (err) {
        this.log.debug(`createPayloadIndex ${field} skipped: ${(err as Error).message}`);
      }
    }
  }

  async upsert(id: string, vectors: ProductVectors, payload: Record<string, unknown>): Promise<void> {
    await this.upsertMany([{ id, vectors, payload }]);
  }

  async upsertMany(points: ProductPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(this.collection, {
      wait: false,
      points: points.map((p) => ({
        id: p.id,
        vector: pruneVectors(p.vectors),
        payload: p.payload,
      })),
    });
  }

  async setPayload(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.client.setPayload(this.collection, { payload, points: [id] });
  }

  async deletePoint(id: string): Promise<void> {
    await this.client.delete(this.collection, { points: [id] });
  }
}
```

- [ ] **Step 7: Run the tests + compile gate**

Run: `cd backend && npm test -- qdrant.service`
Expected: 6 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit`
Expected: "No errors found" (this also confirms the `@qdrant/js-client-rest` import resolves once the module/provider exist; if `QDRANT_CLIENT` is unused so far that's fine).

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json docker-compose.yml backend/.env.example backend/src/search/qdrant.constants.ts backend/src/search/qdrant.service.ts backend/src/search/qdrant.service.spec.ts
git commit -m "feat(be): Qdrant service + collection schema + compose service (SP2)"
```

---

### Task 2: `ProductIndexerService` + `SearchModule`

**Files:**
- Create: `backend/src/search/product-indexer.service.ts`, `backend/src/search/search.module.ts`, `backend/src/search/product-indexer.service.spec.ts`
- Modify: `backend/src/app.module.ts` (register `SearchModule`)

- [ ] **Step 1: Write the failing test `product-indexer.service.spec.ts`**

```ts
import { ProductIndexerService } from './product-indexer.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBEDDINGS_ENABLED: 'true', ...overrides };
  return { get: (k: string, d?: string) => values[k] ?? d } as any;
}

const baseProduct: any = {
  id: 'p1',
  name: 'Red Runner',
  shortDescription: 'Lightweight shoe',
  longDescription: 'A breathable running shoe.',
  availableColors: ['red', 'black'],
  availableSizes: ['40', '41'],
  material: 'mesh',
  targetGender: 'men',
  targetAgeGroup: 'adult',
  imageFirst: 'http://img/1.jpg',
  storeId: 's1',
  category: 'Shoes',
  brand: 'Acme',
  price: '59.90',
  discount: 10,
  isPublished: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function deps() {
  const text = { embed: jest.fn().mockResolvedValue([[0.1]]) };
  const image = { embedImages: jest.fn().mockResolvedValue({ vectors: [[0.9]], failed: [] }) };
  const qdrant = { upsert: jest.fn().mockResolvedValue(undefined), setPayload: jest.fn(), deletePoint: jest.fn() };
  const reviews = {
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avg: '4.5', cnt: '2' }),
    }),
  };
  return { text, image, qdrant, reviews };
}

describe('ProductIndexerService builders', () => {
  const { text, image, qdrant, reviews } = deps();
  const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());

  it('buildDescText labels and skips empty parts', () => {
    expect(svc.buildDescText(baseProduct)).toBe(
      'name: Red Runner | short description: Lightweight shoe | description: A breathable running shoe.',
    );
    expect(svc.buildDescText({ ...baseProduct, shortDescription: null, longDescription: null })).toBe(
      'name: Red Runner',
    );
  });

  it('buildAttrText labels, joins arrays, skips empty', () => {
    expect(svc.buildAttrText(baseProduct)).toBe(
      'color: red, black | sizes: 40, 41 | material: mesh | gender: men | age: adult',
    );
    expect(svc.buildAttrText({ ...baseProduct, availableColors: null, availableSizes: null, material: null })).toBe(
      'gender: men | age: adult',
    );
  });

  it('buildPayload maps the filter/boost fields', () => {
    const pl = svc.buildPayload(baseProduct, { rating: 4.5, reviewCount: 2 });
    expect(pl).toMatchObject({
      storeId: 's1',
      category: 'Shoes',
      price: 59.9,
      discount: 10,
      rating: 4.5,
      reviewCount: 2,
      targetGender: 'men',
      isPublished: true,
    });
  });
});

describe('ProductIndexerService.indexProduct', () => {
  it('embeds desc+attr+image and upserts a full point', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.indexProduct(baseProduct);
    expect(text.embed).toHaveBeenCalledTimes(2); // desc, attr
    expect(image.embedImages).toHaveBeenCalledWith(['http://img/1.jpg']);
    const [id, vectors, payload] = qdrant.upsert.mock.calls[0];
    expect(id).toBe('p1');
    expect(vectors).toEqual({ desc: [0.1], attr: [0.1], image: [0.9] });
    expect(payload.rating).toBe(4.5);
    expect(payload.reviewCount).toBe(2);
  });

  it('omits the image vector when the image embed fails', async () => {
    const { text, image, qdrant, reviews } = deps();
    image.embedImages.mockResolvedValue({ vectors: [[0]], failed: [0] });
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.indexProduct(baseProduct, { rating: 0, reviewCount: 0 });
    const vectors = qdrant.upsert.mock.calls[0][1];
    expect(vectors.image).toBeUndefined();
    expect(vectors.desc).toBeDefined();
  });

  it('is a no-op when EMBEDDINGS_ENABLED=false', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await svc.indexProduct(baseProduct);
    expect(qdrant.upsert).not.toHaveBeenCalled();
    expect(text.embed).not.toHaveBeenCalled();
  });

  it('refreshStats does a payload-only update', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.refreshStats('p1');
    expect(qdrant.setPayload).toHaveBeenCalledWith('p1', { rating: 4.5, reviewCount: 2 });
    expect(text.embed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `product-indexer.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { Review } from '../reviews/review.entity';
import { TextEmbeddingClient } from '../embeddings/text-embedding.client';
import { ImageEmbeddingClient } from '../embeddings/image-embedding.client';
import { ProductPoint, QdrantService } from './qdrant.service';

export interface ProductStats {
  rating: number;
  reviewCount: number;
}

function toStringList(v: unknown): string {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr
    .map((x) =>
      typeof x === 'string'
        ? x
        : x && typeof x === 'object' && 'name' in (x as object)
          ? String((x as { name: unknown }).name)
          : '',
    )
    .filter(Boolean)
    .join(', ');
}

@Injectable()
export class ProductIndexerService {
  private readonly log = new Logger('ProductIndexerService');
  private readonly enabled: boolean;

  constructor(
    private readonly text: TextEmbeddingClient,
    private readonly image: ImageEmbeddingClient,
    private readonly qdrant: QdrantService,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }

  buildDescText(p: Product): string {
    const parts: string[] = [];
    if (p.name) parts.push(`name: ${p.name}`);
    if (p.shortDescription) parts.push(`short description: ${p.shortDescription}`);
    if (p.longDescription) parts.push(`description: ${p.longDescription}`);
    return parts.join(' | ');
  }

  buildAttrText(p: Product): string {
    const parts: string[] = [];
    const colors = toStringList(p.availableColors ?? p.color);
    if (colors) parts.push(`color: ${colors}`);
    const sizes = toStringList(p.availableSizes);
    if (sizes) parts.push(`sizes: ${sizes}`);
    if (p.material) parts.push(`material: ${p.material}`);
    if (p.targetGender) parts.push(`gender: ${p.targetGender}`);
    if (p.targetAgeGroup) parts.push(`age: ${p.targetAgeGroup}`);
    return parts.join(' | ');
  }

  buildPayload(p: Product, stats: ProductStats): Record<string, unknown> {
    return {
      storeId: p.storeId,
      category: p.category,
      brand: p.brand,
      name: p.name,
      image: p.imageFirst,
      price: Number(p.price),
      discount: p.discount,
      rating: stats.rating,
      reviewCount: stats.reviewCount,
      targetGender: p.targetGender,
      targetAgeGroup: p.targetAgeGroup,
      color: toStringList(p.availableColors ?? p.color),
      sizes: toStringList(p.availableSizes),
      material: p.material,
      isPublished: p.isPublished,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    };
  }

  async statsFor(productId: string): Promise<ProductStats> {
    const row = await this.reviews
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.product_id = :id', { id: productId })
      .getRawOne<{ avg: string | null; cnt: string }>();
    return {
      rating: row?.avg ? Math.round(Number(row.avg) * 10) / 10 : 0,
      reviewCount: Number(row?.cnt ?? 0),
    };
  }

  async indexProduct(p: Product, stats?: ProductStats): Promise<void> {
    if (!this.enabled) return;
    const s = stats ?? (await this.statsFor(p.id));
    const point = await this.buildPoint(p, s);
    await this.qdrant.upsert(point.id, point.vectors, point.payload);
  }

  async indexProducts(products: Product[], statsMap?: Map<string, ProductStats>): Promise<void> {
    if (!this.enabled || products.length === 0) return;
    const points: ProductPoint[] = [];
    for (const p of products) {
      const s = statsMap?.get(p.id) ?? (await this.statsFor(p.id));
      points.push(await this.buildPoint(p, s));
    }
    await this.qdrant.upsertMany(points);
  }

  async refreshStats(productId: string): Promise<void> {
    if (!this.enabled) return;
    const s = await this.statsFor(productId);
    await this.qdrant.setPayload(productId, { rating: s.rating, reviewCount: s.reviewCount });
  }

  async removeProduct(id: string): Promise<void> {
    if (!this.enabled) return;
    await this.qdrant.deletePoint(id);
  }

  private async buildPoint(p: Product, stats: ProductStats): Promise<ProductPoint> {
    const [descVec] = await this.text.embed([this.buildDescText(p)]);
    const attrText = this.buildAttrText(p);
    const attrVec = attrText ? (await this.text.embed([attrText]))[0] : undefined;
    let imageVec: number[] | undefined;
    if (p.imageFirst) {
      const { vectors, failed } = await this.image.embedImages([p.imageFirst]);
      if (!failed.includes(0)) imageVec = vectors[0];
    }
    return {
      id: p.id,
      vectors: { desc: descVec, attr: attrVec, image: imageVec },
      payload: this.buildPayload(p, stats),
    };
  }
}
```

- [ ] **Step 3: Create `search.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Review } from '../reviews/review.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ProductIndexerService } from './product-indexer.service';
import { QDRANT_CLIENT, QdrantService } from './qdrant.service';

@Module({
  imports: [EmbeddingsModule, TypeOrmModule.forFeature([Review])],
  providers: [
    {
      provide: QDRANT_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new QdrantClient({ url: config.get<string>('QDRANT_URL', 'http://qdrant:6333') }),
    },
    QdrantService,
    ProductIndexerService,
  ],
  exports: [QdrantService, ProductIndexerService],
})
export class SearchModule {}
```

- [ ] **Step 4: Register `SearchModule` in `app.module.ts`**

Add `import { SearchModule } from './search/search.module';` and add `SearchModule` to the `imports:` array (after `EmbeddingsModule`).

- [ ] **Step 5: Run tests + compile gate**

Run: `cd backend && npm test -- product-indexer.service`
Expected: all (8) tests pass.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit`
Expected: "No errors found".

- [ ] **Step 6: Commit**

```bash
git add backend/src/search/product-indexer.service.ts backend/src/search/search.module.ts backend/src/search/product-indexer.service.spec.ts backend/src/app.module.ts
git commit -m "feat(be): ProductIndexerService + SearchModule (SP2)"
```

---

### Task 3: Backfill script

**Files:**
- Create: `backend/scripts/index-products.ts`
- Modify: `backend/package.json` (add `index:products` script)

- [ ] **Step 1: Create `backend/scripts/index-products.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.entity';
import { QdrantService } from '../src/search/qdrant.service';
import { ProductIndexerService, ProductStats } from '../src/search/product-indexer.service';

const BATCH = 64;

async function main() {
  const start = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);
    const qdrant = app.get(QdrantService);
    const indexer = app.get(ProductIndexerService);

    await qdrant.ensureCollection();

    // One pass for rating/reviewCount.
    const statsRows: Array<{ product_id: string; avg: string; cnt: string }> = await ds.query(
      'SELECT product_id, AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews GROUP BY product_id',
    );
    const statsMap = new Map<string, ProductStats>();
    for (const r of statsRows) {
      statsMap.set(r.product_id, {
        rating: r.avg ? Math.round(Number(r.avg) * 10) / 10 : 0,
        reviewCount: Number(r.cnt),
      });
    }

    const repo = ds.getRepository(Product);
    const total = await repo.count();
    let done = 0;
    let failures = 0;
    for (let offset = 0; offset < total; offset += BATCH) {
      const batch = await repo.find({ order: { id: 'ASC' }, skip: offset, take: BATCH });
      try {
        await indexer.indexProducts(batch, statsMap);
      } catch (err) {
        failures += batch.length;
        console.error(`[index] batch at ${offset} failed: ${(err as Error).message}`);
      }
      done += batch.length;
      console.log(`[index] ${done}/${total}`);
    }
    console.log(
      `[index] done in ${((Date.now() - start) / 1000).toFixed(1)}s — ${done} processed, ${failures} failed`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `backend/package.json` `"scripts"`, after `seed:all`, add:
```json
    "index:products": "ts-node -P scripts/tsconfig.json scripts/index-products.ts"
```

- [ ] **Step 3: Compile-check the script**

Run: `cd backend && npx tsc -p scripts/tsconfig.json --noEmit`
Expected: "No errors found" (the script type-checks against the real `QdrantService`/`ProductIndexerService` signatures).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/index-products.ts backend/package.json
git commit -m "feat(be): product index backfill script (npm run index:products)"
```

---

### Task 4: Async best-effort index hooks (products + reviews)

**Files:**
- Modify: `backend/src/products/products.module.ts`, `backend/src/products/products.service.ts`
- Modify: `backend/src/reviews/reviews.module.ts`, `backend/src/reviews/reviews.service.ts`
- Create: `backend/src/products/products.indexing.spec.ts`

- [ ] **Step 1: Wire `SearchModule` into `ProductsModule`**

In `backend/src/products/products.module.ts`, add `import { SearchModule } from '../search/search.module';` and add `SearchModule` to the `imports:` array (alongside `StoresModule`).

- [ ] **Step 2: Inject the indexer into `ProductsService` and add hooks**

In `backend/src/products/products.service.ts`:
- Add imports:
  ```ts
  import { Optional } from '@nestjs/common';
  import { ProductIndexerService } from '../search/product-indexer.service';
  ```
- Add to the constructor parameters (after the existing repos):
  ```ts
    @Optional() private readonly indexer?: ProductIndexerService,
  ```
- Add this private helper to the class:
  ```ts
  private fireIndex(fn: () => Promise<void>): void {
    if (!this.indexer) return;
    fn().catch((err) => this.indexerLog.warn(`index hook failed: ${(err as Error).message}`));
  }
  ```
  and a logger field at the top of the class:
  ```ts
  private readonly indexerLog = new Logger('ProductsService:index');
  ```
  (import `Logger` from `@nestjs/common` if not already imported).
- At the end of `createForStore`, before `return this.products.save(entity);`, capture the saved row and index it. Change the return to:
  ```ts
    const saved = await this.products.save(entity);
    this.fireIndex(() => this.indexer!.indexProduct(saved));
    return saved;
  ```
- At the end of `updateForStore`, change `return this.products.save(product);` to:
  ```ts
    const saved = await this.products.save(product);
    this.fireIndex(() => this.indexer!.indexProduct(saved));
    return saved;
  ```
- In `deleteForStore`, after `await this.products.remove(product);` add:
  ```ts
    this.fireIndex(() => this.indexer!.removeProduct(id));
  ```
- In `createManyForStore`, after the loop completes and before `return { created, ... }`, the entities were saved per chunk; collect saved entities. The simplest: after the existing per-chunk `await this.products.save(entities); created += entities.length;`, add `this.fireIndex(() => this.indexer!.indexProducts(entities));` inside the `if (entities.length)` block (right after `created += entities.length;`).

- [ ] **Step 3: Wire `SearchModule` into `ReviewsModule`**

In `backend/src/reviews/reviews.module.ts`, add `import { SearchModule } from '../search/search.module';` and add `SearchModule` to the `imports:` array.

- [ ] **Step 4: Inject the indexer into `ReviewsService` and refresh stats**

In `backend/src/reviews/reviews.service.ts`:
- Add imports `import { Logger, Optional } from '@nestjs/common';` (extend the existing `@nestjs/common` import) and `import { ProductIndexerService } from '../search/product-indexer.service';`.
- Add constructor param `@Optional() private readonly indexer?: ProductIndexerService,` and a field `private readonly indexLog = new Logger('ReviewsService:index');` plus the same helper:
  ```ts
  private fireRefresh(productId: string): void {
    if (!this.indexer) return;
    this.indexer.refreshStats(productId).catch((err) => this.indexLog.warn(`refreshStats failed: ${(err as Error).message}`));
  }
  ```
- In `create`, after a successful save (`const saved = await this.reviews.save(entity);`), add `this.fireRefresh(productId);` before the `return`.
- In `update`, after `const saved = await this.reviews.save(review);`, add `this.fireRefresh(review.productId);`.
- In `remove`, after `await this.reviews.remove(review);`, add `this.fireRefresh(review.productId);`.

- [ ] **Step 5: Write the hook test `products.indexing.spec.ts`**

```ts
import { ProductsService } from './products.service';

// Minimal repo stub: save returns its argument; findOne returns a product for update/delete.
function repoStub(overrides: any = {}) {
  return {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (e: any) => e),
    remove: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((e: any) => e),
    ...overrides,
  } as any;
}

describe('ProductsService indexing hooks', () => {
  it('createForStore fires indexProduct with the saved product', async () => {
    const indexer = { indexProduct: jest.fn().mockResolvedValue(undefined), removeProduct: jest.fn(), indexProducts: jest.fn() };
    const products = repoStub();
    const reviews = repoStub();
    const svc = new ProductsService(products, reviews, indexer as any);
    const saved = await svc.createForStore('s1', {
      name: 'X', brand: 'B', category: 'C', price: 10, stock: 5,
    } as any);
    expect(indexer.indexProduct).toHaveBeenCalledWith(saved);
  });

  it('deleteForStore fires removeProduct', async () => {
    const indexer = { indexProduct: jest.fn(), removeProduct: jest.fn().mockResolvedValue(undefined), indexProducts: jest.fn() };
    const product = { id: 'p1', storeId: 's1' };
    const products = repoStub({ findOne: jest.fn().mockResolvedValue(product) });
    const svc = new ProductsService(products, repoStub(), indexer as any);
    await svc.deleteForStore('s1', 'p1');
    expect(indexer.removeProduct).toHaveBeenCalledWith('p1');
  });
});
```

> Note: `ProductsService`'s constructor order is `(products repo, reviews repo, [indexer])`. If the real constructor differs, pass args positionally to match — the test instantiates `ProductsService` directly (no Nest DI), so it only needs the params the exercised methods touch. If `createForStore` references other injected deps, stub them too.

- [ ] **Step 6: Run tests + compile gate**

Run: `cd backend && npm test -- products.indexing`
Expected: 2 passed.
Run: `cd backend && npm test` (full suite — confirm the new `@Optional()` constructor params didn't break existing ProductsService/ReviewsService specs)
Expected: all pass.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit`
Expected: "No errors found".

- [ ] **Step 7: Commit**

```bash
git add backend/src/products/ backend/src/reviews/
git commit -m "feat(be): async best-effort Qdrant indexing on product/review writes (SP2)"
```

---

## Self-Review

**Spec coverage:**
- Qdrant server + compose + `QDRANT_URL` → Task 1. ✓
- Collection `products`, 3 named cosine vectors (desc 384 / attr 384 / image 768), payload + indexes → Task 1 (`ensureCollection`, constants). ✓
- Image vector optional per point → Task 1 (`pruneVectors`) + Task 2 (`buildPoint` omits on `failed`). ✓
- Vector inputs: desc/attr text formats (labeled, skip empty), image via `embedImages` → Task 2 (`buildDescText`/`buildAttrText`/`buildPoint`). ✓
- Payload fields + boost data → Task 2 (`buildPayload`). ✓
- Backfill standalone script + bulk stats + batched embed/upsert → Task 3. ✓
- On-CRUD async best-effort, gated by `EMBEDDINGS_ENABLED` → Task 4 (+ indexer’s `enabled` guard). ✓
- On-review payload-only refresh → Task 4 (`refreshStats`). ✓
- Config (`QDRANT_URL`, `QDRANT_COLLECTION`, `EMBEDDINGS_ENABLED`) → Tasks 1, 2. ✓
- Tests: builders + indexProduct/refreshStats + qdrant service + hooks → Tasks 1, 2, 4. ✓
- Scope: no search/ranking — confirmed none added. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. The Task 4 note about constructor arg order is guidance for an existing-file edit, not a placeholder.

**Type/name consistency:** `QdrantService` methods (`ensureCollection`, `upsert`, `upsertMany`, `setPayload`, `deletePoint`) and `ProductVectors`/`ProductPoint` are used identically in `product-indexer.service.ts`, the backfill script, and the specs. `ProductIndexerService` public surface (`buildDescText`, `buildAttrText`, `buildPayload`, `statsFor`, `indexProduct`, `indexProducts`, `refreshStats`, `removeProduct`, `ProductStats`) matches across Task 2, Task 3 (script imports `ProductStats`), and Task 4 hooks. Vector names (`desc`/`attr`/`image`) and dims (384/384/768) are defined once in `qdrant.constants.ts` and reused. `EMBEDDINGS_ENABLED` / `QDRANT_URL` / `QDRANT_COLLECTION` keys are consistent across service, module factory, compose, and `.env.example`.
