import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { QDRANT_CLIENT } from './qdrant.service';
import type { RankedHit } from './search.service';

// bge-small-en-v1.5 text-embedding dimension; the cache vector is the query's
// bge embedding (same one the search already computes — no extra embed call).
const QUERY_DIM = 384;

interface QueryCacheClient {
  createCollection(name: string, cfg: unknown): Promise<void>;
  createPayloadIndex(name: string, cfg: unknown): Promise<void>;
  upsert(name: string, body: unknown): Promise<void>;
  delete(name: string, body: unknown): Promise<void>;
  query(
    name: string,
    body: unknown,
  ): Promise<{
    points: Array<{ id: string | number; score?: number; payload?: Record<string, unknown> | null }>;
  }>;
}

function isAlreadyExists(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = ((err as Error)?.message ?? '').toLowerCase();
  return status === 409 || msg.includes('already exist');
}

/**
 * Semantic query cache (tier 2, on top of the Redis exact cache). Stores each
 * computed search's ranked hits as a Qdrant point keyed by the query's bge
 * embedding; a later query whose embedding is within `threshold` cosine of a
 * cached one — for the same filter scope, not expired — reuses those hits,
 * skipping the Qdrant product search + fusion. Entries carry an `expiresAt`;
 * reads filter it out and a periodic sweep deletes expired points (TTL).
 *
 * Every Qdrant call is best-effort: a failure degrades to "no cache", never throws.
 */
@Injectable()
export class QueryCacheService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('QueryCache');
  private readonly collection: string;
  private readonly threshold: number;
  private readonly ttlMs: number;
  private readonly sweepMs: number;
  readonly enabled: boolean;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(QDRANT_CLIENT) private readonly client: QueryCacheClient,
    config: ConfigService,
  ) {
    const num = (key: string, def: number): number => {
      const n = Number(config.get<string>(key, String(def)));
      return Number.isFinite(n) ? n : def;
    };
    this.collection = config.get<string>('QUERY_CACHE_COLLECTION', 'query_cache');
    this.threshold = num('QUERY_CACHE_THRESHOLD', 0.97);
    this.ttlMs = num('QUERY_CACHE_TTL_MS', 300000);
    this.sweepMs = num('QUERY_CACHE_SWEEP_MS', 60000);
    this.enabled = this.threshold > 0 && this.ttlMs > 0;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.ensureCollection();
      this.log.log(
        `semantic query cache enabled (collection ${this.collection}, threshold ${this.threshold}, ttl ${this.ttlMs}ms)`,
      );
    } catch (err) {
      this.log.warn(`ensureCollection failed (semantic cache off until reachable): ${(err as Error).message}`);
    }
    this.sweepTimer = setInterval(() => void this.sweep(), this.sweepMs);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async ensureCollection(): Promise<void> {
    try {
      await this.client.createCollection(this.collection, {
        vectors: { size: QUERY_DIM, distance: 'Cosine' },
      });
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
    for (const [field, schema] of [
      ['scope', 'keyword'],
      ['expiresAt', 'integer'],
    ] as const) {
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

  /** Return cached hits for a semantically-close, non-expired query in the same
   *  scope, or null. `vector` is the query's bge embedding. */
  async lookup(vector: number[], scope: string): Promise<RankedHit[] | null> {
    if (!this.enabled) return null;
    try {
      const res = await this.client.query(this.collection, {
        query: vector,
        limit: 1,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [
            { key: 'scope', match: { value: scope } },
            { key: 'expiresAt', range: { gt: Date.now() } },
          ],
        },
      });
      const top = res.points?.[0];
      if (!top || (top.score ?? 0) < this.threshold) return null;
      const hits = top.payload?.hits;
      return Array.isArray(hits) ? (hits as RankedHit[]) : null;
    } catch (err) {
      this.log.warn(`lookup failed (serving uncached): ${(err as Error).message}`);
      return null;
    }
  }

  /** Cache a computed result. No-op for empty results (a near-miss must not be
   *  served an empty list). */
  async store(vector: number[], scope: string, query: string, hits: RankedHit[]): Promise<void> {
    if (!this.enabled || hits.length === 0) return;
    try {
      await this.client.upsert(this.collection, {
        wait: false,
        points: [
          {
            id: randomUUID(),
            vector,
            payload: { scope, query, hits, expiresAt: Date.now() + this.ttlMs },
          },
        ],
      });
    } catch (err) {
      this.log.warn(`store failed (skipping cache write): ${(err as Error).message}`);
    }
  }

  private async sweep(): Promise<void> {
    try {
      await this.client.delete(this.collection, {
        filter: { must: [{ key: 'expiresAt', range: { lt: Date.now() } }] },
      });
    } catch (err) {
      this.log.debug(`sweep failed: ${(err as Error).message}`);
    }
  }
}
