# Reviews CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai feature review (rating 1–5 sao + comment) cho từng product. Buyer đã có order Delivered chứa product có thể tạo / sửa / xoá review của mình; ai cũng xem được list reviews và aggregate rating trên product detail.

**Architecture:** Module mới `backend/src/reviews/` với entity `Review`, service `ReviewsService`, 2 controller (nested `/products/:productId/reviews*` và flat `/reviews/:id`). `ProductsService` được mở rộng để trả `rating` + `reviewCount` qua subquery join với `reviews`. Frontend chỉ sửa `ProductDetailPage.jsx` và thêm `services/reviews.js`. Seed script đọc `backend/1200_sample_review.json` và gán random tới cặp `(buyer, product)` có order Delivered.

**Tech Stack:** NestJS 10, TypeORM, MySQL, Jest, supertest, React 18 + Vite (no FE test harness).

**Spec:** `docs/superpowers/specs/2026-05-14-reviews-crud-design.md`

---

## File structure

**Backend — new files:**
- `backend/src/reviews/review.entity.ts` — TypeORM entity
- `backend/src/reviews/reviews.module.ts` — module wiring
- `backend/src/reviews/reviews.service.ts` — business logic
- `backend/src/reviews/reviews.controller.ts` — flat `/reviews/:id`
- `backend/src/reviews/product-reviews.controller.ts` — nested `/products/:productId/reviews*`
- `backend/src/reviews/dto/create-review.dto.ts`
- `backend/src/reviews/dto/update-review.dto.ts`
- `backend/src/reviews/dto/list-reviews.dto.ts`
- `backend/src/reviews/dto/review-views.ts` — response shapes + mapper
- `backend/src/reviews/reviews.service.spec.ts` — unit tests
- `backend/test/reviews.e2e-spec.ts` — e2e tests
- `backend/scripts/seed-reviews.ts`

**Backend — modified files:**
- `backend/src/app.module.ts` — register `ReviewsModule` + entity in `entities` array
- `backend/src/products/products.service.ts` — join `rating`/`reviewCount` vào product detail
- `backend/src/products/dto/product-views.ts` — extend `ProductDetail` với `rating` + `reviewCount`
- `backend/src/products/products.module.ts` — import Review repository (subquery)
- `backend/test/setup-e2e.ts` — thêm `TRUNCATE TABLE reviews`
- `backend/package.json` — thêm npm script `seed:reviews`
- `docs/features/reviews.md` (mới) + `docs/README.md` (thêm row)

**Frontend — new files:**
- `frontend/src/services/reviews.js`

**Frontend — modified files:**
- `frontend/src/pages/ProductDetailPage.jsx` — thay block review mock bằng integration thực

---

## Task 1: Review entity + module skeleton

**Files:**
- Create: `backend/src/reviews/review.entity.ts`
- Create: `backend/src/reviews/reviews.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/test/setup-e2e.ts`

- [ ] **Step 1: Tạo entity Review**

Create `backend/src/reviews/review.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'reviews' })
@Index('idx_reviews_product_created', ['productId', 'createdAt'])
@Index('idx_reviews_user', ['userId'])
@Index('uniq_reviews_product_user', ['productId', 'userId'], { unique: true })
export class Review {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ type: 'tinyint', unsigned: true })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Tạo module skeleton**

Create `backend/src/reviews/reviews.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Order, OrderItem, User])],
  controllers: [],
  providers: [],
  exports: [TypeOrmModule],
})
export class ReviewsModule {}
```

- [ ] **Step 3: Đăng ký module + entity vào app.module.ts**

Modify `backend/src/app.module.ts`:

Thêm import:
```ts
import { ReviewsModule } from './reviews/reviews.module';
import { Review } from './reviews/review.entity';
```

Trong `entities` array, thêm `Review`:
```ts
entities: [User, Store, Product, WishlistItem, CartItem, Order, OrderItem, UserAddress, Conversation, Message, Review],
```

Trong `imports` array, thêm `ReviewsModule` sau `ChatsModule`:
```ts
ChatsModule,
UploadsModule,
ReviewsModule,
```

- [ ] **Step 4: Thêm TRUNCATE reviews vào setup-e2e**

Modify `backend/test/setup-e2e.ts`: trong function `resetDatabase`, thêm sau `TRUNCATE TABLE order_items`:

```ts
await dataSource.query('TRUNCATE TABLE reviews');
```

- [ ] **Step 5: Verify build + DB schema tạo OK**

Run:
```bash
cd backend && npm run build
```
Expected: build success, no TS errors.

Run:
```bash
docker compose up -d mysql backend
docker compose logs backend --tail 30
```
Expected: backend khởi động, schema sync tạo bảng `reviews`. Verify bằng:
```bash
docker compose exec mysql mysql -uamazara -pamazara amazara -e "DESCRIBE reviews;"
```
Expected: 7 cột, có UNIQUE key `uniq_reviews_product_user`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/reviews/review.entity.ts backend/src/reviews/reviews.module.ts backend/src/app.module.ts backend/test/setup-e2e.ts
git commit -m "feat(reviews): add Review entity and empty module"
```

---

## Task 2: ReviewsService — canUserReview

