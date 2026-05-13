import request from 'supertest';
import { createTestApp, resetDatabase, TestContext } from './setup-e2e';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
  });

  const validBody = {
    email: 'jane@example.com',
    password: 'hunter2hunter2',
    fullName: 'Jane Doe',
    role: 'buyer' as const,
  };

  describe('POST /auth/register', () => {
    it('creates a user and returns an accessToken', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        role: 'buyer',
      });
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('normalizes email (lowercase + trim) before storing', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: '  JANE@Example.com  ' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('jane@example.com');
    });

    it('returns 409 when email is already registered', async () => {
      await request(ctx.app.getHttpServer()).post('/auth/register').send(validBody);
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send(validBody);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already/i);
    });

    it.each([
      ['missing email', { ...validBody, email: undefined }],
      ['invalid email', { ...validBody, email: 'not-an-email' }],
      ['short password', { ...validBody, password: 'short' }],
      ['empty fullName', { ...validBody, fullName: '   ' }],
      ['invalid role', { ...validBody, role: 'admin' }],
      ['extra field', { ...validBody, isAdmin: true }],
    ])('returns 400 for %s', async (_name, body) => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send(body);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(ctx.app.getHttpServer()).post('/auth/register').send(validBody);
    });

    it('returns user + accessToken on valid credentials', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email, password: validBody.password });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        email: validBody.email,
        fullName: validBody.fullName,
        role: validBody.role,
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('accepts email regardless of case / whitespace', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: '  JANE@Example.com ', password: validBody.password });
      expect(res.status).toBe(200);
    });

    it('returns 401 on wrong password', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email, password: 'wrongpassword1' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns 401 on unknown email with the same generic message', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: validBody.password });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns 400 on invalid body', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'short' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    let token: string;
    let userId: string;

    beforeEach(async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send(validBody);
      token = res.body.accessToken;
      userId = res.body.user.id;
    });

    it('returns the authenticated user when token is valid', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: userId,
        email: validBody.email,
        fullName: validBody.fullName,
        role: validBody.role,
      });
    });

    it('returns 401 when no token is provided', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is malformed', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });
  });
});
