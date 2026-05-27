# Behavior Tracking Implementation Plan (sub-project 4/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record weighted user-behavior events (purchase / cart / wishlist / review / view) into a `user_product_events` table via a `BehaviorService`, fired async-best-effort from the order/cart/wishlist/review write paths + a new view endpoint, with the frontend triggering views.

**Architecture:** A new `BehaviorModule` owns the `UserProductEvent` entity, a `BehaviorService` (resolves weight, appends events; `view` idempotent, `review` upserted), and a `POST /me/events/view` controller. Existing services inject `@Optional() BehaviorService` and fire events fire-and-forget so tracking never affects the request. SP5 will aggregate this table.

**Tech Stack:** NestJS 10, TypeORM (MySQL, `synchronize` on in dev), `@nestjs/config`, Jest; React (frontend view trigger). Spec: `docs/superpowers/specs/2026-05-27-behavior-tracking-design.md`.

**Verification notes:** Jest via `cd backend && npm test -- <pattern>`; full suite `cd backend && npm test`. Compile gate `cd backend && npx tsc -p tsconfig.build.json --noEmit` (ignore non-zero exit; only `error TS` lines matter — `nest build` is blocked by a root-owned `dist`). Frontend gate: `cd frontend && npm run build`. Real DB rows verified at the user's end-to-end pass.

---

## File Structure

**Create:**
- `backend/src/behavior/behavior-event.entity.ts` — `UserProductEvent` + `BehaviorEventType`.
- `backend/src/behavior/behavior.service.ts` — `BehaviorService`, `WEIGHTS`, `reviewWeight`.
- `backend/src/behavior/behavior.module.ts` — TypeOrm[UserProductEvent]; providers/exports `BehaviorService`.
- `backend/src/behavior/behavior.controller.ts` — `POST /me/events/view`.
- `backend/src/behavior/behavior.service.spec.ts`, `behavior.controller.spec.ts`, `behavior-hooks.spec.ts`.
- `frontend/src/services/events.js` — `recordView(productId)`.

**Modify:**
- `backend/src/app.module.ts` — register `UserProductEvent` entity + import `BehaviorModule`.
- `backend/src/orders/orders.{module,service}.ts`, `cart/cart.{module,service}.ts`, `wishlist/wishlist.{module,service}.ts`, `reviews/reviews.{module,service}.ts` — import `BehaviorModule`, fire events.
- `frontend/src/pages/ProductDetailPage.jsx` — fire `recordView` on mount for authed buyers.

---

### Task 1: Entity + BehaviorService + module + app wiring

**Files:**
- Create: `backend/src/behavior/behavior-event.entity.ts`, `behavior.service.ts`, `behavior.module.ts`, `behavior.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create `behavior-event.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type BehaviorEventType =
  | 'purchase'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'add_to_wishlist'
  | 'remove_wishlist'
  | 'review'
  | 'view';

@Entity({ name: 'user_product_events' })
@Index('idx_upe_user_product', ['userId', 'productId'])
@Index('idx_upe_user_product_type', ['userId', 'productId', 'type'])
export class UserProductEvent {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'product_id', type: 'char', length: 36 })
  productId!: string;

  @Column({
    type: 'enum',
    enum: ['purchase', 'add_to_cart', 'remove_from_cart', 'add_to_wishlist', 'remove_wishlist', 'review', 'view'],
  })
  type!: BehaviorEventType;

  @Column({ type: 'int' })
  weight!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
```

- [ ] **Step 2: Write the failing test `behavior.service.spec.ts`**

```ts
import { BehaviorService, reviewWeight } from './behavior.service';

function repoStub(findResult: any = null) {
  return {
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(findResult),
  } as any;
}

describe('reviewWeight', () => {
  it('maps rating to weight', () => {
    expect(reviewWeight(5)).toBe(4);
    expect(reviewWeight(4)).toBe(3);
    expect(reviewWeight(3)).toBe(1);
    expect(reviewWeight(2)).toBe(-3);
    expect(reviewWeight(1)).toBe(-3);
  });
});

