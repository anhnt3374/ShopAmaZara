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
const PASSWORD = 'password123';

async function seed(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const products = ds.getRepository(Product);
  const orders = ds.getRepository(Order);
  const orderItems = ds.getRepository(OrderItem);

  const hash = await bcrypt.hash(PASSWORD, 4);
  const seller = await users.save(users.create({ email: 'seller-rev@test.local', passwordHash: hash, fullName: 'Seller', role: 'seller' }));
  const buyerA = await users.save(users.create({ email: 'a-rev@test.local', passwordHash: hash, fullName: 'Buyer A', role: 'buyer' }));
  const buyerB = await users.save(users.create({ email: 'b-rev@test.local', passwordHash: hash, fullName: 'Buyer B', role: 'buyer' }));

  await stores.save(stores.create({ id: STORE_ID, name: 'S', slug: 's-rev', ownerId: seller.id }));
  await products.save(products.create({ id: PRODUCT_A_ID, name: 'A', brand: 'B', category: 'C', storeId: STORE_ID, price: '10.00', discount: 0, stock: 5, imageFirst: 'https://x/i.png' }));
  await products.save(products.create({ id: PRODUCT_B_ID, name: 'B', brand: 'B', category: 'C', storeId: STORE_ID, price: '10.00', discount: 0, stock: 5, imageFirst: 'https://x/i.png' }));

  const order = await orders.save(orders.create({
    buyerId: buyerA.id,
    subtotal: '10.00',
    total: '10.00',
    status: 'Delivered',
  }));
  await orderItems.save(orderItems.create({
    orderId: order.id,
    productId: PRODUCT_A_ID,
    storeId: STORE_ID,
    nameSnapshot: 'A',
    priceSnapshot: '10.00',
    quantity: 1,
  }));

  return { buyerA, buyerB };
}

async function login(app: any, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
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
    tokenA = await login(ctx.app, 'a-rev@test.local');
    tokenB = await login(ctx.app, 'b-rev@test.local');
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
