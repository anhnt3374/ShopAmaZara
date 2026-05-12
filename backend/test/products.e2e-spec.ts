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
