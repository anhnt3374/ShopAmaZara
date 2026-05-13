import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Store } from '../src/stores/store.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

const storeId = '11111111-1111-1111-1111-111111111111';

async function seedStore(ds: DataSource) {
  const users = ds.getRepository(User);
  const stores = ds.getRepository(Store);
  const seller = await users.save(
    users.create({
      email: 'chat-seller@a.local',
      passwordHash: await bcrypt.hash('seller123', 12),
      fullName: 'Seller',
      role: 'seller',
    }),
  );
  await stores.save(stores.create({ id: storeId, name: 'S', slug: 's', ownerId: seller.id }));
}

async function registerBuyer(server: any, email: string): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({ email, password: 'pass1234pass', fullName: 'B', role: 'buyer' });
  return res.body.accessToken;
}

async function loginSeller(server: any): Promise<string> {
  const res = await request(server)
    .post('/auth/login')
    .send({ email: 'chat-seller@a.local', password: 'seller123' });
  return res.body.accessToken;
}

describe('Chats (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    await seedStore(ctx.dataSource);
  });

  it('system chat echoes the buyer message', async () => {
    const t = await registerBuyer(ctx.app.getHttpServer(), 'a@a.local');
    const open = await request(ctx.app.getHttpServer())
      .post('/me/chats/system')
      .set('Authorization', `Bearer ${t}`);
    expect(open.status).toBe(201);
    const id = open.body.conversation.id;
    await request(ctx.app.getHttpServer())
      .post(`/me/chats/${id}/messages`)
      .set('Authorization', `Bearer ${t}`)
      .send({ body: 'hello' })
      .expect(201);
    const list = await request(ctx.app.getHttpServer())
      .get(`/me/chats/${id}/messages`)
      .set('Authorization', `Bearer ${t}`);
    expect(list.body.items.length).toBe(2);
    expect(list.body.items[0].senderKind).toBe('buyer');
    expect(list.body.items[1].senderKind).toBe('system');
    expect(list.body.items[1].body).toContain('hello');
  });

  it('store chat round-trip and isolation', async () => {
    const tA = await registerBuyer(ctx.app.getHttpServer(), 'aa@a.local');
    const tB = await registerBuyer(ctx.app.getHttpServer(), 'bb@a.local');
    const tSeller = await loginSeller(ctx.app.getHttpServer());

    const open = await request(ctx.app.getHttpServer())
      .post(`/me/chats/store/${storeId}`)
      .set('Authorization', `Bearer ${tA}`)
      .expect(201);
    const id = open.body.conversation.id;

    await request(ctx.app.getHttpServer())
      .post(`/me/chats/${id}/messages`)
      .set('Authorization', `Bearer ${tA}`)
      .send({ body: 'hi store' })
      .expect(201);

    const sellerList = await request(ctx.app.getHttpServer())
      .get('/store/chats')
      .set('Authorization', `Bearer ${tSeller}`);
    expect(sellerList.body.items.length).toBe(1);
    expect(sellerList.body.items[0].id).toBe(id);

    await request(ctx.app.getHttpServer())
      .post(`/store/chats/${id}/messages`)
      .set('Authorization', `Bearer ${tSeller}`)
      .send({ body: 'hello buyer' })
      .expect(201);

    const buyerView = await request(ctx.app.getHttpServer())
      .get(`/me/chats/${id}/messages`)
      .set('Authorization', `Bearer ${tA}`);
    expect(buyerView.body.items.length).toBe(2);

    const forbidden = await request(ctx.app.getHttpServer())
      .get(`/me/chats/${id}/messages`)
      .set('Authorization', `Bearer ${tB}`);
    expect(forbidden.status).toBe(403);
  });

  it('ensureSystem and ensureStore are idempotent', async () => {
    const t = await registerBuyer(ctx.app.getHttpServer(), 'i@a.local');
    const a = await request(ctx.app.getHttpServer())
      .post('/me/chats/system')
      .set('Authorization', `Bearer ${t}`);
    const b = await request(ctx.app.getHttpServer())
      .post('/me/chats/system')
      .set('Authorization', `Bearer ${t}`);
    expect(a.body.conversation.id).toBe(b.body.conversation.id);

    const c = await request(ctx.app.getHttpServer())
      .post(`/me/chats/store/${storeId}`)
      .set('Authorization', `Bearer ${t}`);
    const d = await request(ctx.app.getHttpServer())
      .post(`/me/chats/store/${storeId}`)
      .set('Authorization', `Bearer ${t}`);
    expect(c.body.conversation.id).toBe(d.body.conversation.id);
  });

  it('read endpoint updates buyer_last_read_at', async () => {
    const t = await registerBuyer(ctx.app.getHttpServer(), 'r@a.local');
    const open = await request(ctx.app.getHttpServer())
      .post('/me/chats/system')
      .set('Authorization', `Bearer ${t}`);
    const id = open.body.conversation.id;
    const res = await request(ctx.app.getHttpServer())
      .patch(`/me/chats/${id}/read`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.at).toBeDefined();
  });
});