**Files:**
- Create: `backend/src/reviews/reviews.service.ts`
- Create: `backend/src/reviews/reviews.service.spec.ts`
- Modify: `backend/src/reviews/reviews.module.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/reviews/reviews.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviews: any;
  let orderItems: any;
  let users: any;
  let orderItemsQb: any;

  beforeEach(async () => {
    orderItemsQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
    };
    reviews = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    orderItems = {
      createQueryBuilder: jest.fn().mockReturnValue(orderItemsQb),
    };
    users = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: reviews },
        { provide: getRepositoryToken(OrderItem), useValue: orderItems },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(User), useValue: users },
      ],
    }).compile();

    service = moduleRef.get(ReviewsService);
  });

  describe('canUserReview', () => {
    it('returns true when user has Delivered order containing product', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      await expect(service.canUserReview('42', 'p-1')).resolves.toBe(true);
    });

    it('returns false when no Delivered order matches', async () => {
      orderItemsQb.getCount.mockResolvedValue(0);
      await expect(service.canUserReview('42', 'p-1')).resolves.toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: FAIL with `Cannot find module './reviews.service'`.

- [ ] **Step 3: Implement ReviewsService skeleton with canUserReview**

Create `backend/src/reviews/reviews.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canUserReview(userId: string, productId: string): Promise<boolean> {
    const count = await this.orderItems
      .createQueryBuilder('oi')
      .innerJoin('orders', 'o', 'o.id = oi.order_id')
      .where('oi.product_id = :productId', { productId })
      .andWhere('o.buyer_id = :userId', { userId })
      .andWhere("o.status = 'Delivered'")
      .getCount();
    return count > 0;
  }
}
```

- [ ] **Step 4: Register service in module**

Modify `backend/src/reviews/reviews.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Order, OrderItem, User])],
  controllers: [],
  providers: [ReviewsService],
  exports: [ReviewsService, TypeOrmModule],
})
export class ReviewsModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/reviews/reviews.service.ts backend/src/reviews/reviews.service.spec.ts backend/src/reviews/reviews.module.ts
git commit -m "feat(reviews): canUserReview service method"
```

---

## Task 3: Review response mapper + create

**Files:**
- Create: `backend/src/reviews/dto/create-review.dto.ts`
- Create: `backend/src/reviews/dto/review-views.ts`
- Modify: `backend/src/reviews/reviews.service.ts`
- Modify: `backend/src/reviews/reviews.service.spec.ts`

- [ ] **Step 1: Create DTO**

Create `backend/src/reviews/dto/create-review.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
```

- [ ] **Step 2: Create response view + mapper**

Create `backend/src/reviews/dto/review-views.ts`:

```ts
import { Review } from '../review.entity';

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string };
}

export interface ReviewUserRef {
  id: string;
  fullName: string;
}