describe('BehaviorService', () => {
  it('recordPurchase inserts one row per deduped product with weight 5', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).recordPurchase('7', ['a', 'a', 'b']);
    const rows = repo.insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.type === 'purchase' && r.weight === 5 && r.userId === '7')).toBe(true);
    expect(rows.map((r: any) => r.productId).sort()).toEqual(['a', 'b']);
  });

  it('recordPurchase([]) is a no-op', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).recordPurchase('7', []);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('cart/wishlist add+remove append with the right weights', async () => {
    const repo = repoStub();
    const svc = new BehaviorService(repo);
    await svc.recordCartAdd('7', 'p');
    await svc.recordCartRemove('7', 'p');
    await svc.recordWishlistAdd('7', 'p');
    await svc.recordWishlistRemove('7', 'p');
    const weights = repo.insert.mock.calls.map((c: any[]) => c[0].weight);
    const types = repo.insert.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toEqual(['add_to_cart', 'remove_from_cart', 'add_to_wishlist', 'remove_wishlist']);
    expect(weights).toEqual([4, -2, 3, -2]);
  });

  it('recordView is idempotent (skips when a view row exists)', async () => {
    const fresh = repoStub(null);
    await new BehaviorService(fresh).recordView('7', 'p');
    expect(fresh.insert).toHaveBeenCalledTimes(1);
    expect(fresh.insert.mock.calls[0][0]).toMatchObject({ type: 'view', weight: 1 });

    const dup = repoStub({ id: 'x' });
    await new BehaviorService(dup).recordView('7', 'p');
    expect(dup.insert).not.toHaveBeenCalled();
  });

  it('recordReview inserts when none, updates weight when present', async () => {
    const insertRepo = repoStub(null);
    await new BehaviorService(insertRepo).recordReview('7', 'p', 5);
    expect(insertRepo.insert.mock.calls[0][0]).toMatchObject({ type: 'review', weight: 4 });

    const existing = { id: 'r1', weight: 4 };
    const updateRepo = repoStub(existing);
    await new BehaviorService(updateRepo).recordReview('7', 'p', 2);
    expect(updateRepo.insert).not.toHaveBeenCalled();
    expect(updateRepo.save).toHaveBeenCalledWith({ id: 'r1', weight: -3 });
  });

  it('removeReview deletes the review row for the pair', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).removeReview('7', 'p');
    expect(repo.delete).toHaveBeenCalledWith({ userId: '7', productId: 'p', type: 'review' });
  });
});
```

- [ ] **Step 3: Implement `behavior.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { BehaviorEventType, UserProductEvent } from './behavior-event.entity';

export const WEIGHTS = {
  purchase: 5,
  add_to_cart: 4,
  remove_from_cart: -2,
  add_to_wishlist: 3,
  remove_wishlist: -2,
  view: 1,
} as const;

export function reviewWeight(rating: number): number {
  return rating >= 5 ? 4 : rating === 4 ? 3 : rating === 3 ? 1 : -3;
}

@Injectable()
export class BehaviorService {
  constructor(
    @InjectRepository(UserProductEvent)
    private readonly events: Repository<UserProductEvent>,
  ) {}

  private append(userId: string, productId: string, type: BehaviorEventType, weight: number): Promise<unknown> {
    return this.events.insert({ id: randomUUID(), userId, productId, type, weight });
  }

