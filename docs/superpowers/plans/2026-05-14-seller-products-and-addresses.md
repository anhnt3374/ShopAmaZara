# Seller Products + Addresses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seller-side product CRUD (List / Add / Edit / Archive / Bulk-import) with real image upload, plus a card-grid re-skin of the buyer addresses page.

**Architecture:** Six new columns on the `products` table (`images`, `is_published`, `sku`, `sale_price`, `track_inventory`, `model`). New Nest `UploadsModule` (Multer + local disk + static serve). New `ProductsBulkService` for CSV/XLS parsing. Frontend gets a unified `ProductForm` component used by both create + edit pages, a multi-image `ImageUploader`, a bulk-import modal, and a re-skinned `AddressCard`.

**Tech Stack:** NestJS 10 + TypeORM + MySQL (`multer`, `csv-parse`, `xlsx`). React 18 + Vite + Tailwind (no new client deps; uses `fetch` + `FormData` directly).

**Spec:** [`docs/superpowers/specs/2026-05-14-seller-products-and-addresses-design.md`](../specs/2026-05-14-seller-products-and-addresses-design.md)

**Working directory throughout:** `/home/anhnt2112/Documents/temp/amazara`. All paths below are relative to it unless absolute.

---

## File map

**Backend — new:**
- `backend/src/uploads/uploads.module.ts`
- `backend/src/uploads/uploads.controller.ts`
- `backend/src/products/products.bulk.service.ts`
- `backend/src/products/products.bulk.service.spec.ts`
- `backend/src/products/dto/list-store-products.dto.ts`
- `backend/test/fixtures/products-sample.csv`
- `backend/test/fixtures/products-with-duplicate.csv`
- `backend/test/fixtures/products-missing-price.csv`
- `backend/test/fixtures/sample.png`

**Backend — modified:**
- `backend/.gitignore` — add `uploads/`
- `backend/package.json` — `multer`, `@types/multer`, `csv-parse`, `xlsx`
- `backend/src/products/product.entity.ts` — 6 new columns
- `backend/src/products/dto/create-product.dto.ts` — new optional fields
- `backend/src/products/dto/product-views.ts` — new fields in views + `originalPrice` fix
- `backend/src/products/products.service.ts` — SKU auto-gen, isPublished, salePrice validation, list filters + KPI, bulk integration
- `backend/src/products/products.service.spec.ts` — new tests
- `backend/src/products/products.controller.ts` — public list/findOne filter `is_published = 1`
- `backend/src/products/store-products.controller.ts` — `?status=` query, `/bulk`, `/bulk/template`
- `backend/src/products/products.module.ts` — register bulk service
- `backend/src/main.ts` — `useStaticAssets`
- `backend/src/app.module.ts` — register `UploadsModule`
- `backend/test/store-products.e2e-spec.ts` — extended cases
- `backend/test/setup-e2e.ts` (no schema change needed; `products` already truncated)

**Frontend — new:**
- `frontend/src/pages/store/StoreProductFormPage.jsx`
- `frontend/src/pages/store/ProductForm.jsx`
- `frontend/src/pages/store/ImageUploader.jsx`
- `frontend/src/pages/store/ImportProductModal.jsx`
- `frontend/src/pages/store/InventoryKpiCards.jsx`
- `frontend/src/components/AddressCard.jsx`
- `frontend/src/services/uploads.js`

**Frontend — modified:**
- `frontend/src/pages/store/StoreInventoryPage.jsx` — full rewrite
- `frontend/src/pages/AddressesPage.jsx` — re-skin
- `frontend/src/services/inventory.js` — drop mocks + new methods
- `frontend/src/router.jsx` — `/store/products/new` + `/store/products/:id`

**Docs:**
- `docs/features/products.md` — note new fields + endpoints
- `docs/README.md` — new row

---

## Phase A — Backend: schema + service + uploads + bulk

### Task 1: Install backend deps + gitignore uploads

**Files:**
- Modify: `backend/package.json` (via npm install)
- Modify: `backend/.gitignore`

- [ ] **Step 1: Install**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend
npm install multer csv-parse xlsx
npm install -D @types/multer
```

If peer-dep conflicts occur on the existing NestJS 10 install, append `--legacy-peer-deps`.

- [ ] **Step 2: Gitignore uploads**

Append to `/home/anhnt2112/Documents/temp/amazara/backend/.gitignore`:

```
# Local product image uploads (gitignored — orphan cleanup is out of scope in v1)
uploads/
```

If `.gitignore` doesn't exist in `backend/`, create it with just that block.

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/package.json backend/package-lock.json backend/.gitignore
git commit -m "chore(backend): add multer/csv-parse/xlsx; gitignore uploads/"
```

---

### Task 2: Extend `Product` entity with the 6 new columns

**Files:**
- Modify: `backend/src/products/product.entity.ts`

- [ ] **Step 1: Add the new columns**

Replace `backend/src/products/product.entity.ts` with:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TargetGender = 'men' | 'women' | 'unisex' | 'kids';

@Entity({ name: 'products' })
@Index('idx_products_store', ['storeId'])
@Index('idx_products_category', ['category'])
@Index('idx_products_brand', ['brand'])
@Index('idx_products_store_sku', ['storeId', 'sku'])
export class Product {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  brand!: string;

  @Column({ type: 'varchar', length: 255 })
  category!: string;

