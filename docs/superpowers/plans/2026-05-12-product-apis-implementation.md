# Product APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend product domain — stores, catalog, wishlist, cart, orders, and seller management — seeded from `products.enriched.csv`, with one commit per feature.

**Architecture:** Per-domain NestJS modules (`stores/`, `products/`, `wishlist/`, `cart/`, `orders/`) following the existing `auth/` + `users/` pattern. Server-persisted cart and wishlist behind `JwtAuthGuard`. Stock-safe checkout in a TypeORM transaction. One seller account per store, seeded from the CSV.

**Tech Stack:** NestJS 10, TypeORM 0.3, MySQL 8, class-validator, csv-parse, Jest, supertest.

**Spec:** `docs/superpowers/specs/2026-05-12-product-apis-design.md`

---

## Conventions used in this plan

- **Working directory** is `backend/` for all `npm` and `git` commands unless stated otherwise.
- Tests live next to the source as `*.spec.ts`; e2e tests live in `backend/test/*.e2e-spec.ts`.
- The MySQL test database is `amazara_test`. Start it once with
  `docker compose up -d mysql` from the repo root before running e2e tests.
- Commit messages use the existing project convention (lowercase type prefix, short subject; `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`).
- The test helper `resetDatabase()` in `backend/test/setup-e2e.ts` is extended in Task 1 to truncate every new table.

---

## File map

| Task | Created | Modified |
|------|---------|----------|
| 1 | `backend/src/stores/store.entity.ts`, `stores.service.ts`, `stores.module.ts`, `stores.service.spec.ts`; `backend/scripts/seed-products.ts`; `backend/scripts/tsconfig.json`; `docs/features/stores.md` | `backend/package.json` (add `csv-parse`, `seed:products` script); `backend/src/app.module.ts`; `backend/test/setup-e2e.ts`; `docs/README.md` |
| 2 | `backend/src/products/product.entity.ts`, `products.service.ts`, `products.controller.ts`, `products.module.ts`, `dto/list-products.dto.ts`, `dto/product-views.ts`, `products.service.spec.ts`; `backend/test/products.e2e-spec.ts`; `docs/features/products.md` | `backend/src/app.module.ts`; `docs/README.md` |
| 3 | `backend/src/common/guards/seller-store.guard.ts`, `seller-store.guard.spec.ts`; `backend/src/products/store-products.controller.ts`, `store-inventory.controller.ts`, `dto/create-product.dto.ts`, `dto/update-product.dto.ts`; `backend/test/store-products.e2e-spec.ts` | `backend/src/products/products.module.ts`; `docs/features/products.md` |
| 4 | `backend/src/wishlist/wishlist-item.entity.ts`, `wishlist.service.ts`, `wishlist.controller.ts`, `wishlist.module.ts`, `wishlist.service.spec.ts`; `backend/test/wishlist.e2e-spec.ts`; `docs/features/wishlist.md` | `backend/src/app.module.ts`; `backend/test/setup-e2e.ts`; `docs/README.md` |
| 5 | `backend/src/cart/cart-item.entity.ts`, `cart.service.ts`, `cart.controller.ts`, `cart.module.ts`, `dto/add-cart-item.dto.ts`, `dto/update-cart-item.dto.ts`, `cart.service.spec.ts`; `backend/test/cart.e2e-spec.ts`; `docs/features/cart.md` | `backend/src/app.module.ts`; `backend/test/setup-e2e.ts`; `docs/README.md` |
| 6 | `backend/src/orders/order.entity.ts`, `order-item.entity.ts`, `orders.service.ts`, `orders.controller.ts`, `orders.module.ts`, `dto/checkout.dto.ts`, `orders.service.spec.ts`; `backend/test/orders.e2e-spec.ts`; `docs/features/orders.md` | `backend/src/app.module.ts`; `backend/test/setup-e2e.ts`; `docs/README.md` |
| 7 | `backend/src/orders/store-orders.controller.ts`, `dto/update-order-status.dto.ts`; `backend/test/store-orders.e2e-spec.ts` | `backend/src/orders/orders.module.ts`; `backend/src/orders/orders.service.ts`; `docs/features/orders.md` |

---

## Task 1: Stores foundation + CSV seed

**Files:**
- Create: `backend/src/stores/store.entity.ts`
- Create: `backend/src/stores/stores.service.ts`
- Create: `backend/src/stores/stores.module.ts`
- Create: `backend/src/stores/stores.service.spec.ts`
- Create: `backend/scripts/seed-products.ts`
- Create: `backend/scripts/tsconfig.json`
- Create: `docs/features/stores.md`
- Modify: `backend/package.json` (deps + script)
- Modify: `backend/src/app.module.ts` (register `Store` + `StoresModule`)
- Modify: `backend/test/setup-e2e.ts` (truncate `stores`)
- Modify: `docs/README.md`

- [ ] **Step 1: Add `csv-parse` and the seed script entry to `backend/package.json`**

Modify `backend/package.json`:

```json
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand",
    "seed:products": "ts-node -P scripts/tsconfig.json scripts/seed-products.ts"
  },
```

Add to `dependencies` (alphabetical):

```json
    "csv-parse": "^5.5.6",
```

Then run:

```bash
cd backend && npm install
```

- [ ] **Step 2: Create the script tsconfig**

Create `backend/scripts/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "../dist-scripts",
    "rootDir": "..",
    "noEmit": false
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

- [ ] **Step 3: Create the `Store` entity**

Create `backend/src/stores/store.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity({ name: 'stores' })
export class Store {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  slug!: string;

  @Column({ name: 'owner_id', type: 'bigint', unsigned: true })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
```

- [ ] **Step 4: Write the failing spec for `StoresService`**

Create `backend/src/stores/stores.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './store.entity';
import { StoresService } from './stores.service';

describe('StoresService', () => {
  let service: StoresService;
  let repo: jest.Mocked<Repository<Store>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoresService,
        {
          provide: getRepositoryToken(Store),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StoresService);
    repo = moduleRef.get(getRepositoryToken(Store));
  });