  async recordPurchase(userId: string, productIds: string[]): Promise<void> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return;
    await this.events.insert(
      unique.map((productId) => ({
        id: randomUUID(),
        userId,
        productId,
        type: 'purchase' as const,
        weight: WEIGHTS.purchase,
      })),
    );
  }

  async recordCartAdd(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'add_to_cart', WEIGHTS.add_to_cart);
  }
  async recordCartRemove(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'remove_from_cart', WEIGHTS.remove_from_cart);
  }
  async recordWishlistAdd(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'add_to_wishlist', WEIGHTS.add_to_wishlist);
  }
  async recordWishlistRemove(userId: string, productId: string): Promise<void> {
    await this.append(userId, productId, 'remove_wishlist', WEIGHTS.remove_wishlist);
  }

  async recordReview(userId: string, productId: string, rating: number): Promise<void> {
    const weight = reviewWeight(rating);
    const existing = await this.events.findOne({ where: { userId, productId, type: 'review' } });
    if (existing) {
      existing.weight = weight;
      await this.events.save(existing);
      return;
    }
    await this.append(userId, productId, 'review', weight);
  }

  async removeReview(userId: string, productId: string): Promise<void> {
    await this.events.delete({ userId, productId, type: 'review' });
  }

  async recordView(userId: string, productId: string): Promise<void> {
    const existing = await this.events.findOne({ where: { userId, productId, type: 'view' } });
    if (existing) return;
    await this.append(userId, productId, 'view', WEIGHTS.view);
  }
}
```

- [ ] **Step 4: Create `behavior.module.ts`** (controller added in Task 2)

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProductEvent } from './behavior-event.entity';
import { BehaviorService } from './behavior.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserProductEvent])],
  providers: [BehaviorService],
  exports: [BehaviorService],
})
export class BehaviorModule {}
```

- [ ] **Step 5: Register the entity + module in `app.module.ts`**

Add `import { UserProductEvent } from './behavior/behavior-event.entity';` and `import { BehaviorModule } from './behavior/behavior.module';`. Add `UserProductEvent` to the TypeORM `entities: [...]` array, and add `BehaviorModule` to the `imports:` array (after `SearchModule`).

- [ ] **Step 6: Verify**

Run: `cd backend && npm test -- behavior.service` → expect 7 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add backend/src/behavior/behavior-event.entity.ts backend/src/behavior/behavior.service.ts backend/src/behavior/behavior.module.ts backend/src/behavior/behavior.service.spec.ts backend/src/app.module.ts
git commit -m "feat(be): behavior events table + BehaviorService (SP4)"
```

---

### Task 2: View endpoint

**Files:**
- Create: `backend/src/behavior/behavior.controller.ts`, `backend/src/behavior/behavior.controller.spec.ts`
- Modify: `backend/src/behavior/behavior.module.ts`

- [ ] **Step 1: Write the failing test `behavior.controller.spec.ts`**

```ts
import { BehaviorController } from './behavior.controller';

