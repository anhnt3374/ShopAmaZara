import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { ListProductsDto } from './dto/list-products.dto';
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
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async list(dto: ListProductsDto): Promise<ListResult> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const qb = this.products.createQueryBuilder('p');

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
    const row = await this.products.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Product not found');
    return toProductDetail(row);
  }

  async facets(q?: string): Promise<{
    categories: string[];
    brands: string[];
    priceRange: { min: number; max: number };
  }> {
    const qb = this.products.createQueryBuilder('p');
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
}