  describe('findByOwnerId', () => {
    it('returns the store owned by the user', async () => {
      const store = { id: 's1', name: 'Test', slug: 'test', ownerId: '7' } as Store;
      repo.findOne.mockResolvedValue(store);
      const result = await service.findByOwnerId('7');
      expect(result).toBe(store);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId: '7' } });
    });

    it('returns null when the user owns no store', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findByOwnerId('99');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 5: Run the spec to confirm it fails**

```bash
cd backend && npm test -- stores.service.spec
```

Expected: FAIL — `Cannot find module './stores.service'`.

- [ ] **Step 6: Implement `StoresService`**

Create `backend/src/stores/stores.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './store.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  findByOwnerId(ownerId: string): Promise<Store | null> {
    return this.stores.findOne({ where: { ownerId } });
  }

  findById(id: string): Promise<Store | null> {
    return this.stores.findOne({ where: { id } });
  }
}
```

- [ ] **Step 7: Run the spec to confirm it passes**

```bash
cd backend && npm test -- stores.service.spec
```

Expected: 2 passing.

- [ ] **Step 8: Wire the `StoresModule`**

Create `backend/src/stores/stores.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { StoresService } from './stores.service';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
```

- [ ] **Step 9: Register `Store` + `StoresModule` in `AppModule`**

Modify `backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StoresModule } from './stores/stores.module';
import { User } from './users/user.entity';
import { Store } from './stores/store.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DATABASE_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DATABASE_PORT', '3306')),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD'),
        database: config.get<string>('DATABASE_NAME'),
        entities: [User, Store],
        synchronize: process.env.NODE_ENV !== 'production',
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
    AuthModule,
    StoresModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 10: Extend `resetDatabase()` to include the `stores` table**

Modify `backend/test/setup-e2e.ts` — replace the `resetDatabase` function:

```ts
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 11: Confirm existing e2e tests still pass**

```bash
docker compose up -d mysql
cd backend && npm run test:e2e -- auth.e2e-spec
```

Expected: all auth e2e tests pass.

- [ ] **Step 12: Write the seed script**

Create `backend/scripts/seed-products.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { parse } from 'csv-parse/sync';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/user.entity';
import { Store } from '../src/stores/store.entity';

const CSV_PATH = path.resolve(__dirname, '..', '..', 'products.enriched.csv');
const SELLER_PASSWORD = 'seller123';
const BCRYPT_ROUNDS = 12;

interface CsvRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  store_id: string;
  price: string;
  discount: string;
  stock: string;
  image_count: string;
  image_first: string;
  short_description: string;
  long_description: string;
  highlights: string;
  color: string;
  available_colors: string;
  available_sizes: string;
  material: string;
  target_gender: string;
  target_age_group: string;
  tags: string;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}`);
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as CsvRow[];
  console.log(`Parsed ${rows.length} CSV rows`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const ds = app.get(DataSource);
    const users = ds.getRepository(User);
    const stores = ds.getRepository(Store);
    const passwordHash = await bcrypt.hash(SELLER_PASSWORD, BCRYPT_ROUNDS);

    const distinctStoreIds = Array.from(new Set(rows.map((r) => r.store_id)));
    console.log(`Found ${distinctStoreIds.length} distinct store IDs`);

    let sellersCreated = 0;
    let storesCreated = 0;
    const printedSellers: string[] = [];

    for (const storeId of distinctStoreIds) {
      const short5 = storeId.slice(0, 5);
      const short8 = storeId.slice(0, 8);
      const email = `seller-${short8}@amazara.local`;

      let seller = await users.findOne({ where: { email } });
      if (!seller) {
        seller = await users.save(
          users.create({
            email,
            passwordHash,
            fullName: `Seller ${short5}`,
            role: 'seller',
          }),
        );
        sellersCreated += 1;
        if (printedSellers.length < 3) printedSellers.push(email);
      }

      const existingStore = await stores.findOne({ where: { id: storeId } });
      if (!existingStore) {
        await stores.save(
          stores.create({
            id: storeId,
            name: `Store ${short5}`,
            slug: `store-${short5}`,
            ownerId: seller.id,
          }),
        );
        storesCreated += 1;
      }
    }

    console.log(`Seeded ${sellersCreated} new sellers, ${storesCreated} new stores`);
    if (printedSellers.length) {
      console.log('Example seller logins (password "seller123"):');
      for (const e of printedSellers) console.log(`  ${e}`);
    }
    // Products are inserted by Task 2. Re-running this script after Task 2
    // ships will also upsert products.
    void rows; // referenced so the parse step is verified
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: this Task 1 version of the script only seeds **stores + sellers**. The product upsert is added in Task 2, Step 14. This lets us commit the stores foundation independently.

- [ ] **Step 13: Run the seed script**

```bash
docker compose up -d mysql
cd backend && npm run start:dev   # in a separate shell, just to ensure DB schema is created
# wait for "Backend listening..." then Ctrl+C in that shell
cd backend && npm run seed:products
```

Expected output ends with something like:

```
Seeded NN new sellers, NN new stores
Example seller logins (password "seller123"):
  seller-xxxxxxxx@amazara.local
  ...
```

Verify in MySQL:

```bash
docker compose exec mysql mysql -uamazara -pamazara amazara -e "SELECT COUNT(*) FROM stores; SELECT COUNT(*) FROM users WHERE role='seller';"
```

Both counts should match.

- [ ] **Step 14: Add `docs/features/stores.md`**

Create `docs/features/stores.md`:

```markdown
# Stores

Each row in `products.enriched.csv` belongs to a `store_id`. The seed command
provisions one MySQL `stores` row per distinct `store_id` and one seller user
that owns it.

## Seeding

```bash
docker compose up -d mysql
cd backend && npm install && npm run seed:products
```

The script is idempotent — rerunning only inserts what is missing.

## Seller credentials

- email: `seller-<first-8-of-store-uuid>@amazara.local`
- password: `seller123`

The seed log prints a few example emails. To list more:

```bash
docker compose exec mysql mysql -uamazara -pamazara amazara \
  -e "SELECT email FROM users WHERE role='seller' LIMIT 5;"
```

## Schema

`stores(id CHAR(36) PK, name, slug UNIQUE, owner_id → users.id, created_at)`.
```

- [ ] **Step 15: Add the row in `docs/README.md`**

Modify `docs/README.md` — append a row to the completed-features table:

```markdown
| Stores foundation | docs/features/stores.md |
```

(Match the existing column structure — the auth row already there is the template.)

- [ ] **Step 16: Commit Task 1**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/package.json backend/package-lock.json \
        backend/src/stores backend/scripts \
        backend/src/app.module.ts backend/test/setup-e2e.ts \
        docs/features/stores.md docs/README.md
git commit -m "$(cat <<'EOF'
feat(backend): add stores module + CSV-driven seller seed

One Store row per distinct store_id in products.enriched.csv, each owned by a
seeded seller account (seller-<first8>@amazara.local / seller123). The
`npm run seed:products` command is idempotent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Products module — public catalog APIs

**Files:**
- Create: `backend/src/products/product.entity.ts`
- Create: `backend/src/products/products.service.ts`
- Create: `backend/src/products/products.controller.ts`
- Create: `backend/src/products/products.module.ts`
- Create: `backend/src/products/dto/list-products.dto.ts`
- Create: `backend/src/products/dto/product-views.ts`
- Create: `backend/src/products/products.service.spec.ts`
- Create: `backend/test/products.e2e-spec.ts`
- Create: `docs/features/products.md`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/scripts/seed-products.ts` (add product upsert)
- Modify: `backend/test/setup-e2e.ts` (truncate `products`)
- Modify: `docs/README.md`

- [ ] **Step 1: Create the `Product` entity**

Create `backend/src/products/product.entity.ts`:

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

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  discount!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  stock!: number;

  @Column({ name: 'image_first', type: 'text' })
  imageFirst!: string;

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

- [ ] **Step 2: Create the response views helper**

Create `backend/src/products/dto/product-views.ts`:

```ts
import { Product } from '../product.entity';

export interface ProductSummary {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  storeId: string;
  price: number;
  discount: number;
  originalPrice: number | null;
  image: string;
  inStock: boolean;
  stock: number;
  colors: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
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

function originalPrice(price: number, discount: number): number | null {
  if (!discount || discount <= 0) return null;
  return Math.round((price / (1 - discount / 100)) * 100) / 100;
}

function colorHexes(availableColors: unknown): string[] {
  const arr = asArray<{ hex?: string }>(availableColors);
  return arr.map((c) => c?.hex).filter((h): h is string => typeof h === 'string');
}

export function toProductSummary(p: Product): ProductSummary {
  const price = Number(p.price);
  return {
    id: p.id,
    name: p.name,
    subtitle: p.shortDescription,
    brand: p.brand,
    category: p.category,
    storeId: p.storeId,
    price,
    discount: p.discount,
    originalPrice: originalPrice(price, p.discount),
    image: p.imageFirst,
    inStock: p.stock > 0,
    stock: p.stock,
    colors: colorHexes(p.availableColors),
  };
}

export function toProductDetail(p: Product): ProductDetail {
  return {
    ...toProductSummary(p),
    description: p.longDescription,
    images: [p.imageFirst],
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

- [ ] **Step 3: Create the list-products DTO**

Create `backend/src/products/dto/list-products.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

export class ListProductsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  category?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  brand?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => toArray(value))
  storeId?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(['men', 'women', 'unisex', 'kids'])
  gender?: 'men' | 'women' | 'unisex' | 'kids';

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsEnum(['featured', 'price-asc', 'price-desc', 'newest'])
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}
```

- [ ] **Step 4: Write the failing unit spec for `ProductsService`**

Create `backend/src/products/products.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

function makeQb(): jest.Mocked<SelectQueryBuilder<Product>> & {
  resolveResult: (rows: Product[], total: number) => void;
} {
  const qb: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  qb.resolveResult = (rows: Product[], total: number) =>
    qb.getManyAndCount.mockResolvedValue([rows, total]);
  return qb;
}

describe('ProductsService', () => {
  let service: ProductsService;
  let qb: ReturnType<typeof makeQb>;
  const repo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    qb = makeQb();
    repo.createQueryBuilder.mockReturnValue(qb);
    repo.findOne.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('list() defaults page=1, limit=24 and applies pagination', async () => {
    qb.resolveResult([], 0);
    await service.list({});
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(24);
  });

  it('list() clamps limit to max 60', async () => {
    qb.resolveResult([], 0);
    await service.list({ limit: 999 } as any);
    expect(qb.take).toHaveBeenCalledWith(60);
  });

  it('list() returns rows mapped to ProductSummary', async () => {
    const row = {
      id: 'p1',
      name: 'Tee',
      brand: 'Nike',
      category: 'Shirts',
      storeId: 's1',
      price: '40.00',
      discount: 20,
      stock: 5,
      imageFirst: 'https://img/x.png',
      shortDescription: 'A shirt',
      availableColors: [{ hex: '#000' }, { hex: '#fff' }],
    } as unknown as Product;
    qb.resolveResult([row], 1);
    const out = await service.list({});
    expect(out.total).toBe(1);
    expect(out.items[0]).toMatchObject({
      id: 'p1',
      price: 40,
      discount: 20,
      originalPrice: 50,
      inStock: true,
      colors: ['#000', '#fff'],
    });
  });

  it('findOne() throws NotFound when product is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 5: Run the spec to confirm it fails**

```bash
cd backend && npm test -- products.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 6: Implement `ProductsService`**

Create `backend/src/products/products.service.ts`:

```ts
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
```

- [ ] **Step 7: Run the spec to confirm it passes**

```bash
cd backend && npm test -- products.service.spec
```

Expected: 4 passing.

- [ ] **Step 8: Implement the controller**

Create `backend/src/products/products.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() dto: ListProductsDto) {
    return this.products.list(dto);
  }

  @Get('facets')
  facets(@Query('q') q?: string) {
    return this.products.facets(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
```

- [ ] **Step 9: Wire `ProductsModule`**

Create `backend/src/products/products.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
```

- [ ] **Step 10: Register `Product` + `ProductsModule` in `AppModule`**

Modify `backend/src/app.module.ts` — extend `entities` and `imports`:

```ts
import { ProductsModule } from './products/products.module';
import { Product } from './products/product.entity';
// ...
entities: [User, Store, Product],
// ...
imports: [
  // ...existing entries
  StoresModule,
  ProductsModule,
],
```

- [ ] **Step 11: Extend `resetDatabase()` to include `products`**

Modify `backend/test/setup-e2e.ts`:

```ts
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE products');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 12: Write an e2e spec for the catalog endpoints**

Create `backend/test/products.e2e-spec.ts`:

```ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Store } from '../src/stores/store.entity';
import { Product } from '../src/products/product.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function seedTestCatalog(ds: DataSource): Promise<void> {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);

  const seller = await users.save(
    users.create({
      email: 'seller-test1@amazara.local',
      passwordHash: 'x',
      fullName: 'Seller One',
      role: 'seller',
    }),
  );
  await stores.save(
    stores.create({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Store One',
      slug: 'store-one',
      ownerId: seller.id,
    }),
  );

  await products.save([
    products.create({
      id: '22222222-0000-0000-0000-000000000001',
      name: 'Blue Running Tee',
      brand: 'Nike',
      category: 'Shirts',
      storeId: '11111111-1111-1111-1111-111111111111',
      price: '40.00',
      discount: 20,
      stock: 5,
      imageFirst: 'https://example.com/a.png',
      shortDescription: 'Lightweight running tee',
      longDescription: 'A blue tee',
      highlights: ['Dri-FIT'],
      availableColors: [{ name: 'blue', hex: '#0000ff' }],
      availableSizes: [{ label: 'M', stock: 1 }],
      targetGender: 'men',
      targetAgeGroup: 'adult',
      tags: ['running', 'blue'],
    }),
    products.create({
      id: '22222222-0000-0000-0000-000000000002',
      name: 'Red Sneakers',
      brand: 'Adidas',
      category: 'Shoes',
      storeId: '11111111-1111-1111-1111-111111111111',
      price: '120.00',
      discount: 0,
      stock: 0,
      imageFirst: 'https://example.com/b.png',
      shortDescription: 'Red kicks',
      longDescription: 'A pair of red sneakers',
      highlights: ['Rubber sole'],
      availableColors: [{ name: 'red', hex: '#ff0000' }],
      availableSizes: [{ label: '42', stock: 0 }],
      targetGender: 'unisex',
      targetAgeGroup: 'adult',
      tags: ['shoes', 'red'],
    }),
  ]);
}

describe('Products (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seedTestCatalog(ctx.dataSource);
  });

  it('GET /products returns paginated summaries', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toHaveProperty('inStock');
    expect(res.body.items[0]).toHaveProperty('subtitle');
  });

  it('GET /products?q=blue matches by name', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products?q=blue');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe('Blue Running Tee');
  });

  it('GET /products?minPrice=100 filters by price', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products?minPrice=100');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].name).toBe('Red Sneakers');
  });

  it('GET /products?sort=price-asc orders ascending', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products?sort=price-asc');
    expect(res.body.items.map((p: { price: number }) => p.price)).toEqual([40, 120]);
  });

  it('GET /products/:id returns the detail view', async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      '/products/22222222-0000-0000-0000-000000000001',
    );
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Blue Running Tee');
    expect(res.body.images).toEqual(['https://example.com/a.png']);
    expect(Array.isArray(res.body.highlights)).toBe(true);
  });

  it('GET /products/:id returns 404 for unknown id', async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      '/products/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  it('GET /products/facets returns categories, brands, and price range', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products/facets');
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(expect.arrayContaining(['Shirts', 'Shoes']));
    expect(res.body.brands).toEqual(expect.arrayContaining(['Nike', 'Adidas']));
    expect(res.body.priceRange).toEqual({ min: 40, max: 120 });
  });
});
```

- [ ] **Step 13: Run the e2e suite**

```bash
docker compose up -d mysql
cd backend && npm run test:e2e -- products.e2e-spec
```

Expected: all 7 cases pass.

- [ ] **Step 14: Extend the seed script to upsert products**

Modify `backend/scripts/seed-products.ts` — inside `main()`, after the store/seller loop, append:

```ts
    const productsRepo = ds.getRepository(
      (await import('../src/products/product.entity')).Product,
    );

    let productsInserted = 0;
    let productsUpdated = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const entities = chunk
        .map((r) => mapRowToProduct(r))
        .filter((p): p is NonNullable<typeof p> => p !== null);
      const existing = await productsRepo
        .createQueryBuilder('p')
        .select('p.id')
        .where('p.id IN (:...ids)', { ids: entities.map((e) => e.id) })
        .getMany();
      const existingIds = new Set(existing.map((e) => e.id));
      await productsRepo.save(entities);
      for (const e of entities) {
        if (existingIds.has(e.id)) productsUpdated += 1;
        else productsInserted += 1;
      }
      console.log(`Products: ${i + chunk.length} / ${rows.length}`);
    }
    console.log(`Seeded ${productsInserted} new products, updated ${productsUpdated}`);