  @Column({ name: 'store_id', type: 'char', length: 36 })
  storeId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sku!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  model!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Column({ name: 'sale_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  salePrice!: string | null;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  discount!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  stock!: number;

  @Column({ name: 'track_inventory', type: 'boolean', default: true })
  trackInventory!: boolean;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished!: boolean;

  @Column({ name: 'image_first', type: 'text' })
  imageFirst!: string;

  @Column({ type: 'json', nullable: true })
  images!: unknown;

  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription!: string | null;

  @Column({ name: 'long_description', type: 'text', nullable: true })
  longDescription!: string | null;

  @Column({ type: 'json', nullable: true })
  highlights!: unknown;

  @Column({ type: 'json', nullable: true })
  color!: unknown;

  @Column({ name: 'available_colors', type: 'json', nullable: true })
  availableColors!: unknown;

  @Column({ name: 'available_sizes', type: 'json', nullable: true })
  availableSizes!: unknown;

  @Column({ type: 'varchar', length: 255, nullable: true })
  material!: string | null;

  @Column({
    name: 'target_gender',
    type: 'enum',
    enum: ['men', 'women', 'unisex', 'kids'],
    nullable: true,
  })
  targetGender!: TargetGender | null;

  @Column({ name: 'target_age_group', type: 'varchar', length: 64, nullable: true })
  targetAgeGroup!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Verify compile**

Run: `cd /home/anhnt2112/Documents/temp/amazara/backend && npx tsc --noEmit -p tsconfig.build.json`
Expected: errors elsewhere — `products.service.ts` and `dto/create-product.dto.ts` haven't been updated yet. Those get fixed in the next tasks. Save the list of failing files for next steps.

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/product.entity.ts
git commit -m "feat(products): add sku, sale_price, track_inventory, is_published, model, images columns"
```

---

### Task 3: Extend `CreateProductDto`, `UpdateProductDto`, add `ListStoreProductsDto`

**Files:**
- Modify: `backend/src/products/dto/create-product.dto.ts`
- Create: `backend/src/products/dto/list-store-products.dto.ts`

(`UpdateProductDto` uses `PartialType(CreateProductDto)` — no edit needed.)

- [ ] **Step 1: Rewrite `create-product.dto.ts`**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsString()
  @Length(1, 255)
  brand!: string;

  @IsString()
  @Length(1, 255)
  category!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  model?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsString()
  imageFirst!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  longDescription?: string;

  @IsOptional()
  @IsArray()
  highlights?: unknown[];

  @IsOptional()
  availableColors?: unknown;

  @IsOptional()
  availableSizes?: unknown;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsEnum(['men', 'women', 'unisex', 'kids'])
  targetGender?: 'men' | 'women' | 'unisex' | 'kids';

  @IsOptional()
  @IsString()
  targetAgeGroup?: string;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  tags?: string[];
}
```

Two intentional changes from the prior version: `imageFirst` is now `@IsString()` only (was `@IsUrl`) — uploaded paths like `/static/products/abc.png` aren't valid URLs by `validator.isURL`'s defaults; and `sku`/`model`/`salePrice`/`trackInventory`/`isPublished`/`images` are added.

- [ ] **Step 2: Create `list-store-products.dto.ts`**

```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListStoreProductsDto {
  @IsOptional()
  @IsEnum(['all', 'published', 'drafts'])
  status?: 'all' | 'published' | 'drafts';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/dto/create-product.dto.ts backend/src/products/dto/list-store-products.dto.ts
git commit -m "feat(products): DTOs accept sku/sale_price/images/isPublished + ListStoreProductsDto"
```

---

### Task 4: Update `product-views.ts` (snapshot views) — new fields + originalPrice fix

**Files:**
- Modify: `backend/src/products/dto/product-views.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { Product } from '../product.entity';

export interface ProductSummary {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  storeId: string;
  sku: string | null;
  price: number;
  salePrice: number | null;
  discount: number;
  originalPrice: number | null;
  image: string;
  inStock: boolean;
  stock: number;
  isPublished: boolean;
  colors: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  model: string | null;
  trackInventory: boolean;
  images: string[];
  highlights: unknown;
  availableColors: unknown;
  availableSizes: unknown;
  material: string | null;
  targetGender: string | null;
  targetAgeGroup: string | null;
  tags: unknown;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function colorHexes(availableColors: unknown): string[] {
  const arr = asArray<{ hex?: string }>(availableColors);
  return arr.map((c) => c?.hex).filter((h): h is string => typeof h === 'string');
}

function imagesArray(p: Product): string[] {
  const arr = asArray<string>(p.images);
  if (arr.length) return arr;
  return p.imageFirst ? [p.imageFirst] : [];
}

export function toProductSummary(p: Product): ProductSummary {
  const price = Number(p.price);
  const salePrice = p.salePrice == null ? null : Number(p.salePrice);
  return {
    id: p.id,
    name: p.name,
    subtitle: p.shortDescription,
    brand: p.brand,
    category: p.category,
    storeId: p.storeId,
    sku: p.sku,
    price,
    salePrice,
    discount: p.discount,
    originalPrice: salePrice == null ? null : price,
    image: p.imageFirst,
    inStock: p.stock > 0,
    stock: p.stock,
    isPublished: p.isPublished,
    colors: colorHexes(p.availableColors),
  };
}

export function toProductDetail(p: Product): ProductDetail {
  return {
    ...toProductSummary(p),
    description: p.longDescription,
    model: p.model,
    trackInventory: p.trackInventory,
    images: imagesArray(p),
    highlights: asJson(p.highlights),
    availableColors: asJson(p.availableColors),
    availableSizes: asJson(p.availableSizes),
    material: p.material,
    targetGender: p.targetGender,
    targetAgeGroup: p.targetAgeGroup,
    tags: asJson(p.tags),
  };
}
```

Notes:
- `originalPrice` is now derived from `salePrice` (the spec's chosen model). When `salePrice` is set, the buyer-side "old price" badge is the regular `price`; when null, no strike-through.
- `images` array prefers the new JSON column; falls back to `[imageFirst]` for legacy rows.

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/dto/product-views.ts
git commit -m "feat(products): expose sku/salePrice/isPublished/images/model in views; fix originalPrice"
```

---

### Task 5: `ProductsService` — SKU auto-gen, isPublished, salePrice validation + spec

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Modify: `backend/src/products/products.service.spec.ts`

- [ ] **Step 1: Append failing tests to the existing spec**

Append to `backend/src/products/products.service.spec.ts` at the bottom of the existing `describe('ProductsService', …)` block (preserve the existing setup):

```ts
  describe('createForStore (new fields)', () => {
    it('auto-generates SKU when blank', async () => {
      (repo.create as jest.Mock).mockImplementation((d) => d);
      (repo.save as jest.Mock).mockImplementation((p) => ({ ...p, id: 'p1' }));
      const out = await service.createForStore('store-abc-def', {
        name: 'X', brand: 'B', category: 'C', price: 10, stock: 5, imageFirst: '/x.png',
      } as any);
      expect(out.sku).toMatch(/^NX-[A-Z0-9]+-[A-Z0-9]{6}$/);
    });

    it('rejects salePrice >= price', async () => {
      await expect(
        service.createForStore('store-1', {
          name: 'X', brand: 'B', category: 'C', price: 10, salePrice: 10, stock: 5, imageFirst: '/x.png',
        } as any),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createForStore('store-1', {
          name: 'X', brand: 'B', category: 'C', price: 10, salePrice: 15, stock: 5, imageFirst: '/x.png',
        } as any),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('defaults isPublished to true and trackInventory to true', async () => {
      let saved: any = null;
      (repo.create as jest.Mock).mockImplementation((d) => d);
      (repo.save as jest.Mock).mockImplementation((p) => {
        saved = p;
        return { ...p, id: 'p2' };
      });
      await service.createForStore('store-1', {
        name: 'X', brand: 'B', category: 'C', price: 10, stock: 5, imageFirst: '/x.png',
      } as any);
      expect(saved.isPublished).toBe(true);
      expect(saved.trackInventory).toBe(true);
    });
  });
```

- [ ] **Step 2: Run and verify fail**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx jest products.service.spec
```
Expected: FAIL (compile errors or test assertions).

- [ ] **Step 3: Update the service**

In `backend/src/products/products.service.ts`:

1. Add at the top, next to existing imports:
   ```ts
   import { BadRequestException } from '@nestjs/common';
   ```

2. Add this private helper inside the class:
   ```ts
   private generateSku(storeId: string): string {
     const storeShort = storeId.replace(/-/g, '').slice(0, 6).toUpperCase();
     const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
     return `NX-${storeShort}-${rand}`;
   }
   ```

3. Replace the entire body of `createForStore(storeId, dto)` with:
   ```ts
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
   ```

4. Replace the entire body of `updateForStore(storeId, id, dto)` to mirror the same logic where the fields are present:
   ```ts
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

     // Re-derive discount when price or salePrice moved.
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
   ```

- [ ] **Step 4: Run tests**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx jest products.service.spec
```
Expected: PASS (existing tests + 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/products.service.ts backend/src/products/products.service.spec.ts
git commit -m "feat(products): auto-gen SKU, salePrice validation, isPublished default + tests"
```

---

### Task 6: `ProductsService.listForStore` — status filter + KPI

**Files:**
- Modify: `backend/src/products/products.service.ts`

- [ ] **Step 1: Replace `listForStore`**

Replace the existing `listForStore(...)` method with this version. Also extend the existing `ListResult` interface in the same file to include `kpi`.

```ts
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

// ... inside ProductsService:

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
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/products.service.ts
git commit -m "feat(products): listForStore supports status filter + KPI"
```

---

### Task 7: Public list/findOne filter `is_published = 1`

**Files:**
- Modify: `backend/src/products/products.service.ts`

- [ ] **Step 1: Patch `list` and `findOne`**

In `backend/src/products/products.service.ts`:

- Inside `list(dto)`: add `qb.andWhere('p.is_published = 1');` immediately after `const qb = this.products.createQueryBuilder('p');`.
- Inside `findOne(id)`: change the `findOne` call to `await this.products.findOne({ where: { id, isPublished: true } });` (and keep the `if (!row) throw new NotFoundException(...)` line). 404 is the right answer for drafts.
- Inside `facets(q)`: also add `qb.andWhere('p.is_published = 1');` so facets reflect only published products.

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/products.service.ts
git commit -m "feat(products): public catalog hides drafts (is_published = 1)"
```

---

### Task 8: `UploadsModule` — Multer + product-image endpoint + static serve

**Files:**
- Create: `backend/src/uploads/uploads.module.ts`
- Create: `backend/src/uploads/uploads.controller.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: `uploads.controller.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Controller('uploads')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class UploadsController {
  @Post('product-image')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads/products',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5_000_000 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
        else cb(new BadRequestException('Unsupported image type'), false);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file');
    return { url: `/static/products/${file.filename}` };
  }
}
```

- [ ] **Step 2: `uploads.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { UploadsController } from './uploads.controller';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';

@Module({
  imports: [StoresModule],
  controllers: [UploadsController],
  providers: [SellerStoreGuard],
})
export class UploadsModule {}
```

- [ ] **Step 3: Patch `main.ts`** — add static serving

Read the file first. Then:

1. Add this import at the top with the existing imports:
   ```ts
   import { join } from 'node:path';
   import type { NestExpressApplication } from '@nestjs/platform-express';
   ```

2. Change the `NestFactory.create(...)` call to:
   ```ts
   const app = await NestFactory.create<NestExpressApplication>(AppModule);
   ```

3. Right after `app.useGlobalPipes(...)`, before `app.enableCors(...)`, add:
   ```ts
   app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/static/' });
   ```

- [ ] **Step 4: Register in `app.module.ts`**

Add the import next to the other module imports:
```ts
import { UploadsModule } from './uploads/uploads.module';
```
And append `UploadsModule` to the `imports: [...]` list.

- [ ] **Step 5: Verify compile**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx tsc --noEmit -p tsconfig.build.json
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/uploads backend/src/main.ts backend/src/app.module.ts
git commit -m "feat(uploads): /uploads/product-image via Multer; serve /static/* from uploads/"
```

---

### Task 9: `ProductsBulkService` + unit tests

**Files:**
- Create: `backend/src/products/products.bulk.service.ts`
- Create: `backend/src/products/products.bulk.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

```ts
// backend/src/products/products.bulk.service.spec.ts
import { ProductsBulkService } from './products.bulk.service';

describe('ProductsBulkService.parseCsvBuffer', () => {
  let service: ProductsBulkService;
  beforeEach(() => {
    service = new ProductsBulkService();
  });

  it('parses a valid CSV', () => {
    const csv = Buffer.from(
      'name,sku,category,price,stock\nA,NX-A,cat,10,5\nB,,cat,20,2\n',
    );
    const out = service.parseCsvBuffer(csv);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ name: 'A', sku: 'NX-A', price: '10' });
    expect(out[1].sku).toBe('');
  });

  it('matches headers case-insensitively', () => {
    const csv = Buffer.from('Name,SKU,Category,Price,Stock\nX,X1,c,1,1\n');
    const out = service.parseCsvBuffer(csv);
    expect(out[0]).toMatchObject({ name: 'X', sku: 'X1', category: 'c' });
  });

  it('ignores trailing empty rows', () => {
    const csv = Buffer.from('name,sku,category,price,stock\nA,NX-A,c,1,1\n\n');
    const out = service.parseCsvBuffer(csv);
    expect(out.length).toBe(1);
  });
});

describe('ProductsBulkService.validateRows', () => {
  let service: ProductsBulkService;
  beforeEach(() => {
    service = new ProductsBulkService();
  });

  it('rejects rows missing name', () => {
    const result = service.validateRows([
      { name: '', sku: 'A', category: 'c', price: '10', stock: '1' },
      { name: 'B', sku: 'B', category: 'c', price: '20', stock: '2' },
    ]);
    expect(result.valid.length).toBe(1);
    expect(result.skipped).toEqual([{ row: 1, reason: 'Missing name' }]);
  });

  it('rejects invalid price/stock', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'A', category: 'c', price: 'abc', stock: '1' },
      { name: 'B', sku: 'B', category: 'c', price: '10', stock: 'xyz' },
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'Invalid price',
      'Invalid stock',
    ]);
  });

  it('rejects duplicate SKU within the upload', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'DUP', category: 'c', price: '10', stock: '1' },
      { name: 'B', sku: 'DUP', category: 'c', price: '20', stock: '2' },
    ]);
    expect(result.valid.length).toBe(1);
    expect(result.skipped[0]).toMatchObject({ row: 2, reason: 'Duplicate SKU' });
  });

  it('rejects salePrice >= price', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'A', category: 'c', price: '10', stock: '1', saleprice: '10' },
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped[0].reason).toBe('Sale price not less than price');
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx jest products.bulk.service.spec
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// backend/src/products/products.bulk.service.ts
import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface ParsedRow {
  name?: string;
  sku?: string;
  category?: string;
  price?: string;
  stock?: string;
  brand?: string;
  saleprice?: string;
  model?: string;
  description?: string;
  imageurl?: string;
  ispublished?: string;
  [k: string]: string | undefined;
}

export interface ValidRow {
  name: string;
  sku: string | null;
  category: string;
  price: number;
  stock: number;
  brand: string;
  salePrice: number | null;
  model: string | null;
  description: string | null;
  imageUrl: string | null;
  isPublished: boolean;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export const MAX_ROWS = 500;

@Injectable()
export class ProductsBulkService {
  parseCsvBuffer(buffer: Buffer): ParsedRow[] {
    const rows: Record<string, string>[] = parseCsv(buffer, {
      columns: (header: string[]) => header.map((h) => h.toLowerCase().trim()),
      skip_empty_lines: true,
      trim: true,
    });
    return rows;
  }

  parseXlsxBuffer(buffer: Buffer): ParsedRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const sheet = wb.Sheets[firstSheet];
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
    });
    return raw.map((row) => {
      const out: ParsedRow = {};
      for (const [k, v] of Object.entries(row)) {
        out[k.toLowerCase().trim()] = String(v ?? '').trim();
      }
      return out;
    });
  }

  validateRows(rows: ParsedRow[]): { valid: ValidRow[]; skipped: SkippedRow[] } {
    const valid: ValidRow[] = [];
    const skipped: SkippedRow[] = [];
    const seenSkus = new Set<string>();
    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const name = (row.name ?? '').trim();
      if (!name) {
        skipped.push({ row: rowNum, reason: 'Missing name' });
        return;
      }
      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) {
        skipped.push({ row: rowNum, reason: 'Invalid price' });
        return;
      }
      const stock = Number(row.stock);
      if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
        skipped.push({ row: rowNum, reason: 'Invalid stock' });
        return;
      }
      const salePriceRaw = (row.saleprice ?? '').trim();
      let salePrice: number | null = null;
      if (salePriceRaw) {
        const n = Number(salePriceRaw);
        if (!Number.isFinite(n) || n < 0) {
          skipped.push({ row: rowNum, reason: 'Invalid sale price' });
          return;
        }
        if (n >= price) {
          skipped.push({ row: rowNum, reason: 'Sale price not less than price' });
          return;
        }
        salePrice = n;
      }
      const sku = (row.sku ?? '').trim() || null;
      if (sku) {
        if (seenSkus.has(sku)) {
          skipped.push({ row: rowNum, reason: 'Duplicate SKU' });
          return;
        }
        seenSkus.add(sku);
      }
      const ispub = (row.ispublished ?? '').trim().toLowerCase();
      const isPublished = ispub === '' ? true : ispub !== 'false' && ispub !== '0';
      valid.push({
        name,
        sku,
        category: (row.category ?? '').trim() || 'Uncategorized',
        price,
        stock,
        brand: (row.brand ?? '').trim() || 'Unknown',
        salePrice,
        model: (row.model ?? '').trim() || null,
        description: (row.description ?? '').trim() || null,
        imageUrl: (row.imageurl ?? '').trim() || null,
        isPublished,
      });
    });
    return { valid, skipped };
  }
}
```

- [ ] **Step 4: Re-run tests**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx jest products.bulk.service.spec
```
Expected: PASS — all bulk-parser cases green.

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/products.bulk.service.ts backend/src/products/products.bulk.service.spec.ts
git commit -m "feat(products): ProductsBulkService for CSV/XLS parsing + validation"
```

---

### Task 10: Wire bulk + new query into `StoreProductsController`

**Files:**
- Modify: `backend/src/products/store-products.controller.ts`
- Modify: `backend/src/products/products.module.ts`
- Modify: `backend/src/products/products.service.ts`

- [ ] **Step 1: Add `createMany` helper on `ProductsService`**

Append this method to `ProductsService`:

```ts
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
```

- [ ] **Step 2: Replace `store-products.controller.ts`**

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { MAX_ROWS, ProductsBulkService } from './products.bulk.service';

@Controller('store/products')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly bulk: ProductsBulkService,
  ) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query() dto: ListStoreProductsDto,
  ) {
    return this.products.listForStore(req.store.id, dto);
  }

  @Get('bulk/template')
  template(@Res() res: Response) {
    const csv =
      'name,sku,category,price,stock,brand,salePrice,model,description,imageUrl,isPublished\n' +
      'Example Product,NX-EXAMPLE-001,Electronics,99.99,10,Nexus,79.99,XP-2024,Sample description,,true\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    res.send(csv);
  }

  @Post('bulk')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10_000_000 },
    }),
  )
  async bulkUpload(
    @Req() req: Request & { store: Store },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file');
    const lower = file.originalname.toLowerCase();
    const rows = lower.endsWith('.csv')
      ? this.bulk.parseCsvBuffer(file.buffer)
      : lower.endsWith('.xls') || lower.endsWith('.xlsx')
      ? this.bulk.parseXlsxBuffer(file.buffer)
      : (() => {
          throw new BadRequestException('Unsupported file extension');
        })();
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`Too many rows (max ${MAX_ROWS})`);
    }
    const { valid, skipped } = this.bulk.validateRows(rows);
    const { created, skippedDuringInsert } = await this.products.createManyForStore(
      req.store.id,
      valid,
    );
    return { created, skippedRows: [...skipped, ...skippedDuringInsert] };
  }

  @Post()
  async create(
    @Req() req: Request & { store: Store },
    @Body() dto: CreateProductDto,
  ) {
    const product = await this.products.createForStore(req.store.id, dto);
    return { product };
  }

  @Patch(':id')
  async update(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.products.updateForStore(req.store.id, id, dto);
    return { product };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request & { store: Store }, @Param('id') id: string) {
    await this.products.deleteForStore(req.store.id, id);
  }
}
```

Note: `/bulk` and `/bulk/template` are placed BEFORE the `@Patch(':id')` and `@Delete(':id')` routes so the path `:id` doesn't shadow them.

- [ ] **Step 3: Register `ProductsBulkService`**

In `backend/src/products/products.module.ts`, add `ProductsBulkService` to the `providers: [...]` list, and import it at the top.

- [ ] **Step 4: Verify compile + tests**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npx tsc --noEmit -p tsconfig.build.json && npx jest
```
Expected: clean compile; all tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products/store-products.controller.ts backend/src/products/products.module.ts backend/src/products/products.service.ts
git commit -m "feat(products): /store/products/bulk + bulk/template + list dto"
```

---

### Task 11: e2e — bulk import + isPublished + upload

**Files:**
- Create: `backend/test/fixtures/products-sample.csv`
- Create: `backend/test/fixtures/products-with-duplicate.csv`
- Create: `backend/test/fixtures/products-missing-price.csv`
- Create: `backend/test/fixtures/sample.png`
- Modify: `backend/test/store-products.e2e-spec.ts`

- [ ] **Step 1: Write fixtures**

`backend/test/fixtures/products-sample.csv`:

```
name,sku,category,price,stock
Sample A,SAMP-A,Audio,10.00,5
Sample B,SAMP-B,Apparel,20.00,3
Sample C,SAMP-C,Home,30.00,1
```

`backend/test/fixtures/products-with-duplicate.csv`:

```
name,sku,category,price,stock
Dup A,DUP-1,Audio,10.00,5
Dup B,DUP-1,Apparel,20.00,3
```

`backend/test/fixtures/products-missing-price.csv`:

```
name,sku,category,price,stock
Good,GOOD,Audio,10.00,5
Bad,BAD,Audio,,5
```

`backend/test/fixtures/sample.png`: create a minimal valid 1×1 PNG. Use this command in Step 4 to write it:
```bash
node -e "require('fs').writeFileSync('backend/test/fixtures/sample.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100200100000000049b0000000049454e44ae426082','hex'))"
```

- [ ] **Step 2: Extend `store-products.e2e-spec.ts`** — append these tests after the existing ones (preserve the existing `describe`):

```ts
import * as path from 'node:path';

