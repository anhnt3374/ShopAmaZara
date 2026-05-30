import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextEmbeddingClient } from '../embeddings/text-embedding.client';
import { ImageEmbeddingClient } from '../embeddings/image-embedding.client';
import { ProductVectors, QdrantService } from './qdrant.service';
import { ATTR_VECTOR, DESC_VECTOR, IMAGE_VECTOR } from './qdrant.constants';
import { DEFAULT_CANDIDATE_K, DEFAULT_RESULT_CAP, DEFAULT_WEIGHTS } from './search.constants';
import { buildFilter, SearchFilters } from './search.filter';
import { SEARCH_CACHE, SearchCacheStore } from './search-cache';
import { QueryCacheService } from './query-cache.service';

export interface SearchParams extends SearchFilters {
  query: string;
  userPreference?: ProductVectors;
  // Personalization discriminator for the query cache (the caller's user id).
  // Only used to key cache entries when a preference vector is actually applied.
  userKey?: string;
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
  // `|| 0` coerces a NaN (malformed/non-numeric payload value) to 0 so a single
  // bad row can't poison the whole result-set sort with NaN.
  const discount = Math.max(0, Math.min(100, Number(payload.discount ?? 0) || 0)) / 100;
  const rating = Math.max(0, Math.min(5, Number(payload.rating ?? 0) || 0)) / 5;
  const reviewCount = Math.max(0, Number(payload.reviewCount ?? 0) || 0);
  const conf = Math.min(1, Math.log1p(reviewCount) / Math.log(50));
  const v = 0.5 * discount + 0.5 * rating * conf;
  return Math.max(0, Math.min(1, v));
}

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

@Injectable()
export class SearchService {
  private readonly log = new Logger('SearchService');
  private readonly weights: typeof DEFAULT_WEIGHTS;
  private readonly candidateK: number;
  private readonly resultCap: number;
  private readonly alpha: number;
  // Exact-match query cache (Redis): a normalized (query + filters +
  // personalization) key -> ranked hit list, so a repeated query — and every
  // page of it, since pagination just slices these hits — skips the embed +
  // Qdrant + fusion work. Best-effort: a cache outage never breaks search.
  private readonly cacheTtlMs: number;

  constructor(
    private readonly text: TextEmbeddingClient,
    private readonly image: ImageEmbeddingClient,
    private readonly qdrant: QdrantService,
    config: ConfigService,
    @Optional() @Inject(SEARCH_CACHE) private readonly cache?: SearchCacheStore | null,
    @Optional() private readonly queryCache?: QueryCacheService,
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
    this.alpha = num('PERSONALIZATION_ALPHA', 0.25);
    this.cacheTtlMs = num('SEARCH_CACHE_TTL_MS', 60000); // 0 disables the cache
  }

  private cacheKey(params: SearchParams): string {
    const pref = params.userPreference;
    const hasPref = !!pref && !!(pref.desc || pref.attr || pref.image);
    // Non-personalized results (anon, or logged-in with no history) share one
    // entry; personalized results are keyed per user.
    const prefKey = hasPref ? params.userKey ?? 'pref' : 'anon';
    return JSON.stringify([
      params.query.trim().toLowerCase(),
      params.category ?? null,
      params.brand ?? null,
      params.storeId ?? null,
      params.minPrice ?? null,
      params.maxPrice ?? null,
      params.gender ?? null,
      params.ageGroup ?? null,
      prefKey,
    ]);
  }

  // Filter-only key for the semantic cache (personalization excluded — semantic
  // caching is applied to non-personalized queries only).
  private scopeKey(params: SearchParams): string {
    return JSON.stringify([
      params.category ?? null,
      params.brand ?? null,
      params.storeId ?? null,
      params.minPrice ?? null,
      params.maxPrice ?? null,
      params.gender ?? null,
      params.ageGroup ?? null,
    ]);
  }

  async search(params: SearchParams): Promise<RankedHit[]> {
    // Tier 1: Redis exact cache — skips the embedding entirely on a verbatim repeat.
    const key = this.cache && this.cacheTtlMs > 0 ? this.cacheKey(params) : null;
    if (key) {
      const cached = await this.cache!.get(key);
      if (cached) return cached;
    }

    const [bgeVecs, clipVecs] = await Promise.all([
      this.text.embed([params.query], { isQuery: true }),
      this.image.embedText([params.query]),
    ]);
    const qBge = bgeVecs[0];
    const qClip = clipVecs[0];
    if (!qBge || !qClip) throw new Error('query embedding produced no vector');

    const pref = params.userPreference;
    const hasPref = !!pref && !!(pref.desc || pref.attr || pref.image);

    // Tier 2: semantic cache (non-personalized queries only). A near-identical
    // past query in the same filter scope returns its hits without the Qdrant
    // product search; populate the exact cache so the next verbatim repeat is instant.
    const scope = !hasPref && this.queryCache?.enabled ? this.scopeKey(params) : null;
    if (scope) {
      const sem = await this.queryCache!.lookup(qBge, scope);
      if (sem) {
        if (key) await this.cache!.set(key, sem, this.cacheTtlMs);
        return sem;
      }
    }

    const filter = buildFilter(params);
    const [descIds, attrIds, imageIds] = await Promise.all([
      this.qdrant.searchVector(DESC_VECTOR, qBge, filter, this.candidateK),
      this.qdrant.searchVector(ATTR_VECTOR, qBge, filter, this.candidateK),
      this.qdrant.searchVector(IMAGE_VECTOR, qClip, filter, this.candidateK),
    ]);
    const ids = [...new Set([...descIds, ...attrIds, ...imageIds])];
    if (ids.length === 0) {
      if (key) await this.cache!.set(key, [], this.cacheTtlMs);
      return [];
    }

    const points = await this.qdrant.retrieveWithVectors(ids);
    // Only blend when there is an actual preference vector — an empty {} (a
    // logged-in buyer with no history) must not uniformly shrink every score by α
    // (pref/hasPref computed above for the cache decision).
    const hits: RankedHit[] = points.map((p) => {
      const sDesc = p.vectors.desc ? Math.max(0, dot(qBge, p.vectors.desc)) : 0;
      const sAttr = p.vectors.attr ? Math.max(0, dot(qBge, p.vectors.attr)) : 0;
      const sImage = p.vectors.image ? Math.max(0, dot(qClip, p.vectors.image)) : 0;
      const sBoost = boostScore(p.payload);
      const queryScore =
        this.weights.desc * sDesc +
        this.weights.attr * sAttr +
        this.weights.image * sImage +
        this.weights.boost * sBoost;
      const score = hasPref
        ? (1 - this.alpha) * queryScore + this.alpha * personalizationScore(pref!, p.vectors, this.weights)
        : queryScore;
      return { id: p.id, score, components: { desc: sDesc, attr: sAttr, image: sImage, boost: sBoost } };
    });
    hits.sort((a, b) => b.score - a.score);
    const capped = hits.slice(0, this.resultCap);
    this.log.debug(`q=${JSON.stringify(params.query)} cands=${ids.length} kept=${capped.length}`);
    if (key) await this.cache!.set(key, capped, this.cacheTtlMs);
    if (scope && capped.length > 0) await this.queryCache!.store(qBge, scope, params.query, capped);
    return capped;
  }
}
