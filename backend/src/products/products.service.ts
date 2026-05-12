import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
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

  async listForStore(
    storeId: string,
    opts: { q?: string; page?: number; limit?: number },
  ): Promise<ListResult> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const qb = this.products
      .createQueryBuilder('p')
      .where('p.store_id = :storeId', { storeId });
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      qb.andWhere('(LOWER(p.name) LIKE :like OR LOWER(p.brand) LIKE :like)', {
        like,
      });
    }
    qb.orderBy('p.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(toProductSummary), total, page, limit };
  }

  async createForStore(storeId: string, dto: CreateProductDto): Promise<Product> {
    const entity = this.products.create({
      id: randomUUID(),
      name: dto.name,
      brand: dto.brand,
      category: dto.category,
      storeId,
      price: dto.price.toFixed(2),
      discount: dto.discount ?? 0,
      stock: dto.stock,
      imageFirst: dto.imageFirst,
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
    Object.assign(product, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.brand !== undefined && { brand: dto.brand }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.price !== undefined && { price: dto.price.toFixed(2) }),
      ...(dto.discount !== undefined && { discount: dto.discount }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.imageFirst !== undefined && { imageFirst: dto.imageFirst }),
      ...(dto.shortDescription !== undefined && {
        shortDescription: dto.shortDescription,
      }),
      ...(dto.longDescription !== undefined && {
        longDescription: dto.longDescription,
      }),
      ...(dto.highlights !== undefined && { highlights: dto.highlights }),
      ...(dto.availableColors !== undefined && {
        availableColors: dto.availableColors,
      }),
      ...(dto.availableSizes !== undefined && {
        availableSizes: dto.availableSizes,
      }),
      ...(dto.material !== undefined && { material: dto.material }),
      ...(dto.targetGender !== undefined && {
        targetGender: dto.targetGender,
      }),
      ...(dto.targetAgeGroup !== undefined && {
        targetAgeGroup: dto.targetAgeGroup,
      }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
    });
    return this.products.save(product);
  }

  async deleteForStore(storeId: string, id: string): Promise<void> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.storeId !== storeId)
      throw new ForbiddenException('Not your product');
    await this.products.remove(product);
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