// inside the existing describe:
describe('bulk import', () => {
  it('imports 3 rows', async () => {
    const token = await loginSeller(/* existing helper */);
    const res = await request(ctx.app.getHttpServer())
      .post('/store/products/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(__dirname, 'fixtures/products-sample.csv'));
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);
    expect(res.body.skippedRows).toEqual([]);
  });

  it('skips duplicate SKU within upload', async () => {
    const token = await loginSeller(/* existing helper */);
    const res = await request(ctx.app.getHttpServer())
      .post('/store/products/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(__dirname, 'fixtures/products-with-duplicate.csv'));
    expect(res.body.created).toBe(1);
    expect(res.body.skippedRows).toEqual([{ row: 2, reason: 'Duplicate SKU' }]);
  });

  it('skips invalid price', async () => {
    const token = await loginSeller(/* existing helper */);
    const res = await request(ctx.app.getHttpServer())
      .post('/store/products/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(__dirname, 'fixtures/products-missing-price.csv'));
    expect(res.body.created).toBe(1);
    expect(res.body.skippedRows).toEqual([{ row: 2, reason: 'Invalid price' }]);
  });
});

describe('isPublished filter', () => {
  it('drafts are hidden from public catalog', async () => {
    const token = await loginSeller(/* existing helper */);
    const created = await request(ctx.app.getHttpServer())
      .post('/store/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Hidden', brand: 'B', category: 'C',
        price: 10, stock: 5, imageFirst: 'http://x/y.png',
        isPublished: false,
      });
    const publicList = await request(ctx.app.getHttpServer())
      .get('/products');
    expect(publicList.body.items.find((p: any) => p.id === created.body.product.id)).toBeUndefined();
    const publicDetail = await request(ctx.app.getHttpServer())
      .get(`/products/${created.body.product.id}`);
    expect(publicDetail.status).toBe(404);
  });
});

describe('upload', () => {
  it('accepts PNG, returns /static URL', async () => {
    const token = await loginSeller(/* existing helper */);
    const res = await request(ctx.app.getHttpServer())
      .post('/uploads/product-image')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(__dirname, 'fixtures/sample.png'));
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/static\/products\/.+\.png$/);
  });
});
```

When you wire these into the existing file: re-use the existing `loginSeller` helper (or `registerSeller` — match what the file currently uses). The `/* existing helper */` placeholder above is a hint to use whatever exists in the file. If neither exists, copy the helper pattern from `chats.e2e-spec.ts`:

```ts
async function loginSeller(server: any): Promise<string> {
  const res = await request(server)
    .post('/auth/login')
    .send({ email: '<seller-email-from-seed>', password: '<password-from-seed>' });
  return res.body.accessToken;
}
```

- [ ] **Step 3: Run e2e**

```bash
cd /home/anhnt2112/Documents/temp/amazara && docker compose up -d mysql
cd backend && npm run test:e2e
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/test
git commit -m "test(e2e): bulk import + isPublished filter + upload happy path"
```

---

## Phase B — Frontend services + routing

### Task 12: Frontend services + router

**Files:**
- Create: `frontend/src/services/uploads.js`
- Modify: `frontend/src/services/inventory.js`
- Modify: `frontend/src/router.jsx`

- [ ] **Step 1: `services/uploads.js`**

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'amazara.auth.token';

function authHeader() {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadProductImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/uploads/product-image`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(payload?.message || `Upload failed (${res.status})`);
  }
  return payload;
}

