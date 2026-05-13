import request from 'supertest';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

async function registerBuyer(server: any, email: string): Promise<string> {
  const res = await request(server)
    .post('/auth/register')
    .send({ email, password: 'pass1234pass', fullName: 'B', role: 'buyer' });
  return res.body.accessToken;
}

const body = {
  label: 'Home', recipientName: 'B', phone: '+1',
  line1: '1 St', city: 'SF', region: 'CA', postalCode: '94000', country: 'US',
};

describe('Addresses (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.app.close(); });
  beforeEach(async () => { await resetDatabase(ctx.dataSource); });

  it('first address becomes default', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'a@a.local');
    const res = await request(ctx.app.getHttpServer())
      .post('/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
  });

  it('setting a new default unsets others', async () => {
    const token = await registerBuyer(ctx.app.getHttpServer(), 'b@a.local');
    const a = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${token}`).send(body);
    const b = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${token}`).send({ ...body, label: 'Office', isDefault: true });
    const list = await request(ctx.app.getHttpServer())
      .get('/me/addresses').set('Authorization', `Bearer ${token}`);
    const defaults = list.body.items.filter((x: any) => x.isDefault).map((x: any) => x.id);
    expect(defaults).toEqual([b.body.address.id]);
    expect(list.body.items.find((x: any) => x.id === a.body.address.id).isDefault).toBe(false);
  });

  it('other user cannot update', async () => {
    const t1 = await registerBuyer(ctx.app.getHttpServer(), 'c@a.local');
    const t2 = await registerBuyer(ctx.app.getHttpServer(), 'd@a.local');
    const a = await request(ctx.app.getHttpServer())
      .post('/me/addresses').set('Authorization', `Bearer ${t1}`).send(body);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/me/addresses/${a.body.address.id}`)
      .set('Authorization', `Bearer ${t2}`)
      .send({ label: 'x' });
    expect(res.status).toBe(403);
  });
});
