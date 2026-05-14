import request from 'supertest';
import * as bcrypt from 'bcrypt';
import * as path from 'node:path';
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

  describe('bulk import', () => {
    it('imports 3 rows', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/store/products/bulk')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', path.join(__dirname, 'fixtures/products-sample.csv'));
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(3);
      expect(res.body.skippedRows).toEqual([]);
    });

    it('skips duplicate SKU within upload', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/store/products/bulk')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', path.join(__dirname, 'fixtures/products-with-duplicate.csv'));
      expect(res.body.created).toBe(1);
      expect(res.body.skippedRows).toEqual([{ row: 2, reason: 'Duplicate SKU' }]);
    });

    it('skips invalid price', async () => {
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
      const created = await request(ctx.app.getHttpServer())
        .post('/store/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Hidden',
          brand: 'B',
          category: 'C',
          price: 10,
          stock: 5,
          imageFirst: '/static/products/x.png',
          isPublished: false,
        });
      expect(created.status).toBe(201);
      const productId = created.body.product.id;

      const publicList = await request(ctx.app.getHttpServer()).get('/products');
      expect(publicList.body.items.find((p: any) => p.id === productId)).toBeUndefined();

      const publicDetail = await request(ctx.app.getHttpServer()).get(`/products/${productId}`);
      expect(publicDetail.status).toBe(404);
    });
  });

  describe('upload', () => {
    it('accepts PNG, returns /static URL', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/uploads/product-image')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', path.join(__dirname, 'fixtures/sample.png'));
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/static\/products\/.+\.png$/);
    });
  });
});
