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
      .expect(204);
    const list = await request(ctx.app.getHttpServer())
      .get('/me/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toEqual([]);
  });
});
