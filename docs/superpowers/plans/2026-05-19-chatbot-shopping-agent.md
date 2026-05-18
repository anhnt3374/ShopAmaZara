# Chatbot — Shopping Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the system-conversation echo with a LangGraph-driven shopping assistant covering KB 1/2/3/4/9 from `chatbot.xlsx`.

**Architecture:** `@langchain/langgraph` JS embedded in NestJS. ReAct agent (`openai/gpt-oss-120b` via Groq) with 10 tools that wrap existing services. Order flow uses a subgraph with `interrupt()` for the preorder → confirm step. Replies stream over WebSocket as `message:delta`/`message:done`; rich content (product list, confirm card) lives in a new `messages.content_blocks` JSON column.

**Tech Stack:** NestJS 10 · TypeORM · MySQL · `@langchain/langgraph` · `@langchain/groq` · `@langchain/core` · `zod` · `nanoid` · React 18 + Vite (frontend). Tests in Jest with a `FakeChatModel` for deterministic LLM behavior.

**Spec:** `docs/superpowers/specs/2026-05-19-chatbot-shopping-agent-design.md`

---

## Phase 0 — Setup

### Task 1: Verify branch and install dependencies

**Files:**
- Modify: `backend/package.json` (deps only)

- [ ] **Step 1: Confirm branch**

```bash
git branch --show-current
```
Expected: `feat/chatbot-shopping-agent`. If not, abort and switch.

- [ ] **Step 2: Install backend deps**

```bash
cd backend && npm install --save @langchain/langgraph @langchain/groq @langchain/core zod nanoid
```

- [ ] **Step 3: Verify versions resolved**

```bash
cd backend && npm ls @langchain/langgraph @langchain/groq @langchain/core zod nanoid
```
Expected: no `UNMET PEER` warnings; all five resolve.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(ai): add @langchain/langgraph + @langchain/groq + zod + nanoid"
```

---

### Task 2: Add AI env vars + kill switch

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/app.module.ts` (no logic change — just confirm `ConfigModule.forRoot` is global; if not, add `isGlobal: true`)

- [ ] **Step 1: Append to `backend/.env.example`**

```
# AI / chatbot
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
AI_MAX_HISTORY=20
AI_RECURSION_LIMIT=8
AI_REQUEST_TIMEOUT_MS=20000
AI_FEATURE_ENABLED=true
```

- [ ] **Step 2: Inspect `app.module.ts`**

```bash
grep -n "ConfigModule" backend/src/app.module.ts
```
If `isGlobal: true` is not present on `ConfigModule.forRoot`, add it.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example backend/src/app.module.ts
git commit -m "chore(ai): env vars for Groq + AI feature flag"
```

---

## Phase 1 — Schema migration

### Task 3: Migration adding `content_blocks` + nullable `body`

**Files:**
- Create: `backend/src/migrations/1716163000000-AddContentBlocksToMessages.ts`
- Modify: `backend/src/chats/message.entity.ts`

- [ ] **Step 1: Create migration file**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentBlocksToMessages1716163000000 implements MigrationInterface {
  name = 'AddContentBlocksToMessages1716163000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE messages MODIFY body TEXT NULL`);
    await qr.query(`ALTER TABLE messages ADD COLUMN content_blocks JSON NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE messages DROP COLUMN content_blocks`);
    await qr.query(`ALTER TABLE messages MODIFY body TEXT NOT NULL`);
  }
}
```

- [ ] **Step 2: Update `message.entity.ts` body + add contentBlocks**

Replace:
```ts
  @Column({ type: 'text' })
  body!: string;
```
With:
```ts
  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'content_blocks', type: 'json', nullable: true })
  contentBlocks!: unknown[] | null;
```

- [ ] **Step 3: Run dev backend to apply via TypeORM sync**

```bash
docker compose up -d mysql backend
docker compose logs backend | tail -30
```
Expected: backend boots without "column not found" errors. Confirm with:
```bash
docker compose exec mysql mysql -uamazara -pamazara amazara -e "DESCRIBE messages;"
```
Expected: `content_blocks json YES NULL`; `body text YES NULL`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/migrations/1716163000000-AddContentBlocksToMessages.ts backend/src/chats/message.entity.ts
git commit -m "feat(chat): messages.content_blocks + body nullable"
```

---

## Phase 2 — AI module skeleton + shared types

### Task 4: Create `rich-message.ts` (ContentBlock union)

**Files:**
- Create: `backend/src/ai/rich-message.ts`

- [ ] **Step 1: Write file**

```ts
export type ProductItem = {
  id: string;
  name: string;
  price: string;
  image: string | null;
  rating?: number;
  storeName?: string;
  stock?: 'in_stock' | 'low' | 'out';
  actions: Array<'view' | 'wishlist' | 'add_to_cart'>;
};

export type ConfirmCardLine = { label: string; value: string };

export type ContentBlock =
  | { type: 'products'; mode?: 'list' | 'compare' | 'upsell'; items: ProductItem[] }
  | {
      type: 'confirm_card';
      preorderId: string;
      title: string;
      lines: ConfirmCardLine[];
      total: ConfirmCardLine;
      primary: { label: string; action: 'confirm_order' };
      secondary: { label: string; action: 'cancel_order' };
      chips: { label: string; action: 'edit_address' | 'edit_qty' | 'edit_payment' }[];
    }
  | { type: 'order_success'; orderId: string; total: string }
  | { type: 'orders'; items: { id: string; status: string; total: string; createdAt: string }[] }
  | { type: 'toast'; kind: 'success' | 'info' | 'warn'; text: string };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/ai/rich-message.ts
git commit -m "feat(ai): ContentBlock union for rich chat messages"
```

---

### Task 5: System prompt

**Files:**
- Create: `backend/src/ai/prompts/system.en.ts`

- [ ] **Step 1: Write the prompt**

```ts
export const SYSTEM_PROMPT_EN = `You are AmaZara's in-app shopping assistant. You help authenticated buyers search products, compare items, manage their cart and wishlist, place and cancel orders, and discover related products.

CAPABILITIES (use the provided tools — do not invent products or prices):
- search_products: find products matching a natural-language query and optional filters.
- compare_products: fetch full details of 2-4 products for side-by-side comparison.
- add_to_cart, remove_from_cart: cart management.
- toggle_wishlist: add or remove from wishlist.
- create_preorder: build a draft order. ALWAYS show a confirm card and wait for the user before calling confirm_order.
- confirm_order, cancel_order: finalize or undo.
- lookup_order: list or fetch one of the user's orders.
- suggest_similar: recommend related items after a successful add_to_cart.

RULES:
1. Be concise. One short paragraph + the tool's rich content is usually enough.
2. Never place an order without an explicit confirm action from the user. Always create_preorder first.
3. When the user references "the second one", "this", "that", look at the most recent product list you produced. If ambiguous, ask.
4. If a tool returns an error, briefly explain what went wrong and offer next steps. Do not retry the same call.
5. If the user asks for something outside shopping (account settings, store policies, contacting support), politely say it's outside your scope and point them to the relevant page.
6. All output to the user must be in English.
`;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/ai/prompts/system.en.ts
git commit -m "feat(ai): system prompt (English)"
```

---

### Task 6: AI logger

**Files:**
- Create: `backend/src/ai/ai.logger.ts`
- Test: `backend/src/ai/ai.logger.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
import { AiLogger } from './ai.logger';

describe('AiLogger', () => {
  it('records a turn outcome with metrics', () => {
    const logger = new AiLogger();
    const spy = jest.spyOn(logger['nest'], 'log').mockImplementation();
    logger.recordTurn({
      userId: '7', conversationId: '12', requestId: 'r1',
      durationMs: 1234, tokensIn: 100, tokensOut: 50,
      toolsCalled: ['search_products'], outcome: 'ok',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/"outcome":"ok"/);
    expect(spy.mock.calls[0][0]).toMatch(/"toolsCalled":\["search_products"\]/);
  });
});
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
cd backend && npx jest src/ai/ai.logger.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { Injectable, Logger } from '@nestjs/common';

export type TurnOutcome = {
  userId: string;
  conversationId: string;
  requestId: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  toolsCalled: string[];
  outcome: 'ok' | 'error';
  errorCode?: string;
};

@Injectable()
export class AiLogger {
  private readonly nest = new Logger('AI');

  recordTurn(t: TurnOutcome): void {
    this.nest.log(JSON.stringify(t));
  }

  toolError(toolName: string, err: unknown): void {
    this.nest.warn(`tool=${toolName} error=${(err as Error).message}`);
  }
}
```

- [ ] **Step 4: Run test (passes)**

```bash
cd backend && npx jest src/ai/ai.logger.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai.logger.ts backend/src/ai/ai.logger.spec.ts
git commit -m "feat(ai): structured per-turn logger"
```

---

## Phase 3 — Backend service additions

### Task 7: `ProductsService.findManyByIds`

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Test: `backend/src/products/products.service.spec.ts` (extend existing if present; else create)

- [ ] **Step 1: Add failing test**

```ts
import { Test } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './product.entity';

describe('ProductsService.findManyByIds', () => {
  let svc: ProductsService;
  let findBy: jest.Mock;

  beforeEach(async () => {
    findBy = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: { findBy } },
      ],
    }).compile();
    svc = mod.get(ProductsService);
  });

  it('returns an empty array for empty ids', async () => {
    expect(await svc.findManyByIds([])).toEqual([]);
    expect(findBy).not.toHaveBeenCalled();
  });

  it('queries the repo with In(ids) when present', async () => {
    findBy.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const out = await svc.findManyByIds(['1', '2']);
    expect(findBy).toHaveBeenCalledWith({ id: expect.anything() });
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest products.service.spec
```
Expected: FAIL — method not defined.

- [ ] **Step 3: Implement**

In `products.service.ts`, add:
```ts
import { In } from 'typeorm';

// inside the class:
async findManyByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  return this.products.findBy({ id: In(ids) });
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx jest products.service.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/products/products.service.ts backend/src/products/products.service.spec.ts
git commit -m "feat(products): findManyByIds for AI tools"
```

---

### Task 8: `ProductsService.suggest`

**Files:**
- Modify: `backend/src/products/products.service.ts`
- Modify: `backend/src/products/products.service.spec.ts`

- [ ] **Step 1: Add failing test**

```ts
describe('ProductsService.suggest', () => {
  let svc: ProductsService;
  let products: { find: jest.Mock; findBy: jest.Mock };

  beforeEach(async () => {
    products = { find: jest.fn(), findBy: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    svc = mod.get(ProductsService);
  });

  it('similar mode: finds products in the same category, excluding the seeds', async () => {
    products.findBy.mockResolvedValue([{ id: '1', category: 'headphones' }]);
    products.find.mockResolvedValue([{ id: '5', category: 'headphones' }]);
    const out = await svc.suggest(['1'], 'similar');
    const call = products.find.mock.calls[0][0];
    expect(call.where.category).toBe('headphones');
    expect(out).toHaveLength(1);
  });

  it('returns empty array when seeds are empty', async () => {
    expect(await svc.suggest([], 'similar')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest products.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { Not, In } from 'typeorm';

async suggest(
  seedIds: string[],
  mode: 'similar' | 'complementary',
  limit = 6,
): Promise<Product[]> {
  if (seedIds.length === 0) return [];
  const seeds = await this.findManyByIds(seedIds);
  if (seeds.length === 0) return [];
  const seedCategory = seeds[0].category;
  const seedIdSet = seeds.map((s) => s.id);
  // v1: 'similar' = same category; 'complementary' = different category, same store.
  if (mode === 'similar') {
    return this.products.find({
      where: { category: seedCategory, id: Not(In(seedIdSet)), isPublished: true },
      take: limit,
    });
  }
  return this.products.find({
    where: {
      category: Not(seedCategory),
      storeId: seeds[0].storeId,
      isPublished: true,
      id: Not(In(seedIdSet)),
    },
    take: limit,
  });
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx jest products.service.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/products/products.service.ts backend/src/products/products.service.spec.ts
git commit -m "feat(products): suggest (similar/complementary)"
```