```

And add the `mapRowToProduct` helper at the bottom of the file (before `main().catch`):

```ts
function safeJson(value: string): unknown {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function mapRowToProduct(r: CsvRow):
  | {
      id: string;
      name: string;
      brand: string;
      category: string;
      storeId: string;
      price: string;
      discount: number;
      stock: number;
      imageFirst: string;
      shortDescription: string | null;
      longDescription: string | null;
      highlights: unknown;
      color: unknown;
      availableColors: unknown;
      availableSizes: unknown;
      material: string | null;
      targetGender: 'men' | 'women' | 'unisex' | 'kids' | null;
      targetAgeGroup: string | null;
      tags: unknown;
    }
  | null {
  if (!r.id || !r.name || !r.store_id) return null;
  const price = Number(r.price);
  const discount = Math.max(0, Math.min(100, Math.round(Number(r.discount) || 0)));
  const stock = Math.max(0, Math.round(Number(r.stock) || 0));
  const allowedGenders = new Set(['men', 'women', 'unisex', 'kids']);
  const gender = allowedGenders.has(r.target_gender)
    ? (r.target_gender as 'men' | 'women' | 'unisex' | 'kids')
    : null;
  return {
    id: r.id,
    name: r.name,
    brand: r.brand || 'Unbranded',
    category: r.category || 'Other',
    storeId: r.store_id,
    price: price.toFixed(2),
    discount,
    stock,
    imageFirst: r.image_first || '',
    shortDescription: r.short_description || null,
    longDescription: r.long_description || null,
    highlights: safeJson(r.highlights),
    color: safeJson(r.color),
    availableColors: safeJson(r.available_colors),
    availableSizes: safeJson(r.available_sizes),
    material: r.material || null,
    targetGender: gender,
    targetAgeGroup: r.target_age_group || null,
    tags: safeJson(r.tags),
  };
}
```

Also remove the `void rows;` no-op statement from Step 12.

- [ ] **Step 15: Run the seed script and verify**

```bash
cd backend && npm run seed:products
docker compose exec mysql mysql -uamazara -pamazara amazara -e "SELECT COUNT(*) FROM products;"
```

Expected: count = 4725 (the CSV's row count minus any rows missing `id`/`name`/`store_id`).

- [ ] **Step 16: Create `docs/features/products.md`**

Create `docs/features/products.md`:

```markdown
# Products — catalog

Public catalog APIs backed by MySQL. Data is seeded from
`products.enriched.csv` via `npm run seed:products` in `backend/`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List with `q`, `category[]`, `brand[]`, `storeId[]`, `minPrice`, `maxPrice`, `gender`, `ageGroup`, `sort`, `page`, `limit`. |
| GET | `/products/:id` | Full detail view (parsed JSON columns). |
| GET | `/products/facets` | Distinct categories, brands, price range. Optional `q` narrows it. |

## Response shapes

`ProductSummary`: `id`, `name`, `subtitle`, `brand`, `category`, `storeId`,
`price`, `discount`, `originalPrice`, `image`, `inStock`, `stock`, `colors`.

`ProductDetail` adds `description`, `images`, `highlights`, `availableColors`,
`availableSizes`, `material`, `targetGender`, `targetAgeGroup`, `tags`.

Fields the frontend mocks use but the CSV does not include (`rating`,
`reviewCount`, `features`, `reviews`) are omitted from API responses.

## Search

Case-insensitive `LIKE` across `name`, `brand`, and the `tags` JSON column.
No FULLTEXT index yet.
```

- [ ] **Step 17: Add the row in `docs/README.md`**

Append:

```markdown
| Products catalog | docs/features/products.md |
```

- [ ] **Step 18: Commit Task 2**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/products backend/scripts/seed-products.ts \
        backend/src/app.module.ts backend/test/setup-e2e.ts \
        backend/test/products.e2e-spec.ts \
        docs/features/products.md docs/README.md
git commit -m "$(cat <<'EOF'
feat(backend): public product catalog APIs

GET /products (with filters, search, pagination), /products/:id, and
/products/facets. ProductsService maps CSV fields to a stable summary/detail
shape. seed:products script extended to upsert all 4,725 rows from
products.enriched.csv.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Seller routes for products + `SellerStoreGuard`

**Files:**
- Create: `backend/src/common/guards/seller-store.guard.ts`
- Create: `backend/src/common/guards/seller-store.guard.spec.ts`
- Create: `backend/src/products/store-products.controller.ts`
- Create: `backend/src/products/store-inventory.controller.ts`
- Create: `backend/src/products/dto/create-product.dto.ts`
- Create: `backend/src/products/dto/update-product.dto.ts`
- Create: `backend/test/store-products.e2e-spec.ts`
- Modify: `backend/src/products/products.module.ts`
- Modify: `backend/src/products/products.service.ts` (seller-scoped methods)
- Modify: `docs/features/products.md`

- [ ] **Step 1: Write the failing spec for `SellerStoreGuard`**

Create `backend/src/common/guards/seller-store.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StoresService } from '../../stores/stores.service';
import { SellerStoreGuard } from './seller-store.guard';

