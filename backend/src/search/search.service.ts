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
