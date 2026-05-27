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