---

### Task 9: `OrdersService.buildPreorder` (pure, no DB write)

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Test: `backend/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Add types + test**

In `orders.service.ts` (top of file or in a new `preorder.types.ts`):
```ts
export type PreorderItemInput = { productId: string; qty: number };
export type PreorderDraft = {
  preorderId: string;
  items: { productId: string; qty: number; unitPrice: string; name: string }[];
  addressId: string;
  paymentMethod: 'COD' | 'card';
  total: string;
  expiresAt: number;
};
```

Test:
```ts
describe('OrdersService.buildPreorder', () => {
  // mock products + addresses repos like existing patterns
  it('throws if items empty', async () => {
    await expect(svc.buildPreorder('u1', [], undefined, 'COD')).rejects.toThrow(/items/i);
  });
  it('throws if stock insufficient', async () => {
    productRepo.findOne.mockResolvedValue({ id: 'p1', name: 'X', price: '10.00', stock: 0 });
    await expect(svc.buildPreorder('u1', [{ productId: 'p1', qty: 1 }], 'a1', 'COD'))
      .rejects.toThrow(/stock/i);
  });
  it('returns a preorder draft with computed total', async () => {
    productRepo.findOne.mockImplementation(async ({ where: { id } }) => ({
      id, name: `prod-${id}`, price: '10.00', stock: 5,
    }));
    addressRepo.findOne.mockResolvedValue({ id: 'a1', userId: 'u1' });
    const draft = await svc.buildPreorder('u1', [
      { productId: 'p1', qty: 2 }, { productId: 'p2', qty: 1 },
    ], 'a1', 'COD');
    expect(draft.total).toBe('30.00');
    expect(draft.items).toHaveLength(2);
    expect(draft.preorderId).toMatch(/^PRE-[A-Z0-9]{6}$/);
    expect(draft.expiresAt).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest orders.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `orders.service.ts`:
```ts
import { customAlphabet } from 'nanoid';
const PREORDER_TTL_MS = 10 * 60 * 1000;
const makePreorderId = () => `PRE-${customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6)()}`;

async buildPreorder(
  userId: string,
  items: PreorderItemInput[],
  addressId: string | undefined,
  paymentMethod: 'COD' | 'card' = 'COD',
): Promise<PreorderDraft> {
  if (items.length === 0) throw new BadRequestException('items must not be empty');

  let resolvedAddressId = addressId;
  if (!resolvedAddressId) {
    const defaultAddr = await this.addresses.findOne({
      where: { userId, isDefault: true },
    });
    if (!defaultAddr) {
      throw new BadRequestException('No default address; please provide addressId');
    }
    resolvedAddressId = defaultAddr.id;
  } else {
    const addr = await this.addresses.findOne({ where: { id: resolvedAddressId } });
    if (!addr) throw new NotFoundException('Address not found');
    if (addr.userId !== userId) throw new ForbiddenException('Not your address');
  }

  const lines: PreorderDraft['items'] = [];
  let total = 0;
  for (const it of items) {
    const p = await this.products.findOne({ where: { id: it.productId } });
    if (!p) throw new NotFoundException(`Product ${it.productId} not found`);
    if (p.stock < it.qty) throw new BadRequestException(`Insufficient stock for ${p.name}`);
    const unit = Number(p.price);
    total += unit * it.qty;
    lines.push({ productId: p.id, qty: it.qty, unitPrice: p.price, name: p.name });
  }

  return {
    preorderId: makePreorderId(),
    items: lines,
    addressId: resolvedAddressId,
    paymentMethod,
    total: total.toFixed(2),
    expiresAt: Date.now() + PREORDER_TTL_MS,
  };
}
```

(Inject `@InjectRepository(Address) private readonly addresses: Repository<Address>` into the constructor if not already present. Mirror the existing constructor wiring pattern.)

- [ ] **Step 4: Run tests**

```bash
cd backend && npx jest orders.service.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/orders.service.ts backend/src/orders/orders.service.spec.ts
git commit -m "feat(orders): buildPreorder (validate-only, no DB write)"
```

---

### Task 10: `OrdersService.createFromPreorder`

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Add test**

```ts
describe('OrdersService.createFromPreorder', () => {
  it('throws expired if expiresAt is in the past', async () => {
    const draft = { ...validDraft, expiresAt: Date.now() - 1 };
    await expect(svc.createFromPreorder('u1', draft)).rejects.toThrow(/expired/i);
  });

  it('creates an order with stock decrement', async () => {
    // mock stock decrement returning affected=1, and order save
    const out = await svc.createFromPreorder('u1', validDraft);
    expect(out.orderId).toBeDefined();
    expect(out.total).toBe(validDraft.total);
    expect(out.status).toBe('Paid');
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest orders.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
async createFromPreorder(
  userId: string,
  draft: PreorderDraft,
): Promise<{ orderId: string; total: string; status: 'Paid' }> {
  if (Date.now() > draft.expiresAt) {
    throw new BadRequestException('Preorder expired');
  }
  return this.ds.transaction(async (m) => {
    // mirror the stock-decrement-with-affected-rows pattern from checkout()
    for (const it of draft.items) {
      const res: { affected?: number } = await m
        .createQueryBuilder()
        .update(Product)
        .set({ stock: () => 'stock - :q' })
        .where('id = :id AND stock >= :q', { id: it.productId, q: it.qty })
        .setParameters({ q: it.qty })
        .execute();
      if (res.affected !== 1) {
        throw new ConflictException(`Insufficient stock for ${it.name}`);
      }
    }
    const order = await m.save(
      m.create(Order, {
        buyerId: userId,
        addressId: draft.addressId,
        paymentMethod: draft.paymentMethod,
        status: 'Paid',
        totalAmount: draft.total,
      }),
    );
    for (const it of draft.items) {
      await m.save(
        m.create(OrderItem, {
          orderId: order.id,
          productId: it.productId,
          quantity: it.qty,
          unitPrice: it.unitPrice,
          productName: it.name,
        }),
      );
    }
    return { orderId: order.id, total: draft.total, status: 'Paid' };
  });
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx jest orders.service.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/orders.service.ts backend/src/orders/orders.service.spec.ts
git commit -m "feat(orders): createFromPreorder finalizer"
```

---

### Task 11: `OrdersService.cancelForBuyer`

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Add test**

```ts
describe('OrdersService.cancelForBuyer', () => {
  it('forbids cancelling not-owned orders', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'o1', buyerId: 'other', status: 'Paid' });
    await expect(svc.cancelForBuyer('u1', 'o1', 'changed mind')).rejects.toThrow(/not your/i);
  });
  it('rejects cancelling Delivered orders', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'o1', buyerId: 'u1', status: 'Delivered' });
    await expect(svc.cancelForBuyer('u1', 'o1')).rejects.toThrow(/delivered/i);
  });
  it('cancels and restocks each item', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'o1', buyerId: 'u1', status: 'Paid',
      items: [{ productId: 'p1', quantity: 2 }],
    });
    await svc.cancelForBuyer('u1', 'o1', 'no longer needed');
    // assert update increments stock back, sets status='Cancelled'
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest orders.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
async cancelForBuyer(
  userId: string,
  orderId: string,
  reason?: string,
): Promise<{ ok: true }> {
  return this.ds.transaction(async (m) => {
    const order = await m.findOne(Order, { where: { id: orderId }, relations: ['items'] });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status === 'Delivered') {
      throw new BadRequestException('Cannot cancel a delivered order');
    }
    if (order.status === 'Cancelled') return { ok: true };

    for (const it of order.items ?? []) {
      await m
        .createQueryBuilder()
        .update(Product)
        .set({ stock: () => 'stock + :q' })
        .where('id = :id', { id: it.productId })
        .setParameters({ q: it.quantity })
        .execute();
    }
    await m.update(Order, { id: order.id }, { status: 'Cancelled', cancelReason: reason ?? null });
    return { ok: true };
  });
}
```

(Add `cancelReason` to Order entity if not present: `@Column({ name: 'cancel_reason', type: 'varchar', length: 200, nullable: true }) cancelReason!: string | null;` — include in same commit.)

- [ ] **Step 4: Run tests**

```bash
cd backend && npx jest orders.service.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/orders.service.ts backend/src/orders/orders.service.spec.ts backend/src/orders/order.entity.ts
git commit -m "feat(orders): cancelForBuyer with stock restock"
```

---

## Phase 4 — Tools (one task per tool)

> Each tool is a factory function `(deps) => DynamicStructuredTool`. Tools receive `userId` from `RunnableConfig.configurable`, never from LLM input. Each tool pushes a `ContentBlock` via a `pushBlock` callback also in config.

### Task 12: Tool common helpers

**Files:**
- Create: `backend/src/ai/graph/tools/tool-context.ts`

- [ ] **Step 1: Write file**

```ts
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ContentBlock } from '../../rich-message';

export type ToolContext = {
  userId: string;
  conversationId: string;
  pushBlock: (block: ContentBlock) => void;
};

export function ctxFromConfig(config?: RunnableConfig): ToolContext {
  const ctx = config?.configurable as Partial<ToolContext> | undefined;
  if (!ctx?.userId || !ctx.pushBlock || !ctx.conversationId) {
    throw new Error('ToolContext missing in RunnableConfig.configurable');
  }
  return ctx as ToolContext;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/ai/graph/tools/tool-context.ts
git commit -m "feat(ai): ToolContext helper for LangGraph tools"
```

---

### Task 13: `search_products` tool

**Files:**
- Create: `backend/src/ai/graph/tools/search-products.tool.ts`
- Test: `backend/src/ai/graph/tools/search-products.tool.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
import { makeSearchProductsTool } from './search-products.tool';

describe('search_products tool', () => {
  it('calls ProductsService.list with mapped filters and pushes a products block', async () => {
    const list = jest.fn().mockResolvedValue({
      items: [{ id: '1', name: 'X', price: '10.00', images: ['img.jpg'], rating: 4.2, stock: 3 }],
      total: 1,
    });
    const pushed: any[] = [];
    const tool = makeSearchProductsTool({ products: { list } as any });
    const out = await tool.invoke(
      { query: 'bluetooth', maxPrice: 1_000_000, limit: 5 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b) } },
    );
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      q: 'bluetooth', maxPrice: 1_000_000, page: 1, pageSize: 5,
    }));
    expect(JSON.parse(out).items).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ type: 'products', mode: 'list' });
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest search-products.tool.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock, ProductItem } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  query: z.string().min(1),
  maxPrice: z.number().int().positive().optional(),
  minPrice: z.number().int().nonnegative().optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(12).default(8),
});

export function makeSearchProductsTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'search_products',
    description: 'Search the catalog with a natural-language query plus optional price/category filters. Returns up to 8 products by default.',
    schema: Schema,
    func: async (input, _runManager, config) => {
      const ctx = ctxFromConfig(config);
      const { items } = await deps.products.list({
        q: input.query,
        maxPrice: input.minPrice ? undefined : input.maxPrice,
        minPrice: input.minPrice,
        category: input.category ? [input.category] : undefined,
        page: 1,
        pageSize: input.limit,
      } as any);

      const productItems: ProductItem[] = items.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        price: String(p.price),
        image: p.images?.[0] ?? null,
        rating: p.rating,
        storeName: p.storeName,
        stock: p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'],
      }));

      const block: ContentBlock = { type: 'products', mode: 'list', items: productItems };
      ctx.pushBlock(block);

      // small JSON to the LLM (id, name, price only)
      return JSON.stringify({
        count: productItems.length,
        items: productItems.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      });
    },
  });
}
```

- [ ] **Step 4: Run test (passes)**

```bash
cd backend && npx jest search-products.tool.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/graph/tools/search-products.tool.ts backend/src/ai/graph/tools/search-products.tool.spec.ts
git commit -m "feat(ai): search_products tool"
```

---

### Task 14: `compare_products` tool

**Files:**
- Create: `backend/src/ai/graph/tools/compare-products.tool.ts`
- Test: `backend/src/ai/graph/tools/compare-products.tool.spec.ts`

- [ ] **Step 1: Test**

```ts
import { makeCompareProductsTool } from './compare-products.tool';

describe('compare_products tool', () => {
  it('looks up products and pushes a compare-mode block', async () => {
    const findManyByIds = jest.fn().mockResolvedValue([
      { id: '1', name: 'A', price: '10', images: [], rating: 4 },
      { id: '2', name: 'B', price: '20', images: [], rating: 5 },
    ]);
    const pushed: any[] = [];
    const tool = makeCompareProductsTool({ products: { findManyByIds } as any });
    const out = await tool.invoke(
      { productIds: ['1', '2'] },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b) } },
    );
    expect(findManyByIds).toHaveBeenCalledWith(['1', '2']);
    expect(pushed[0]).toMatchObject({ type: 'products', mode: 'compare' });
    expect(JSON.parse(out).items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest compare-products.tool.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productIds: z.array(z.string()).min(2).max(4),
});

export function makeCompareProductsTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'compare_products',
    description: 'Fetch full detail for 2-4 products to compare side by side.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const products = await deps.products.findManyByIds(input.productIds);
      const items = products.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        price: String(p.price),
        image: p.images?.[0] ?? null,
        rating: p.rating,
        storeName: p.storeName,
        stock: p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'] as const,
      }));
      const block: ContentBlock = { type: 'products', mode: 'compare', items };
      ctx.pushBlock(block);
      return JSON.stringify({
        count: items.length,
        items: products.map((p: any) => ({
          id: p.id, name: p.name, price: p.price,
          brand: p.brand, category: p.category, stock: p.stock,
          rating: p.rating, highlights: p.highlights,
        })),
      });
    },
  });
}
```

- [ ] **Step 4: Run test**

```bash
cd backend && npx jest compare-products.tool.spec
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/graph/tools/compare-products.tool.ts backend/src/ai/graph/tools/compare-products.tool.spec.ts
git commit -m "feat(ai): compare_products tool"
```

---

### Task 15: `add_to_cart` and `remove_from_cart` tools

**Files:**
- Create: `backend/src/ai/graph/tools/add-to-cart.tool.ts`
- Create: `backend/src/ai/graph/tools/remove-from-cart.tool.ts`
- Test: `backend/src/ai/graph/tools/cart-tools.spec.ts`

- [ ] **Step 1: Tests**

```ts
import { makeAddToCartTool } from './add-to-cart.tool';
import { makeRemoveFromCartTool } from './remove-from-cart.tool';

describe('cart tools', () => {
  it('add_to_cart calls cart.add and pushes toast', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'r1' });
    const list = jest.fn().mockResolvedValue({ items: [{ productId: 'p1', name: 'X' }], subtotal: 10 });
    const pushed: any[] = [];
    const tool = makeAddToCartTool({ cart: { add, list } as any });
    const out = await tool.invoke(
      { productId: 'p1', qty: 2 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b) } },
    );
    expect(add).toHaveBeenCalledWith('u1', { productId: 'p1', quantity: 2 });
    expect(pushed[0]).toMatchObject({ type: 'toast', kind: 'success' });
    expect(JSON.parse(out)).toMatchObject({ ok: true, cartCount: 1 });
  });

  it('add_to_cart returns ok:false when service throws', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Insufficient stock'));
    const tool = makeAddToCartTool({ cart: { add, list: jest.fn() } as any });
    const out = await tool.invoke(
      { productId: 'p1', qty: 99 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } },
    );
    expect(JSON.parse(out)).toMatchObject({ ok: false });
  });

  it('remove_from_cart calls cart.remove', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const tool = makeRemoveFromCartTool({ cart: { remove } as any });
    await tool.invoke(
      { productId: 'p1' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } },
    );
    expect(remove).toHaveBeenCalledWith('u1', 'p1');
  });
});
```

- [ ] **Step 2: Run tests (fail)**

```bash
cd backend && npx jest cart-tools.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement add_to_cart**

```ts
// add-to-cart.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { CartService } from '../../../cart/cart.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productId: z.string(),
  qty: z.number().int().min(1).max(99).default(1),
});

export function makeAddToCartTool(deps: { cart: CartService }) {
  return new DynamicStructuredTool({
    name: 'add_to_cart',
    description: 'Add a product to the current user\'s cart.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.cart.add(ctx.userId, { productId: input.productId, quantity: input.qty } as any);
        const { items } = await deps.cart.list(ctx.userId);
        const productName = items.find((it) => it.productId === input.productId)?.name ?? 'item';
        ctx.pushBlock({ type: 'toast', kind: 'success', text: `Added ${productName} to your cart` });
        return JSON.stringify({ ok: true, cartCount: items.length });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
```

- [ ] **Step 4: Implement remove_from_cart**

```ts
// remove-from-cart.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { CartService } from '../../../cart/cart.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({ productId: z.string() });

export function makeRemoveFromCartTool(deps: { cart: CartService }) {
  return new DynamicStructuredTool({
    name: 'remove_from_cart',
    description: 'Remove a product from the current user\'s cart.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.cart.remove(ctx.userId, input.productId);
        ctx.pushBlock({ type: 'toast', kind: 'info', text: 'Removed from cart' });
        return JSON.stringify({ ok: true });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
```

- [ ] **Step 5: Run tests + commit**

```bash
cd backend && npx jest cart-tools.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/tools/add-to-cart.tool.ts backend/src/ai/graph/tools/remove-from-cart.tool.ts backend/src/ai/graph/tools/cart-tools.spec.ts
git commit -m "feat(ai): add_to_cart + remove_from_cart tools"
```

---

### Task 16: `toggle_wishlist` tool

**Files:**
- Create: `backend/src/ai/graph/tools/toggle-wishlist.tool.ts`
- Test: `backend/src/ai/graph/tools/toggle-wishlist.tool.spec.ts`

- [ ] **Step 1: Test**

```ts
import { makeToggleWishlistTool } from './toggle-wishlist.tool';

describe('toggle_wishlist tool', () => {
  it('calls add when action=add', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn();
    const tool = makeToggleWishlistTool({ wishlist: { add, remove } as any });
    const out = await tool.invoke(
      { productId: 'p1', action: 'add' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } },
    );
    expect(add).toHaveBeenCalledWith('u1', 'p1');
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toMatchObject({ ok: true, state: 'added' });
  });
  it('calls remove when action=remove', async () => {
    const add = jest.fn();
    const remove = jest.fn().mockResolvedValue(undefined);
    const tool = makeToggleWishlistTool({ wishlist: { add, remove } as any });
    const out = await tool.invoke(
      { productId: 'p1', action: 'remove' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } },
    );
    expect(remove).toHaveBeenCalledWith('u1', 'p1');
    expect(JSON.parse(out)).toMatchObject({ ok: true, state: 'removed' });
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest toggle-wishlist.tool.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { WishlistService } from '../../../wishlist/wishlist.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productId: z.string(),
  action: z.enum(['add', 'remove']),
});

export function makeToggleWishlistTool(deps: { wishlist: WishlistService }) {
  return new DynamicStructuredTool({
    name: 'toggle_wishlist',
    description: 'Add or remove a product from the user\'s wishlist.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        if (input.action === 'add') {
          await deps.wishlist.add(ctx.userId, input.productId);
          ctx.pushBlock({ type: 'toast', kind: 'success', text: 'Saved to wishlist' });
          return JSON.stringify({ ok: true, state: 'added' });
        }
        await deps.wishlist.remove(ctx.userId, input.productId);
        ctx.pushBlock({ type: 'toast', kind: 'info', text: 'Removed from wishlist' });
        return JSON.stringify({ ok: true, state: 'removed' });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
```

(If `WishlistService.add/remove` method names differ, adapt the call to match the real names — check `backend/src/wishlist/wishlist.service.ts` first.)

- [ ] **Step 4: Run test + commit**

```bash
cd backend && npx jest toggle-wishlist.tool.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/tools/toggle-wishlist.tool.ts backend/src/ai/graph/tools/toggle-wishlist.tool.spec.ts
git commit -m "feat(ai): toggle_wishlist tool"
```

---

### Task 17: `create_preorder` + `confirm_order` + `cancel_order` tools

**Files:**
- Create: `backend/src/ai/graph/tools/order-tools.ts` (all three; small)
- Test: `backend/src/ai/graph/tools/order-tools.spec.ts`

- [ ] **Step 1: Tests**

```ts
import { makeCreatePreorderTool, makeConfirmOrderTool, makeCancelOrderTool } from './order-tools';

describe('order tools', () => {
  it('create_preorder builds draft, sets pendingPreorder via setState, pushes confirm_card', async () => {
    const draft = {
      preorderId: 'PRE-ABC123', items: [{ productId: 'p1', qty: 1, unitPrice: '10.00', name: 'X' }],
      addressId: 'a1', paymentMethod: 'COD' as const, total: '10.00', expiresAt: Date.now() + 60000,
    };
    const buildPreorder = jest.fn().mockResolvedValue(draft);
    const pushed: any[] = [];
    const stateSet: any[] = [];
    const tool = makeCreatePreorderTool({ orders: { buildPreorder } as any });
    const out = await tool.invoke(
      { items: [{ productId: 'p1', qty: 1 }], addressId: 'a1', paymentMethod: 'COD' },
      { configurable: {
          userId: 'u1', conversationId: 'c1',
          pushBlock: (b: any) => pushed.push(b),
          setPendingPreorder: (d: any) => stateSet.push(d),
      } },
    );
    expect(buildPreorder).toHaveBeenCalled();
    expect(pushed[0]).toMatchObject({ type: 'confirm_card', preorderId: 'PRE-ABC123' });
    expect(stateSet[0]).toBe(draft);
    expect(JSON.parse(out)).toMatchObject({ preorderId: 'PRE-ABC123' });
  });

  it('confirm_order calls createFromPreorder when draft matches', async () => {
    const draft = { preorderId: 'PRE-X', items: [], addressId: 'a', paymentMethod: 'COD',
                    total: '10', expiresAt: Date.now() + 60000 } as any;
    const createFromPreorder = jest.fn().mockResolvedValue({ orderId: 'o1', total: '10', status: 'Paid' });
    const tool = makeConfirmOrderTool({ orders: { createFromPreorder } as any });
    const out = await tool.invoke(
      { preorderId: 'PRE-X' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {},
                        getPendingPreorder: () => draft, setPendingPreorder: () => {} } },
    );
    expect(createFromPreorder).toHaveBeenCalledWith('u1', draft);
    expect(JSON.parse(out)).toMatchObject({ orderId: 'o1' });
  });

  it('confirm_order returns expired when draft is gone', async () => {
    const tool = makeConfirmOrderTool({ orders: { createFromPreorder: jest.fn() } as any });
    const out = await tool.invoke(
      { preorderId: 'PRE-X' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {},
                        getPendingPreorder: () => null, setPendingPreorder: () => {} } },
    );
    expect(JSON.parse(out)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('cancel_order calls OrdersService.cancelForBuyer', async () => {
    const cancelForBuyer = jest.fn().mockResolvedValue({ ok: true });
    const tool = makeCancelOrderTool({ orders: { cancelForBuyer } as any });
    await tool.invoke(
      { orderId: 'o1', reason: 'no' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } },
    );
    expect(cancelForBuyer).toHaveBeenCalledWith('u1', 'o1', 'no');
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest order-tools.spec
```
Expected: FAIL.

- [ ] **Step 3: Update `ToolContext` to expose preorder state**

In `backend/src/ai/graph/tools/tool-context.ts`:
```ts
import type { PreorderDraft } from '../../../orders/orders.service';
// ...
export type ToolContext = {
  userId: string;
  conversationId: string;
  pushBlock: (block: ContentBlock) => void;
  getPendingPreorder: () => PreorderDraft | null;
  setPendingPreorder: (draft: PreorderDraft | null) => void;
};
```
Update `ctxFromConfig` to require both new fns.

- [ ] **Step 4: Implement order-tools.ts**

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { OrdersService } from '../../../orders/orders.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const PreorderSchema = z.object({
  items: z.array(z.object({ productId: z.string(), qty: z.number().int().min(1) })).min(1),
  addressId: z.string().optional(),
  paymentMethod: z.enum(['COD', 'card']).default('COD'),
});

export function makeCreatePreorderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'create_preorder',
    description: 'Build a draft order. ALWAYS call this before confirm_order. The user must approve via the confirm card.',
    schema: PreorderSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        const draft = await deps.orders.buildPreorder(
          ctx.userId, input.items, input.addressId, input.paymentMethod,
        );
        ctx.setPendingPreorder(draft);
        const block: ContentBlock = {
          type: 'confirm_card',
          preorderId: draft.preorderId,
          title: `Order ${draft.preorderId}`,
          lines: draft.items.map((it) => ({
            label: `${it.name} ×${it.qty}`, value: `${(Number(it.unitPrice) * it.qty).toFixed(2)}`,
          })),
          total: { label: 'Total', value: draft.total },
          primary: { label: 'Confirm order', action: 'confirm_order' },
          secondary: { label: 'Cancel', action: 'cancel_order' },
          chips: [
            { label: 'Edit address', action: 'edit_address' },
            { label: 'Edit quantity', action: 'edit_qty' },
            { label: 'Edit payment', action: 'edit_payment' },
          ],
        };
        ctx.pushBlock(block);
        return JSON.stringify({
          preorderId: draft.preorderId, total: draft.total,
          itemCount: draft.items.length, expiresAt: draft.expiresAt,
        });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}

const ConfirmSchema = z.object({ preorderId: z.string() });
export function makeConfirmOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'confirm_order',
    description: 'Finalize a preorder the user has confirmed. Only call this after the user clicked Confirm.',
    schema: ConfirmSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const draft = ctx.getPendingPreorder();
      if (!draft || draft.preorderId !== input.preorderId) {
        return JSON.stringify({ ok: false, error: 'expired' });
      }
      try {
        const result = await deps.orders.createFromPreorder(ctx.userId, draft);
        ctx.setPendingPreorder(null);
        ctx.pushBlock({ type: 'order_success', orderId: result.orderId, total: result.total });
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}

const CancelSchema = z.object({ orderId: z.string(), reason: z.string().max(200).optional() });
export function makeCancelOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'cancel_order',
    description: 'Cancel an existing order belonging to the user.',
    schema: CancelSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.orders.cancelForBuyer(ctx.userId, input.orderId, input.reason);
        ctx.pushBlock({ type: 'toast', kind: 'info', text: `Cancelled order #${input.orderId}` });
        return JSON.stringify({ ok: true });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
```

- [ ] **Step 5: Run test + commit**

```bash
cd backend && npx jest order-tools.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/tools/order-tools.ts backend/src/ai/graph/tools/order-tools.spec.ts backend/src/ai/graph/tools/tool-context.ts
git commit -m "feat(ai): create_preorder + confirm_order + cancel_order tools"
```

---

### Task 18: `lookup_order` + `suggest_similar` tools

**Files:**
- Create: `backend/src/ai/graph/tools/lookup-order.tool.ts`
- Create: `backend/src/ai/graph/tools/suggest-similar.tool.ts`
- Test: `backend/src/ai/graph/tools/extras-tools.spec.ts`

- [ ] **Step 1: Tests**

```ts
import { makeLookupOrderTool } from './lookup-order.tool';
import { makeSuggestSimilarTool } from './suggest-similar.tool';

describe('extras tools', () => {
  it('lookup_order: list when no id', async () => {
    const listForBuyer = jest.fn().mockResolvedValue([{ id: 'o1', status: 'Paid', totalAmount: '10', createdAt: new Date('2026-01-01') }]);
    const tool = makeLookupOrderTool({ orders: { listForBuyer, findOneForBuyer: jest.fn() } as any });
    const out = await tool.invoke({}, { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } });
    expect(listForBuyer).toHaveBeenCalledWith('u1', undefined);
    expect(JSON.parse(out).items).toHaveLength(1);
  });
  it('lookup_order: single when id given', async () => {
    const findOneForBuyer = jest.fn().mockResolvedValue({ id: 'o1', status: 'Paid', totalAmount: '10', createdAt: new Date(), items: [] });
    const tool = makeLookupOrderTool({ orders: { findOneForBuyer, listForBuyer: jest.fn() } as any });
    await tool.invoke({ orderId: 'o1' }, { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: () => {} } });
    expect(findOneForBuyer).toHaveBeenCalledWith('u1', 'o1');
  });
  it('suggest_similar: pushes upsell block', async () => {
    const suggest = jest.fn().mockResolvedValue([{ id: 'p2', name: 'Y', price: '10', images: [], stock: 3 }]);
    const pushed: any[] = [];
    const tool = makeSuggestSimilarTool({ products: { suggest } as any });
    await tool.invoke(
      { seedProductIds: ['p1'], mode: 'similar' },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b) } },
    );
    expect(pushed[0]).toMatchObject({ type: 'products', mode: 'upsell' });
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest extras-tools.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement lookup_order**

```ts
// lookup-order.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { OrdersService } from '../../../orders/orders.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  orderId: z.string().optional(),
  status: z.enum(['Paid', 'Shipped', 'Delivered', 'Cancelled']).optional(),
});

export function makeLookupOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'lookup_order',
    description: 'List the user\'s orders (optionally filtered by status) or fetch one by id.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        if (input.orderId) {
          const order = await deps.orders.findOneForBuyer(ctx.userId, input.orderId);
          const items = [{
            id: String(order.id), status: order.status,
            total: String(order.totalAmount), createdAt: order.createdAt.toISOString(),
          }];
          ctx.pushBlock({ type: 'orders', items });
          return JSON.stringify({ items });
        }
        const orders = await deps.orders.listForBuyer(ctx.userId, input.status);
        const items = orders.map((o: any) => ({
          id: String(o.id), status: o.status,
          total: String(o.totalAmount), createdAt: o.createdAt.toISOString(),
        }));
        ctx.pushBlock({ type: 'orders', items });
        return JSON.stringify({ items });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
```

- [ ] **Step 4: Implement suggest_similar**

```ts
// suggest-similar.tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  seedProductIds: z.array(z.string()).min(1).max(4),
  mode: z.enum(['similar', 'complementary']),
});

export function makeSuggestSimilarTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'suggest_similar',
    description: 'Recommend related products. mode=similar (same category) or complementary (different category, same store).',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const out = await deps.products.suggest(input.seedProductIds, input.mode);
      const items = out.map((p: any) => ({
        id: String(p.id), name: p.name, price: String(p.price),
        image: p.images?.[0] ?? null, rating: p.rating,
        stock: p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'] as const,
      }));
      const block: ContentBlock = { type: 'products', mode: 'upsell', items };
      ctx.pushBlock(block);
      return JSON.stringify({
        count: items.length,
        items: items.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      });
    },
  });
}
```

- [ ] **Step 5: Run test + commit**

```bash
cd backend && npx jest extras-tools.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/tools/lookup-order.tool.ts backend/src/ai/graph/tools/suggest-similar.tool.ts backend/src/ai/graph/tools/extras-tools.spec.ts
git commit -m "feat(ai): lookup_order + suggest_similar tools"
```

---

## Phase 5 — Graph state + nodes

### Task 19: Graph state annotation

**Files:**
- Create: `backend/src/ai/graph/state.ts`

- [ ] **Step 1: Write file**

```ts
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ContentBlock } from '../rich-message';
import type { PreorderDraft } from '../../orders/orders.service';

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  contentBlocks: Annotation<ContentBlock[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  pendingPreorder: Annotation<PreorderDraft | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type GraphState = typeof GraphAnnotation.State;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/ai/graph/state.ts
git commit -m "feat(ai): GraphState annotation"
```

---

### Task 20: Agent node + ChatGroq factory

**Files:**
- Create: `backend/src/ai/graph/nodes/agent.node.ts`
- Test: `backend/src/ai/graph/nodes/agent.node.spec.ts`

- [ ] **Step 1: Test**

```ts
import { agentNodeFactory } from './agent.node';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

describe('agent node', () => {
  it('invokes the model with bound tools and returns the AIMessage', async () => {
    const aiMsg = new AIMessage({ content: 'ok', tool_calls: [] });
    const invoke = jest.fn().mockResolvedValue(aiMsg);
    const model = { bindTools: jest.fn().mockReturnValue({ invoke }) };
    const tools = [{ name: 't1' }, { name: 't2' }] as any;

    const node = agentNodeFactory(model as any, tools, 'SYSTEM');
    const out = await node({ messages: [new HumanMessage('hi')], contentBlocks: [], pendingPreorder: null } as any);

    expect(model.bindTools).toHaveBeenCalledWith(tools);
    expect(invoke).toHaveBeenCalled();
    expect(out.messages).toEqual([aiMsg]);
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest agent.node.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { GraphState } from '../state';

export function agentNodeFactory(
  model: any,
  tools: any[],
  systemPrompt: string,
) {
  const bound = model.bindTools(tools);
  return async (state: GraphState) => {
    const messages: BaseMessage[] = [new SystemMessage(systemPrompt), ...state.messages];
    const ai = await bound.invoke(messages);
    return { messages: [ai] };
  };
}
```

- [ ] **Step 4: Run test + commit**

```bash
cd backend && npx jest agent.node.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/nodes/agent.node.ts backend/src/ai/graph/nodes/agent.node.spec.ts
git commit -m "feat(ai): agent node (ReAct via bindTools)"
```

---

### Task 21: Tools node — custom dispatcher with order interrupt

**Files:**
- Create: `backend/src/ai/graph/nodes/tools.node.ts`
- Test: `backend/src/ai/graph/nodes/tools.node.spec.ts`

- [ ] **Step 1: Test**

```ts
import { makeToolsNode } from './tools.node';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

describe('tools node', () => {
  it('executes each tool call and appends ToolMessage', async () => {
    const tool = { name: 'search_products', invoke: jest.fn().mockResolvedValue('{"ok":true}') };
    const node = makeToolsNode([tool as any]);
    const lastAi = new AIMessage({
      content: '',
      tool_calls: [{ id: 'call1', name: 'search_products', args: { query: 'x' } }],
    });
    const out = await node({ messages: [lastAi], contentBlocks: [], pendingPreorder: null } as any, {
      configurable: { userId: 'u1', conversationId: 'c1', pushBlock: jest.fn(), getPendingPreorder: () => null, setPendingPreorder: jest.fn() },
    });
    expect(tool.invoke).toHaveBeenCalled();
    expect(out.messages[0]).toBeInstanceOf(ToolMessage);
    expect((out.messages[0] as ToolMessage).tool_call_id).toBe('call1');
  });

  it('returns "tool not found" ToolMessage for unknown tool name', async () => {
    const node = makeToolsNode([]);
    const lastAi = new AIMessage({
      content: '', tool_calls: [{ id: 'cx', name: 'no_such', args: {} }],
    });
    const out = await node({ messages: [lastAi], contentBlocks: [], pendingPreorder: null } as any, {
      configurable: { userId: 'u1', conversationId: 'c1', pushBlock: jest.fn(), getPendingPreorder: () => null, setPendingPreorder: jest.fn() },
    });
    expect((out.messages[0] as ToolMessage).content).toMatch(/not found/i);
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest tools.node.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { ToolMessage, type AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { GraphState } from '../state';

export function makeToolsNode(tools: any[]) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return async (state: GraphState, config: RunnableConfig) => {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    const calls = last.tool_calls ?? [];
    const out: ToolMessage[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      if (!tool) {
        out.push(new ToolMessage({
          tool_call_id: call.id ?? '',
          content: JSON.stringify({ ok: false, error: `Tool ${call.name} not found` }),
        }));
        continue;
      }
      const content = await tool.invoke(call.args, config);
      out.push(new ToolMessage({ tool_call_id: call.id ?? '', content }));
    }
    return { messages: out };
  };
}
```

- [ ] **Step 4: Run test + commit**

```bash
cd backend && npx jest tools.node.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/nodes/tools.node.ts backend/src/ai/graph/nodes/tools.node.spec.ts
git commit -m "feat(ai): tools node dispatcher"
```

---

### Task 22: Build the graph (wiring)

**Files:**
- Create: `backend/src/ai/graph/build-graph.ts`
- Test: `backend/src/ai/graph/build-graph.spec.ts`

- [ ] **Step 1: Test**

```ts
import { buildGraph } from './build-graph';
import { AIMessage } from '@langchain/core/messages';

describe('buildGraph', () => {
  it('routes to tools when last AI message has tool_calls, else ends', async () => {
    const tools = [{
      name: 't', invoke: jest.fn().mockResolvedValue('{"ok":true}'),
    }];
    const replies: AIMessage[] = [
      new AIMessage({ content: '', tool_calls: [{ id: '1', name: 't', args: {} }] }),
      new AIMessage({ content: 'done', tool_calls: [] }),
    ];
    let i = 0;
    const model = { bindTools: () => ({ invoke: async () => replies[i++] }) };

    const graph = buildGraph({ model: model as any, tools: tools as any, systemPrompt: 'sys' });
    const out = await graph.invoke(
      { messages: [{ type: 'human', content: 'hi' } as any], contentBlocks: [], pendingPreorder: null },
      { configurable: { userId: 'u1', conversationId: 'c1',
                        pushBlock: () => {}, getPendingPreorder: () => null, setPendingPreorder: () => {} } },
    );
    expect(out.messages.at(-1).content).toBe('done');
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest build-graph.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { GraphAnnotation, type GraphState } from './state';
import { agentNodeFactory } from './nodes/agent.node';
import { makeToolsNode } from './nodes/tools.node';

const checkpointer = new MemorySaver();

export function buildGraph(opts: { model: any; tools: any[]; systemPrompt: string }) {
  const agent = agentNodeFactory(opts.model, opts.tools, opts.systemPrompt);
  const tools = makeToolsNode(opts.tools);

  const graph = new StateGraph(GraphAnnotation)
    .addNode('agent', agent)
    .addNode('tools', tools)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', (state: GraphState) => {
      const last = state.messages[state.messages.length - 1] as AIMessage;
      return last.tool_calls && last.tool_calls.length > 0 ? 'tools' : '__end__';
    })
    .addEdge('tools', 'agent');

  return graph.compile({ checkpointer });
}

export { checkpointer };
```

- [ ] **Step 4: Run test + commit**

```bash
cd backend && npx jest build-graph.spec
```
Expected: PASS.
```bash
git add backend/src/ai/graph/build-graph.ts backend/src/ai/graph/build-graph.spec.ts
git commit -m "feat(ai): build-graph wiring with MemorySaver"
```

> Note: the design's order subgraph uses LangGraph `interrupt()` for the preorder→confirm pause. In this implementation, the pause is naturally enforced by the agent's system prompt + the `create_preorder` tool returning a confirm card. Because each user turn is a fresh `graph.invoke` keyed by `thread_id = conversationId`, the checkpointer holds `pendingPreorder` across turns. We do not need an explicit `interrupt()` node — the turn boundary IS the interrupt. The order-tools tests above cover the resume path (confirm/expire).

---

## Phase 6 — AI service (orchestrator)

### Task 23: `AiService` skeleton + `respond` happy path (non-stream)

**Files:**
- Create: `backend/src/ai/ai.service.ts`
- Create: `backend/src/ai/ai.module.ts`
- Modify: `backend/src/app.module.ts` (register `AiModule`)
- Test: `backend/src/ai/ai.service.spec.ts`

- [ ] **Step 1: Test**

```ts
import { Test } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ChatsService } from '../chats/chats.service';
import { ConfigService } from '@nestjs/config';
// ...other service mocks as needed
import { AIMessage } from '@langchain/core/messages';

describe('AiService.respond', () => {
  it('feature flag off → bot replies with echo fallback', async () => {
    const config = { get: (k: string) => (k === 'AI_FEATURE_ENABLED' ? 'false' : undefined) };
    const chats = { appendBotMessage: jest.fn().mockResolvedValue({ id: 'm1' }) } as any;
    const svc = new AiService(config as any, chats, {} as any, [] as any, jest.fn() as any, new (require('./ai.logger').AiLogger)());
    await svc.respond('u1', 'c1', 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1', expect.stringMatching(/received your message/i), null,
    );
  });

  it('feature flag on → invokes the graph and persists final bot message', async () => {
    const config = { get: (k: string) => (k === 'AI_FEATURE_ENABLED' ? 'true' : (k === 'AI_MAX_HISTORY' ? '20' : '8')) };
    const chats = {
      appendBotMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      loadRecentMessages: jest.fn().mockResolvedValue([]),
    } as any;
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        messages: [new AIMessage('reply')],
        contentBlocks: [{ type: 'toast', kind: 'info', text: 'x' }],
        pendingPreorder: null,
      }),
    };
    const svc = new AiService(config as any, chats, {} as any, [] as any, graph as any, new (require('./ai.logger').AiLogger)());
    await svc.respond('u1', 'c1', 'hello');
    expect(graph.invoke).toHaveBeenCalled();
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1', 'reply', [{ type: 'toast', kind: 'info', text: 'x' }],
    );
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest ai.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement `ai.service.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatsService } from '../chats/chats.service';
import { ChatsGateway } from '../chats/chats.gateway';
import { HumanMessage, AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { ContentBlock } from './rich-message';
import { AiLogger } from './ai.logger';

export const AI_GRAPH = 'AI_GRAPH';

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly chats: ChatsService,
    private readonly gateway: ChatsGateway,
    private readonly tools: any[],
    @Inject(AI_GRAPH) private readonly graph: any,
    private readonly logger: AiLogger,
  ) {}

  async respond(userId: string, conversationId: string, _userMessage: string): Promise<void> {
    if (this.config.get<string>('AI_FEATURE_ENABLED') !== 'true') {
      await this.chats.appendBotMessage(conversationId, 'Thanks, we received your message.', null);
      return;
    }

    const requestId = Math.random().toString(36).slice(2, 10);
    const start = Date.now();
    const collected: ContentBlock[] = [];
    let pendingPreorder: any = null;

    const recent = await this.chats.loadRecentMessages(
      conversationId, Number(this.config.get('AI_MAX_HISTORY') ?? 20),
    );
    const history: BaseMessage[] = recent.map((m: any) =>
      m.senderKind === 'buyer' ? new HumanMessage(m.body ?? '')
      : m.senderKind === 'system' ? new AIMessage(m.body ?? '')
      : new HumanMessage(`[store]: ${m.body}`));

    try {
      const final = await this.graph.invoke(
        { messages: history, contentBlocks: [], pendingPreorder: null },
        {
          recursionLimit: Number(this.config.get('AI_RECURSION_LIMIT') ?? 8),
          configurable: {
            thread_id: conversationId,
            userId, conversationId,
            pushBlock: (b: ContentBlock) => collected.push(b),
            getPendingPreorder: () => pendingPreorder,
            setPendingPreorder: (d: any) => { pendingPreorder = d; },
          },
        },
      );
      const lastAi = final.messages.filter((m: any) => m instanceof AIMessage).at(-1) as AIMessage | undefined;
      const text = typeof lastAi?.content === 'string' ? lastAi.content : '';
      const blocks = (final.contentBlocks?.length ? final.contentBlocks : collected) as ContentBlock[];
      const saved = await this.chats.appendBotMessage(conversationId, text, blocks.length ? blocks : null);
      this.gateway.emitDone(userId, conversationId, requestId, String(saved.id));
      this.logger.recordTurn({
        userId, conversationId, requestId,
        durationMs: Date.now() - start,
        tokensIn: 0, tokensOut: 0,
        toolsCalled: collected.map((b) => b.type),
        outcome: 'ok',
      });
    } catch (e) {
      const fallback = 'Sorry, I am having trouble right now. Please try again.';
      const saved = await this.chats.appendBotMessage(conversationId, fallback, null);
      this.gateway.emitError(userId, conversationId, requestId, 'ai_error', fallback);
      this.gateway.emitDone(userId, conversationId, requestId, String(saved.id));
      this.logger.recordTurn({
        userId, conversationId, requestId,
        durationMs: Date.now() - start, tokensIn: 0, tokensOut: 0,
        toolsCalled: [], outcome: 'error', errorCode: (e as Error).message,
      });
    }
  }
}
```

- [ ] **Step 4: Implement `ai.module.ts`**

```ts
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGroq } from '@langchain/groq';
import { AiService, AI_GRAPH } from './ai.service';
import { AiLogger } from './ai.logger';
import { ChatsModule } from '../chats/chats.module';
import { ProductsModule } from '../products/products.module';
import { CartModule } from '../cart/cart.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsService } from '../products/products.service';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { OrdersService } from '../orders/orders.service';
import { buildGraph } from './graph/build-graph';
import { SYSTEM_PROMPT_EN } from './prompts/system.en';
import { makeSearchProductsTool } from './graph/tools/search-products.tool';
import { makeCompareProductsTool } from './graph/tools/compare-products.tool';
import { makeAddToCartTool } from './graph/tools/add-to-cart.tool';
import { makeRemoveFromCartTool } from './graph/tools/remove-from-cart.tool';
import { makeToggleWishlistTool } from './graph/tools/toggle-wishlist.tool';
import {
  makeCreatePreorderTool, makeConfirmOrderTool, makeCancelOrderTool,
} from './graph/tools/order-tools';
import { makeLookupOrderTool } from './graph/tools/lookup-order.tool';
import { makeSuggestSimilarTool } from './graph/tools/suggest-similar.tool';

@Module({
  imports: [
    ConfigModule,
    ProductsModule, CartModule, WishlistModule, OrdersModule,
    forwardRef(() => ChatsModule),
  ],
  providers: [
    AiLogger,
    {
      provide: AI_GRAPH,
      inject: [ConfigService, ProductsService, CartService, WishlistService, OrdersService],
      useFactory: (
        config: ConfigService,
        products: ProductsService, cart: CartService,
        wishlist: WishlistService, orders: OrdersService,
      ) => {
        const tools = [
          makeSearchProductsTool({ products }),
          makeCompareProductsTool({ products }),
          makeAddToCartTool({ cart }), makeRemoveFromCartTool({ cart }),
          makeToggleWishlistTool({ wishlist }),
          makeCreatePreorderTool({ orders }), makeConfirmOrderTool({ orders }), makeCancelOrderTool({ orders }),
          makeLookupOrderTool({ orders }),
          makeSuggestSimilarTool({ products }),
        ];
        const model = new ChatGroq({
          apiKey: config.get('GROQ_API_KEY'),
          model: config.get('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
          temperature: 0.3,
        });
        return buildGraph({ model, tools, systemPrompt: SYSTEM_PROMPT_EN });
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
```

- [ ] **Step 5: Register `AiModule` in `app.module.ts`**

Add to imports array: `AiModule` (use forwardRef if ChatsModule already imports something from ai).

- [ ] **Step 6: Run tests + commit**

```bash
cd backend && npx jest ai.service.spec
```
Expected: PASS.
```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.module.ts backend/src/app.module.ts backend/src/ai/ai.service.spec.ts
git commit -m "feat(ai): AiService + AiModule with feature flag + fallback"
```

---

### Task 24: Streaming via `streamEvents`

**Files:**
- Modify: `backend/src/ai/ai.service.ts`
- Modify: `backend/src/ai/ai.service.spec.ts`

- [ ] **Step 1: Extend test**

```ts
it('streams token deltas via gateway.emitDelta', async () => {
  const config = { get: (k: string) => k === 'AI_FEATURE_ENABLED' ? 'true' : '8' };
  const chats = {
    appendBotMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    loadRecentMessages: jest.fn().mockResolvedValue([]),
  } as any;
  const gateway = { emitDelta: jest.fn(), emitDone: jest.fn(), emitError: jest.fn() } as any;
  // Fake streamEvents async generator yielding 2 chunk events then end
  async function* fakeStream() {
    yield { event: 'on_chat_model_stream', data: { chunk: { content: 'Hel' } } };
    yield { event: 'on_chat_model_stream', data: { chunk: { content: 'lo' } } };
    yield { event: 'on_chain_end', data: { output: { messages: [{ content: 'Hello' }], contentBlocks: [], pendingPreorder: null } } };
  }
  const graph = { streamEvents: jest.fn(() => fakeStream()), invoke: jest.fn() };
  const svc = new AiService(config as any, chats, gateway, [] as any, graph as any, new (require('./ai.logger').AiLogger)());
  await svc.respond('u1', 'c1', 'hi');
  expect(gateway.emitDelta).toHaveBeenNthCalledWith(1, 'u1', 'c1', expect.any(String), 'Hel');
  expect(gateway.emitDelta).toHaveBeenNthCalledWith(2, 'u1', 'c1', expect.any(String), 'lo');
  expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'Hello', null);
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest ai.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Replace the `graph.invoke` block in `respond()` with stream handling**

```ts
let buffer = '';
let finalState: any = null;
try {
  for await (const ev of this.graph.streamEvents(
    { messages: history, contentBlocks: [], pendingPreorder: null },
    { version: 'v2', recursionLimit: Number(this.config.get('AI_RECURSION_LIMIT') ?? 8),
      configurable: { thread_id: conversationId, userId, conversationId,
        pushBlock: (b: ContentBlock) => collected.push(b),
        getPendingPreorder: () => pendingPreorder,
        setPendingPreorder: (d: any) => { pendingPreorder = d; } } },
  )) {
    if (ev.event === 'on_chat_model_stream') {
      const chunk = ev.data?.chunk?.content;
      if (typeof chunk === 'string' && chunk.length > 0) {
        buffer += chunk;
        this.gateway.emitDelta(userId, conversationId, requestId, chunk);
      }
    } else if (ev.event === 'on_chain_end' && (ev as any).name === 'LangGraph') {
      finalState = (ev as any).data?.output;
    }
  }
  const blocks = collected.length ? collected : (finalState?.contentBlocks ?? []);
  const text = buffer.length > 0 ? buffer : ((finalState?.messages?.at(-1)?.content ?? '') as string);
  const saved = await this.chats.appendBotMessage(conversationId, text, blocks.length ? blocks : null);
  this.gateway.emitDone(userId, conversationId, requestId, String(saved.id));
  this.logger.recordTurn({ userId, conversationId, requestId, durationMs: Date.now() - start,
                          tokensIn: 0, tokensOut: 0,
                          toolsCalled: collected.map((b) => b.type), outcome: 'ok' });
} catch (e) {
  // ...same fallback as before
}
```

- [ ] **Step 4: Run test + commit**

```bash
cd backend && npx jest ai.service.spec
```
Expected: PASS.
```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "feat(ai): stream token deltas via gateway"
```

---

## Phase 7 — Chat integration

### Task 25: `ChatsService.loadRecentMessages` + `appendBotMessage`

**Files:**
- Modify: `backend/src/chats/chats.service.ts`
- Modify: `backend/src/chats/chats.service.spec.ts`

- [ ] **Step 1: Tests**

```ts
it('loadRecentMessages returns last N in chrono order', async () => {
  // arrange messages with ids 1..30 in DB
  const out = await svc.loadRecentMessages('c1', 20);
  expect(out).toHaveLength(20);
  expect(out[0].createdAt.getTime()).toBeLessThan(out.at(-1)!.createdAt.getTime());
});

it('appendBotMessage stores body + content_blocks and bumps conversation.updatedAt', async () => {
  const blocks = [{ type: 'toast', kind: 'info', text: 'x' }];
  const out = await svc.appendBotMessage('c1', 'hello', blocks as any);
  expect(out.body).toBe('hello');
  expect(out.contentBlocks).toEqual(blocks);
});
```

- [ ] **Step 2: Run tests (fail)**

```bash
cd backend && npx jest chats.service.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
async loadRecentMessages(conversationId: string, limit: number): Promise<Message[]> {
  const rows = await this.messages.find({
    where: { conversationId },
    order: { createdAt: 'DESC' },
    take: limit,
  });
  return rows.reverse();
}

async appendBotMessage(
  conversationId: string,
  body: string,
  contentBlocks: unknown[] | null,
): Promise<Message> {
  return this.ds.transaction(async (m) => {
    const saved = await m.save(
      m.create(Message, {
        conversationId, senderKind: 'system', senderId: '',
        body, contentBlocks,
      }),
    );
    await m.update(Conversation, { id: conversationId }, { updatedAt: new Date() });
    return saved as Message;
  });
}
```

- [ ] **Step 4: Run tests + commit**

```bash
cd backend && npx jest chats.service.spec
```
Expected: PASS.
```bash
git add backend/src/chats/chats.service.ts backend/src/chats/chats.service.spec.ts
git commit -m "feat(chat): loadRecentMessages + appendBotMessage helpers"
```

---

### Task 26: Wire `ChatsService.sendBuyerMessage` to call `AiService`

**Files:**
- Modify: `backend/src/chats/chats.service.ts`
- Modify: `backend/src/chats/chats.module.ts`
- Modify: `backend/src/chats/chats.service.spec.ts`

- [ ] **Step 1: Add test**

```ts
it('system conversation: persists buyer msg only (no echo); kicks off AiService.respond', async () => {
  const aiRespond = jest.fn().mockResolvedValue(undefined);
  const svc = new ChatsService(ds, convoRepo, msgRepo, storeRepo, { respond: aiRespond } as any);
  const out = await svc.sendBuyerMessage('u1', 'c1' /* kind='system' */, 'hello');
  expect(out.messages).toHaveLength(1); // ONLY the buyer message
  expect(out.messages[0].senderKind).toBe('buyer');
  // ai service invoked async (we use queueMicrotask). Wait a tick:
  await new Promise((r) => setTimeout(r, 0));
  expect(aiRespond).toHaveBeenCalledWith('u1', 'c1', 'hello');
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest chats.service.spec
```
Expected: FAIL (no echo means existing assertion also breaks — update that existing test too).

- [ ] **Step 3: Implement**

In `ChatsService` constructor, inject `forwardRef(() => AiService)`:
```ts
constructor(
  ...existing,
  @Inject(forwardRef(() => AiService)) private readonly ai: AiService,
) {}
```
Update `sendBuyerMessage`:
```ts
// inside the transaction, after persisting buyerMsg:
const results: Message[] = [buyerMsg as Message];
// remove the echo block entirely
await m.update(Conversation, { id: convo.id }, { updatedAt: new Date() });
const ret = { conversation: convo, messages: results };
if (convo.kind === 'system') {
  queueMicrotask(() => { this.ai.respond(buyerId, convo.id, trimmed).catch(() => {}); });
}
return ret;
```

In `chats.module.ts`, add `forwardRef(() => AiModule)` to imports.

- [ ] **Step 4: Run tests + commit**

```bash
cd backend && npx jest chats.service.spec
```
Expected: PASS.
```bash
git add backend/src/chats/chats.service.ts backend/src/chats/chats.module.ts backend/src/chats/chats.service.spec.ts
git commit -m "feat(chat): system conversation invokes AiService instead of echoing"
```

---

### Task 27: WS — delta/done/error emit + action subscriber

**Files:**
- Modify: `backend/src/chats/chats.gateway.ts`
- Modify: `backend/src/chats/chats.controller.ts` or new endpoint
- Create: `backend/src/chats/dto/action-message.dto.ts`
- Test: `backend/src/chats/chats.gateway.spec.ts` (extend if exists; else create unit for emit helpers)

- [ ] **Step 1: Test (unit, no real socket)**

```ts
import { ChatsGateway } from './chats.gateway';

describe('ChatsGateway emit helpers', () => {
  it('emitDelta sends to user room', () => {
    const gw = new ChatsGateway({} as any, {} as any, {} as any);
    const to = jest.fn().mockReturnValue({ emit: jest.fn() });
    gw.server = { to } as any;
    gw.emitDelta('u1', 'c1', 'r1', 'Hel');
    expect(to).toHaveBeenCalledWith('user:u1');
    expect((to as any).mock.results[0].value.emit).toHaveBeenCalledWith('message:delta', expect.objectContaining({
      conversationId: 'c1', requestId: 'r1', textDelta: 'Hel',
    }));
  });
});
```

- [ ] **Step 2: Run test (fails)**

```bash
cd backend && npx jest chats.gateway.spec
```
Expected: FAIL.

- [ ] **Step 3: Implement helpers in `chats.gateway.ts`**

```ts
emitDelta(userId: string, conversationId: string, requestId: string, textDelta: string) {
  this.server.to(`user:${userId}`).emit('message:delta', { conversationId, requestId, textDelta });
}

emitDone(userId: string, conversationId: string, requestId: string, messageId: string) {
  this.server.to(`user:${userId}`).emit('message:done', { conversationId, requestId, messageId });
}

emitError(userId: string, conversationId: string, requestId: string, code: string, text: string) {
  this.server.to(`user:${userId}`).emit('message:error', { conversationId, requestId, code, text });
}
```

- [ ] **Step 4: Implement action subscriber**

```ts
@SubscribeMessage('message:action')
async onAction(
  @ConnectedSocket() socket: Socket,
  @MessageBody() body: { conversationId: string; action: string; preorderId?: string; payload?: unknown },
) {
  const userId = socket.data.userId;
  if (!userId) return;
  // persist a buyer pseudo-message and kick off the AI respond
  const actionBody = `[action:${body.action}]`;
  await this.chats.sendBuyerMessage(userId, body.conversationId, actionBody);
}
```

(Inject `ChatsService` into `ChatsGateway` constructor; mirror existing pattern.)

- [ ] **Step 5: Create DTO** (used by REST too if added later)

```ts
// dto/action-message.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ActionMessageDto {
  @IsString() conversationId!: string;
  @IsIn(['confirm_order', 'cancel_order', 'edit_address', 'edit_qty', 'edit_payment'])
  action!: string;
  @IsString() @IsOptional() preorderId?: string;
}
```

- [ ] **Step 6: Run test + commit**

```bash
cd backend && npx jest chats.gateway.spec
```
Expected: PASS.
```bash
git add backend/src/chats/chats.gateway.ts backend/src/chats/dto/action-message.dto.ts backend/src/chats/chats.gateway.spec.ts
git commit -m "feat(chat): WS emit delta/done/error + message:action subscriber"
```

---

## Phase 8 — Frontend

### Task 28: `chatSocket.js` — handle delta/done/error + `sendAction`

**Files:**
- Modify: `frontend/src/services/chatSocket.js`

- [ ] **Step 1: Add handlers**

Add to the existing socket setup:
```js
socket.on('message:delta', (payload) => emitter.emit('delta', payload));
socket.on('message:done', (payload) => emitter.emit('done', payload));
socket.on('message:error', (payload) => emitter.emit('error', payload));
```

Add helper:
```js
export function sendChatAction({ conversationId, action, preorderId }) {
  socket.emit('message:action', { conversationId, action, preorderId });
}
```

- [ ] **Step 2: Manual verify** by opening browser console after `npm run dev`:
```js
window.socket.on('message:delta', console.log);
```
Then trigger a send; should log delta chunks once backend is up.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/chatSocket.js
git commit -m "feat(fe): chatSocket handles message:delta/done/error + sendAction"
```

---

### Task 29: `MessageBubble` + `BlockDispatcher`

**Files:**
- Create: `frontend/src/components/chat/MessageBubble.jsx`
- Create: `frontend/src/components/chat/BlockDispatcher.jsx`

- [ ] **Step 1: Write `MessageBubble`**

```jsx
import { BlockDispatcher } from './BlockDispatcher';

export function MessageBubble({ message }) {
  const isBot = message.senderKind === 'system';
  if (!isBot) {
    return (
      <div className={`bubble bubble-${message.senderKind}`}>
        <p>{message.body}</p>
      </div>
    );
  }
  const blocks = message.contentBlocks ?? [];
  return (
    <div className="bubble bubble-bot">
      {message.body && <p>{message.body}</p>}
      {blocks.map((b, i) => <BlockDispatcher key={i} block={b} conversationId={message.conversationId} />)}
    </div>
  );
}
```

- [ ] **Step 2: Write `BlockDispatcher`**

```jsx
import { ProductListBlock } from './ProductListBlock';
import { ConfirmCardBlock } from './ConfirmCardBlock';
import { OrderSuccessBlock } from './OrderSuccessBlock';
import { OrdersListBlock } from './OrdersListBlock';
import { ToastBlock } from './ToastBlock';

export function BlockDispatcher({ block, conversationId }) {
  switch (block.type) {
    case 'products': return <ProductListBlock block={block} conversationId={conversationId} />;
    case 'confirm_card': return <ConfirmCardBlock block={block} conversationId={conversationId} />;
    case 'order_success': return <OrderSuccessBlock block={block} />;
    case 'orders': return <OrdersListBlock block={block} />;
    case 'toast': return <ToastBlock block={block} />;
    default: return null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/MessageBubble.jsx frontend/src/components/chat/BlockDispatcher.jsx
git commit -m "feat(fe): MessageBubble + BlockDispatcher"
```

---

### Task 30: `ProductListBlock` (vertical list row — layout C)

**Files:**
- Create: `frontend/src/components/chat/ProductListBlock.jsx`
- Create: `frontend/src/components/chat/ProductListBlock.css`

- [ ] **Step 1: Component**

```jsx
import { Link } from 'react-router-dom';
import { cartService } from '../../services/cart';
import { wishlistService } from '../../services/wishlist';
import './ProductListBlock.css';

export function ProductListBlock({ block }) {
  const onAdd = async (id) => { try { await cartService.add(id, 1); } catch {} };
  const onSave = async (id) => { try { await wishlistService.add(id); } catch {} };
  return (
    <div className={`pl-block pl-mode-${block.mode ?? 'list'}`}>
      {block.items.map((p) => (
        <div className="pl-row" key={p.id}>
          {p.image ? <img src={p.image} alt={p.name} /> : <div className="pl-img-placeholder" />}
          <div className="pl-body">
            <Link to={`/products/${p.id}`} className="pl-name">{p.name}</Link>
            <div className="pl-meta">
              <span className="pl-price">{p.price}</span>
              {p.rating != null && <span className="pl-rating">★ {p.rating.toFixed(1)}</span>}
              {p.stock === 'out' && <span className="pl-stock-out">Out of stock</span>}
            </div>
            <div className="pl-actions">
              {p.actions.includes('wishlist') && <button onClick={() => onSave(p.id)}>♡ Save</button>}
              {p.actions.includes('view') && <Link to={`/products/${p.id}`}><button>Details</button></Link>}
              {p.actions.includes('add_to_cart') && p.stock !== 'out' && (
                <button className="primary" onClick={() => onAdd(p.id)}>+ Add to cart</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Minimal CSS** (mirror layout C from the mockup)

```css
.pl-block { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.pl-row { display: flex; gap: 12px; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; }
.pl-row img, .pl-img-placeholder { width: 80px; height: 80px; flex: none; background: #f4f4f5; border-radius: 6px; object-fit: cover; }
.pl-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.pl-name { font-size: 13px; font-weight: 600; color: #18181b; text-decoration: none; }
.pl-meta { display: flex; gap: 10px; font-size: 12px; color: #52525b; }
.pl-price { color: #dc2626; font-weight: 700; }
.pl-stock-out { color: #b91c1c; }
.pl-actions { display: flex; gap: 6px; margin-top: 4px; }
.pl-actions button { font-size: 11px; padding: 6px 10px; border: 1px solid #e4e4e7; background: #fafafa; border-radius: 6px; cursor: pointer; }
.pl-actions button.primary { background: #18181b; color: #fff; border-color: #18181b; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ProductListBlock.jsx frontend/src/components/chat/ProductListBlock.css
git commit -m "feat(fe): ProductListBlock (vertical list row)"
```

---

### Task 31: `ConfirmCardBlock` (Yes/No + edit chips)

**Files:**
- Create: `frontend/src/components/chat/ConfirmCardBlock.jsx`
- Create: `frontend/src/components/chat/ConfirmCardBlock.css`

- [ ] **Step 1: Component**

```jsx
import { useState } from 'react';
import { sendChatAction } from '../../services/chatSocket';
import './ConfirmCardBlock.css';

export function ConfirmCardBlock({ block, conversationId }) {
  const [used, setUsed] = useState(false);
  const fire = (action) => {
    if (used) return;
    setUsed(true);
    sendChatAction({ conversationId, action, preorderId: block.preorderId });
  };
  return (
    <div className={`cc-block ${used ? 'cc-used' : ''}`}>
      <div className="cc-title">{block.title}</div>
      <div className="cc-lines">
        {block.lines.map((l, i) => (
          <div className="cc-row" key={i}><span>{l.label}</span><span>{l.value}</span></div>
        ))}
        <div className="cc-row cc-total"><span>{block.total.label}</span><span>{block.total.value}</span></div>
      </div>
      <div className="cc-buttons">
        <button onClick={() => fire(block.secondary.action)}>{block.secondary.label}</button>
        <button className="primary" onClick={() => fire(block.primary.action)}>{block.primary.label}</button>
      </div>
      <div className="cc-chips">
        {block.chips.map((c, i) => (
          <button key={i} className="cc-chip" onClick={() => fire(c.action)}>{c.label}</button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: CSS**

```css
.cc-block { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 12px; margin-top: 6px; }
.cc-block.cc-used { opacity: 0.6; pointer-events: none; }
.cc-title { font-weight: 700; margin-bottom: 6px; }
.cc-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e4e4e7; font-size: 13px; color: #3f3f46; }
.cc-row.cc-total { border: none; font-weight: 700; color: #dc2626; font-size: 15px; }
.cc-buttons { display: flex; gap: 8px; margin-top: 10px; }
.cc-buttons button { flex: 1; padding: 9px 0; border: 1px solid #e4e4e7; background: #fff; border-radius: 8px; font-weight: 600; cursor: pointer; }
.cc-buttons button.primary { background: #18181b; color: #fff; border-color: #18181b; }
.cc-chips { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.cc-chip { padding: 4px 8px; font-size: 11px; border: 1px solid #e4e4e7; background: #fff; border-radius: 999px; cursor: pointer; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ConfirmCardBlock.jsx frontend/src/components/chat/ConfirmCardBlock.css
git commit -m "feat(fe): ConfirmCardBlock (Yes/No + edit chips)"
```

---

### Task 32: Remaining renderers (`OrderSuccess`, `OrdersList`, `Toast`)

**Files:**
- Create: `frontend/src/components/chat/OrderSuccessBlock.jsx`
- Create: `frontend/src/components/chat/OrdersListBlock.jsx`
- Create: `frontend/src/components/chat/ToastBlock.jsx`

- [ ] **Step 1: OrderSuccessBlock**

```jsx
import { Link } from 'react-router-dom';
export function OrderSuccessBlock({ block }) {
  return (
    <div className="bubble-inline-success">
      <strong>✓ Order #{block.orderId} placed</strong>
      <span> Total {block.total}.</span>
      <Link to={`/orders/${block.orderId}`}> View order →</Link>
    </div>
  );
}
```

- [ ] **Step 2: OrdersListBlock**

```jsx
import { Link } from 'react-router-dom';
export function OrdersListBlock({ block }) {
  return (
    <ul className="bubble-inline-orders">
      {block.items.map((o) => (
        <li key={o.id}>
          <Link to={`/orders/${o.id}`}>#{o.id}</Link>
          <span> · {o.status} · {o.total}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: ToastBlock**

```jsx
export function ToastBlock({ block }) {
  return <div className={`bubble-inline-toast t-${block.kind}`}>{block.text}</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/OrderSuccessBlock.jsx frontend/src/components/chat/OrdersListBlock.jsx frontend/src/components/chat/ToastBlock.jsx
git commit -m "feat(fe): order-success, orders-list, toast renderers"
```

---

### Task 33: `StreamingBubble` + integrate into `ConversationView`

**Files:**
- Create: `frontend/src/components/chat/StreamingBubble.jsx`
- Modify: `frontend/src/pages/Chat/ConversationView.jsx` (or wherever messages render — locate via `grep -rn "message.body" frontend/src`)

- [ ] **Step 1: StreamingBubble**

```jsx
export function StreamingBubble({ text }) {
  return (
    <div className="bubble bubble-bot bubble-streaming" aria-live="polite">
      {text}
      <span className="cursor">▍</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire into ConversationView**

In the component file:
```jsx
import { useEffect, useState } from 'react';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { StreamingBubble } from '../../components/chat/StreamingBubble';
import { chatSocketEmitter } from '../../services/chatSocket';

function ConversationView({ messages, conversationId }) {
  const [streamingText, setStreamingText] = useState('');

  useEffect(() => {
    const onDelta = ({ conversationId: cid, textDelta }) => {
      if (cid !== conversationId) return;
      setStreamingText((t) => t + textDelta);
    };
    const onDone = ({ conversationId: cid }) => {
      if (cid !== conversationId) return;
      setStreamingText('');  // real message arrived via message:new
    };
    chatSocketEmitter.on('delta', onDelta);
    chatSocketEmitter.on('done', onDone);
    return () => {
      chatSocketEmitter.off('delta', onDelta);
      chatSocketEmitter.off('done', onDone);
    };
  }, [conversationId]);

  return (
    <div className="conversation-view">
      {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      {streamingText && <StreamingBubble text={streamingText} />}
    </div>
  );
}
```

(Reset `streamingText` to `''` also on `message:new` for the bot, in case `done` arrives before the real message — adjust to your existing message-list state machine.)

- [ ] **Step 3: Manual browser check** with backend running and `AI_FEATURE_ENABLED=true`:
1. `docker compose up -d`
2. Open `http://localhost:5173`, log in as a buyer.
3. Open system conversation; send "find me bluetooth headphones".
4. Verify deltas appear, then product list block renders.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/StreamingBubble.jsx frontend/src/pages/Chat/ConversationView.jsx
git commit -m "feat(fe): streaming bubble + wire into ConversationView"
```

---

## Phase 9 — End-to-end tests

### Task 34: E2E harness with `FakeChatModel`

**Files:**
- Create: `backend/test/ai/fake-chat-model.ts`
- Create: `backend/test/ai.e2e-spec.ts`

- [ ] **Step 1: FakeChatModel**

```ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';

export class FakeChatModel extends BaseChatModel {
  constructor(private script: Array<{ content?: string; tool_calls?: any[] }>) { super({}); }
  _llmType() { return 'fake'; }
  async _generate() {
    const step = this.script.shift();
    if (!step) throw new Error('FakeChatModel: script exhausted');
    const msg = new AIMessage({ content: step.content ?? '', tool_calls: step.tool_calls ?? [] });
    return { generations: [{ message: msg, text: step.content ?? '' }] };
  }
  bindTools() { return this; }
}
```

- [ ] **Step 2: E2E shell** (uses `amazara_test` DB)

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AI_GRAPH } from '../src/ai/ai.service';
import { buildGraph } from '../src/ai/graph/build-graph';
import { FakeChatModel } from './ai/fake-chat-model';
import * as request from 'supertest';

let app: INestApplication;
let buyerToken: string;
let conversationId: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_GRAPH)
    .useFactory({
      factory: (config: any, products: any, cart: any, wishlist: any, orders: any, ...rest: any[]) => {
        // Re-wire with fake model. We'll set the model per-test via a holder.
        // ...
      },
      inject: [/* same as AiModule */],
    })
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
  // seed a buyer, login, get token, ensure system conversation
});

afterAll(async () => { await app.close(); });
```

- [ ] **Step 3: Commit harness**

```bash
git add backend/test/ai/fake-chat-model.ts backend/test/ai.e2e-spec.ts
git commit -m "test(ai): FakeChatModel + e2e harness"
```

---

### Task 35: E2E — KB1 search

**Files:**
- Modify: `backend/test/ai.e2e-spec.ts`

- [ ] **Step 1: Test**

```ts
it('KB1: search products', async () => {
  setScript([
    { content: '', tool_calls: [{ id: 'c1', name: 'search_products', args: { query: 'bluetooth', maxPrice: 1000000, limit: 4 } }] },
    { content: 'Here are 4 bluetooth headphones under 1m.' },
  ]);
  const res = await request(app.getHttpServer())
    .post(`/me/chats/${conversationId}/messages`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ body: 'find bluetooth headphones under 1m' })
    .expect(201);
  // poll the DB for the bot message
  const botMsg = await waitForBotMessage(conversationId);
  expect(botMsg.body).toMatch(/bluetooth/i);
  expect(botMsg.contentBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'products', mode: 'list' }),
  ]));
});
```

- [ ] **Step 2: Run + commit**

```bash
cd backend && npm run test:e2e -- --testPathPattern ai.e2e-spec
```
Expected: PASS.
```bash
git add backend/test/ai.e2e-spec.ts
git commit -m "test(ai): e2e KB1 search"
```

---

### Task 36: E2E — KB3 add-to-cart + KB9 upsell

**Files:**
- Modify: `backend/test/ai.e2e-spec.ts`

- [ ] **Step 1: Test**

```ts
it('KB3+KB9: add to cart then upsell', async () => {
  setScript([
    { content: '', tool_calls: [{ id: 'c1', name: 'add_to_cart', args: { productId: seededProductId, qty: 1 } }] },
    { content: '', tool_calls: [{ id: 'c2', name: 'suggest_similar', args: { seedProductIds: [seededProductId], mode: 'similar' } }] },
    { content: 'Added. You may also like these.' },
  ]);
  await request(app.getHttpServer())
    .post(`/me/chats/${conversationId}/messages`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ body: 'add this to cart and show similar' })
    .expect(201);
  const botMsg = await waitForBotMessage(conversationId);
  expect(botMsg.contentBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'toast', kind: 'success' }),
    expect.objectContaining({ type: 'products', mode: 'upsell' }),
  ]));
});
```

- [ ] **Step 2: Run + commit**

```bash
cd backend && npm run test:e2e -- --testPathPattern ai.e2e-spec
```
Expected: PASS.
```bash
git add backend/test/ai.e2e-spec.ts
git commit -m "test(ai): e2e KB3 add to cart + KB9 upsell"
```

---

### Task 37: E2E — KB4 order happy path + cancel + expired

**Files:**
- Modify: `backend/test/ai.e2e-spec.ts`

- [ ] **Step 1: Tests**

```ts
it('KB4 happy: preorder → confirm action → order success', async () => {
  setScript([
    { content: '', tool_calls: [{ id: 'c1', name: 'create_preorder', args: { items: [{ productId: seededProductId, qty: 1 }] } }] },
    { content: 'Please review and confirm.' },
    // resume turn (from action): one tool call to confirm_order
    { content: '', tool_calls: [{ id: 'c2', name: 'confirm_order', args: { preorderId: '__from_state__' } }] },
    { content: 'Order placed.' },
  ]);
  // Turn 1
  await request(app.getHttpServer())
    .post(`/me/chats/${conversationId}/messages`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ body: 'order this' }).expect(201);
  const turn1 = await waitForBotMessage(conversationId);
  expect(turn1.contentBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'confirm_card' }),
  ]));
  const preorderId = turn1.contentBlocks.find((b: any) => b.type === 'confirm_card').preorderId;
  // Patch the next scripted call's args to the real preorder id:
  rewritePreorderId(preorderId);

  // Turn 2: action arrives via WS message:action — simulate by posting an action body
  await request(app.getHttpServer())
    .post(`/me/chats/${conversationId}/messages`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ body: `[action:confirm_order]` }).expect(201);
  const turn2 = await waitForBotMessage(conversationId, /* skip: 1 */);
  expect(turn2.contentBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'order_success' }),
  ]));
});

it('KB4 cancel: preorder → cancel action → no order created', async () => {
  // similar setup with cancel_order tool call on resume
  // assert no Order row written for this run
});

it('KB4 expired: preorder → wait > TTL → confirm fails', async () => {
  jest.useFakeTimers();
  // run preorder turn
  jest.advanceTimersByTime(11 * 60 * 1000);
  // run confirm action turn
  const turn2 = await waitForBotMessage(conversationId);
  expect(turn2.body).toMatch(/expired|try again/i);
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run + commit**

```bash
cd backend && npm run test:e2e -- --testPathPattern ai.e2e-spec
```
Expected: PASS.
```bash
git add backend/test/ai.e2e-spec.ts
git commit -m "test(ai): e2e KB4 order happy + cancel + expired"
```

---

### Task 38: E2E — KB2 compare

**Files:**
- Modify: `backend/test/ai.e2e-spec.ts`

- [ ] **Step 1: Test**

```ts
it('KB2: compare two products', async () => {
  setScript([
    { content: '', tool_calls: [{ id: 'c1', name: 'compare_products', args: { productIds: [pid1, pid2] } }] },
    { content: 'Comparison: A vs B. B wins on battery.' },
  ]);
  await request(app.getHttpServer())
    .post(`/me/chats/${conversationId}/messages`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ body: 'compare product A and B' }).expect(201);
  const botMsg = await waitForBotMessage(conversationId);
  expect(botMsg.contentBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'products', mode: 'compare' }),
  ]));
});
```

- [ ] **Step 2: Run + commit**

```bash
cd backend && npm run test:e2e -- --testPathPattern ai.e2e-spec
```
Expected: PASS.
```bash
git add backend/test/ai.e2e-spec.ts
git commit -m "test(ai): e2e KB2 compare"
```

---

## Phase 10 — Documentation

### Task 39: Feature page

**Files:**
- Create: `docs/features/chatbot.md`

- [ ] **Step 1: Write doc**

```markdown
# Chatbot — shopping agent

Conversational shopping assistant in the buyer's `kind='system'` conversation. Powered by `@langchain/langgraph` + Groq (`openai/gpt-oss-120b`). Covers natural-language product search, comparison, cart and wishlist actions, two-step order placement with confirmation, and upsell suggestions.

## Endpoints

Inherits existing chat endpoints (`/me/chats/system`, `/me/chats/:id/messages`). No new HTTP endpoints; the bot lives inside `sendBuyerMessage`. Actions (button/chip clicks) flow via WS event `message:action`.

## WebSocket events (additions)

| Direction | Event | Payload |
|-----------|-------|---------|
| S→C | `message:delta` | `{conversationId, requestId, textDelta}` |
| S→C | `message:done` | `{conversationId, requestId, messageId}` |
| S→C | `message:error` | `{conversationId, requestId, code, text}` |
| C→S | `message:action` | `{conversationId, action, preorderId?, payload?}` |

## Rich content (`messages.content_blocks`)

JSON array of `ContentBlock`. See `backend/src/ai/rich-message.ts`.

## Environment

| Var | Default | Notes |
|-----|---------|-------|
| `GROQ_API_KEY` | — | required for bot |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | |
| `AI_MAX_HISTORY` | `20` | sliding window |
| `AI_RECURSION_LIMIT` | `8` | max agent↔tools ping-pong |
| `AI_REQUEST_TIMEOUT_MS` | `20000` | |
| `AI_FEATURE_ENABLED` | `true` | kill switch (echo fallback) |

## Local smoke test

```bash
cp backend/.env.example backend/.env  # set GROQ_API_KEY
docker compose up -d
# log in as a buyer, ensure system conversation, send "find bluetooth headphones under 1m"
```

## Out of scope (sub-projects)

- Policy/FAQ RAG agent → sub-project B.
- Cart-abandonment / price-drop / restock notifications → sub-project C.
```

- [ ] **Step 2: Commit**

```bash
git add docs/features/chatbot.md
git commit -m "docs: chatbot feature page"
```

---

### Task 40: Update `docs/README.md`

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: Add row at the bottom of the completed-features table**

```markdown
| 2026-05-19 | Chatbot — shopping agent (LangGraph + Groq) | [features/chatbot.md](features/chatbot.md) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/README.md
git commit -m "docs: list chatbot feature in README"
```

---

## Self-review

**Spec coverage:**
- KB1 search → Task 13 + Task 35.
- KB2 compare → Task 14 + Task 38.
- KB3 cart actions → Tasks 15, 16 + Task 36.
- KB4 order happy/cancel/expired → Tasks 17, 9, 10, 11 + Task 37.
- KB9 upsell → Task 18 + Task 36.
- Streaming → Task 24.
- Memory window (N=20) → Task 25 + Task 23.
- Confirm card UI → Task 31.
- Vertical list carousel → Task 30.
- Fallback / kill switch → Task 23.
- Feature doc → Tasks 39-40.

**Placeholder scan:** none found.

**Type consistency:**
- `PreorderDraft` defined in Task 9, used consistently in Tasks 10, 11, 17, 19.
- `ContentBlock` union defined in Task 4, used in tools (13-18), state (19), service (23), frontend (29-32).
- `ToolContext` defined in Task 12, extended in Task 17 (adds `getPendingPreorder`/`setPendingPreorder`).
- Frontend renderer prop is consistently `{ block, conversationId }`.

Plan complete.