function ctx(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SellerStoreGuard', () => {
  let guard: SellerStoreGuard;
  const stores = { findByOwnerId: jest.fn() };

  beforeEach(async () => {
    stores.findByOwnerId.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerStoreGuard,
        { provide: StoresService, useValue: stores },
      ],
    }).compile();
    guard = moduleRef.get(SellerStoreGuard);
  });

  it('attaches the store and returns true when the seller owns one', async () => {
    const req: any = { user: { id: '7' } };
    stores.findByOwnerId.mockResolvedValue({ id: 's1' });
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.store).toEqual({ id: 's1' });
  });

  it('throws 403 when the user owns no store', async () => {
    stores.findByOwnerId.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctx({ user: { id: '99' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 403 when no user is on the request', async () => {
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run the spec to confirm it fails**

```bash
cd backend && npm test -- seller-store.guard.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SellerStoreGuard`**

Create `backend/src/common/guards/seller-store.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Store } from '../../stores/store.entity';
import { StoresService } from '../../stores/stores.service';

interface RequestWithUserStore {
  user?: { id: string };
  store?: Store;
}

@Injectable()
export class SellerStoreGuard implements CanActivate {
  constructor(private readonly stores: StoresService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<RequestWithUserStore>();
    if (!req.user?.id) throw new ForbiddenException('Seller account required');
    const store = await this.stores.findByOwnerId(req.user.id);
    if (!store) throw new ForbiddenException('No store owned by this user');
    req.store = store;
    return true;
  }
}
```

- [ ] **Step 4: Run the spec to confirm it passes**

```bash
cd backend && npm test -- seller-store.guard.spec
```

Expected: 3 passing.

- [ ] **Step 5: Add the create/update product DTOs**

Create `backend/src/products/dto/create-product.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
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

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsUrl({ require_tld: false })
  imageFirst!: string;

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

Create `backend/src/products/dto/update-product.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

Run `npm install @nestjs/mapped-types` if missing:

```bash
cd backend && npm install @nestjs/mapped-types
```

- [ ] **Step 6: Extend `ProductsService` with seller-scoped methods**

Append to `backend/src/products/products.service.ts` inside the `ProductsService` class:

```ts
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
```

Also add to the imports at the top of `products.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
```

- [ ] **Step 7: Implement the seller controllers**

Create `backend/src/products/store-products.controller.ts`:

```ts
import {
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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('store/products')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.listForStore(req.store.id, {
      q,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
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

Create `backend/src/products/store-inventory.controller.ts`:

```ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { ProductsService } from './products.service';

@Controller('store/inventory')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreInventoryController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('q') q?: string,
  ) {
    return this.products.inventoryForStore(req.store.id, q);
  }
}
```

Also add `GET /store/me` — extend `backend/src/products/store-products.controller.ts` with a top-level controller for `/store/me`:

Create `backend/src/products/store-me.controller.ts`:

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';

@Controller('store')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreMeController {
  @Get('me')
  me(@Req() req: Request & { store: Store }) {
    return { store: req.store };
  }
}
```

- [ ] **Step 8: Wire controllers into `ProductsModule`**

Modify `backend/src/products/products.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresModule } from '../stores/stores.module';
import { Product } from './product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StoreProductsController } from './store-products.controller';
import { StoreInventoryController } from './store-inventory.controller';
import { StoreMeController } from './store-me.controller';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), StoresModule],
  controllers: [
    ProductsController,
    StoreProductsController,
    StoreInventoryController,
    StoreMeController,
  ],
  providers: [ProductsService, SellerStoreGuard],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
```

- [ ] **Step 9: Write an e2e spec for store/products + store/inventory**

Create `backend/test/store-products.e2e-spec.ts`:

```ts
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function seedSellerWithStore(ds: DataSource): Promise<{ token: string; storeId: string }> {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const passwordHash = await bcrypt.hash('seller123', 12);
  const seller = await users.save(
    users.create({
      email: 'owner@amazara.local',
      passwordHash,
      fullName: 'Owner',
      role: 'seller',
    }),
  );
  const store = await stores.save(
    stores.create({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Owner Store',
      slug: 'owner-store',
      ownerId: seller.id,
    }),
  );
  return { token: '', storeId: store.id };
}

describe('Store products (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let storeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    const seeded = await seedSellerWithStore(ctx.dataSource);
    storeId = seeded.storeId;
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@amazara.local', password: 'seller123' });
    token = login.body.accessToken;
    expect(token).toBeDefined();
  });

  it('GET /store/me returns the seller’s store', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/store/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.store.id).toBe(storeId);
  });

  it('GET /store/me returns 403 for a buyer', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'buyer@amazara.local',
        password: 'buyer123buyer',
        fullName: 'Buyer',
        role: 'buyer',
      });
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'buyer@amazara.local', password: 'buyer123buyer' });
    const res = await request(ctx.app.getHttpServer())
      .get('/store/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /store/products creates a product owned by the seller’s store', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/store/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Tee',
        brand: 'Nike',
        category: 'Shirts',
        price: 50,
        stock: 10,
        imageFirst: 'https://example.com/x.png',
      });
    expect(res.status).toBe(201);
    expect(res.body.product.storeId).toBe(storeId);
    expect(res.body.product.id).toBeDefined();
  });

  it('PATCH /store/products/:id 403s when product belongs to another store', async () => {
    const products = ctx.dataSource.getRepository(Product);
    const stores = ctx.dataSource.getRepository(Store);
    const users = ctx.dataSource.getRepository(User);
    const otherOwner = await users.save(
      users.create({
        email: 'other@amazara.local',
        passwordHash: 'x',
        fullName: 'Other',
        role: 'seller',
      }),
    );
    const otherStore = await stores.save(
      stores.create({
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Other Store',
        slug: 'other-store',
        ownerId: otherOwner.id,
      }),
    );
    const product = await products.save(
      products.create({
        id: '33333333-0000-0000-0000-000000000001',
        name: 'Other Tee',
        brand: 'Nike',
        category: 'Shirts',
        storeId: otherStore.id,
        price: '25.00',
        discount: 0,
        stock: 3,
        imageFirst: 'https://example.com/y.png',
      }),
    );

    const res = await request(ctx.app.getHttpServer())
      .patch(`/store/products/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 5 });
    expect(res.status).toBe(403);
  });

  it('GET /store/inventory returns rows shaped for the inventory page', async () => {
    const products = ctx.dataSource.getRepository(Product);
    await products.save([
      products.create({
        id: '44444444-0000-0000-0000-000000000001',
        name: 'In stock',
        brand: 'Nike',
        category: 'Shirts',
        storeId,
        price: '40.00',
        discount: 0,
        stock: 50,
        imageFirst: 'https://example.com/a.png',
      }),
      products.create({
        id: '44444444-0000-0000-0000-000000000002',
        name: 'Low stock',
        brand: 'Nike',
        category: 'Shirts',
        storeId,
        price: '40.00',
        discount: 0,
        stock: 5,
        imageFirst: 'https://example.com/b.png',
      }),
      products.create({
        id: '44444444-0000-0000-0000-000000000003',
        name: 'Out of stock',
        brand: 'Nike',
        category: 'Shirts',
        storeId,
        price: '40.00',
        discount: 0,
        stock: 0,
        imageFirst: 'https://example.com/c.png',
      }),
    ]);
    const res = await request(ctx.app.getHttpServer())
      .get('/store/inventory')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const statuses = res.body.items.map((r: { status: string }) => r.status);
    expect(statuses).toEqual(
      expect.arrayContaining(['In Stock', 'Low Stock', 'Out of Stock']),
    );
  });
});
```

- [ ] **Step 10: Run the e2e suite**

```bash
cd backend && npm run test:e2e -- store-products.e2e-spec
```

Expected: 5 cases pass.

- [ ] **Step 11: Append to `docs/features/products.md`**

Append to `docs/features/products.md`:

```markdown

## Seller routes