export async function bulkImportProducts(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/store/products/bulk`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(payload?.message || `Import failed (${res.status})`);
  }
  return payload;
}

export function bulkTemplateUrl() {
  return `${API_BASE_URL}/store/products/bulk/template`;
}
```

- [ ] **Step 2: Rewrite `services/inventory.js`**

```js
import { api } from './api.js';

export const listInventory = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/store/inventory${qs ? `?${qs}` : ''}`);
};

export const listStoreProducts = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)),
  ).toString();
  return api.get(`/store/products${qs ? `?${qs}` : ''}`);
};

export const getStoreProduct = (id) => api.get(`/store/products/${id}`);
export const createStoreProduct = (payload) => api.post('/store/products', payload);
export const updateStoreProduct = (id, payload) => api.patch(`/store/products/${id}`, payload);
export const deleteStoreProduct = (id) => api.delete(`/store/products/${id}`);
```

Note: backend doesn't yet expose `GET /store/products/:id`. The edit page can simply use the public `/products/:id` (drafts return 404 — but the seller's own catalog UI never shows drafts there). To keep behavior correct for drafts, add this endpoint as a tiny extension:

In `backend/src/products/store-products.controller.ts`, add this method between `list` and `create`:

```ts
@Get(':id')
async findOne(
  @Req() req: Request & { store: Store },
  @Param('id') id: string,
) {
  return this.products.findOneForStore(req.store.id, id);
}
```

In `backend/src/products/products.service.ts`, add:

```ts
async findOneForStore(storeId: string, id: string): Promise<ProductDetail> {
  const product = await this.products.findOne({ where: { id } });
  if (!product) throw new NotFoundException('Product not found');
  if (product.storeId !== storeId) throw new ForbiddenException('Not your product');
  return toProductDetail(product);
}
```

Add these to the same commit.

- [ ] **Step 3: Routes**

Open `frontend/src/router.jsx`. Add imports near the existing page imports:

```jsx
import StoreProductFormPage from './pages/store/StoreProductFormPage.jsx';
```

Add to the `StoreLayout` children list:

```jsx
{ path: '/store/products/new', element: <StoreProductFormPage /> },
{ path: '/store/products/:id', element: <StoreProductFormPage /> },
```

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/services/uploads.js frontend/src/services/inventory.js frontend/src/router.jsx backend/src/products/store-products.controller.ts backend/src/products/products.service.ts
git commit -m "feat(fe+be): inventory/uploads services, store-products findOneForStore, new routes"
```

