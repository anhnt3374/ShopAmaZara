import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { Review } from '../reviews/review.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ProductDetail,
  ProductSummary,
  toProductDetail,
  toProductSummary,
} from './dto/product-views';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export interface ListResult {
  items: ProductSummary[];
  total: number;
  page: number;
  limit: number;
  kpi?: {
    total: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Review) private readonly reviewsRepo: Repository<Review>,
  ) {}

  async list(dto: ListProductsDto): Promise<ListResult> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const qb = this.products.createQueryBuilder('p');
    qb.andWhere('p.is_published = 1');

    if (dto.q) {
      const like = `%${dto.q.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.name) LIKE :like OR LOWER(p.brand) LIKE :like OR JSON_SEARCH(LOWER(CAST(p.tags AS CHAR)), "one", :like) IS NOT NULL)',
        { like },
      );
    }
    if (dto.category?.length) qb.andWhere('p.category IN (:...category)', { category: dto.category });
    if (dto.brand?.length) qb.andWhere('p.brand IN (:...brand)', { brand: dto.brand });
    if (dto.storeId?.length) qb.andWhere('p.store_id IN (:...storeIds)', { storeIds: dto.storeId });
    if (dto.minPrice !== undefined) qb.andWhere('p.price >= :minPrice', { minPrice: dto.minPrice });
    if (dto.maxPrice !== undefined) qb.andWhere('p.price <= :maxPrice', { maxPrice: dto.maxPrice });
    if (dto.gender) qb.andWhere('p.target_gender = :gender', { gender: dto.gender });
    if (dto.ageGroup) qb.andWhere('p.target_age_group = :ageGroup', { ageGroup: dto.ageGroup });

    switch (dto.sort) {
      case 'price-asc':
        qb.orderBy('p.price', 'ASC');
        break;
      case 'price-desc':
        qb.orderBy('p.price', 'DESC');
        break;
      case 'newest':
        qb.orderBy('p.created_at', 'DESC');
        break;
      default:
        qb.orderBy('p.discount', 'DESC').addOrderBy('p.created_at', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map(toProductSummary),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<ProductDetail> {
    const row = await this.products.findOne({ where: { id, isPublished: true } });
    if (!row) throw new NotFoundException('Product not found');
    const stats = await this.reviewsRepo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'cnt')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.product_id = :id', { id })
      .getRawOne<{ cnt: string; avg: string | null }>();
    return toProductDetail(row, {
      rating: stats?.avg ? Math.round(Number(stats.avg) * 10) / 10 : 0,
      reviewCount: Number(stats?.cnt ?? 0),
    });
  }

  async facets(q?: string): Promise<{
    categories: string[];
    brands: string[];
    priceRange: { min: number; max: number };
  }> {
    const qb = this.products.createQueryBuilder('p');
    qb.andWhere('p.is_published = 1');
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.name) LIKE :like OR LOWER(p.brand) LIKE :like)',
        { like },
      );
    }
    const [categoriesRaw, brandsRaw, range] = await Promise.all([
      qb
        .clone()
        .select('DISTINCT p.category', 'category')
        .orderBy('p.category', 'ASC')
        .getRawMany<{ category: string }>(),
      qb
        .clone()
        .select('DISTINCT p.brand', 'brand')
        .orderBy('p.brand', 'ASC')
        .getRawMany<{ brand: string }>(),
      qb
        .clone()
        .select('MIN(p.price)', 'min')
        .addSelect('MAX(p.price)', 'max')
        .getRawOne<{ min: string | null; max: string | null }>(),
    ]);
    return {
      categories: categoriesRaw.map((r) => r.category),
      brands: brandsRaw.map((r) => r.brand),
      priceRange: {
        min: Number(range?.min ?? 0),
        max: Number(range?.max ?? 0),
      },
    };
  }

  async listForStore(
    storeId: string,
    opts: { q?: string; page?: number; limit?: number; status?: 'all' | 'published' | 'drafts' },
  ): Promise<ListResult> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const qb = this.products
      .createQueryBuilder('p')
      .where('p.store_id = :storeId', { storeId });
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.name) LIKE :like OR LOWER(p.brand) LIKE :like OR LOWER(p.sku) LIKE :like)',
        { like },
      );
    }
    if (opts.status === 'published') qb.andWhere('p.is_published = 1');
    if (opts.status === 'drafts') qb.andWhere('p.is_published = 0');
    qb.orderBy('p.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await qb.getManyAndCount();

    const kpiRaw = await this.products
      .createQueryBuilder('p')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN p.stock > 10 THEN 1 ELSE 0 END)', 'in_stock')
      .addSelect('SUM(CASE WHEN p.stock > 0 AND p.stock <= 10 THEN 1 ELSE 0 END)', 'low_stock')
      .addSelect('SUM(CASE WHEN p.stock = 0 THEN 1 ELSE 0 END)', 'out_of_stock')
      .where('p.store_id = :storeId', { storeId })
      .getRawOne<{ total: string; in_stock: string; low_stock: string; out_of_stock: string }>();

    return {
      items: rows.map(toProductSummary),
      total,
      page,
      limit,
      kpi: {
        total: Number(kpiRaw?.total ?? 0),
        inStock: Number(kpiRaw?.in_stock ?? 0),
        lowStock: Number(kpiRaw?.low_stock ?? 0),
        outOfStock: Number(kpiRaw?.out_of_stock ?? 0),
      },
    };
  }

  async createForStore(storeId: string, dto: CreateProductDto): Promise<Product> {
    if (dto.salePrice != null && dto.salePrice >= dto.price) {
      throw new BadRequestException('salePrice must be less than price');
    }
    const images = dto.images ?? (dto.imageFirst ? [dto.imageFirst] : []);
    const imageFirst = images[0] ?? dto.imageFirst;
    const sku = dto.sku?.trim() || this.generateSku(storeId);
    const computedDiscount =
      dto.salePrice != null && dto.salePrice < dto.price
        ? Math.round(((dto.price - dto.salePrice) / dto.price) * 100)
        : dto.discount ?? 0;
    const entity = this.products.create({
      id: randomUUID(),
      name: dto.name,
      brand: dto.brand,
      category: dto.category,
      storeId,
      sku,
      model: dto.model ?? null,
      price: dto.price.toFixed(2),
      salePrice: dto.salePrice != null ? dto.salePrice.toFixed(2) : null,
      discount: computedDiscount,
      stock: dto.stock,
      trackInventory: dto.trackInventory ?? true,
      isPublished: dto.isPublished ?? true,
      imageFirst,
      images,
      shortDescription: dto.shortDescription ?? null,
      longDescription: dto.longDescription ?? null,
      highlights: dto.highlights ?? null,
      availableColors: dto.availableColors ?? null,
      availableSizes: dto.availableSizes ?? null,
      material: dto.material ?? null,
      targetGender: dto.targetGender ?? null,
      targetAgeGroup: dto.targetAgeGroup ?? null,
      tags: dto.tags ?? null,
    });
    return this.products.save(entity);
  }

  async updateForStore(
    storeId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId)
      throw new ForbiddenException('Not your product');

    const nextPrice = dto.price ?? Number(product.price);
    const nextSale =
      dto.salePrice === undefined
        ? product.salePrice == null
          ? null
          : Number(product.salePrice)
        : dto.salePrice;
    if (nextSale != null && nextSale >= nextPrice) {
      throw new BadRequestException('salePrice must be less than price');
    }

    const fields: Partial<Product> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.brand !== undefined) fields.brand = dto.brand;
    if (dto.category !== undefined) fields.category = dto.category;
    if (dto.sku !== undefined) fields.sku = dto.sku.trim() || null;
    if (dto.model !== undefined) fields.model = dto.model ?? null;
    if (dto.price !== undefined) fields.price = dto.price.toFixed(2);
    if (dto.salePrice !== undefined)
      fields.salePrice = dto.salePrice == null ? null : dto.salePrice.toFixed(2);
    if (dto.stock !== undefined) fields.stock = dto.stock;
    if (dto.trackInventory !== undefined) fields.trackInventory = dto.trackInventory;
    if (dto.isPublished !== undefined) fields.isPublished = dto.isPublished;
    if (dto.images !== undefined) {
      fields.images = dto.images;
      fields.imageFirst = dto.images[0] ?? product.imageFirst;
    }
    if (dto.imageFirst !== undefined && dto.images === undefined) {
      fields.imageFirst = dto.imageFirst;
    }
    if (dto.shortDescription !== undefined) fields.shortDescription = dto.shortDescription;
    if (dto.longDescription !== undefined) fields.longDescription = dto.longDescription;
    if (dto.highlights !== undefined) fields.highlights = dto.highlights;
    if (dto.availableColors !== undefined) fields.availableColors = dto.availableColors;
    if (dto.availableSizes !== undefined) fields.availableSizes = dto.availableSizes;
    if (dto.material !== undefined) fields.material = dto.material;
    if (dto.targetGender !== undefined) fields.targetGender = dto.targetGender;
    if (dto.targetAgeGroup !== undefined) fields.targetAgeGroup = dto.targetAgeGroup;
    if (dto.tags !== undefined) fields.tags = dto.tags;

    if (dto.price !== undefined || dto.salePrice !== undefined) {
      fields.discount =
        nextSale != null && nextSale < nextPrice
          ? Math.round(((nextPrice - nextSale) / nextPrice) * 100)
          : 0;
    } else if (dto.discount !== undefined) {
      fields.discount = dto.discount;
    }

    Object.assign(product, fields);
    return this.products.save(product);
  }

  async deleteForStore(storeId: string, id: string): Promise<void> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId)
      throw new ForbiddenException('Not your product');
    await this.products.remove(product);
  }

  async createManyForStore(
    storeId: string,
    rows: import('./products.bulk.service').ValidRow[],
  ): Promise<{ created: number; skippedDuringInsert: { row: number; reason: string }[] }> {
    let created = 0;
    const skippedDuringInsert: { row: number; reason: string }[] = [];
    const existing = rows
      .map((r, i) => ({ sku: r.sku, row: i + 1 }))
      .filter((x): x is { sku: string; row: number } => Boolean(x.sku));
    let existingSkus = new Set<string>();
    if (existing.length) {
      const found = await this.products
        .createQueryBuilder('p')
        .select('p.sku', 'sku')
        .where('p.store_id = :storeId', { storeId })
        .andWhere('p.sku IN (:...skus)', { skus: existing.map((e) => e.sku) })
        .getRawMany<{ sku: string }>();
      existingSkus = new Set(found.map((f) => f.sku));
    }
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const entities = chunk
        .filter((r, idx) => {
          if (r.sku && existingSkus.has(r.sku)) {
            skippedDuringInsert.push({ row: i + idx + 1, reason: 'Duplicate SKU' });
            return false;
          }
          return true;
        })
        .map((r) => {
          const imgs = r.imageUrl ? [r.imageUrl] : [];
          return this.products.create({
            id: randomUUID(),
            name: r.name,
            brand: r.brand,
            category: r.category,
            storeId,
            sku: r.sku ?? this.generateSku(storeId),
            model: r.model,
            price: r.price.toFixed(2),
            salePrice: r.salePrice != null ? r.salePrice.toFixed(2) : null,
            discount:
              r.salePrice != null && r.salePrice < r.price
                ? Math.round(((r.price - r.salePrice) / r.price) * 100)
                : 0,
            stock: r.stock,
            trackInventory: true,
            isPublished: r.isPublished,
            imageFirst: imgs[0] ?? '',
            images: imgs,
            shortDescription: null,
            longDescription: r.description,
            highlights: null,
            color: null,
            availableColors: null,
            availableSizes: null,
            material: null,
            targetGender: null,
            targetAgeGroup: null,
            tags: null,
          });
        });
      if (entities.length) {
        await this.products.save(entities);
        created += entities.length;
      }
    }
    return { created, skippedDuringInsert };
  }

  async findOneForStore(storeId: string, id: string): Promise<ProductDetail> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId) throw new ForbiddenException('Not your product');
    return toProductDetail(product);
  }

  private generateSku(storeId: string): string {
    const storeShort = storeId.replace(/-/g, '').slice(0, 6).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `NX-${storeShort}-${rand}`;
  }

  async inventoryForStore(
    storeId: string,
    q?: string,
  ): Promise<{
    items: Array<{
      sku: string;
      name: string;
      category: string;
      stock: number;
      price: number;
      status: 'In Stock' | 'Low Stock' | 'Out of Stock';
    }>;
  }> {
    const qb = this.products
      .createQueryBuilder('p')
      .where('p.store_id = :storeId', { storeId });
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      qb.andWhere('(LOWER(p.name) LIKE :like OR LOWER(p.id) LIKE :like)', {
        like,
      });
    }
    qb.orderBy('p.updated_at', 'DESC');
    const rows = await qb.getMany();
    return {
      items: rows.map((p) => {
        const price = Number(p.price);
        const status: 'In Stock' | 'Low Stock' | 'Out of Stock' =
          p.stock === 0 ? 'Out of Stock' : p.stock <= 10 ? 'Low Stock' : 'In Stock';
        return {
          sku: p.id,
          name: p.name,
          category: p.category,
          stock: p.stock,
          price,
          status,
        };
      }),
    };
  }
}
