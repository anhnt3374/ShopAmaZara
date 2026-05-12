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