All require `Authorization: Bearer <token>` from a seller who owns a store.
`SellerStoreGuard` resolves `req.store` from the seller's `ownerId`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/me` | The authenticated seller's store. |
| GET | `/store/products` | Paginated list, scoped to the store. |
| POST | `/store/products` | Create a product (always pinned to the seller's store). |
| PATCH | `/store/products/:id` | Update; 403 if the product belongs to a different store. |
| DELETE | `/store/products/:id` | Delete; 403 on cross-store access. |
| GET | `/store/inventory` | Rows shaped for `StoreInventoryPage` (sku, name, category, stock, price, status). |

`status` is derived from `stock`: `Out of Stock` (0), `Low Stock` (≤ 10),
`In Stock` (> 10).
```

- [ ] **Step 12: Commit Task 3**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/common backend/src/products \
        backend/test/store-products.e2e-spec.ts \
        backend/package.json backend/package-lock.json \
        docs/features/products.md
git commit -m "$(cat <<'EOF'
feat(backend): seller product + inventory APIs

/store/me, /store/products (CRUD), and /store/inventory behind
JwtAuthGuard + new SellerStoreGuard. Sellers can only act on products that
belong to the store they own.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wishlist module

**Files:**
- Create: `backend/src/wishlist/wishlist-item.entity.ts`
- Create: `backend/src/wishlist/wishlist.service.ts`
- Create: `backend/src/wishlist/wishlist.controller.ts`
- Create: `backend/src/wishlist/wishlist.module.ts`
- Create: `backend/src/wishlist/wishlist.service.spec.ts`
- Create: `backend/test/wishlist.e2e-spec.ts`
- Create: `docs/features/wishlist.md`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/test/setup-e2e.ts`
- Modify: `docs/README.md`

- [ ] **Step 1: Create the `WishlistItem` entity**

Create `backend/src/wishlist/wishlist-item.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'wishlist_items' })
@Index('uniq_wishlist_user_product', ['userId', 'productId'], { unique: true })
export class WishlistItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
```

- [ ] **Step 2: Write the failing unit spec**

Create `backend/src/wishlist/wishlist.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { WishlistItem } from './wishlist-item.entity';
import { WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  let service: WishlistService;
  const items = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };
  const products = { find: jest.fn() };

  beforeEach(async () => {
    for (const fn of Object.values(items)) (fn as jest.Mock).mockReset();
    products.find.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: getRepositoryToken(WishlistItem), useValue: items },
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    service = moduleRef.get(WishlistService);
  });

  it('add() inserts when none exists', async () => {
    items.findOne.mockResolvedValue(null);
    items.create.mockImplementation((v) => v);
    items.save.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1' });
    const out = await service.add('u1', 'p1');
    expect(items.save).toHaveBeenCalled();
    expect(out.item.productId).toBe('p1');
  });

  it('add() is idempotent — returns existing row without inserting', async () => {
    items.findOne.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1' });
    const out = await service.add('u1', 'p1');
    expect(items.save).not.toHaveBeenCalled();
    expect(out.item.id).toBe('1');
  });

  it('remove() deletes by composite key', async () => {
    items.delete.mockResolvedValue({ affected: 1 });
    await service.remove('u1', 'p1');
    expect(items.delete).toHaveBeenCalledWith({ userId: 'u1', productId: 'p1' });
  });

  it('list() returns ProductSummary for each wishlisted product', async () => {
    items.find.mockResolvedValue([
      { productId: 'p1' },
      { productId: 'p2' },
    ]);
    products.find.mockResolvedValue([
      {
        id: 'p1',
        name: 'A',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '10.00',
        discount: 0,
        stock: 1,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
      {
        id: 'p2',
        name: 'A2',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '20.00',
        discount: 0,
        stock: 0,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
    ]);
    const out = await service.list('u1');
    expect(out.items).toHaveLength(2);
    expect(out.items[1].inStock).toBe(false);
  });
});
```

- [ ] **Step 3: Run the spec to confirm it fails**

```bash
cd backend && npm test -- wishlist.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `WishlistService`**

Create `backend/src/wishlist/wishlist.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { toProductSummary } from '../products/dto/product-views';
import { WishlistItem } from './wishlist-item.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly items: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async list(userId: string) {
    const rows = await this.items.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return { items: [] };
    const products = await this.products.find({
      where: { id: In(rows.map((r) => r.productId)) },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = rows
      .map((r) => byId.get(r.productId))
      .filter((p): p is Product => p !== undefined)
      .map(toProductSummary);
    return { items };
  }

  async add(userId: string, productId: string) {
    const existing = await this.items.findOne({ where: { userId, productId } });
    if (existing) return { item: existing, created: false };
    const entity = this.items.create({ userId, productId });
    const saved = await this.items.save(entity);
    return { item: saved, created: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
  }
}
```

- [ ] **Step 5: Run the spec to confirm it passes**

```bash
cd backend && npm test -- wishlist.service.spec
```

Expected: 4 passing.

- [ ] **Step 6: Implement the controller**

Create `backend/src/wishlist/wishlist.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WishlistService } from './wishlist.service';

class AddWishlistDto {
  @IsString()
  @Length(36, 36)
  productId!: string;
}

@Controller('me/wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.wishlist.list(req.user.id);
  }

  @Post()
  async add(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: AddWishlistDto,
  ) {
    const out = await this.wishlist.add(req.user.id, dto.productId);
    return { item: out.item };
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    await this.wishlist.remove(req.user.id, productId);
  }
}
```

- [ ] **Step 7: Wire `WishlistModule`**

Create `backend/src/wishlist/wishlist.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { WishlistItem } from './wishlist-item.entity';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItem, Product])],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
```

- [ ] **Step 8: Register in `AppModule` + extend `resetDatabase`**

Modify `backend/src/app.module.ts`:

```ts
import { WishlistModule } from './wishlist/wishlist.module';
import { WishlistItem } from './wishlist/wishlist-item.entity';
// ...
entities: [User, Store, Product, WishlistItem],
// imports: append WishlistModule
```

Modify `backend/test/setup-e2e.ts`:

```ts
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE wishlist_items');
  await dataSource.query('TRUNCATE TABLE products');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 9: Write the e2e spec**

Create `backend/test/wishlist.e2e-spec.ts`:

```ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function seedCatalog(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const seller = await users.save(
    users.create({
      email: 'seller-x@amazara.local',
      passwordHash: 'x',
      fullName: 'Seller',
      role: 'seller',
    }),
  );
  const store = await stores.save(
    stores.create({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'A',
      slug: 'a',
      ownerId: seller.id,
    }),
  );
  await products.save(
    products.create({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Item',
      brand: 'B',
      category: 'C',
      storeId: store.id,
      price: '10.00',
      discount: 0,
      stock: 5,
      imageFirst: 'https://example.com/i.png',
    }),
  );
}

async function registerBuyer(server: any): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({
      email: 'buyer@amazara.local',
      password: 'buyer123buyer',
      fullName: 'Buyer',
      role: 'buyer',
    });
  return res.body.accessToken;
}

describe('Wishlist (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seedCatalog(ctx.dataSource);
  });

  const productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('GET /me/wishlist requires auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/me/wishlist');
    expect(res.status).toBe(401);
  });

  it('full add → list → delete cycle', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer());
    const empty = await request(ctx.app.getHttpServer())
      .get('/me/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(empty.body.items).toEqual([]);

    const add = await request(ctx.app.getHttpServer())
      .post('/me/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId });
    expect(add.status).toBe(201);

    const list = await request(ctx.app.getHttpServer())
      .get('/me/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(productId);

    const del = await request(ctx.app.getHttpServer())
      .delete(`/me/wishlist/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await request(ctx.app.getHttpServer())
      .get('/me/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.items).toEqual([]);
  });

  it('add is idempotent', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer());
    await request(ctx.app.getHttpServer())
      .post('/me/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId });
    const second = await request(ctx.app.getHttpServer())
      .post('/me/wishlist')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId });
    expect([200, 201]).toContain(second.status);

    const list = await request(ctx.app.getHttpServer())
      .get('/me/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 10: Run the e2e suite**

```bash
cd backend && npm run test:e2e -- wishlist.e2e-spec
```

Expected: 3 passing.

- [ ] **Step 11: Create `docs/features/wishlist.md` + update `docs/README.md`**

Create `docs/features/wishlist.md`:

```markdown
# Wishlist

Per-user saved products, persisted on the server behind `JwtAuthGuard`.

| Method | Path | Body | Behaviour |
|--------|------|------|-----------|
| GET | `/me/wishlist` | — | Returns the user's wishlisted `ProductSummary`s. |
| POST | `/me/wishlist` | `{ productId }` | Idempotent. Returns the row whether new or existing. |
| DELETE | `/me/wishlist/:productId` | — | Returns 204; missing rows are a no-op. |

Schema: `wishlist_items(id, user_id, product_id, created_at)` with a unique
index on `(user_id, product_id)`.
```

Append to `docs/README.md`:

```markdown
| Wishlist | docs/features/wishlist.md |
```

- [ ] **Step 12: Commit Task 4**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/wishlist backend/src/app.module.ts \
        backend/test/setup-e2e.ts backend/test/wishlist.e2e-spec.ts \
        docs/features/wishlist.md docs/README.md
git commit -m "$(cat <<'EOF'
feat(backend): persisted wishlist APIs

/me/wishlist GET/POST/DELETE behind JwtAuthGuard. Composite-unique
(user_id, product_id) makes POST idempotent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Cart module

**Files:**
- Create: `backend/src/cart/cart-item.entity.ts`
- Create: `backend/src/cart/cart.service.ts`
- Create: `backend/src/cart/cart.controller.ts`
- Create: `backend/src/cart/cart.module.ts`
- Create: `backend/src/cart/dto/add-cart-item.dto.ts`
- Create: `backend/src/cart/dto/update-cart-item.dto.ts`
- Create: `backend/src/cart/cart.service.spec.ts`
- Create: `backend/test/cart.e2e-spec.ts`
- Create: `docs/features/cart.md`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/test/setup-e2e.ts`
- Modify: `docs/README.md`

- [ ] **Step 1: Create the `CartItem` entity**

Create `backend/src/cart/cart-item.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'cart_items' })
@Index('uniq_cart_user_product', ['userId', 'productId'], { unique: true })
export class CartItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Create the DTOs**

Create `backend/src/cart/dto/add-cart-item.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @Length(36, 36)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}
```

Create `backend/src/cart/dto/update-cart-item.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  quantity!: number;
}
```

- [ ] **Step 3: Write the failing unit spec**

Create `backend/src/cart/cart.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  const items = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };
  const products = { findOne: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    for (const fn of Object.values(items)) (fn as jest.Mock).mockReset();
    for (const fn of Object.values(products)) (fn as jest.Mock).mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(CartItem), useValue: items },
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    service = moduleRef.get(CartService);
  });

  it('add() inserts a new row when none exists', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 10 });
    items.findOne.mockResolvedValue(null);
    items.create.mockImplementation((v) => v);
    items.save.mockImplementation((v) => Promise.resolve({ id: '1', ...v }));
    const out = await service.add('u1', { productId: 'p1', quantity: 2 } as any);
    expect(out.item.quantity).toBe(2);
  });

  it('add() increments quantity on duplicate productId', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 10 });
    items.findOne.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1', quantity: 1 });
    items.save.mockImplementation((v) => Promise.resolve(v));
    const out = await service.add('u1', { productId: 'p1', quantity: 3 } as any);
    expect(out.item.quantity).toBe(4);
  });

  it('add() rejects when product not found', async () => {
    products.findOne.mockResolvedValue(null);
    await expect(
      service.add('u1', { productId: 'missing', quantity: 1 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('add() rejects when requested quantity exceeds stock', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 1 });
    items.findOne.mockResolvedValue(null);
    await expect(
      service.add('u1', { productId: 'p1', quantity: 5 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update() with quantity=0 deletes the row', async () => {
    items.findOne.mockResolvedValue({ id: '1' });
    items.delete.mockResolvedValue({ affected: 1 });
    const out = await service.update('u1', 'p1', { quantity: 0 } as any);
    expect(out).toBeNull();
    expect(items.delete).toHaveBeenCalled();
  });

  it('list() returns hydrated items with subtotal', async () => {
    items.find.mockResolvedValue([
      { id: '1', productId: 'p1', quantity: 2 },
      { id: '2', productId: 'p2', quantity: 1 },
    ]);
    products.find.mockResolvedValue([
      {
        id: 'p1',
        name: 'A',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '10.00',
        discount: 0,
        stock: 5,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
      {
        id: 'p2',
        name: 'D',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '4.50',
        discount: 0,
        stock: 5,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
    ]);
    const out = await service.list('u1');
    expect(out.items).toHaveLength(2);
    expect(out.subtotal).toBe(24.5);
  });
});
```