describe('BehaviorController', () => {
  it('view calls recordView with the authed user id + body productId', async () => {
    const behavior = { recordView: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new BehaviorController(behavior as any);
    await ctrl.view({ user: { id: '7' } } as any, { productId: 'p1' } as any);
    expect(behavior.recordView).toHaveBeenCalledWith('7', 'p1');
  });

  it('view swallows recordView errors (never throws to the client)', async () => {
    const behavior = { recordView: jest.fn().mockRejectedValue(new Error('db down')) };
    const ctrl = new BehaviorController(behavior as any);
    await expect(ctrl.view({ user: { id: '7' } } as any, { productId: 'p1' } as any)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `behavior.controller.ts`**

```ts
import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BehaviorService } from './behavior.service';

class ViewEventDto {
  @IsString()
  @Length(36, 36)
  productId!: string;
}

@Controller('me/events')
@UseGuards(JwtAuthGuard)
export class BehaviorController {
  private readonly log = new Logger('BehaviorController');

  constructor(private readonly behavior: BehaviorService) {}

  @Post('view')
  @HttpCode(204)
  async view(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: ViewEventDto,
  ): Promise<void> {
    try {
      await this.behavior.recordView(req.user.id, dto.productId);
    } catch (err) {
      this.log.warn(`recordView failed: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 3: Register the controller in `behavior.module.ts`**

Add `import { BehaviorController } from './behavior.controller';` and add `controllers: [BehaviorController],` to the `@Module({...})`.

- [ ] **Step 4: Verify**

Run: `cd backend && npm test -- behavior.controller` → expect 2 passed.
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 5: Commit**

```bash
git add backend/src/behavior/behavior.controller.ts backend/src/behavior/behavior.controller.spec.ts backend/src/behavior/behavior.module.ts
git commit -m "feat(be): POST /me/events/view endpoint (SP4)"
```

---

### Task 3: Fire events from order/cart/wishlist/review writes

**Files:**
- Modify: `backend/src/cart/cart.module.ts`, `cart/cart.service.ts`, `wishlist/wishlist.module.ts`, `wishlist/wishlist.service.ts`, `reviews/reviews.module.ts`, `reviews/reviews.service.ts`, `orders/orders.module.ts`, `orders/orders.service.ts`
- Create: `backend/src/behavior/behavior-hooks.spec.ts`

Each service gets: import `BehaviorModule` in its module; constructor param `@Optional() private readonly behavior?: BehaviorService` (added LAST so existing positional test constructions still work); a `Logger` field; and a `fireBehavior` helper:
```ts
  private fireBehavior(fn: () => Promise<void>): void {
    if (!this.behavior) return;
    Promise.resolve()
      .then(fn)
      .catch((err) =>
        this.behaviorLog.warn(`behavior hook failed: ${err instanceof Error ? err.message : String(err)}`),
      );
  }
```
(`import { Optional, Logger } from '@nestjs/common';` — extend the existing import. `import { BehaviorService } from '../behavior/behavior.service';`.)

- [ ] **Step 1: Cart** — `cart.module.ts`: add `import { BehaviorModule } from '../behavior/behavior.module';` and `BehaviorModule` to `imports`. `cart.service.ts`: add the import, the `@Optional() behavior?`, `private readonly behaviorLog = new Logger('CartService:behavior');`, and the `fireBehavior` helper. Then:
  - In `add`, inside the `else`/new-row branch (after `const saved = await this.items.save(created);`, before returning): `this.fireBehavior(() => this.behavior!.recordCartAdd(userId, dto.productId));`
  - In `remove`, after `await this.items.delete({ userId, productId });`: `this.fireBehavior(() => this.behavior!.recordCartRemove(userId, productId));`
  - In `update`, inside the `if (dto.quantity === 0)` branch, after `await this.items.delete({ userId, productId });` and before `return null;`: `this.fireBehavior(() => this.behavior!.recordCartRemove(userId, productId));`

- [ ] **Step 2: Wishlist** — `wishlist.module.ts`: import + add `BehaviorModule`. `wishlist.service.ts`: import, `@Optional() behavior?`, `behaviorLog`, `fireBehavior`. Then:
  - In `add`, in the new-row branch (after `const saved = await this.items.save(entity);`, before `return { item: saved, created: true };`): `this.fireBehavior(() => this.behavior!.recordWishlistAdd(userId, productId));`
  - In `remove`, after `await this.items.delete({ userId, productId });`: `this.fireBehavior(() => this.behavior!.recordWishlistRemove(userId, productId));`

- [ ] **Step 3: Reviews** — `reviews.module.ts`: import + add `BehaviorModule` to `imports` (it already imports `SearchModule`). `reviews.service.ts`: add the `BehaviorService` import, `@Optional() behavior?` param (after the existing `@Optional() indexer?`), a `behaviorLog` field, and the `fireBehavior` helper. Then (alongside the existing `fireRefresh` SP2 calls):
  - In `create`, after `const saved = await this.reviews.save(entity);`: `this.fireBehavior(() => this.behavior!.recordReview(userId, productId, saved.rating));`
  - In `update`, after `const saved = await this.reviews.save(review);`: `this.fireBehavior(() => this.behavior!.recordReview(userId, review.productId, saved.rating));`
  - In `remove`, after `await this.reviews.remove(review);`: `this.fireBehavior(() => this.behavior!.removeReview(userId, review.productId));`

- [ ] **Step 4: Orders** — `orders.module.ts`: import + add `BehaviorModule` to `imports`. `orders.service.ts`: add the import, `@Optional() behavior?` (last constructor param), `behaviorLog`, `fireBehavior`. Then:
  - In `checkout`: capture the purchased ids and fire **after** the transaction commits. Change the method so the transaction result is stored and the hook fires before returning:
    ```ts
    async checkout(buyerId: string, dto: CheckoutDto): Promise<{ orderId: string; total: number; status: 'Paid' }> {
      let purchasedIds: string[] = [];
      const result = await this.dataSource.transaction(async (manager) => {
        // ...existing body unchanged...
        // (right after `const productIds = cartRows.map((r) => r.productId);`)
        purchasedIds = productIds;
        // ...rest unchanged, still `return { orderId: String(savedOrder.id), total, status: 'Paid' };`
      });
      this.fireBehavior(() => this.behavior!.recordPurchase(buyerId, purchasedIds));
      return result;
    }
    ```
  - In `createFromPreorder`: capture ids and fire after the transaction:
    ```ts
    const purchasedIds = draft.items.map((it) => it.productId);
    const result = await this.dataSource.transaction(async (manager) => { /* unchanged body + return */ });
    this.fireBehavior(() => this.behavior!.recordPurchase(userId, purchasedIds));
    return result;
    ```
    (Place `const purchasedIds = ...` after the `expiresAt` check, before the transaction.)

- [ ] **Step 5: Write `behavior-hooks.spec.ts`** (cart + wishlist — the cleanly-constructible services)

```ts
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';

function flush() {
  return new Promise((r) => setImmediate(r));
}

describe('Cart behavior hooks', () => {
  it('add fires recordCartAdd only on a new row', async () => {
    const behavior = { recordCartAdd: jest.fn().mockResolvedValue(undefined), recordCartRemove: jest.fn() };
    const items = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'c1' })),
    } as any;
    const products = { findOne: jest.fn().mockResolvedValue({ id: 'p1', name: 'X', price: '10', stock: 5 }) } as any;
    const svc = new CartService(items, products, behavior as any);
    await svc.add('7', { productId: 'p1', quantity: 1 } as any);
    await flush();
    expect(behavior.recordCartAdd).toHaveBeenCalledWith('7', 'p1');
  });

  it('add does NOT fire on a qty increment (existing row)', async () => {
    const behavior = { recordCartAdd: jest.fn(), recordCartRemove: jest.fn() };
    const items = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', userId: '7', productId: 'p1', quantity: 1 }),
      save: jest.fn().mockImplementation(async (e) => e),
    } as any;
    const products = { findOne: jest.fn().mockResolvedValue({ id: 'p1', name: 'X', price: '10', stock: 5 }) } as any;
    const svc = new CartService(items, products, behavior as any);
    await svc.add('7', { productId: 'p1', quantity: 1 } as any);
    await flush();
    expect(behavior.recordCartAdd).not.toHaveBeenCalled();
  });

  it('remove fires recordCartRemove', async () => {
    const behavior = { recordCartAdd: jest.fn(), recordCartRemove: jest.fn().mockResolvedValue(undefined) };
    const items = { delete: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new CartService(items, {} as any, behavior as any);
    await svc.remove('7', 'p1');
    await flush();
    expect(behavior.recordCartRemove).toHaveBeenCalledWith('7', 'p1');
  });
});

describe('Wishlist behavior hooks', () => {
  it('add fires recordWishlistAdd on a new row; remove fires recordWishlistRemove', async () => {
    const behavior = { recordWishlistAdd: jest.fn().mockResolvedValue(undefined), recordWishlistRemove: jest.fn().mockResolvedValue(undefined) };
    const items = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'w1' })),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new WishlistService(items, {} as any, behavior as any);
    await svc.add('7', 'p1');
    await flush();
    expect(behavior.recordWishlistAdd).toHaveBeenCalledWith('7', 'p1');
    await svc.remove('7', 'p1');
    await flush();
    expect(behavior.recordWishlistRemove).toHaveBeenCalledWith('7', 'p1');
  });
});
```
> Note: the cart/wishlist service constructors are `(itemsRepo, productsRepo, [behavior])` and `(itemsRepo, productsRepo, [behavior])` respectively (behavior is the new last `@Optional()` param). Confirm the exact param order after your edits and adjust the `new XService(...)` args if other injected deps sit between. The orders + reviews purchase/review hooks are verified by `tsc` + the full suite + the manual end-to-end pass (their methods need heavy transaction/eligibility mocking to unit-test, which is out of proportion here).

- [ ] **Step 6: Verify**

Run: `cd backend && npm test -- behavior-hooks` → expect all pass.
Run: `cd backend && npm test` → FULL suite, all pass (the new `@Optional()` params must not break existing service specs).
Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit` → no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add backend/src/cart/ backend/src/wishlist/ backend/src/reviews/ backend/src/orders/ backend/src/behavior/behavior-hooks.spec.ts
git commit -m "feat(be): fire behavior events on order/cart/wishlist/review writes (SP4)"
```

---

### Task 4: Frontend view trigger

**Files:**
- Create: `frontend/src/services/events.js`
- Modify: `frontend/src/pages/ProductDetailPage.jsx`

- [ ] **Step 1: Create `frontend/src/services/events.js`**

```js
import { api } from './api.js';

// Fire-and-forget: a failed view track must never disrupt the page.
export function recordView(productId) {
  return api.post('/me/events/view', { productId }).catch(() => null);
}
```

- [ ] **Step 2: Fire the view in `ProductDetailPage.jsx`**

Add the import near the other service imports:
```jsx
import { recordView } from '../services/events.js';
```
`ProductDetailPage` already reads `const { isAuthenticated } = useAuth();` — extend it to also get `user`:
```jsx
  const { isAuthenticated, user } = useAuth();
```
Add an effect (place it after the existing `useEffect` that loads the product):
```jsx
  useEffect(() => {
    if (id && isAuthenticated && user?.role === 'buyer') {
      recordView(id);
    }
  }, [id, isAuthenticated, user?.role]);
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run build`
Expected: build succeeds (exit 0).

- [ ] **Step 4: Manual check (dev server, optional)**

Log in as `buyer01@amazara.local`, open a product page → a row appears in `user_product_events` (`type='view'`, `weight=1`); reopening the same product adds no new view row. Guests/sellers create no row.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/events.js frontend/src/pages/ProductDetailPage.jsx
git commit -m "feat(fe): record product view for authenticated buyers (SP4)"
```

---

## Self-Review

**Spec coverage:**
- `user_product_events` table (userId/productId/type/weight/createdAt + 2 indexes; enum incl. cart types) → Task 1 entity. ✓
- Weights (purchase 5, add_to_cart 4, remove_from_cart -2, wishlist 3/-2, view 1; review 5/4/3/1-2 → 4/3/1/-3) → Task 1 (`WEIGHTS`, `reviewWeight`). ✓
- `BehaviorService` record* methods; view idempotent; review upsert; purchase dedup → Task 1 (impl + tests). ✓
- View endpoint `POST /me/events/view` (auth, 204, swallows errors) → Task 2. ✓
- Hooks: orders checkout + createFromPreorder → purchase; cart add(new)/remove/update-qty0; wishlist add(new)/remove; reviews create/update → review, delete → removeReview; all async best-effort via `@Optional()` + fire-and-forget → Task 3. ✓
- Frontend view trigger (buyer-only, ProductDetailPage) → Task 4. ✓
- Behavior independent of EMBEDDINGS_ENABLED; no new env flag → no gating added. ✓
- Scope: no aggregation/preference vectors/profile → none added. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. The Task 3 note about not unit-testing orders/reviews hooks is an explicit, justified verification decision (heavy mocking), not a placeholder — the hook code is fully specified.

**Type/name consistency:** `BehaviorService` methods (`recordPurchase`, `recordCartAdd`, `recordCartRemove`, `recordWishlistAdd`, `recordWishlistRemove`, `recordReview`, `removeReview`, `recordView`) defined in Task 1 are the exact names fired in Task 3 and called by the controller (Task 2) + frontend (`recordView` endpoint). `WEIGHTS` keys match the entity enum and the spec. `UserProductEvent` registered in `app.module` entities (Task 1) so `synchronize` creates the table. `@Optional() behavior?` added as the LAST constructor param in cart/wishlist/orders, and after `indexer?` in reviews — preserving SP2's positional test constructions.
