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
  const addrRes = await request(server)
    .post('/me/addresses')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      label: 'Home', recipientName: 'B', phone: '+1',
      line1: '1 St', city: 'SF', region: 'CA', postalCode: '94000', country: 'US',
    });
  await request(server)
    .post('/me/cart')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ productId, quantity: 1 });
  const checkout = await request(server)
    .post('/orders/checkout')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      productIds: [productId],
      addressId: addrRes.body.address.id,
      shippingMethod: 'Standard',
      payment: { method: 'card', cardLast4: '4242' },
    });
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