- [ ] **Step 4: Run the spec to confirm it fails**

```bash
cd backend && npm test -- cart.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `CartService`**

Create `backend/src/cart/cart.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import {
  ProductSummary,
  toProductSummary,
} from '../products/dto/product-views';
import { CartItem } from './cart-item.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  product: ProductSummary;
  lineTotal: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async list(userId: string): Promise<{ items: CartItemView[]; subtotal: number }> {
    const rows = await this.items.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0) return { items: [], subtotal: 0 };
    const products = await this.products.find({
      where: { id: In(rows.map((r) => r.productId)) },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: CartItemView[] = [];
    let subtotal = 0;
    for (const r of rows) {
      const p = byId.get(r.productId);
      if (!p) continue;
      const summary = toProductSummary(p);
      const line = Math.round(summary.price * r.quantity * 100) / 100;
      subtotal += line;
      items.push({
        id: r.id,
        productId: r.productId,
        quantity: r.quantity,
        product: summary,
        lineTotal: line,
      });
    }
    return { items, subtotal: Math.round(subtotal * 100) / 100 };
  }

  async add(
    userId: string,
    dto: AddCartItemDto,
  ): Promise<{ item: CartItem }> {
    const product = await this.products.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    const existing = await this.items.findOne({
      where: { userId, productId: dto.productId },
    });
    const nextQty = (existing?.quantity ?? 0) + dto.quantity;
    if (nextQty > product.stock)
      throw new BadRequestException('Requested quantity exceeds stock');
    if (existing) {
      existing.quantity = nextQty;
      const saved = await this.items.save(existing);
      return { item: saved };
    }
    const created = this.items.create({
      userId,
      productId: dto.productId,
      quantity: dto.quantity,
    });
    return { item: await this.items.save(created) };
  }

  async update(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartItem | null> {
    const row = await this.items.findOne({ where: { userId, productId } });
    if (!row) throw new NotFoundException('Cart row not found');
    if (dto.quantity === 0) {
      await this.items.delete({ userId, productId });
      return null;
    }
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (dto.quantity > product.stock)
      throw new BadRequestException('Requested quantity exceeds stock');
    row.quantity = dto.quantity;
    return this.items.save(row);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.items.delete({ userId, productId });
  }

  async clear(userId: string): Promise<void> {
    await this.items.delete({ userId });
  }
}
```

- [ ] **Step 6: Run the spec to confirm it passes**

```bash
cd backend && npm test -- cart.service.spec
```

Expected: 6 passing.

- [ ] **Step 7: Implement the controller**

Create `backend/src/cart/cart.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('me/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  list(@Req() req: Request & { user: { id: string } }) {
    return this.cart.list(req.user.id);
  }

  @Post()
  async add(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: AddCartItemDto,
  ) {
    const out = await this.cart.add(req.user.id, dto);
    return out;
  }

  @Patch(':productId')
  async update(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const item = await this.cart.update(req.user.id, productId, dto);
    if (!item) return { ok: true };
    return { item };
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    await this.cart.remove(req.user.id, productId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@Req() req: Request & { user: { id: string } }) {
    await this.cart.clear(req.user.id);
  }
}
```

- [ ] **Step 8: Wire `CartModule` + register in `AppModule` + extend `resetDatabase`**

Create `backend/src/cart/cart.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CartItem, Product])],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService, TypeOrmModule],
})
export class CartModule {}
```

Modify `backend/src/app.module.ts`:

```ts
import { CartModule } from './cart/cart.module';
import { CartItem } from './cart/cart-item.entity';
// ...
entities: [User, Store, Product, WishlistItem, CartItem],
// imports: append CartModule
```

Modify `backend/test/setup-e2e.ts`:

```ts
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE cart_items');
  await dataSource.query('TRUNCATE TABLE wishlist_items');
  await dataSource.query('TRUNCATE TABLE products');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 9: Write the e2e spec**

Create `backend/test/cart.e2e-spec.ts`:

```ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function seedCatalog(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const seller = await users.save(
    users.create({
      email: 'cart-seller@amazara.local',
      passwordHash: 'x',
      fullName: 'Seller',
      role: 'seller',
    }),
  );
  const store = await stores.save(
    stores.create({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      name: 'C',
      slug: 'c',
      ownerId: seller.id,
    }),
  );
  await products.save(
    products.create({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      name: 'CartItem',
      brand: 'B',
      category: 'C',
      storeId: store.id,
      price: '10.00',
      discount: 0,
      stock: 3,
      imageFirst: 'https://example.com/x.png',
    }),
  );
}

async function registerBuyer(server: any): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({
      email: 'cart-buyer@amazara.local',
      password: 'buyer123buyer',
      fullName: 'Buyer',
      role: 'buyer',
    });
  return res.body.accessToken;
}

const productId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('Cart (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seedCatalog(ctx.dataSource);
  });

  it('GET /me/cart requires auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/me/cart');
    expect(res.status).toBe(401);
  });

  it('add → list → patch → delete cycle', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer());
    await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const list = await request(ctx.app.getHttpServer())
      .get('/me/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.subtotal).toBe(20);

    await request(ctx.app.getHttpServer())
      .patch(`/me/cart/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })
      .expect(200);

    const list2 = await request(ctx.app.getHttpServer())
      .get('/me/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(list2.body.items[0].quantity).toBe(3);

    await request(ctx.app.getHttpServer())
      .delete(`/me/cart/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('rejects quantity over stock', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 99 });
    expect(res.status).toBe(400);
  });

  it('PATCH quantity=0 deletes the row', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer());
    await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    await request(ctx.app.getHttpServer())
      .patch(`/me/cart/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 0 })
      .expect(200);
    const list = await request(ctx.app.getHttpServer())
      .get('/me/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toEqual([]);
  });
});
```

- [ ] **Step 10: Run the e2e suite**

```bash
cd backend && npm run test:e2e -- cart.e2e-spec
```

Expected: 4 passing.

- [ ] **Step 11: Create `docs/features/cart.md` and update `docs/README.md`**

Create `docs/features/cart.md`:

```markdown
# Cart

Per-user cart, persisted in MySQL behind `JwtAuthGuard`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me/cart` | — | Returns `{ items, subtotal }`. Each item hydrates the product summary. |
| POST | `/me/cart` | `{ productId, quantity }` | Adds or increments. 400 if cumulative qty > stock. |
| PATCH | `/me/cart/:productId` | `{ quantity }` | `quantity = 0` deletes the row. 400 if qty > stock. |
| DELETE | `/me/cart/:productId` | — | 204, no-op for missing rows. |
| DELETE | `/me/cart` | — | Clears the entire cart. |

Schema: `cart_items(id, user_id, product_id, quantity, created_at, updated_at)`
with a unique index on `(user_id, product_id)`.
```

Append to `docs/README.md`:

```markdown
| Cart | docs/features/cart.md |
```

- [ ] **Step 12: Commit Task 5**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/cart backend/src/app.module.ts \
        backend/test/setup-e2e.ts backend/test/cart.e2e-spec.ts \
        docs/features/cart.md docs/README.md
git commit -m "$(cat <<'EOF'
feat(backend): persisted cart APIs

/me/cart GET/POST/PATCH/DELETE with stock validation. Adding a productId
that's already in the cart increments quantity; patching to 0 removes it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Orders module — buyer side (checkout + my orders)

**Files:**
- Create: `backend/src/orders/order.entity.ts`
- Create: `backend/src/orders/order-item.entity.ts`
- Create: `backend/src/orders/orders.service.ts`
- Create: `backend/src/orders/orders.controller.ts`
- Create: `backend/src/orders/orders.module.ts`
- Create: `backend/src/orders/dto/checkout.dto.ts`
- Create: `backend/src/orders/orders.service.spec.ts`
- Create: `backend/test/orders.e2e-spec.ts`
- Create: `docs/features/orders.md`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/test/setup-e2e.ts`
- Modify: `docs/README.md`

- [ ] **Step 1: Create the order entities**

Create `backend/src/orders/order.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index('idx_orders_buyer')
  @Column({ name: 'buyer_id', type: 'bigint', unsigned: true })
  buyerId!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  shipping!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  tax!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: string;

  @Column({
    type: 'enum',
    enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Processing',
  })
  status!: OrderStatus;

  @OneToMany(() => OrderItem, (i) => i.order, { cascade: true })
  items?: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

Create `backend/src/orders/order-item.entity.ts`:

```ts
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity({ name: 'order_items' })
@Index('idx_order_items_store', ['storeId'])
@Index('idx_order_items_order', ['orderId'])
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({ name: 'store_id', type: 'char', length: 36 })
  storeId!: string;

  @Column({ name: 'name_snapshot', type: 'varchar', length: 255 })
  nameSnapshot!: string;

  @Column({ name: 'price_snapshot', type: 'decimal', precision: 10, scale: 2 })
  priceSnapshot!: string;

  @Column({ type: 'int', unsigned: true })
  quantity!: number;
}
```

- [ ] **Step 2: Create the checkout DTO**

Create `backend/src/orders/dto/checkout.dto.ts`:

```ts
import { ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Length(36, 36, { each: true })
  productIds!: string[];
}
```

- [ ] **Step 3: Write the failing unit spec**