export function toReviewItem(r: Review, user: ReviewUserRef): ReviewItem {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    user: { id: String(user.id), name: user.fullName },
  };
}
```

- [ ] **Step 3: Write failing tests for create**

Add to `backend/src/reviews/reviews.service.spec.ts` before the closing `});`:

```ts
  describe('create', () => {
    const userId = '42';
    const productId = 'p-1';
    const dto = { rating: 5, comment: 'Great' };
    const dbReview = {
      id: 'r-1',
      productId,
      userId,
      rating: 5,
      comment: 'Great',
      createdAt: new Date('2026-05-14T10:00:00Z'),
      updatedAt: new Date('2026-05-14T10:00:00Z'),
    };

    it('creates review when user is eligible', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh N.' });
      reviews.save.mockResolvedValue(dbReview);

      const result = await service.create(userId, productId, dto);

      expect(reviews.save).toHaveBeenCalledWith(
        expect.objectContaining({ productId, userId, rating: 5, comment: 'Great' }),
      );
      expect(result.user.name).toBe('Anh N.');
      expect(result.rating).toBe(5);
    });

    it('throws 403 when user is not eligible', async () => {
      orderItemsQb.getCount.mockResolvedValue(0);
      await expect(service.create(userId, productId, dto)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('throws 409 on duplicate (ER_DUP_ENTRY)', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh N.' });
      const err: any = new Error('dup');
      err.code = 'ER_DUP_ENTRY';
      reviews.save.mockRejectedValue(err);

      await expect(service.create(userId, productId, dto)).rejects.toMatchObject({
        status: 409,
      });
    });
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: 3 new tests FAIL (`service.create is not a function`).

- [ ] **Step 5: Implement create**

Modify `backend/src/reviews/reviews.service.ts`. Add imports + method:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { User } from '../users/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewItem, toReviewItem } from './dto/review-views';
import { Review } from './review.entity';
```

Add method inside class:

```ts
  async create(userId: string, productId: string, dto: CreateReviewDto): Promise<ReviewItem> {
    const eligible = await this.canUserReview(userId, productId);
    if (!eligible) {
      throw new ForbiddenException('You can only review products from a delivered order');
    }
    const user = await this.users.findOne({ where: { id: userId as any } });
    if (!user) throw new NotFoundException('User not found');

    const entity = this.reviews.create({
      id: randomUUID(),
      productId,
      userId,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
    });

    try {
      const saved = await this.reviews.save(entity);
      return toReviewItem(saved, { id: user.id, fullName: user.fullName });
    } catch (err) {
      const code = (err as any)?.code ?? (err instanceof QueryFailedError ? (err.driverError as any)?.code : undefined);
      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw err;
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/reviews/dto/ backend/src/reviews/reviews.service.ts backend/src/reviews/reviews.service.spec.ts
git commit -m "feat(reviews): create review with eligibility + dup handling"
```

---

## Task 4: ReviewsService — update + delete

**Files:**
- Create: `backend/src/reviews/dto/update-review.dto.ts`
- Modify: `backend/src/reviews/reviews.service.ts`
- Modify: `backend/src/reviews/reviews.service.spec.ts`

- [ ] **Step 1: Create UpdateReviewDto**

Create `backend/src/reviews/dto/update-review.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
```

- [ ] **Step 2: Write failing tests for update + delete**

Append to `backend/src/reviews/reviews.service.spec.ts` before the closing `});`:

```ts
  describe('update', () => {
    const dbReview = {
      id: 'r-1', productId: 'p-1', userId: '42', rating: 4, comment: 'x',
      createdAt: new Date('2026-05-14T10:00:00Z'), updatedAt: new Date('2026-05-14T10:00:00Z'),
    };

    it('updates when caller is owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh' });
      reviews.save.mockResolvedValue({ ...dbReview, rating: 5, comment: 'better' });

      const result = await service.update('r-1', '42', { rating: 5, comment: 'better' });
      expect(result.rating).toBe(5);
      expect(result.comment).toBe('better');
    });

    it('throws 404 when review missing', async () => {
      reviews.findOne.mockResolvedValue(null);
      await expect(service.update('r-x', '42', { rating: 5 })).rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 when caller is not owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      await expect(service.update('r-1', '99', { rating: 5 })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('remove', () => {
    const dbReview = { id: 'r-1', productId: 'p-1', userId: '42' };

    it('removes when caller is owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      reviews.remove.mockResolvedValue(undefined);
      await service.remove('r-1', '42');
      expect(reviews.remove).toHaveBeenCalledWith(dbReview);
    });

    it('throws 404 when review missing', async () => {
      reviews.findOne.mockResolvedValue(null);
      await expect(service.remove('r-x', '42')).rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 when caller is not owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      await expect(service.remove('r-1', '99')).rejects.toMatchObject({ status: 403 });
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: 6 new tests FAIL.

- [ ] **Step 4: Implement update + remove**

Modify `backend/src/reviews/reviews.service.ts`. Add import:

```ts
import { UpdateReviewDto } from './dto/update-review.dto';
```

Add methods inside class:

```ts
  async update(id: string, userId: string, dto: UpdateReviewDto): Promise<ReviewItem> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (String(review.userId) !== String(userId)) {
      throw new ForbiddenException('You can only edit your own review');
    }
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment?.trim() || null;

    const saved = await this.reviews.save(review);
    const user = await this.users.findOne({ where: { id: userId as any } });
    return toReviewItem(saved, { id: user!.id, fullName: user!.fullName });
  }

  async remove(id: string, userId: string): Promise<void> {
    const review = await this.reviews.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (String(review.userId) !== String(userId)) {
      throw new ForbiddenException('You can only delete your own review');
    }
    await this.reviews.remove(review);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: all 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/reviews/dto/update-review.dto.ts backend/src/reviews/reviews.service.ts backend/src/reviews/reviews.service.spec.ts
git commit -m "feat(reviews): update + delete with ownership checks"
```

---

## Task 5: ReviewsService — list + summary + myReview

**Files:**
- Create: `backend/src/reviews/dto/list-reviews.dto.ts`
- Modify: `backend/src/reviews/dto/review-views.ts`
- Modify: `backend/src/reviews/reviews.service.ts`
- Modify: `backend/src/reviews/reviews.service.spec.ts`

- [ ] **Step 1: Create ListReviewsDto**

Create `backend/src/reviews/dto/list-reviews.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsEnum(['newest', 'highest', 'lowest'])
  sort?: 'newest' | 'highest' | 'lowest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
```

- [ ] **Step 2: Extend review-views with list shapes**

Modify `backend/src/reviews/dto/review-views.ts`. Append:

```ts
export interface ReviewSummary {
  average: number;
  count: number;
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewListResult {
  items: ReviewItem[];
  total: number;
  page: number;
  limit: number;
  summary: ReviewSummary;
}

export interface MyReviewResult {
  review: ReviewItem | null;
  canReview: boolean;
}
```

- [ ] **Step 3: Write failing tests**

Add to spec (before closing `});`):

```ts
  describe('listForProduct', () => {
    it('returns paginated items, summary and breakdown', async () => {
      const listQb: any = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'r-1', productId: 'p-1', userId: '42', rating: 5, comment: 'a', createdAt: new Date(), updatedAt: new Date() }],
          1,
        ]),
      };
      const summaryQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { rating: '5', cnt: '3' },
          { rating: '4', cnt: '1' },
        ]),
      };
      reviews.createQueryBuilder = jest.fn()
        .mockImplementationOnce(() => listQb)   // list
        .mockImplementationOnce(() => summaryQb); // summary
      users.find = jest.fn().mockResolvedValue([{ id: '42', fullName: 'Anh' }]);

      const out = await service.listForProduct('p-1', { page: 1, limit: 10 });

      expect(out.total).toBe(1);
      expect(out.items).toHaveLength(1);
      expect(out.summary.count).toBe(4);
      expect(out.summary.average).toBeCloseTo((5 * 3 + 4 * 1) / 4, 1);
      expect(out.summary.breakdown['5']).toBe(3);
      expect(out.summary.breakdown['1']).toBe(0);
    });
  });

  describe('myReviewForProduct', () => {
    it('returns review + canReview=false when review exists', async () => {
      const review = {
        id: 'r-1', productId: 'p-1', userId: '42', rating: 5, comment: 'a',
        createdAt: new Date(), updatedAt: new Date(),
      };
      reviews.findOne.mockResolvedValue(review);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh' });

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review?.id).toBe('r-1');
      expect(out.canReview).toBe(false);
    });

    it('returns null review + canReview=true when no review and eligible', async () => {
      reviews.findOne.mockResolvedValue(null);
      orderItemsQb.getCount.mockResolvedValue(1);

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review).toBeNull();
      expect(out.canReview).toBe(true);
    });

    it('returns null review + canReview=false when no review and not eligible', async () => {
      reviews.findOne.mockResolvedValue(null);
      orderItemsQb.getCount.mockResolvedValue(0);

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review).toBeNull();
      expect(out.canReview).toBe(false);
    });
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: 4 new tests FAIL.

- [ ] **Step 5: Implement listForProduct + myReviewForProduct**

Modify `backend/src/reviews/reviews.service.ts`. Add imports:

```ts
import { In } from 'typeorm';
import { ListReviewsDto } from './dto/list-reviews.dto';
import {
  MyReviewResult,
  ReviewListResult,
  ReviewSummary,
  toReviewItem,
} from './dto/review-views';
```

Add methods to class:

```ts
  async listForProduct(productId: string, dto: ListReviewsDto): Promise<ReviewListResult> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 10, 50);

    const qb = this.reviews.createQueryBuilder('r').andWhere('r.product_id = :productId', { productId });
    if (dto.rating !== undefined) qb.andWhere('r.rating = :rating', { rating: dto.rating });
    switch (dto.sort) {
      case 'highest':
        qb.orderBy('r.rating', 'DESC').addOrderBy('r.created_at', 'DESC');
        break;
      case 'lowest':
        qb.orderBy('r.rating', 'ASC').addOrderBy('r.created_at', 'DESC');
        break;
      default:
        qb.orderBy('r.created_at', 'DESC');
    }
    qb.skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();

    const summary = await this.summaryForProduct(productId);

    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users = userIds.length
      ? await this.users.find({ where: { id: In(userIds as any[]) } })
      : [];
    const userById = new Map(users.map((u) => [String(u.id), u]));

    const items = rows.map((r) => {
      const u = userById.get(String(r.userId));
      return toReviewItem(r, { id: u?.id ?? r.userId, fullName: u?.fullName ?? 'Unknown' });
    });

    return { items, total, page, limit, summary };
  }

  async myReviewForProduct(userId: string, productId: string): Promise<MyReviewResult> {
    const existing = await this.reviews.findOne({ where: { productId, userId } });
    if (existing) {
      const user = await this.users.findOne({ where: { id: userId as any } });
      return {
        review: toReviewItem(existing, {
          id: user?.id ?? existing.userId,
          fullName: user?.fullName ?? 'Unknown',
        }),
        canReview: false,
      };
    }
    const eligible = await this.canUserReview(userId, productId);
    return { review: null, canReview: eligible };
  }

  private async summaryForProduct(productId: string): Promise<ReviewSummary> {
    const rows = await this.reviews
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.product_id = :productId', { productId })
      .groupBy('r.rating')
      .getRawMany<{ rating: string | number; cnt: string }>();

    const breakdown: ReviewSummary['breakdown'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const r = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const c = Number(row.cnt);
      breakdown[String(r) as '1'] = c;
      total += c;
      weighted += r * c;
    }
    return {
      average: total ? Math.round((weighted / total) * 10) / 10 : 0,
      count: total,
      breakdown,
    };
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd backend && npx jest src/reviews/reviews.service.spec.ts
```
Expected: all 15 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/reviews/dto/list-reviews.dto.ts backend/src/reviews/dto/review-views.ts backend/src/reviews/reviews.service.ts backend/src/reviews/reviews.service.spec.ts
git commit -m "feat(reviews): list + summary + myReview service methods"
```

---

## Task 6: ProductReviewsController (nested routes)

**Files:**
- Create: `backend/src/reviews/product-reviews.controller.ts`
- Modify: `backend/src/reviews/reviews.module.ts`

- [ ] **Step 1: Check existing auth guard pattern**

Run:
```bash
grep -rn "JwtAuthGuard\|CurrentUser\|@UseGuards" backend/src/orders/orders.controller.ts | head -10
```
Expected output includes guard imports/usage. Use the same imports for new controller. Pattern from `OrdersController`:

```ts
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
```

(If exact paths differ, follow what `orders.controller.ts` imports.)

- [ ] **Step 2: Create controller**

Create `backend/src/reviews/product-reviews.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('productId') productId: string, @Query() dto: ListReviewsDto) {
    return this.reviews.listForProduct(productId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.reviews.myReviewForProduct(req.user.id, productId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req() req: Request & { user: { id: string } },
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(req.user.id, productId, dto);
  }
}
```

Pattern matches `OrdersController` (`backend/src/orders/orders.controller.ts`).

- [ ] **Step 3: Register controller in module**

Modify `backend/src/reviews/reviews.module.ts`:

```ts
import { ProductReviewsController } from './product-reviews.controller';
```

Update controllers array:
```ts
controllers: [ProductReviewsController],
```

Also add `AuthModule` to imports if `JwtAuthGuard` requires it (check pattern in `orders.module.ts` or `cart.module.ts`).

- [ ] **Step 4: Manual smoke test via curl**

Run:
```bash
docker compose up -d
docker compose logs backend --tail 20
```
Expected: backend boots without errors.

Get a JWT (register/login a buyer) and curl:

```bash
TOKEN=...   # buyer JWT
curl -s "http://localhost:3000/products/ffffffff-ffff-ffff-ffff-ffffffffffff/reviews" | jq .
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/products/ffffffff-ffff-ffff-ffff-ffffffffffff/reviews/me" | jq .
```
Expected: 200 with `{items: [], total: 0, summary: ...}` and `{review: null, canReview: false}` (since no Delivered order yet).

- [ ] **Step 5: Commit**

```bash
git add backend/src/reviews/product-reviews.controller.ts backend/src/reviews/reviews.module.ts
git commit -m "feat(reviews): nested product reviews controller"
```

---

## Task 7: ReviewsController (flat /reviews/:id)

**Files:**
- Create: `backend/src/reviews/reviews.controller.ts`
- Modify: `backend/src/reviews/reviews.module.ts`

- [ ] **Step 1: Create controller**

Create `backend/src/reviews/reviews.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch(':id')
  update(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.reviews.remove(id, req.user.id);
  }
}
```

- [ ] **Step 2: Register in module**

Modify `backend/src/reviews/reviews.module.ts` controllers array:

```ts
controllers: [ProductReviewsController, ReviewsController],
```

Add import:
```ts
import { ReviewsController } from './reviews.controller';
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd backend && npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add backend/src/reviews/reviews.controller.ts backend/src/reviews/reviews.module.ts
git commit -m "feat(reviews): flat reviews controller for PATCH/DELETE"
```

---

## Task 8: Extend ProductDetail with rating + reviewCount

**Files:**
- Modify: `backend/src/products/dto/product-views.ts`
- Modify: `backend/src/products/products.service.ts`
- Modify: `backend/src/products/products.module.ts`
- Modify: `backend/src/products/products.service.spec.ts`

- [ ] **Step 1: Extend ProductDetail view**

Modify `backend/src/products/dto/product-views.ts`. Update `ProductDetail` interface and `toProductDetail` to accept optional stats:

```ts
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
  rating: number;
  reviewCount: number;
}
```

Update `toProductDetail` signature to accept stats:

```ts
export function toProductDetail(
  p: Product,
  stats: { rating: number; reviewCount: number } = { rating: 0, reviewCount: 0 },
): ProductDetail {
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
    rating: stats.rating,
    reviewCount: stats.reviewCount,
  };
}
```

- [ ] **Step 2: Inject Review repo into ProductsService**

Modify `backend/src/products/products.module.ts`:

Add import:
```ts
import { Review } from '../reviews/review.entity';
```

Update `TypeOrmModule.forFeature([...])`:
```ts
TypeOrmModule.forFeature([Product, Review, /* existing entries */])
```

(Inspect the current line first; add `Review` to the existing array.)

- [ ] **Step 3: Update ProductsService.findOne to fetch stats**

Modify `backend/src/products/products.service.ts`. Add to constructor:

```ts
@InjectRepository(Review) private readonly reviewsRepo: Repository<Review>,
```

Add import:
```ts
import { Review } from '../reviews/review.entity';
```

Replace `findOne` method:

```ts
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
```

- [ ] **Step 4: Update existing unit test mocks**

Modify `backend/src/products/products.service.spec.ts`: any test that calls `findOne` may break because we now require the Review repo. Add a new provider in the testing module setup:

Find the `Test.createTestingModule` block. Add to providers array:

```ts
{ provide: getRepositoryToken(Review), useValue: { createQueryBuilder: jest.fn().mockReturnValue({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue({ cnt: '0', avg: null }),
}) } },
```

Add import at top of spec:
```ts
import { Review } from '../reviews/review.entity';
```

- [ ] **Step 5: Run product tests**

Run:
```bash
cd backend && npx jest src/products/
```
Expected: all tests pass.

- [ ] **Step 6: Smoke test via curl**

Run:
```bash
curl -s http://localhost:3000/products/<any-product-id> | jq '{rating, reviewCount}'
```
Expected: `{ "rating": 0, "reviewCount": 0 }`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/products/ 
git commit -m "feat(products): include rating + reviewCount in detail response"
```

---

## Task 9: e2e tests

**Files:**
- Create: `backend/test/reviews.e2e-spec.ts`

- [ ] **Step 1: Inspect existing e2e patterns**

Run:
```bash
head -50 backend/test/orders.e2e-spec.ts
```
Note pattern: use `createTestApp`, `resetDatabase`, seed via TypeORM repos, `supertest` for requests, JWT obtained by hitting `/auth/login` after register.

- [ ] **Step 2: Write e2e spec**

Create `backend/test/reviews.e2e-spec.ts`:

```ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Order } from '../src/orders/order.entity';
import { OrderItem } from '../src/orders/order-item.entity';
import { Product } from '../src/products/product.entity';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

const PRODUCT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PRODUCT_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STORE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

async function seed(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const orders = ds.getRepository(Order);
  const orderItems = ds.getRepository(OrderItem);

  const hash = await bcrypt.hash('password123', 4);
  const seller = await users.save(users.create({ email: 'seller@test', passwordHash: hash, fullName: 'Seller', role: 'seller' }));
  const buyerA = await users.save(users.create({ email: 'a@test', passwordHash: hash, fullName: 'Buyer A', role: 'buyer' }));
  const buyerB = await users.save(users.create({ email: 'b@test', passwordHash: hash, fullName: 'Buyer B', role: 'buyer' }));

  await stores.save(stores.create({ id: STORE_ID, name: 'S', slug: 's', ownerId: seller.id }));
  await products.save(products.create({ id: PRODUCT_A_ID, name: 'A', brand: 'B', category: 'C', storeId: STORE_ID, price: '10.00', discount: 0, stock: 5, imageFirst: 'https://x/i.png' }));
  await products.save(products.create({ id: PRODUCT_B_ID, name: 'B', brand: 'B', category: 'C', storeId: STORE_ID, price: '10.00', discount: 0, stock: 5, imageFirst: 'https://x/i.png' }));

  const order = await orders.save(orders.create({
    buyerId: buyerA.id, subtotal: '10.00', shipping: '0.00', tax: '0.00', total: '10.00',
    status: 'Delivered', shippingMethod: 'Standard',
    shippingRecipient: 'A', shippingPhone: 'P', shippingLine1: 'L', shippingCity: 'C', shippingRegion: 'R', shippingPostalCode: '0', shippingCountry: 'US',
    paymentMethod: 'card', paymentLast4: '4242',
  } as any));
  await orderItems.save(orderItems.create({ orderId: order.id, productId: PRODUCT_A_ID, storeId: STORE_ID, nameSnapshot: 'A', priceSnapshot: '10.00', quantity: 1 }));

  return { buyerA, buyerB };
}

async function login(app: any, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);
  return res.body.accessToken;
}

describe('Reviews (e2e)', () => {
  let ctx: TestContext;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seed(ctx.dataSource);
    tokenA = await login(ctx.app, 'a@test');
    tokenB = await login(ctx.app, 'b@test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('buyer A creates a review for product A', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5, comment: 'great' })
      .expect(201);
    expect(res.body.user.name).toBe('Buyer A');
    expect(res.body.rating).toBe(5);
  });

  it('returns 409 on duplicate create', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5 })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 4 })
      .expect(409);
  });

  it('returns 403 when buyer A reviews product B (no Delivered order for B)', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_B_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5 })
      .expect(403);
  });

  it('returns 403 when buyer B (no Delivered order) reviews product A', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ rating: 5 })
      .expect(403);
  });

  it('lists reviews with summary', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5 })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .get(`/products/${PRODUCT_A_ID}/reviews`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.summary.average).toBe(5);
    expect(res.body.summary.breakdown['5']).toBe(1);
  });

  it('/me returns review for owner, null for others', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5 })
      .expect(201);
    const mineA = await request(ctx.app.getHttpServer())
      .get(`/products/${PRODUCT_A_ID}/reviews/me`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(mineA.body.review.id).toBe(created.body.id);
    expect(mineA.body.canReview).toBe(false);

    const mineB = await request(ctx.app.getHttpServer())
      .get(`/products/${PRODUCT_A_ID}/reviews/me`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(mineB.body.review).toBeNull();
    expect(mineB.body.canReview).toBe(false);
  });

  it('PATCH/DELETE enforce ownership', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 4 })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .patch(`/reviews/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ rating: 1 })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .patch(`/reviews/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 5 })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete(`/reviews/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .delete(`/reviews/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  it('GET /products/:id returns rating + reviewCount', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/products/${PRODUCT_A_ID}/reviews`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ rating: 4 })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .get(`/products/${PRODUCT_A_ID}`)
      .expect(200);
    expect(res.body.rating).toBe(4);
    expect(res.body.reviewCount).toBe(1);
  });
});
```

> **Note:** The exact Order entity field names (e.g. `shippingRecipient` vs `shippingRecipientName`) may differ — open `backend/src/orders/order.entity.ts` and adjust the seed payload to match required columns. `/auth/login` returns `{ user, accessToken }` (verified).

- [ ] **Step 3: Run e2e**

Run:
```bash
docker compose up -d mysql
cd backend && npm run test:e2e -- reviews.e2e-spec
```
Expected: all 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/test/reviews.e2e-spec.ts
git commit -m "test(reviews): e2e coverage for CRUD + ownership + product detail"
```

---

## Task 10: Seed script

**Files:**
- Create: `backend/scripts/seed-reviews.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Inspect existing seed pattern**

Run:
```bash
head -80 backend/scripts/seed-products.ts
```

Pattern: `NestFactory.createApplicationContext(AppModule)`, get `DataSource`, work with repos directly.

- [ ] **Step 2: Create seed script**

Create `backend/scripts/seed-reviews.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Review } from '../src/reviews/review.entity';

interface SampleRow {
  label: number;
  review: string;
}

const SAMPLE_PATH = path.resolve(__dirname, '..', '1200_sample_review.json');
const BATCH = 200;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`Sample file not found: ${SAMPLE_PATH}`);
  }
  const samples = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf-8')) as SampleRow[];
  console.log(`Loaded ${samples.length} sample reviews`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);

    const eligibleRaw = await ds.query<{ user_id: string; product_id: string }>(`
      SELECT DISTINCT o.buyer_id AS user_id, oi.product_id AS product_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN reviews r ON r.product_id = oi.product_id AND r.user_id = o.buyer_id
      WHERE o.status = 'Delivered' AND r.id IS NULL
    `);
    console.log(`Found ${eligibleRaw.length} eligible (buyer, product) pairs without review`);

    const eligible = shuffle([...eligibleRaw]);
    const shuffledSamples = shuffle([...samples]);

    const reviewsRepo = ds.getRepository(Review);
    const toInsert: Review[] = [];
    const take = Math.min(eligible.length, shuffledSamples.length);

    for (let i = 0; i < take; i++) {
      const pair = eligible[i];
      const s = shuffledSamples[i];
      toInsert.push(reviewsRepo.create({
        id: randomUUID(),
        productId: pair.product_id,
        userId: String(pair.user_id),
        rating: s.label,
        comment: s.review,
      }));
    }

    for (let i = 0; i < toInsert.length; i += BATCH) {
      await reviewsRepo.insert(toInsert.slice(i, i + BATCH));
    }
    console.log(`Inserted ${toInsert.length} reviews`);
    if (shuffledSamples.length > take) {
      console.warn(`Skipped ${shuffledSamples.length - take} samples (not enough eligible pairs)`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add npm script**

Modify `backend/package.json`. In `scripts` block, add after `seed:products` (or alongside existing seed scripts):

```json
"seed:reviews": "ts-node -P scripts/tsconfig.json scripts/seed-reviews.ts"
```

(If `seed:products` doesn't exist, just add `seed:reviews` to scripts block.)

- [ ] **Step 4: Run + verify**

Run:
```bash
cd backend && npm run seed:reviews
```
Expected: prints `Found X eligible pairs`, `Inserted Y reviews`. With a fresh dev DB and no Delivered orders, Y=0 and a warning. After running `seed-products` + manually creating some Delivered orders, Y > 0.

Run again to verify idempotency:
```bash
cd backend && npm run seed:reviews
```
Expected: `Found 0 eligible pairs without review`, `Inserted 0 reviews`.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed-reviews.ts backend/package.json
git commit -m "feat(reviews): seed script for sample review data"
```

---

## Task 11: Frontend service

**Files:**
- Create: `frontend/src/services/reviews.js`

- [ ] **Step 1: Inspect existing service pattern**

Run:
```bash
cat frontend/src/services/products.js
```

Note: Services use `api.get/post/patch/delete` wrapper.

- [ ] **Step 2: Create reviews service**

Create `frontend/src/services/reviews.js`:

```js
import { api } from './api.js';

export const reviewsService = {
  list(productId, params = {}) {
    return api.get(`/products/${productId}/reviews`, { params });
  },
  myReview(productId) {
    return api.get(`/products/${productId}/reviews/me`);
  },
  create(productId, body) {
    return api.post(`/products/${productId}/reviews`, body);
  },
  update(id, body) {
    return api.patch(`/reviews/${id}`, body);
  },
  remove(id) {
    return api.delete(`/reviews/${id}`);
  },
};
```

> **Note:** Inspect `frontend/src/services/api.js` first. If methods are not named `get/post/patch/delete` (e.g., may be `request(method, url, ...)`), adapt the wrapper calls to match.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/reviews.js
git commit -m "feat(fe): reviews service wrapper"
```

---

## Task 12: ProductDetailPage integration

**Files:**
- Modify: `frontend/src/pages/ProductDetailPage.jsx`

- [ ] **Step 1: Read current ProductDetailPage**

Run:
```bash
sed -n '1,40p;260,325p' frontend/src/pages/ProductDetailPage.jsx
```

Identify current reviews block (around lines 269–321). Need to replace `r.author`, `r.initials`, `r.title`, `r.body`, `r.verified`, `r.date` (mock shape) with the new BE shape `{id, rating, comment, createdAt, user: {id, name}}`.

- [ ] **Step 2: Add imports + state**

In `frontend/src/pages/ProductDetailPage.jsx`, near top:

```jsx
import { reviewsService } from '../services/reviews.js';
```

Inside the component, add state after existing `useState` hooks:

```jsx
const [reviewsState, setReviewsState] = useState({ items: [], total: 0, page: 1, summary: null });
const [reviewsSort, setReviewsSort] = useState('newest');
const [reviewsFilter, setReviewsFilter] = useState('');
const [myReview, setMyReview] = useState(null);
const [canReview, setCanReview] = useState(false);
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState({ rating: 5, comment: '' });
const [submitting, setSubmitting] = useState(false);
```

- [ ] **Step 3: Add loaders**

After the existing `useEffect` that calls `getProduct(id)`:

```jsx
useEffect(() => {
  if (!id) return;
  loadReviews(1);
  if (isAuthenticated) loadMyReview();
  else { setMyReview(null); setCanReview(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [id, isAuthenticated, reviewsSort, reviewsFilter]);

async function loadReviews(page) {
  const params = { page, limit: 10, sort: reviewsSort };
  if (reviewsFilter) params.rating = Number(reviewsFilter);
  const res = await reviewsService.list(id, params);
  setReviewsState((prev) => ({
    ...res,
    items: page === 1 ? res.items : [...prev.items, ...res.items],
  }));
}

async function loadMyReview() {
  try {
    const res = await reviewsService.myReview(id);
    setMyReview(res.review);
    setCanReview(res.canReview);
    if (res.review) setDraft({ rating: res.review.rating, comment: res.review.comment ?? '' });
  } catch {
    setMyReview(null);
    setCanReview(false);
  }
}
```

- [ ] **Step 4: Add submit/edit/delete handlers**

After the handlers above:

```jsx
async function submitReview(e) {
  e.preventDefault();
  if (!isAuthenticated) {
    navigate('/auth', { state: { from: `/products/${id}` } });
    return;
  }
  setSubmitting(true);
  try {
    if (myReview) {
      await reviewsService.update(myReview.id, draft);
      toast.success('Review updated');
    } else {
      await reviewsService.create(id, draft);
      toast.success('Review posted');
    }
    setEditing(false);
    await Promise.all([loadReviews(1), loadMyReview(), getProduct(id).then(setProduct)]);
  } catch (err) {
    toast.error(err?.message ?? 'Failed to save review');
  } finally {
    setSubmitting(false);
  }
}

async function deleteReview() {
  if (!myReview) return;
  if (!window.confirm('Delete your review?')) return;
  try {
    await reviewsService.remove(myReview.id);
    toast.success('Review deleted');
    setEditing(false);
    setDraft({ rating: 5, comment: '' });
    await Promise.all([loadReviews(1), loadMyReview(), getProduct(id).then(setProduct)]);
  } catch (err) {
    toast.error(err?.message ?? 'Failed to delete review');
  }
}
```

- [ ] **Step 5: Replace the reviews JSX block**

Find lines roughly 269–321 (the current `{product.reviews?.length > 0 && ( ... )}` block). Replace the **entire block** with:

```jsx
{/* Reviews */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
  <div className="lg:col-span-4">
    <h2 className="text-headline-md text-on-surface mb-6">Customer Reviews</h2>
    {reviewsState.summary && reviewsState.summary.count > 0 ? (
      <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-display-lg text-on-surface">{reviewsState.summary.average}</span>
          <div>
            <div className="flex text-secondary-container mb-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Icon
                  key={s}
                  name={s <= Math.round(reviewsState.summary.average) ? 'star' : 'star_outline'}
                  filled
                  size={18}
                />
              ))}
            </div>
            <span className="text-body-sm text-on-surface-variant">
              Based on {reviewsState.summary.count} reviews
            </span>
          </div>
        </div>
        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const c = reviewsState.summary.breakdown[String(star)] ?? 0;
            const pct = reviewsState.summary.count ? Math.round((c / reviewsState.summary.count) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-body-sm">
                <span className="w-6 text-on-surface">{star}★</span>
                <div className="flex-1 h-2 bg-surface-container rounded">
                  <div className="h-2 bg-secondary-container rounded" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-on-surface-variant text-right">{c}</span>
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <p className="text-body-md text-on-surface-variant mb-6">No reviews yet.</p>
    )}

    {myReview && !editing && (
      <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/50 mb-4">
        <div className="text-label-md text-on-surface mb-1">Your review</div>
        <div className="flex text-secondary-container mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <Icon key={s} name={s <= myReview.rating ? 'star' : 'star_outline'} filled size={16} />
          ))}
        </div>
        {myReview.comment && <p className="text-body-sm text-on-surface mb-3">{myReview.comment}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-label-md text-primary">Edit</button>
          <button type="button" onClick={deleteReview} className="text-label-md text-error">Delete</button>
        </div>
      </div>
    )}

    {(canReview || (myReview && editing)) && (
      <form onSubmit={submitReview} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/50 space-y-3">
        <div className="text-label-md text-on-surface">{myReview ? 'Edit your review' : 'Write a review'}</div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, rating: s }))}
              aria-label={`${s} star`}
              className="text-secondary-container"
            >
              <Icon name={s <= draft.rating ? 'star' : 'star_outline'} filled size={24} />
            </button>
          ))}
        </div>
        <textarea
          value={draft.comment}
          onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
          maxLength={2000}
          rows={3}
          placeholder="Share your experience (optional)"
          className="w-full p-3 rounded-lg border border-outline-variant bg-surface text-body-md"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md disabled:opacity-50"
          >
            {submitting ? 'Saving…' : myReview ? 'Save' : 'Post review'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft({ rating: myReview.rating, comment: myReview.comment ?? '' }); }}
              className="px-4 py-2 rounded-lg border border-outline-variant text-label-md"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    )}
  </div>

  <div className="lg:col-span-8 space-y-6">
    {reviewsState.total > 0 && (
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={reviewsSort}
          onChange={(e) => setReviewsSort(e.target.value)}
          className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-body-sm"
        >
          <option value="newest">Newest</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
        <select
          value={reviewsFilter}
          onChange={(e) => setReviewsFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-body-sm"
        >
          <option value="">All ratings</option>
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
      </div>
    )}

    {reviewsState.items
      .filter((r) => !myReview || r.id !== myReview.id)
      .map((r) => (
        <div key={r.id} className="border-b border-outline-variant pb-6">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-label-md">
                {(r.user?.name ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <span className="block text-label-md text-on-surface">{r.user?.name ?? 'Unknown'}</span>
            </div>
            <span className="text-body-sm text-outline">{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex text-secondary-container mb-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <Icon key={s} name={s <= r.rating ? 'star' : 'star_outline'} filled size={18} />
            ))}
          </div>
          {r.comment && <p className="text-body-md text-on-surface-variant">{r.comment}</p>}
        </div>
      ))}

    {reviewsState.items.length < reviewsState.total && (
      <button
        type="button"
        onClick={() => loadReviews(reviewsState.page + 1)}
        className="px-4 py-2 rounded-lg border border-outline-variant text-label-md"
      >
        Load more
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Verify FE compiles + visual check**

Run:
```bash
docker compose up -d
```

Open `http://localhost:5173/products/<some-id>`. Check:
- Summary block displays correctly (or "No reviews yet")
- If logged in as buyer with Delivered order: form appears
- Submit → list refreshes, my review card shows, form hides
- Edit → form prefilled, submit updates
- Delete → review removed, summary updates
- Logout → form gone, list still visible read-only

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProductDetailPage.jsx
git commit -m "feat(fe): integrate real reviews API in ProductDetailPage"
```

---

## Task 13: Documentation

**Files:**
- Create: `docs/features/reviews.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write feature doc**

Create `docs/features/reviews.md`:

```markdown
# Reviews

Product reviews (1–5 stars + optional comment). Buyer phải có ≥1 order Delivered
chứa product để được tạo review. Mỗi cặp `(user, product)` chỉ có 1 review;
owner toàn quyền sửa/xoá. Aggregate rating + count được tính on-the-fly trong
`GET /products/:id`.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/products/:productId/reviews` | public | `?page=&limit=&sort=newest\|highest\|lowest&rating=1..5`. Trả `{items, total, page, limit, summary: {average, count, breakdown}}`. `summary` không bị `rating` filter ảnh hưởng. |
| GET | `/products/:productId/reviews/me` | JWT | `{ review: ReviewItem\|null, canReview: boolean }`. |
| POST | `/products/:productId/reviews` | JWT | `{rating: 1..5, comment?}`. 403 nếu không eligible, 409 nếu đã có review. |
| PATCH | `/reviews/:id` | JWT (owner) | `{rating?, comment?}`. 403 nếu khác owner. |
| DELETE | `/reviews/:id` | JWT (owner) | 204. |

`GET /products/:id` được mở rộng để trả `rating` (1 chữ số thập phân) + `reviewCount`.

## Schema

`reviews(id char(36), product_id char(36), user_id bigint, rating tinyint, comment text, created_at, updated_at)` —
UNIQUE `(product_id, user_id)`, INDEX `(product_id, created_at)`, INDEX `(user_id)`.

## Seed

```bash
docker compose up -d mysql
cd backend && npm run seed:reviews
```

Script đọc `backend/1200_sample_review.json` và gán random vào cặp `(buyer, product)`
có order Delivered chưa có review. Idempotent.
```

- [ ] **Step 2: Add row to docs/README.md**

Modify `docs/README.md`. Add row to the completed-features table:

```markdown
| 2026-05-14 | Reviews (CRUD + product detail aggregate) | [features/reviews.md](features/reviews.md) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/features/reviews.md docs/README.md
git commit -m "docs: reviews feature page"
```

---

## Self-review

After completing all tasks, run the full backend test suite and verify:

```bash
cd backend && npm test
cd backend && npm run test:e2e
```

Expected: all green. Then run a manual end-to-end smoke through the UI:
1. Seed orders → seed reviews.
2. Open product detail with ≥1 review: summary + breakdown + list visible.
3. Login as buyer with Delivered order: form available, submit + edit + delete works, rating in header updates after change.
4. Login as buyer without Delivered order or anonymous: list visible, no form.

If something is off, **do not patch around it** — return to the relevant task and fix the root cause.
