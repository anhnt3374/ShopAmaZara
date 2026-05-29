import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextEmbeddingClient } from '../embeddings/text-embedding.client';
import { ImageEmbeddingClient } from '../embeddings/image-embedding.client';
import { ProductVectors, QdrantService } from './qdrant.service';
import { ATTR_VECTOR, DESC_VECTOR, IMAGE_VECTOR } from './qdrant.constants';
import { DEFAULT_CANDIDATE_K, DEFAULT_RESULT_CAP, DEFAULT_WEIGHTS } from './search.constants';
import { buildFilter, SearchFilters } from './search.filter';

export interface SearchParams extends SearchFilters {
  query: string;
  userPreference?: ProductVectors;
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
    this.alpha = num('PERSONALIZATION_ALPHA', 0.25);
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
    // Only blend when there is an actual preference vector — an empty {} (a
    // logged-in buyer with no history) must not uniformly shrink every score by α.
    const pref = params.userPreference;
    const hasPref = !!pref && !!(pref.desc || pref.attr || pref.image);
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
    return capped;
  }
}