Create `backend/src/orders/orders.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService.checkout', () => {
  let service: OrdersService;
  let txCallback: any;
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => {
      txCallback = cb;
      return cb(manager);
    }),
  } as unknown as DataSource;

  beforeEach(async () => {
    Object.values(manager).forEach((fn) => (fn as jest.Mock).mockReset());
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('throws BadRequest when productIds is empty after cart filter', async () => {
    manager.find.mockResolvedValue([]); // cart_items
    await expect(service.checkout('u1', { productIds: ['p1'] } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws Conflict when stock UPDATE affects zero rows', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.query.mockResolvedValueOnce({ affectedRows: 0 } as any);
    await expect(
      service.checkout('u1', { productIds: ['p1'] } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates order, decrements stock, deletes cart rows on success', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.query.mockResolvedValueOnce({ affectedRows: 1 });
    manager.save
      .mockResolvedValueOnce({ id: '101', total: '20.00' }) // order
      .mockResolvedValueOnce([{ id: '500' }]); // order items
    manager.delete.mockResolvedValue({ affected: 1 });

    const result = await service.checkout('u1', { productIds: ['p1'] } as any);
    expect(result.orderId).toBe('101');
    expect(result.total).toBe(20);
    expect(manager.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the spec to confirm it fails**

```bash
cd backend && npm test -- orders.service.spec
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `OrdersService`**

Create `backend/src/orders/orders.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async checkout(buyerId: string, dto: CheckoutDto): Promise<{ orderId: string; total: number }> {
    return this.dataSource.transaction(async (manager) => {
      const cartRows = await manager.find(CartItem, {
        where: { userId: buyerId, productId: In(dto.productIds) },
      });
      if (cartRows.length === 0) {
        throw new BadRequestException('No matching cart items');
      }
      const productIds = cartRows.map((r) => r.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      let subtotal = 0;
      const orderItemDrafts: Array<{
        productId: string;
        storeId: string;
        nameSnapshot: string;
        priceSnapshot: string;
        quantity: number;
      }> = [];

      for (const row of cartRows) {
        const product = byId.get(row.productId);
        if (!product) throw new NotFoundException(`Product ${row.productId} missing`);
        const res = await manager.query(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [row.quantity, row.productId, row.quantity],
        );
        const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
        if (affected !== 1) {
          throw new ConflictException(`Insufficient stock for ${product.name}`);
        }
        const line = Math.round(Number(product.price) * row.quantity * 100) / 100;
        subtotal += line;
        orderItemDrafts.push({
          productId: row.productId,
          storeId: product.storeId,
          nameSnapshot: product.name,
          priceSnapshot: product.price,
          quantity: row.quantity,
        });
      }

      const subtotalRounded = Math.round(subtotal * 100) / 100;
      const shipping = subtotalRounded > 0 ? 12.5 : 0;
      const tax = Math.round(subtotalRounded * 0.08 * 100) / 100;
      const total = Math.round((subtotalRounded + shipping + tax) * 100) / 100;

      const orderEntity = manager.create(Order, {
        buyerId,
        subtotal: subtotalRounded.toFixed(2),
        shipping: shipping.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        status: 'Processing',
      });
      const savedOrder = await manager.save(orderEntity);

      const itemEntities = orderItemDrafts.map((d) =>
        manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: d.productId,
          storeId: d.storeId,
          nameSnapshot: d.nameSnapshot,
          priceSnapshot: d.priceSnapshot,
          quantity: d.quantity,
        }),
      );
      await manager.save(itemEntities);

      await manager.delete(CartItem, {
        userId: buyerId,
        productId: In(productIds),
      });

      return { orderId: String(savedOrder.id), total };
    });
  }

  async listForBuyer(buyerId: string) {
    const orders = await this.orders.find({
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
    return {
      items: orders.map((o) => ({
        id: String(o.id),
        subtotal: Number(o.subtotal),
        shipping: Number(o.shipping),
        tax: Number(o.tax),
        total: Number(o.total),
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  }

  async findOneForBuyer(buyerId: string, id: string) {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    return {
      id: String(order.id),
      buyerId: order.buyerId,
      subtotal: Number(order.subtotal),
      shipping: Number(order.shipping),
      tax: Number(order.tax),
      total: Number(order.total),
      status: order.status,
      createdAt: order.createdAt,
      items: (order.items ?? []).map((it) => ({
        id: String(it.id),
        productId: it.productId,
        storeId: it.storeId,
        name: it.nameSnapshot,
        price: Number(it.priceSnapshot),
        quantity: it.quantity,
        lineTotal: Math.round(Number(it.priceSnapshot) * it.quantity * 100) / 100,
      })),
    };
  }
}
```

- [ ] **Step 6: Run the spec to confirm it passes**

```bash
cd backend && npm test -- orders.service.spec
```

Expected: 3 passing.

- [ ] **Step 7: Implement the buyer controller**

Create `backend/src/orders/orders.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders/checkout')
  @HttpCode(201)
  checkout(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(req.user.id, dto);
  }

  @Get('me/orders')
  list(@Req() req: Request & { user: { id: string } }) {
    return this.orders.listForBuyer(req.user.id);
  }

  @Get('me/orders/:id')
  findOne(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.orders.findOneForBuyer(req.user.id, id);
  }
}
```

- [ ] **Step 8: Wire `OrdersModule`, register in `AppModule`, extend `resetDatabase`**

Create `backend/src/orders/orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
```

Modify `backend/src/app.module.ts`:

```ts
import { OrdersModule } from './orders/orders.module';
import { Order } from './orders/order.entity';
import { OrderItem } from './orders/order-item.entity';
// ...
entities: [User, Store, Product, WishlistItem, CartItem, Order, OrderItem],
// imports: append OrdersModule
```

Modify `backend/test/setup-e2e.ts`:

```ts
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE order_items');
  await dataSource.query('TRUNCATE TABLE orders');
  await dataSource.query('TRUNCATE TABLE cart_items');
  await dataSource.query('TRUNCATE TABLE wishlist_items');
  await dataSource.query('TRUNCATE TABLE products');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 9: Write the e2e spec**

Create `backend/test/orders.e2e-spec.ts`:

```ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function seedCatalog(ds: DataSource, stock = 5) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const seller = await users.save(
    users.create({
      email: 'order-seller@amazara.local',
      passwordHash: 'x',
      fullName: 'Seller',
      role: 'seller',
    }),
  );
  const store = await stores.save(
    stores.create({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      name: 'E',
      slug: 'e',
      ownerId: seller.id,
    }),
  );
  await products.save(
    products.create({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      name: 'OrderItem',
      brand: 'B',
      category: 'C',
      storeId: store.id,
      price: '10.00',
      discount: 0,
      stock,
      imageFirst: 'https://example.com/i.png',
    }),
  );
}

async function registerBuyer(server: any, email: string): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({ email, password: 'buyer123buyer', fullName: 'Buyer', role: 'buyer' });
  return res.body.accessToken;
}