---

## Phase C — Frontend components

### Task 13: `ImageUploader`

**Files:**
- Create: `frontend/src/pages/store/ImageUploader.jsx`

- [ ] **Step 1: Write**

```jsx
import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadProductImage } from '../../services/uploads.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 5_000_000;

export default function ImageUploader({ value = [], onChange, max = 10 }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [pending, setPending] = useState([]); // [{ id, status: 'uploading'|'error' }]

  function pick() { inputRef.current?.click(); }

  async function uploadOne(file) {
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error(`Unsupported type: ${file.name}`);
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Too big (5MB): ${file.name}`);
      return null;
    }
    const id = `tmp-${Date.now()}-${Math.random()}`;
    setPending((prev) => [...prev, { id, status: 'uploading' }]);
    try {
      const { url } = await uploadProductImage(file);
      setPending((prev) => prev.filter((p) => p.id !== id));
      return url;
    } catch (err) {
      setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'error' } : p)));
      toast.error(err?.message ?? `Upload failed: ${file.name}`);
      return null;
    }
  }

  async function handleFiles(files) {
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    const arr = Array.from(files).slice(0, remaining);
    // limit concurrency to 3
    const urls = [];
    for (let i = 0; i < arr.length; i += 3) {
      const chunk = arr.slice(i, i + 3);
      const results = await Promise.all(chunk.map((f) => uploadOne(f)));
      results.forEach((u) => u && urls.push(u));
    }
    if (urls.length) onChange([...value, ...urls]);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  }

  function removeAt(i) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function moveToFirst(i) {
    if (i === 0) return;
    const next = [...value];
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={pick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="w-full border-2 border-dashed border-outline-variant rounded-lg p-8 flex flex-col items-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
      >
        <Icon name="upload" size={32} />
        <span className="text-body-sm">Click to upload or drag and drop</span>
        <span className="text-[11px] text-outline">PNG, JPG, or WEBP (Max 5MB)</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {(value.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {value.map((url, i) => (
            <div
              key={url}
              className={`relative aspect-square rounded-lg overflow-hidden border ${
                i === 0 ? 'border-primary' : 'border-outline-variant'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => moveToFirst(i)}
                  className="absolute bottom-1 left-1 text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove"
                className="absolute top-1 right-1 bg-error text-on-error rounded-full w-6 h-6 flex items-center justify-center"
              >
                <Icon name="close" size={14} />
              </button>
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded">
                  Primary
                </span>
              )}
            </div>
          ))}
          {pending.map((p) => (
            <div
              key={p.id}
              className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center ${
                p.status === 'error' ? 'border-error text-error' : 'border-outline-variant text-outline-variant'
              }`}
            >
              <Icon name={p.status === 'error' ? 'error' : 'hourglass_top'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/store/ImageUploader.jsx
git commit -m "feat(fe): ImageUploader component (multi-image drag-drop)"
```

---

### Task 14: `ProductForm`

**Files:**
- Create: `frontend/src/pages/store/ProductForm.jsx`

- [ ] **Step 1: Write**

```jsx
import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import ImageUploader from './ImageUploader.jsx';

const INITIAL = {
  name: '',
  brand: '',
  model: '',
  category: '',
  sku: '',
  price: '',
  salePrice: '',
  stock: '',
  trackInventory: true,
  isPublished: true,
  imageFirst: '',
  images: [],
  shortDescription: '',
  longDescription: '',
  tags: [],
};

export default function ProductForm({ initial, onSubmit, onDiscard, submitting }) {
  const [v, setV] = useState(() => ({ ...INITIAL, ...(initial ?? {}) }));
  const [dirty, setDirty] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (initial) setV({ ...INITIAL, ...initial });
  }, [initial]);

  function patch(p) {
    setV((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (v.tags.includes(t)) {
      setTagInput('');
      return;
    }
    patch({ tags: [...v.tags, t] });
    setTagInput('');
  }

  function removeTag(t) {
    patch({ tags: v.tags.filter((x) => x !== t) });
  }

  function handleDiscard() {
    if (dirty && !confirm('Discard your changes?')) return;
    onDiscard?.();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!v.name.trim() || !v.category.trim() || !v.images.length) return;
    const payload = {
      name: v.name.trim(),
      brand: v.brand.trim() || 'Unknown',
      category: v.category.trim(),
      sku: v.sku.trim() || undefined,
      model: v.model.trim() || undefined,
      price: Number(v.price),
      salePrice: v.salePrice === '' || v.salePrice == null ? undefined : Number(v.salePrice),
      stock: Number(v.stock || 0),
      trackInventory: Boolean(v.trackInventory),
      isPublished: Boolean(v.isPublished),
      imageFirst: v.images[0] ?? v.imageFirst,
      images: v.images,
      shortDescription: v.shortDescription.trim() || undefined,
      longDescription: v.longDescription.trim() || undefined,
      tags: v.tags.length ? v.tags : undefined,
    };
    onSubmit(payload);
  }

  const canSave =
    v.name.trim() &&
    v.category.trim() &&
    v.images.length > 0 &&
    Number(v.price) >= 0 &&
    Number(v.stock) >= 0 &&
    (v.salePrice === '' || Number(v.salePrice) < Number(v.price));

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
      <div className="lg:col-span-2 space-y-gutter">
        <Section icon="info" title="General Information">
          <Field label="Product Title">
            <input className="field px-4 py-2" value={v.name} onChange={(e) => patch({ name: e.target.value })} required maxLength={255} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand">
              <input className="field px-4 py-2" value={v.brand} onChange={(e) => patch({ brand: e.target.value })} maxLength={255} />
            </Field>
            <Field label="Product Model">
              <input className="field px-4 py-2" value={v.model} onChange={(e) => patch({ model: e.target.value })} maxLength={128} />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="field px-4 py-2 min-h-[120px]" value={v.longDescription} onChange={(e) => patch({ longDescription: e.target.value })} />
          </Field>
        </Section>

        <Section icon="image" title="Product Media" hint="Recommended: 1000×1000px">
          <ImageUploader value={v.images} onChange={(images) => patch({ images })} />
        </Section>

        <Section icon="payments" title="Pricing & Inventory">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Base Price ($)">
              <input type="number" min="0" step="0.01" className="field px-4 py-2" value={v.price} onChange={(e) => patch({ price: e.target.value })} required />
            </Field>
            <Field label="SKU (Stock Keeping Unit)">
              <input className="field px-4 py-2" value={v.sku} onChange={(e) => patch({ sku: e.target.value })} placeholder="Leave blank to auto-generate" maxLength={64} />
            </Field>
            <Field label="Sale Price ($)">
              <input type="number" min="0" step="0.01" className="field px-4 py-2" value={v.salePrice} onChange={(e) => patch({ salePrice: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Quantity in Stock">
              <input type="number" min="0" className="field px-4 py-2" value={v.stock} onChange={(e) => patch({ stock: e.target.value })} required />
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 mt-2">
            <input type="checkbox" checked={v.trackInventory} onChange={(e) => patch({ trackInventory: e.target.checked })} />
            <span className="text-body-sm">Track inventory for this product</span>
          </label>
        </Section>
      </div>

      <aside className="space-y-gutter">
        <Section icon="category" title="Categorization">
          <Field label="Category">
            <input className="field px-4 py-2" value={v.category} onChange={(e) => patch({ category: e.target.value })} required />
          </Field>
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-2 border border-outline-variant rounded-lg p-2 bg-surface">
              {v.tags.map((t) => (
                <span key={t} className="bg-surface-container-high text-on-surface px-2 py-0.5 rounded-full text-body-sm inline-flex items-center gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label="Remove tag">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
              <input
                className="flex-1 min-w-[80px] bg-transparent outline-none text-body-sm"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag…"
              />
            </div>
          </Field>
        </Section>

        <Section icon="visibility" title="Visibility">
          <label className="flex items-center justify-between">
            <div>
              <div className="text-label-md">Product Status</div>
              <div className="text-body-sm text-on-surface-variant">Set whether this item is live</div>
            </div>
            <input
              type="checkbox"
              checked={v.isPublished}
              onChange={(e) => patch({ isPublished: e.target.checked })}
              className="w-12 h-6 cursor-pointer accent-primary"
              aria-label="Published"
            />
          </label>
        </Section>

        <div className="flex justify-end gap-3 sticky bottom-4 bg-surface-container-low p-3 rounded-xl border border-outline-variant">
          <button type="button" onClick={handleDiscard} className="px-4 py-2 text-on-surface-variant">Discard</button>
          <button
            type="submit"
            disabled={!canSave || submitting}
            className="btn-primary px-6 py-2 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : initial ? 'Update Product' : 'Save Product'}
          </button>
        </div>
      </aside>
    </form>
  );
}

function Section({ icon, title, hint, children }) {
  return (
    <section className="bg-surface border border-outline-variant rounded-xl p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-headline-md flex items-center gap-2">
          <Icon name={icon} className="text-primary" size={18} />
          {title}
        </h2>
        {hint && <span className="text-body-sm text-on-surface-variant">{hint}</span>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/store/ProductForm.jsx
git commit -m "feat(fe): ProductForm shared component (sections + tags chip input)"
```

---

### Task 15: `InventoryKpiCards` + `ImportProductModal` + `AddressCard`

**Files:**
- Create: `frontend/src/pages/store/InventoryKpiCards.jsx`
- Create: `frontend/src/pages/store/ImportProductModal.jsx`
- Create: `frontend/src/components/AddressCard.jsx`

- [ ] **Step 1: `InventoryKpiCards.jsx`**

```jsx
import Icon from '../../components/Icon.jsx';

const TILES = [
  { key: 'total', label: 'Total Products', icon: 'inventory_2', color: 'text-primary' },
  { key: 'inStock', label: 'In Stock', icon: 'check_circle', color: 'text-emerald-700' },
  { key: 'lowStock', label: 'Low Stock', icon: 'warning', color: 'text-secondary' },
  { key: 'outOfStock', label: 'Out of Stock', icon: 'cancel', color: 'text-error' },
];

export default function InventoryKpiCards({ kpi }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {TILES.map((t) => (
        <div key={t.key} className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Icon name={t.icon} className={t.color} size={20} />
            <span className="text-body-sm">{t.label}</span>
          </div>
          <p className={`text-headline-lg font-bold mt-2 ${t.key === 'outOfStock' || t.key === 'lowStock' ? t.color : 'text-on-surface'}`}>
            {kpi?.[t.key] ?? 0}
          </p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: `ImportProductModal.jsx`**

```jsx
import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { bulkImportProducts, bulkTemplateUrl } from '../../services/uploads.js';

const ACCEPT = '.csv,.xls,.xlsx';

export default function ImportProductModal({ open, onClose, onDone }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function upload(file) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
      toast.error('Pick a .csv, .xls or .xlsx file');
      return;
    }
    if (file.size > 10_000_000) {
      toast.error('File too large (max 10MB)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await bulkImportProducts(file);
      setResult(res);
      if (res.created > 0) onDone?.();
    } catch (err) {
      toast.error(err?.message ?? 'Import failed');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    if (submitting && !confirm('Cancel the upload?')) return;
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-surface-container-lowest rounded-xl border border-outline-variant w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
          <h2 className="text-headline-md">Import products from file</h2>
          <button onClick={close} aria-label="Close" className="p-1 rounded-full hover:bg-surface-container">
            <Icon name="close" />
          </button>
        </header>
        <div className="p-6 overflow-y-auto scrollbar-thin space-y-4">
          {!result && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  upload(e.dataTransfer.files[0]);
                }}
                className="w-full border-2 border-dashed border-outline-variant rounded-lg p-8 flex flex-col items-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <Icon name="cloud_upload" size={36} />
                <span className="text-body-md">Drag and drop a file, or click to pick</span>
                <span className="text-body-sm">Accepts .csv, .xls, .xlsx (up to 10MB)</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-outline-variant rounded-lg p-4">
                  <h3 className="text-label-md text-on-surface mb-2">Data requirements</h3>
                  <ul className="text-body-sm text-on-surface-variant space-y-1">
                    <li>Required columns: name, sku, category, price, stock</li>
                    <li>Numeric values for price and stock</li>
                    <li>SKU must be unique per product</li>
                  </ul>
                </div>
                <div className="border border-outline-variant rounded-lg p-4 flex flex-col gap-2 items-start">
                  <p className="text-body-sm text-on-surface-variant">No template yet?</p>
                  <a
                    href={bulkTemplateUrl()}
                    className="btn-secondary inline-flex items-center gap-2 px-4 py-2"
                  >
                    <Icon name="download" size={18} /> Download template
                  </a>
                </div>
              </div>
            </>
          )}
          {result && (
            <div className="space-y-3">
              <p className="text-body-md">
                <span className="font-bold text-emerald-700">{result.created}</span> created,{' '}
                <span className="font-bold text-error">{result.skippedRows.length}</span> skipped.
              </p>
              {result.skippedRows.length > 0 && (
                <ul className="border border-outline-variant rounded-lg divide-y divide-outline-variant max-h-64 overflow-y-auto">
                  {result.skippedRows.map((r, i) => (
                    <li key={i} className="px-3 py-2 text-body-sm flex justify-between">
                      <span>Row {r.row}</span>
                      <span className="text-on-surface-variant">{r.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <footer className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
          <button onClick={close} className="px-4 py-2 text-on-surface-variant">Close</button>
          {result && (
            <button onClick={() => setResult(null)} className="btn-secondary px-4 py-2">
              Import another
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `AddressCard.jsx`**

```jsx
import Icon from './Icon.jsx';

export default function AddressCard({ address, onEdit, onDelete, onSetDefault }) {
  return (
    <article
      className={`bg-surface rounded-xl p-6 border ${
        address.isDefault ? 'border-primary' : 'border-outline-variant'
      } hover:border-primary transition-all hover:shadow-md flex flex-col justify-between`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <span className="text-label-md text-on-surface">{address.recipientName}</span>
          <p className="text-body-md text-on-surface-variant">{address.phone}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
            address.isDefault
              ? 'bg-primary-fixed text-on-primary-fixed'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {address.label}
        </span>
      </div>
      <div className="mb-4">
        <p className="text-body-md text-on-surface leading-relaxed">
          {address.line1}
          {address.line2 ? <><br />{address.line2}</> : null}
          <br />
          {address.city}, {address.region} {address.postalCode}
          <br />
          {address.country}
        </p>
      </div>
      <div className="flex items-center gap-4 pt-4 border-t border-outline-variant text-label-md">
        <button onClick={onEdit} className="text-primary hover:underline">Edit</button>
        {!address.isDefault && (
          <button onClick={onSetDefault} className="text-on-surface-variant hover:text-primary hover:underline">
            Set as default
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={address.isDefault}
          className={`hover:underline ${address.isDefault ? 'text-on-surface-variant opacity-50 cursor-not-allowed' : 'text-error'}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
```

The Delete button is disabled on the default card so users don't strand themselves without a fallback. To delete the default, they must promote another card first.

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/store/InventoryKpiCards.jsx frontend/src/pages/store/ImportProductModal.jsx frontend/src/components/AddressCard.jsx
git commit -m "feat(fe): InventoryKpiCards, ImportProductModal, AddressCard components"
```

---

## Phase D — Pages

### Task 16: `StoreProductFormPage` (create + edit)

**Files:**
- Create: `frontend/src/pages/store/StoreProductFormPage.jsx`

- [ ] **Step 1: Write**

```jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  createStoreProduct,
  deleteStoreProduct,
  getStoreProduct,
  updateStoreProduct,
} from '../../services/inventory.js';
import ProductForm from './ProductForm.jsx';

export default function StoreProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);
  const [initial, setInitial] = useState(editing ? null : {});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    getStoreProduct(id)
      .then((p) => {
        if (cancelled) return;
        setInitial({
          name: p.name,
          brand: p.brand,
          model: p.model ?? '',
          category: p.category,
          sku: p.sku ?? '',
          price: String(p.price ?? ''),
          salePrice: p.salePrice == null ? '' : String(p.salePrice),
          stock: String(p.stock ?? 0),
          trackInventory: p.trackInventory,
          isPublished: p.isPublished,
          imageFirst: p.image,
          images: p.images && p.images.length ? p.images : (p.image ? [p.image] : []),
          shortDescription: p.subtitle ?? '',
          longDescription: p.description ?? '',
          tags: Array.isArray(p.tags) ? p.tags : [],
        });
      })
      .catch((err) => {
        toast.error(err?.message ?? 'Could not load product');
        navigate('/store/inventory', { replace: true });
      });
    return () => { cancelled = true; };
  }, [id, editing, navigate, toast]);

  async function save(payload) {
    setSubmitting(true);
    try {
      if (editing) {
        await updateStoreProduct(id, payload);
        toast.success('Product updated');
        navigate('/store/inventory');
      } else {
        const res = await createStoreProduct(payload);
        toast.success('Product created');
        navigate(`/store/products/${res.product.id}`);
      }
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchive() {
    if (!initial) return;
    const next = !initial.isPublished;
    try {
      await updateStoreProduct(id, { isPublished: next });
      setInitial((prev) => ({ ...prev, isPublished: next }));
      toast.info(next ? 'Restored' : 'Archived');
    } catch (err) {
      toast.error(err?.message ?? 'Could not archive');
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await deleteStoreProduct(id);
      toast.info('Deleted');
      navigate('/store/inventory');
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  }

  if (editing && !initial) {
    return <div className="px-4 py-8">Loading…</div>;
  }

  return (
    <div className="space-y-gutter">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg">{editing ? 'Edit Product' : 'Add New Product'}</h1>
          {editing && initial?.sku && (
            <p className="text-body-sm text-on-surface-variant">SKU: {initial.sku}</p>
          )}
        </div>
        {editing && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/product/${id}`} target="_blank" className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm">
              <Icon name="open_in_new" size={16} /> View on Store
            </Link>
            <button
              type="button"
              onClick={toggleArchive}
              className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm"
            >
              <Icon name={initial?.isPublished ? 'archive' : 'unarchive'} size={16} />
              {initial?.isPublished ? 'Archive' : 'Restore'}
            </button>
            <button
              type="button"
              onClick={remove}
              className="px-3 py-2 inline-flex items-center gap-1 text-body-sm text-error border border-error rounded-lg hover:bg-error/5"
            >
              <Icon name="delete" size={16} /> Delete
            </button>
          </div>
        )}
      </header>
      <ProductForm
        initial={initial}
        submitting={submitting}
        onSubmit={save}
        onDiscard={() => navigate('/store/inventory')}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/store/StoreProductFormPage.jsx
git commit -m "feat(fe): StoreProductFormPage (create + edit modes)"
```

---

### Task 17: `StoreInventoryPage` rewrite

**Files:**
- Modify: `frontend/src/pages/store/StoreInventoryPage.jsx`

- [ ] **Step 1: Replace the file**

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listStoreProducts } from '../../services/inventory.js';
import ImportProductModal from './ImportProductModal.jsx';
import InventoryKpiCards from './InventoryKpiCards.jsx';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
];

export default function StoreInventoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, kpi: null });
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await listStoreProducts({ status, q, page, limit: 20 });
      setData(res);
    } catch (err) {
      toast.error(err?.message ?? 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(reload, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, page]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(data.total / 20)), [data.total]);

  return (
    <div className="space-y-gutter">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg">Inventory Management</h1>
          <p className="text-body-sm text-on-surface-variant">Manage your catalog and stock.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm">
            <Icon name="upload" size={18} /> Import
          </button>
          <Link to="/store/products/new" className="btn-primary px-4 py-2 inline-flex items-center gap-2">
            <Icon name="add" size={18} /> Add Product
          </Link>
        </div>
      </header>

      <InventoryKpiCards kpi={data.kpi} />

      <div className="bg-surface border border-outline-variant rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search SKU, name, or brand…"
            className="field w-full pl-10 pr-3 py-2 text-body-sm"
          />
          <Icon name="search" size={20} className="absolute left-3 top-2.5 text-outline" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setStatus(t.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-body-sm whitespace-nowrap transition-colors ${
                status === t.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-label-md uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">SKU</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Category</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Stock</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-surface-container-low cursor-pointer"
                  onClick={() => navigate(`/store/products/${p.id}`)}
                >
                  <td className="px-4 py-3 flex items-center gap-3">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-12 h-12 rounded object-cover bg-surface-container-low" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-surface-container-low flex items-center justify-center">
                        <Icon name="image" className="text-outline" size={18} />
                      </div>
                    )}
                    <span className="text-on-surface">{p.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-data-mono text-on-surface-variant">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-on-surface-variant">{p.category}</td>
                  <td className="px-4 py-3 text-right text-data-mono">${Number(p.price).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right hidden sm:table-cell text-data-mono ${p.stock === 0 ? 'text-error' : p.stock <= 10 ? 'text-secondary' : 'text-on-surface'}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge product={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/store/products/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline text-body-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data.items.length === 0 && (
          <div className="p-10 text-center text-on-surface-variant">No products match those filters.</div>
        )}
        {pageCount > 1 && (
          <div className="px-4 py-3 border-t border-outline-variant flex justify-between items-center">
            <span className="text-body-sm text-on-surface-variant">
              Page {page} of {pageCount} · {data.total} products
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-outline-variant disabled:opacity-50 text-body-sm"
              >
                Prev
              </button>
              <button
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-outline-variant disabled:opacity-50 text-body-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ImportProductModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={reload}
      />
    </div>
  );
}

function StatusBadge({ product }) {
  if (!product.isPublished) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container text-on-surface-variant">
        Draft
      </span>
    );
  }
  if (product.stock === 0) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-error-container text-on-error-container">
        Out of Stock
      </span>
    );
  }
  if (product.stock <= 10) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-secondary-container/20 text-secondary">
        Low Stock
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
      Active
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/store/StoreInventoryPage.jsx
git commit -m "feat(fe): StoreInventoryPage rewrite (KPI + tabs + table + import + add)"
```

---

### Task 18: AddressesPage re-skin

**Files:**
- Modify: `frontend/src/pages/AddressesPage.jsx`

- [ ] **Step 1: Replace the file** (keeps existing CRUD; just swaps the rendering)

```jsx
import { useEffect, useState } from 'react';
import AccountSideNav from '../components/AccountSideNav.jsx';
import AddressCard from '../components/AddressCard.jsx';
import AddressForm from '../components/AddressForm.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '../services/addresses.js';

export default function AddressesPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | <id>
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await listAddresses();
    setItems(res.items);
  };

  useEffect(() => {
    reload().catch((e) => toast.error(e?.message ?? 'Could not load addresses'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(data) {
    setBusy(true);
    try {
      if (editing === 'new') {
        await createAddress(data);
        toast.success('Address added');
      } else {
        await updateAddress(editing, data);
        toast.success('Address updated');
      }
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (a.isDefault) {
      toast.error('Pick another default first');
      return;
    }
    if (!confirm('Delete this address?')) return;
    try {
      await deleteAddress(a.id);
      toast.info('Address deleted');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  }

  async function setDefault(a) {
    try {
      await updateAddress(a.id, { isDefault: true });
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not set default');
    }
  }

  const current = editing && editing !== 'new' ? items.find((a) => a.id === editing) : null;

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-headline-lg text-on-surface mb-1">Addresses</h1>
            <p className="text-body-md text-on-surface-variant">
              Saved addresses for checkout and shipping.
            </p>
          </div>
          <button onClick={() => setEditing('new')} className="btn-primary px-4 py-2 inline-flex items-center gap-2">
            <Icon name="add" size={18} /> Add address
          </button>
        </header>

        {editing && (
          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md mb-4">
              {editing === 'new' ? 'New address' : 'Edit address'}
            </h2>
            <AddressForm
              initial={current ?? undefined}
              submitting={busy}
              onSubmit={submit}
              onCancel={() => setEditing(null)}
            />
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => setEditing(a.id)}
              onDelete={() => remove(a)}
              onSetDefault={() => setDefault(a)}
            />
          ))}
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="border-2 border-dashed border-outline-variant rounded-xl p-6 flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
              <Icon name="add" size={24} />
            </div>
            <p className="text-label-md">Add new address</p>
          </button>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/AddressesPage.jsx
git commit -m "feat(fe): AddressesPage re-skin (card grid + dashed add tile)"
```

---

## Phase E — Docs + smoke

### Task 19: Docs

**Files:**
- Modify: `docs/features/products.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Append a "Seller product CRUD + bulk import" section** to `docs/features/products.md`:

```markdown
## Seller product CRUD (extended)

New product columns: `sku`, `model`, `sale_price`, `track_inventory`, `is_published`, `images` (JSON).

- Public `/products` and `/products/:id` filter `is_published = 1`.
- `GET /store/products?status=all|published|drafts&q=&page=&limit=` returns paginated items plus `kpi: { total, inStock, lowStock, outOfStock }`.
- `POST /store/products`, `PATCH /store/products/:id`, `DELETE /store/products/:id` accept the new fields; SKU auto-generates when blank (`NX-<storeShortId>-<random>`); `salePrice` must be `< price`.
- `GET /store/products/:id` returns the full ProductDetail for the seller's own product (returns drafts).
- `POST /store/products/bulk` accepts a `multipart/form-data` file (`.csv`, `.xls`, `.xlsx`, up to 10 MB, 500 rows). Returns `{ created, skippedRows: [{ row, reason }] }`. Required columns: `name`, `sku`, `category`, `price`, `stock`. Optional: `brand`, `salePrice`, `model`, `description`, `imageUrl`, `isPublished`.
- `GET /store/products/bulk/template` streams a sample CSV.

## Uploads

- `POST /uploads/product-image` (seller-only, multipart `file`) returns `{ url: '/static/products/<uuid>.<ext>' }`. Files saved under `backend/uploads/products/` (gitignored). Static served at `/static/*`. Mimetype whitelist: `image/png`, `image/jpeg`, `image/webp`. 5 MB cap.
```

- [ ] **Step 2: Append a row** to `docs/README.md` at the bottom of the completed-features table:

```
| 2026-05-14 | Seller product CRUD + image upload + bulk import | [features/products.md](features/products.md) |
```

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add docs/features/products.md docs/README.md
git commit -m "docs: seller product CRUD + bulk import + uploads endpoints"
```

---

### Task 20: Full-stack smoke test

- [ ] **Step 1: Stack up**

```bash
cd /home/anhnt2112/Documents/temp/amazara
docker compose down -v && docker compose up -d
```

- [ ] **Step 2: Backend tests**

```bash
cd /home/anhnt2112/Documents/temp/amazara/backend
npm test
npm run test:e2e
```
Expected: all green.

- [ ] **Step 3: Frontend production build**

```bash
cd /home/anhnt2112/Documents/temp/amazara/frontend
npm run build
```
Expected: `dist/...` produced with no errors.

- [ ] **Step 4: Manual walkthrough**

1. Register a seller; visit `/store/inventory`.
2. KPI tiles show 0 / 0 / 0 / 0; table is empty.
3. Click "Add Product" → fill form → drop 2 images (or click to pick) → Save Product → land on `/store/products/:id`.
4. Edit a field → Update Product → land back on `/store/inventory` with the new row in the table.
5. From the edit page: Archive → status badge becomes Draft on the list; Restore → Active again.
6. From `/store/inventory` open the Import modal → download the template, edit it locally to 3 rows, drag back into the drop area → expect `{ created: 3, skippedRows: [] }` → modal closes, table reloads.
7. Visit `/account/addresses` as a buyer: card grid + dashed "Add new address" tile; all CRUD still works.

- [ ] **Step 5: Final commit (if any docs/format tweaks linger)**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git status
# if anything, commit it
```

---

## Self-Review

- **Spec coverage:** Each spec section maps to at least one task.
  - 6 new columns → Task 2; views update → Task 4; service updates → Task 5; list filters/KPI → Task 6; public catalog hides drafts → Task 7; uploads → Task 8; bulk service → Task 9; bulk endpoints → Task 10; e2e → Task 11; frontend services + routes → Task 12; image uploader → Task 13; product form → Task 14; KPI/Import/AddressCard → Task 15; product form page → Task 16; inventory page → Task 17; AddressesPage re-skin → Task 18; docs → Task 19; smoke → Task 20.
- **No placeholders:** No "TBD"/"similar to"; each code step is the final source.
- **Type consistency:** `images: string[]` typed the same in DTO (Task 3), entity (Task 2), views (Task 4), uploader (Task 13), form (Task 14). KPI shape `{ total, inStock, lowStock, outOfStock }` matches across service (Task 6), KpiCards (Task 15), inventory page (Task 17). `bulkImportProducts` / `bulkTemplateUrl` / `uploadProductImage` names consistent in services (Task 12) and components (Tasks 13, 15).
- **Frequent commits:** 20 tasks, each with its own targeted commit.
