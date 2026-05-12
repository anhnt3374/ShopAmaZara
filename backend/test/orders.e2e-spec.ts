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
