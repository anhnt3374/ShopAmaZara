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
export interface RetrievedPoint {
  id: string;
  payload: Record<string, unknown>;
  vectors: ProductVectors;
}

interface QdrantLike {
  createCollection(name: string, cfg: unknown): Promise<void>;
  createPayloadIndex(name: string, cfg: unknown): Promise<void>;
  upsert(name: string, body: unknown): Promise<void>;
  setPayload(name: string, body: unknown): Promise<void>;
  delete(name: string, body: unknown): Promise<void>;
  query(name: string, body: unknown): Promise<{ points: Array<{ id: string | number }> }>;
  retrieve(
    name: string,
    body: unknown,
  ): Promise<Array<{ id: string | number; payload?: Record<string, unknown> | null; vector?: unknown }>>;
}

type PayloadIndexSchema = 'keyword' | 'float' | 'bool';

const PAYLOAD_INDEXES: Array<[string, PayloadIndexSchema]> = [
  ['category', 'keyword'],
  ['brand', 'keyword'],
  ['storeId', 'keyword'],
  ['targetGender', 'keyword'],
  ['targetAgeGroup', 'keyword'],
  ['price', 'float'],
  ['isPublished', 'bool'],
];

// Qdrant returns a 409/"already exists" when creating a collection that's there.
function isAlreadyExists(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = ((err as Error)?.message ?? '').toLowerCase();
  return status === 409 || msg.includes('already exist');
}

function pruneVectors(v: ProductVectors): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (v.desc) out[DESC_VECTOR] = v.desc;
  if (v.attr) out[ATTR_VECTOR] = v.attr;
  if (v.image) out[IMAGE_VECTOR] = v.image;
  return out;
}

function extractVectors(vector: unknown): ProductVectors {
  if (!vector || typeof vector !== 'object') return {};
  const v = vector as Record<string, unknown>;
  const out: ProductVectors = {};
  if (Array.isArray(v[DESC_VECTOR])) out.desc = v[DESC_VECTOR] as number[];
  if (Array.isArray(v[ATTR_VECTOR])) out.attr = v[ATTR_VECTOR] as number[];
  if (Array.isArray(v[IMAGE_VECTOR])) out.image = v[IMAGE_VECTOR] as number[];
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
      // Already-created is expected (idempotent). Anything else (e.g. a bad
      // QDRANT_URL / unreachable server) must surface — re-throw so the
      // bootstrap warn fires and the backfill script fails loudly.
      if (!isAlreadyExists(err)) throw err;
      this.log.debug('createCollection skipped: collection already exists');
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
    // wait:false — the index is eventually-consistent alongside MySQL (the
    // source of truth). Do not flip to true expecting read-your-write here.
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
}
