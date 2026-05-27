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