const productId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('Orders (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seedCatalog(ctx.dataSource);
  });

  it('checkout with empty productIds returns 400', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'b1@a.local');
    const res = await request(ctx.app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ productIds: [] });
    expect(res.status).toBe(400);
  });

  it('checkout decrements stock and clears cart rows', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'b2@a.local');
    await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ productIds: [productId] });
    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.total).toBeGreaterThan(20);

    const cart = await request(ctx.app.getHttpServer())
      .get('/me/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(cart.body.items).toEqual([]);

    const product = await ctx.dataSource
      .getRepository(Product)
      .findOne({ where: { id: productId } });
    expect(product!.stock).toBe(3);
  });

  it('oversell returns 409', async () => {
    await resetDatabase(ctx.dataSource);
    await seedCatalog(ctx.dataSource, 1);
    const token = await registerBuyer(ctx.app.getHttpServer(), 'b3@a.local');
    await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    // bump stock down behind the cart's back to simulate concurrent purchase
    await ctx.dataSource.query('UPDATE products SET stock = 0 WHERE id = ?', [productId]);
    const res = await request(ctx.app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ productIds: [productId] });
    expect(res.status).toBe(409);
  });

  it('buyer cannot view another buyer’s order', async () => {
    const tokenA = await registerBuyer(ctx.app.getHttpServer(), 'a@a.local');
    const tokenB = await registerBuyer(ctx.app.getHttpServer(), 'b@a.local');
    await request(ctx.app.getHttpServer())
      .post('/me/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId, quantity: 1 });
    const checkout = await request(ctx.app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productIds: [productId] });
    const orderId = checkout.body.orderId;

    const res = await request(ctx.app.getHttpServer())
      .get(`/me/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 10: Run the e2e suite**

```bash
cd backend && npm run test:e2e -- orders.e2e-spec
```

Expected: 4 passing.

- [ ] **Step 11: Create `docs/features/orders.md` and update `docs/README.md`**

Create `docs/features/orders.md`:

```markdown
# Orders

Per-buyer purchase records. Checkout is transactional: stock is decremented,
the order + items are inserted, and the matching cart rows are deleted in a
single transaction.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/orders/checkout` | `{ productIds: string[] }` | Buyer's cart rows for those IDs become an order. 400 if empty, 409 on oversell. |
| GET | `/me/orders` | — | Buyer's orders, newest first. |
| GET | `/me/orders/:id` | — | Order detail with items (snapshots). 403 for other buyers. |

Pricing: `shipping = 12.50` if subtotal > 0, `tax = 8% of subtotal`,
`total = subtotal + shipping + tax`. These rates match the frontend's
`CartPage` constants and stay in sync without coupling.

Schemas:

- `orders(id, buyer_id, subtotal, shipping, tax, total, status, created_at, updated_at)`
- `order_items(id, order_id, product_id, store_id, name_snapshot, price_snapshot, quantity)`
```

Append to `docs/README.md`:

```markdown
| Orders (buyer) | docs/features/orders.md |
```

- [ ] **Step 12: Commit Task 6**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/orders backend/src/app.module.ts \
        backend/test/setup-e2e.ts backend/test/orders.e2e-spec.ts \
        docs/features/orders.md docs/README.md
git commit -m "$(cat <<'EOF'
feat(backend): buyer order APIs with transactional checkout

POST /orders/checkout decrements stock, snapshots line items, deletes the
matching cart rows in a single transaction. Oversells return 409.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Seller-facing order management

**Files:**
- Create: `backend/src/orders/store-orders.controller.ts`
- Create: `backend/src/orders/dto/update-order-status.dto.ts`
- Create: `backend/test/store-orders.e2e-spec.ts`
- Modify: `backend/src/orders/orders.module.ts`
- Modify: `backend/src/orders/orders.service.ts` (seller list + status update)
- Modify: `docs/features/orders.md`

- [ ] **Step 1: Create the update-status DTO**

Create `backend/src/orders/dto/update-order-status.dto.ts`:

```ts
import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['Processing', 'Shipped', 'Delivered', 'Cancelled'])
  status!: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
}
```

- [ ] **Step 2: Extend `OrdersService` with seller methods**

Append to `backend/src/orders/orders.service.ts` (inside class):

```ts
  async listForStore(
    storeId: string,
    opts: { status?: string; q?: string },
  ) {
    const qb = this.orders
      .createQueryBuilder('o')
      .innerJoin('order_items', 'oi', 'oi.order_id = o.id')
      .innerJoin('users', 'u', 'u.id = o.buyer_id')
      .where('oi.store_id = :storeId', { storeId })
      .groupBy('o.id')
      .addGroupBy('u.email')
      .addGroupBy('u.full_name')
      .addSelect('u.email', 'buyer_email')
      .addSelect('u.full_name', 'buyer_name')
      .addSelect(
        'SUM(oi.price_snapshot * oi.quantity)',
        'store_total',
      )
      .addSelect('SUM(oi.quantity)', 'store_qty');
    if (opts.status) qb.andWhere('o.status = :status', { status: opts.status });
    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.email) LIKE :like OR LOWER(u.full_name) LIKE :like OR CAST(o.id AS CHAR) LIKE :like)',
        { like },
      );
    }
    qb.orderBy('o.created_at', 'DESC');
    const rows = await qb.getRawAndEntities<{
      buyer_email: string;
      buyer_name: string;
      store_total: string;
      store_qty: string;
    }>();
    const items = rows.entities.map((order, i) => {
      const r = rows.raw[i];
      return {
        id: String(order.id),
        customer: r.buyer_name,
        email: r.buyer_email,
        date: order.createdAt.toISOString().slice(0, 10),
        status: order.status,
        items: Number(r.store_qty),
        total: Number(r.store_total),
      };
    });
    return { items };
  }

  async updateStatusForStore(
    storeId: string,
    orderId: string,
    status: 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled',
  ) {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const hasItemFromStore = order.items?.some((i) => i.storeId === storeId);
    if (!hasItemFromStore) throw new ForbiddenException('Not your order');
    order.status = status;
    await this.orders.save(order);
    return {
      order: {
        id: String(order.id),
        status: order.status,
      },
    };
  }
```

(`Order` and `OrderItem` repos are already injected; `ForbiddenException` and `NotFoundException` are already imported.)

- [ ] **Step 3: Implement the seller controller**

Create `backend/src/orders/store-orders.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { Store } from '../stores/store.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('store/orders')
@UseGuards(JwtAuthGuard, SellerStoreGuard)
export class StoreOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Req() req: Request & { store: Store },
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.orders.listForStore(req.store.id, { status, q });
  }

  @Patch(':id')
  update(
    @Req() req: Request & { store: Store },
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatusForStore(req.store.id, id, dto.status);
  }
}
```

- [ ] **Step 4: Wire the controller into `OrdersModule`**

Modify `backend/src/orders/orders.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { StoresModule } from '../stores/stores.module';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { StoreOrdersController } from './store-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product]),
    StoresModule,
  ],
  controllers: [OrdersController, StoreOrdersController],
  providers: [OrdersService, SellerStoreGuard],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
```

- [ ] **Step 5: Write the e2e spec**

Create `backend/test/store-orders.e2e-spec.ts`:

```ts
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

const storeId = '99999999-9999-9999-9999-999999999999';
const productId = '88888888-8888-8888-8888-888888888888';

async function seed(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const passwordHash = await bcrypt.hash('seller123', 12);
  const seller = await users.save(
    users.create({
      email: 'so-seller@amazara.local',
      passwordHash,
      fullName: 'Owner',
      role: 'seller',
    }),
  );
  await stores.save(
    stores.create({ id: storeId, name: 'S', slug: 's', ownerId: seller.id }),
  );
  await products.save(
    products.create({
      id: productId,
      name: 'Seller Item',
      brand: 'B',
      category: 'C',
      storeId,
      price: '10.00',
      discount: 0,
      stock: 5,
      imageFirst: 'https://example.com/i.png',
    }),
  );
}

async function buyerCheckout(server: any): Promise<string> {
  const reg = await request(server)
    .post('/auth/register')
    .send({
      email: 'so-buyer@amazara.local',
      password: 'buyer123buyer',
      fullName: 'B',
      role: 'buyer',
    });
  const buyerToken = reg.body.accessToken;
  await request(server)
    .post('/me/cart')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ productId, quantity: 1 });
  const checkout = await request(server)
    .post('/orders/checkout')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ productIds: [productId] });
  return checkout.body.orderId;
}

describe('Store orders (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seed(ctx.dataSource);
  });

  it('seller sees orders that include their items', async () => {
    const orderId = await buyerCheckout(ctx.app.getHttpServer());
    const sellerLogin = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'so-seller@amazara.local', password: 'seller123' });
    const res = await request(ctx.app.getHttpServer())
      .get('/store/orders')
      .set('Authorization', `Bearer ${sellerLogin.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: { id: string }) => o.id)).toContain(orderId);
    expect(res.body.items[0]).toHaveProperty('customer');
  });

  it('seller can update status only for their own orders', async () => {
    const orderId = await buyerCheckout(ctx.app.getHttpServer());
    const sellerLogin = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'so-seller@amazara.local', password: 'seller123' });
    const res = await request(ctx.app.getHttpServer())
      .patch(`/store/orders/${orderId}`)
      .set('Authorization', `Bearer ${sellerLogin.body.accessToken}`)
      .send({ status: 'Shipped' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Shipped');
  });

  it('foreign seller is forbidden from updating', async () => {
    const orderId = await buyerCheckout(ctx.app.getHttpServer());
    // create a second seller with no items in this order
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'other-seller@amazara.local',
        password: 'seller123seller',
        fullName: 'Other',
        role: 'seller',
      });
    const otherOwnerId = (
      await ctx.dataSource
        .getRepository(User)
        .findOne({ where: { email: 'other-seller@amazara.local' } })
    )!.id;
    await ctx.dataSource.getRepository(Store).save(
      ctx.dataSource.getRepository(Store).create({
        id: '77777777-7777-7777-7777-777777777777',
        name: 'O',
        slug: 'o',
        ownerId: otherOwnerId,
      }),
    );
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'other-seller@amazara.local',
        password: 'seller123seller',
      });
    const res = await request(ctx.app.getHttpServer())
      .patch(`/store/orders/${orderId}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ status: 'Cancelled' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run the e2e suite**

```bash
cd backend && npm run test:e2e -- store-orders.e2e-spec
```

Expected: 3 passing.

- [ ] **Step 7: Run the full e2e suite to confirm nothing regressed**

```bash
cd backend && npm run test:e2e
```

Expected: all suites (`auth`, `health`, `products`, `store-products`, `wishlist`, `cart`, `orders`, `store-orders`) pass.

- [ ] **Step 8: Append to `docs/features/orders.md`**

Append to `docs/features/orders.md`:

```markdown

## Seller routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/orders` | Orders that contain ≥1 item from the seller's store. Each row's `items` count and `total` are the **store's slice** only, not the full order. Supports `status` and `q` filters. |
| PATCH | `/store/orders/:id` | Update overall order status (`Processing`, `Shipped`, `Delivered`, `Cancelled`). 403 if no item belongs to the caller's store. |

Note: orders carry a single status across stores in v1. If marketplace-style
multi-seller fulfillment is needed, the status field would move onto `order_items`.
```

- [ ] **Step 9: Commit Task 7**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add backend/src/orders backend/test/store-orders.e2e-spec.ts \
        docs/features/orders.md
git commit -m "$(cat <<'EOF'
feat(backend): seller order management APIs

GET /store/orders surfaces orders that include the seller's items, with the
store's slice of items and total. PATCH /store/orders/:id updates the order
status with 403 when no item belongs to the seller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite (unit + e2e)**

```bash
cd backend && npm test && npm run test:e2e
```

Expected: every suite passes.

- [ ] **Step 2: Manual smoke from the frontend dev server**

```bash
docker compose up -d
# Visit http://localhost:5173, register a buyer, browse /search, add to cart,
# check out. Then log out and log in as one of the seeded sellers
# (seller-<first8>@amazara.local / seller123) and verify the inventory and
# orders pages render real data.
```

Note: The frontend services in `frontend/src/services/*.js` still fall back to
the mock data when `VITE_API_BASE_URL` is empty. To exercise the new APIs,
ensure `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3000`. Wiring
each frontend page to the new endpoints is a follow-up plan.

- [ ] **Step 3: Confirm the git log shows one commit per feature**

```bash
git log --oneline -8
```

Expected: 7 product-API commits stacked on top of `b64c4d2 feat(docker): ...`.
