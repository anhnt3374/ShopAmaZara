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
    try {
      const computed = await this.compute(userId);
      const entry: Entry = { ...computed, expiresAt: now + this.ttlMs };
      this.cache.set(userId, entry);
      return entry;
    } catch (err) {
      // Personalization is best-effort: a DB/Qdrant failure degrades to no
      // personalization (empty vectors + empty profile) rather than erroring the
      // caller (search falls back to query-only; GET /me/profile returns empties).
      // Not cached, so the next request retries.
      this.log.warn(`preference compute failed for ${userId}: ${(err as Error).message}`);
      return {
        vectors: {},
        profile: { topColors: [], topSizes: [], orderPrice: { min: 0, max: 0, avg: 0, count: 0 } },
        expiresAt: 0,
      };
    }
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
