# Auth (register / login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship email/password registration + login for AmaZara with bcrypt-hashed passwords, JWT auth, MySQL persistence in Docker, and the existing React `AuthPage.jsx` wired up to the new backend.

**Architecture:** NestJS HTTP server in `backend/` exposes `POST /auth/register`, `POST /auth/login`, `GET /auth/me`. TypeORM persists `users` to MySQL 8.0 (run via `docker compose`). Frontend gets a `services/auth.js` + an `AuthContext` that stores `{ user, accessToken }` in `localStorage`, and `api.js` auto-injects `Authorization: Bearer <token>`. Tests use Jest e2e against a separate `amazara_test` MySQL schema created by the compose init script.

**Tech Stack:** NestJS 10, TypeORM 0.3, MySQL 8.0, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`, `class-validator`/`class-transformer`, Jest + supertest. Frontend uses the existing React 18 + Vite 5 stack.

**Spec:** `docs/superpowers/specs/2026-05-12-auth-design.md`.

**Working directory:** All paths below are relative to `/home/anhnt2112/Documents/temp/amazara/` unless stated otherwise.

---

## File Map

**Created:**

- `.gitignore` (repo root)
- `CLAUDE.md` (repo root)
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- `backend/nest-cli.json`
- `backend/.env.example`
- `backend/.env` (local only — git-ignored)
- `backend/.gitignore`
- `backend/.dockerignore`
- `backend/Dockerfile`
- `backend/docker-compose.yml`
- `backend/docker/init.sql`
- `backend/README.md`
- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/app.controller.ts`
- `backend/src/users/user.entity.ts`
- `backend/src/users/users.module.ts`
- `backend/src/users/users.service.ts`
- `backend/src/users/users.service.spec.ts`
- `backend/src/auth/dto/register.dto.ts`
- `backend/src/auth/dto/login.dto.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/jwt.strategy.ts`
- `backend/src/auth/jwt-auth.guard.ts`
- `backend/test/auth.e2e-spec.ts`
- `backend/test/health.e2e-spec.ts`
- `backend/test/jest-e2e.json`
- `backend/test/setup-e2e.ts`
- `frontend/src/services/auth.js`
- `frontend/src/context/AuthContext.jsx`
- `docs/README.md`
- `docs/features/auth.md`

**Modified:**

- `frontend/.env.example` — add `VITE_API_BASE_URL` default.
- `frontend/src/services/api.js` — inject `Authorization` header, clear stored auth on 401.
- `frontend/src/main.jsx` — wrap router with `AuthProvider`.
- `frontend/src/pages/AuthPage.jsx` — replace mock submit with real API calls.

---

## Task 1: Initialize git repository

The working directory is not yet a git repo. We need one for the "commit per task" loop.

**Files:**
- Create: `.gitignore` (repo root)

- [ ] **Step 1: Initialize git in the repo root**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git init -b main
```
Expected: `Initialized empty Git repository in .../amazara/.git/`.

- [ ] **Step 2: Create repo-root `.gitignore`**

Write `/home/anhnt2112/Documents/temp/amazara/.gitignore`:
```
# Dependencies
node_modules/

# Build outputs
dist/
build/

# Env files (keep .env.example tracked)
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Editor
.idea/
.vscode/

# Local Claude settings
.claude/settings.local.json
```

- [ ] **Step 3: Initial commit of existing tree**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git add -A && git status
```
Inspect: confirm `frontend/node_modules` / `frontend/dist` are NOT staged (they should be ignored by the new root `.gitignore` plus frontend's own `.gitignore`). If they slipped in, fix `.gitignore` and re-stage.

Then:
```bash
git commit -m "chore: initialize repo with existing frontend"
```
Expected: a single commit on `main` containing `frontend/` + `.gitignore`.

---

## Task 2: Scaffold the NestJS backend

Create a minimal NestJS app that boots on port 3000 and answers `GET /health` with `{ "status": "ok" }`. No DB yet — we just want a runnable shell to commit and build on.

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/tsconfig.build.json`, `backend/nest-cli.json`, `backend/.gitignore`, `backend/.env.example`, `backend/.env`, `backend/README.md`, `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/src/app.controller.ts`

- [ ] **Step 1: Create `backend/` directory and write `backend/package.json`**

```json
{
  "name": "amazara-backend",
  "version": "0.1.0",
  "private": true,
  "description": "AmaZara backend (NestJS + MySQL).",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^3.2.3",
    "@nestjs/core": "^10.4.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/typeorm": "^10.0.2",
    "bcrypt": "^5.1.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "mysql2": "^3.11.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/schematics": "^10.1.4",
    "@nestjs/testing": "^10.4.0",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.16.5",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.4"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Write `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 3: Write `backend/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 4: Write `backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: Write `backend/.gitignore`**

```
node_modules/
dist/
.env
.env.local
coverage/
*.log
```

- [ ] **Step 6: Write `backend/.env.example`**

```
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173

DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_USER=amazara
DATABASE_PASSWORD=amazara
DATABASE_NAME=amazara

# Docker compose only
MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=amazara
MYSQL_USER=amazara
MYSQL_PASSWORD=amazara
MYSQL_PORT=3306

JWT_SECRET=change-me-in-prod-please-rotate
JWT_EXPIRES_IN=7d

# E2E test database
TEST_DATABASE_NAME=amazara_test
```

- [ ] **Step 7: Copy `.env.example` to `.env`**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && cp .env.example .env
```

- [ ] **Step 8: Write `backend/src/main.ts`**

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({ origin, credentials: false });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
}

bootstrap();
```

- [ ] **Step 9: Write `backend/src/app.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 10: Write `backend/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 11: Write `backend/README.md`**

```markdown
# AmaZara Backend

NestJS + TypeORM + MySQL. See `docs/superpowers/specs/2026-05-12-auth-design.md` for the auth feature design.

## Local dev

```bash
cp .env.example .env
docker compose up -d mysql        # MySQL 8.0 on :3306, also creates amazara_test schema
npm install
npm run start:dev                 # http://localhost:3000
```

Health probe: `curl http://localhost:3000/health`.

## Tests

```bash
npm test                          # unit tests
docker compose up -d mysql        # required for e2e
npm run test:e2e                  # hits amazara_test schema
```
```

- [ ] **Step 12: Install dependencies**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm install
```
Expected: `node_modules/` created, no fatal errors (warnings are fine).

- [ ] **Step 13: Boot the server**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run start:dev
```
Leave it running in one terminal. Expected: `Backend listening on http://localhost:3000`.

In another terminal:
```bash
curl -s http://localhost:3000/health
```
Expected output (exact): `{"status":"ok"}`.

Stop the dev server (`Ctrl+C`) once verified.

- [ ] **Step 14: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/ && git commit -m "feat(backend): scaffold NestJS app with health endpoint"
```

---

## Task 3: Run MySQL via docker-compose with dev + test schemas

**Files:**
- Create: `backend/docker-compose.yml`, `backend/docker/init.sql`

- [ ] **Step 1: Write `backend/docker/init.sql`**

```sql
-- Runs once on first MySQL container start (mounted into /docker-entrypoint-initdb.d).
-- Creates an extra schema for e2e tests and grants the application user access to it.
CREATE DATABASE IF NOT EXISTS `amazara_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `amazara_test`.* TO 'amazara'@'%';
FLUSH PRIVILEGES;
```

- [ ] **Step 2: Write `backend/docker-compose.yml`**

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: amazara-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    ports:
      - "${MYSQL_PORT:-3306}:3306"
    volumes:
      - amazara_mysql_data:/var/lib/mysql
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  amazara_mysql_data:
```

- [ ] **Step 3: Bring up MySQL**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && docker compose up -d mysql
```
Then wait for the healthcheck:
```bash
docker compose ps
```
Expected: `amazara-mysql` shows `Up ... (healthy)` within ~30s. If still `starting`, re-run until healthy.

- [ ] **Step 4: Verify both schemas exist**

Run:
```bash
docker compose exec mysql mysql -uamazara -pamazara -e "SHOW DATABASES;"
```
Expected output contains both `amazara` and `amazara_test` (alongside `information_schema`).

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/docker-compose.yml backend/docker/init.sql && git commit -m "feat(backend): add MySQL docker-compose with dev + test schemas"
```

---

## Task 4: Add User entity, UsersModule, UsersService (TDD)

**Files:**
- Create: `backend/src/users/user.entity.ts`, `backend/src/users/users.service.ts`, `backend/src/users/users.module.ts`, `backend/src/users/users.service.spec.ts`
- Modify: `backend/src/app.module.ts`

### Step 1: Write the failing UsersService unit test

- [ ] **Write `backend/src/users/users.service.spec.ts`**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

type RepoMock = Partial<Record<keyof Repository<User>, jest.Mock>>;

function makeRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto as User),
    save: jest.fn(),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: RepoMock;

  beforeEach(async () => {
    repo = makeRepoMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('findByEmail', () => {
    it('normalizes the lookup email (lowercase + trim)', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await service.findByEmail('  Jane@Example.COM  ');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
    });
  });

  describe('create', () => {
    it('persists the user with normalized email', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      (repo.save as jest.Mock).mockImplementation((u) => ({ ...u, id: 1 }));

      const created = await service.create({
        email: '  Jane@Example.COM ',
        passwordHash: 'hashed',
        fullName: 'Jane Doe',
        role: 'buyer',
      });

      expect(created.email).toBe('jane@example.com');
      expect(repo.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'hashed',
        fullName: 'Jane Doe',
        role: 'buyer',
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when email already exists', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: 1 } as User);
      await expect(
        service.create({
          email: 'jane@example.com',
          passwordHash: 'hashed',
          fullName: 'Jane Doe',
          role: 'buyer',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
```

### Step 2: Run the test to confirm it fails

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm test -- users.service.spec
```
Expected: FAIL — TypeScript cannot resolve `./users.service` / `./user.entity` (they don't exist yet).

### Step 3: Write `backend/src/users/user.entity.ts`

- [ ] Write:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'buyer' | 'seller';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ type: 'enum', enum: ['buyer', 'seller'], default: 'buyer' })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
```

Note: `id` is typed as `string` because TypeORM returns MySQL `BIGINT` columns as strings by default. The controller layer will pass it through as-is in JSON responses.

### Step 4: Write `backend/src/users/users.service.ts`

- [ ] Write:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: normalizeEmail(email) } });
  }

  async findByEmailWithHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findById(id: string | number): Promise<User | null> {
    return this.users.findOne({ where: { id: String(id) as unknown as User['id'] } });
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const entity = this.users.create({
      email,
      passwordHash: input.passwordHash,
      fullName: input.fullName.trim(),
      role: input.role,
    });
    return this.users.save(entity);
  }
}
```

### Step 5: Write `backend/src/users/users.module.ts`

- [ ] Write:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### Step 6: Wire TypeORM + UsersModule into `app.module.ts`

- [ ] Replace `backend/src/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { User } from './users/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DATABASE_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DATABASE_PORT', '3306')),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD'),
        database: config.get<string>('DATABASE_NAME'),
        entities: [User],
        synchronize: process.env.NODE_ENV !== 'production',
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

### Step 7: Run unit tests — should now pass

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm test -- users.service.spec
```
Expected: 3 tests pass.

### Step 8: Boot the app and confirm schema sync

- [ ] Ensure MySQL is up (`docker compose ps`). Then:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run start:dev
```
Expected: server starts; TypeORM logs the connection. In another terminal:
```bash
docker compose exec mysql mysql -uamazara -pamazara amazara -e "SHOW TABLES; DESCRIBE users;"
```
Expected: `users` table exists with columns `id`, `email`, `password_hash`, `full_name`, `role` (`enum('buyer','seller')`), `created_at`, `updated_at`. Stop the server.

### Step 9: Commit

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/src/ && git commit -m "feat(backend): add User entity + UsersService with email normalization"
```

---

## Task 5: Wire e2e harness against `amazara_test`

Set up Jest e2e config + a shared setup module so each `*.e2e-spec.ts` boots a Nest app pointing at `amazara_test` and truncates `users` between tests.

**Files:**
- Create: `backend/test/jest-e2e.json`, `backend/test/setup-e2e.ts`, `backend/test/health.e2e-spec.ts`

- [ ] **Step 1: Write `backend/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^src/(.*)$": "<rootDir>/../src/$1"
  }
}
```

- [ ] **Step 2: Write `backend/test/setup-e2e.ts`**

```ts
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

process.env.DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? 'amazara_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use';
process.env.NODE_ENV = 'test';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  const dataSource = moduleRef.get(DataSource);
  return { app, dataSource };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

- [ ] **Step 3: Write a smoke e2e test `backend/test/health.e2e-spec.ts`**

```ts
import request from 'supertest';
import { createTestApp, TestContext } from './setup-e2e';

describe('Health (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 4: Run the e2e test**

Ensure MySQL container is up. Then:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e
```
Expected: 1 test passes. The `users` table is created in the `amazara_test` schema by `synchronize: true`.

Verify:
```bash
docker compose exec mysql mysql -uamazara -pamazara amazara_test -e "SHOW TABLES;"
```
Expected: contains `users`.

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/test/ && git commit -m "test(backend): wire e2e harness against amazara_test schema"
```

---

## Task 6: POST /auth/register (TDD)

**Files:**
- Create: `backend/src/auth/dto/register.dto.ts`, `backend/src/auth/dto/login.dto.ts` (login DTO created here so the auth module is complete; consumed in Task 7), `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.module.ts`, `backend/test/auth.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

### Step 1: Write failing e2e tests for register

- [ ] Write `backend/test/auth.e2e-spec.ts`:

```ts
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
});
```

### Step 2: Run the test — should fail

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```
Expected: failures because `/auth/register` returns 404 (route does not exist).

### Step 3: Write the DTOs

- [ ] Write `backend/src/auth/dto/register.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @IsIn(['buyer', 'seller'])
  role!: UserRole;
}
```

- [ ] Write `backend/src/auth/dto/login.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
```

### Step 4: Write `backend/src/auth/auth.service.ts`

- [ ] Write:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: 'buyer' | 'seller';
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
    });
    return this.toAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithHash(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toAuthResponse(user);
  }

  toPublic(user: User): PublicUser {
    return {
      id: String(user.id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  private async toAuthResponse(user: User): Promise<AuthResponse> {
    const publicUser = this.toPublic(user);
    const accessToken = await this.jwt.signAsync({
      sub: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
    });
    return { user: publicUser, accessToken };
  }
}
```

The `login` method is unused in this task — it's compiled but not exercised. The Task 7 e2e tests will drive it.

### Step 5: Write `backend/src/auth/auth.controller.ts` (register endpoint only)

- [ ] Write:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
}
```

### Step 6: Write `backend/src/auth/auth.module.ts`

- [ ] Write:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return {
          secret,
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

### Step 7: Register `AuthModule` in `app.module.ts`

- [ ] Edit `backend/src/app.module.ts`. Add the import line `import { AuthModule } from './auth/auth.module';` and add `AuthModule` to the `imports` array (after `UsersModule`).

### Step 8: Run e2e tests — register suite should pass

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```
Expected: every `POST /auth/register` test passes (login describe doesn't exist yet).

### Step 9: Commit

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/ && git commit -m "feat(backend): implement POST /auth/register with bcrypt + JWT"
```

---

## Task 7: POST /auth/login (TDD)

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`, `backend/test/auth.e2e-spec.ts`

### Step 1: Add failing tests for login

- [ ] In `backend/test/auth.e2e-spec.ts`, append a new `describe('POST /auth/login', ...)` block inside the outer `describe('Auth (e2e)', ...)`:

```ts
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
```

### Step 2: Run e2e — login suite fails

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```
Expected: 4 of the 5 login tests fail with 404 (route does not exist). The validation test may still 404 too.

### Step 3: Add login endpoint to controller

- [ ] Replace `backend/src/auth/auth.controller.ts` with:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
```

### Step 4: Re-run e2e — login suite passes

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```
Expected: all auth tests pass.

### Step 5: Commit

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/ && git commit -m "feat(backend): implement POST /auth/login"
```

---

## Task 8: GET /auth/me with JwtStrategy + JwtAuthGuard (TDD)

**Files:**
- Create: `backend/src/auth/jwt.strategy.ts`, `backend/src/auth/jwt-auth.guard.ts`
- Modify: `backend/src/auth/auth.module.ts`, `backend/src/auth/auth.controller.ts`, `backend/test/auth.e2e-spec.ts`

### Step 1: Add failing tests for /auth/me

- [ ] Append inside `describe('Auth (e2e)', ...)`:

```ts
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
      expect(res.body).toEqual({
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
```

### Step 2: Run e2e — me suite fails

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e -- auth
```
Expected: 3 new failures (404 because `/auth/me` does not exist).

### Step 3: Write `backend/src/auth/jwt.strategy.ts`

- [ ] Write:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { AuthService, PublicUser } from './auth.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: 'buyer' | 'seller';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? '',
    });
  }

  async validate(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return this.auth.toPublic(user);
  }
}
```

### Step 4: Write `backend/src/auth/jwt-auth.guard.ts`

- [ ] Write:

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### Step 5: Register `JwtStrategy` and configure Passport in `auth.module.ts`

- [ ] Replace `backend/src/auth/auth.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return {
          secret,
          signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### Step 6: Add `GET /auth/me` to the controller

- [ ] Replace `backend/src/auth/auth.controller.ts` with:

```ts
import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: PublicUser }): PublicUser {
    return req.user;
  }
}
```

### Step 7: Run e2e — all tests pass

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && npm run test:e2e
```
Expected: every auth + health test passes.

### Step 8: Commit

- [ ] Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/ && git commit -m "feat(backend): add GET /auth/me with JWT guard"
```

---

## Task 9: Backend Dockerfile (production image)

This image is not used by `docker-compose.yml` yet — it's only built to verify it works, so deploying later is one command away.

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`

- [ ] **Step 1: Write `backend/.dockerignore`**

```
node_modules
dist
coverage
.env
.env.*
.git
.gitignore
Dockerfile
docker-compose.yml
docker/
README.md
test
```

- [ ] **Step 2: Write `backend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Build the image**

Run:
```bash
cd /home/anhnt2112/Documents/temp/amazara/backend && docker build -t amazara-backend:dev .
```
Expected: build completes; final image is created.

- [ ] **Step 4: Quick run check (optional, kills itself if no DB)**

Run:
```bash
docker run --rm -e DATABASE_HOST=host.docker.internal -e DATABASE_USER=amazara -e DATABASE_PASSWORD=amazara -e DATABASE_NAME=amazara -e JWT_SECRET=test -p 3001:3000 amazara-backend:dev &
sleep 5
curl -s http://localhost:3001/health || true
docker ps --filter ancestor=amazara-backend:dev -q | xargs -r docker stop
```
Expected: either `{"status":"ok"}` (if `host.docker.internal` resolves) or the container exits because it can't reach MySQL — that's fine; we only needed the image to build.

- [ ] **Step 5: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add backend/Dockerfile backend/.dockerignore && git commit -m "feat(backend): add multi-stage Dockerfile for deploy"
```

---

## Task 10: Frontend — auth service + token injection in `api.js`

**Files:**
- Create: `frontend/src/services/auth.js`
- Modify: `frontend/src/services/api.js`, `frontend/.env.example`

- [ ] **Step 1: Update `frontend/.env.example`**

Replace its content with:
```
# API base URL used by src/services/api.js. Empty => relative requests.
VITE_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 2: Modify `frontend/src/services/api.js`**

Replace the file with:

```js
// Thin fetch wrapper used by feature services. Centralizes base URL,
// JSON handling, error normalization, and auth token injection.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const TOKEN_KEY = 'amazara.auth.token';
const USER_KEY = 'amazara.auth.user';

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function readToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path, { method = 'GET', body, headers, signal } = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const token = readToken();
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
      ...(token ? { Authorization: `Bearer ${token}` } : null),
      ...headers,
    },
    signal,
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();
  const payload = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) clearStoredAuth();
    const message = extractMessage(payload) || res.statusText;
    throw new ApiError(message, { status: res.status, payload });
  }
  return payload;
}

function extractMessage(payload) {
  if (!payload) return null;
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(', ');
  return null;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

export const authStorage = {
  TOKEN_KEY,
  USER_KEY,
  clear: clearStoredAuth,
};
```

- [ ] **Step 3: Create `frontend/src/services/auth.js`**

```js
import { api } from './api.js';

export function register({ email, password, fullName, role }) {
  return api.post('/auth/register', { email, password, fullName, role });
}

export function login({ email, password }) {
  return api.post('/auth/login', { email, password });
}

export function me() {
  return api.get('/auth/me');
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add frontend/.env.example frontend/src/services/ && git commit -m "feat(frontend): add auth service and inject Bearer token in api wrapper"
```

---

## Task 11: Frontend — AuthContext and provider wire-up

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Write `frontend/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authStorage } from '../services/api.js';
import * as authService from '../services/auth.js';

const AuthContext = createContext(null);

function loadInitial() {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const token = window.localStorage.getItem(authStorage.TOKEN_KEY);
    const userRaw = window.localStorage.getItem(authStorage.USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

function persist({ token, user }) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(authStorage.TOKEN_KEY, token);
    else window.localStorage.removeItem(authStorage.TOKEN_KEY);
    if (user) window.localStorage.setItem(authStorage.USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(authStorage.USER_KEY);
  } catch {
    /* ignore quota */
  }
}

export function AuthProvider({ children }) {
  const [{ token, user }, setState] = useState(loadInitial);

  useEffect(() => {
    persist({ token, user });
  }, [token, user]);

  const login = useCallback(async (credentials) => {
    const res = await authService.login(credentials);
    setState({ token: res.accessToken, user: res.user });
    return res.user;
  }, []);

  const register = useCallback(async (input) => {
    const res = await authService.register(input);
    setState({ token: res.accessToken, user: res.user });
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, user: null });
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
    }),
    [token, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 2: Wrap the app with `AuthProvider` in `frontend/src/main.jsx`**

Replace the file with:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <ChatProvider>
            <RouterProvider router={router} />
          </ChatProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Boot the frontend dev server (sanity check)**

In one terminal:
```bash
cd /home/anhnt2112/Documents/temp/amazara/frontend && (cp -n .env.example .env || true) && npm run dev
```
Expected: Vite starts at `http://localhost:5173`, no console errors related to AuthProvider. Stop the server.

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add frontend/src/context/AuthContext.jsx frontend/src/main.jsx && git commit -m "feat(frontend): add AuthContext + provider wiring"
```

---

## Task 12: Frontend — wire `AuthPage.jsx` to the real API

**Files:**
- Modify: `frontend/src/pages/AuthPage.jsx`

- [ ] **Step 1: Replace `frontend/src/pages/AuthPage.jsx`**

Replace the file with the version below. The visual structure is unchanged; only the form behavior is replaced.

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../services/api.js';

const HERO_IMG =
  'https://images.unsplash.com/photo-1503551723145-6c040742065b-v2?auto=format&fit=crop&w=1200&q=80';

export default function AuthPage() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [role, setRole] = useState('buyer'); // buyer | seller
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user =
        mode === 'signin'
          ? await login({ email, password })
          : await register({ email, password, fullName, role });
      navigate(user.role === 'seller' ? '/store' : '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-overlay">
      {/* Form */}
      <div className="p-8 md:p-12 flex flex-col">
        <Link to="/" className="text-headline-md font-bold text-primary mb-8 inline-flex items-center gap-2">
          <Icon name="storefront" />
          AmaZara
        </Link>

        <h1 className="text-headline-lg text-on-surface mb-2">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-body-sm text-on-surface-variant mb-6">
          {mode === 'signin'
            ? 'Sign in to continue shopping or manage your store.'
            : 'Pick how you want to use AmaZara to get started.'}
        </p>

        <div className="inline-flex bg-surface-container-low border border-outline-variant rounded-full p-1 mb-6 w-fit">
          {[
            { id: 'buyer', label: 'Buyer' },
            { id: 'seller', label: 'Store Owner' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={`px-4 py-1.5 rounded-full text-body-sm transition-all ${
                role === r.id
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form className="space-y-4 flex-1 flex flex-col" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <Field
              label="Full name"
              icon="person"
              placeholder="Jane Doe"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
          <Field
            label="Email"
            icon="mail"
            type="email"
            placeholder="you@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            icon="lock"
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === 'signin' && (
            <div className="flex items-center justify-between text-body-sm">
              <label className="flex items-center gap-2 text-on-surface-variant">
                <input type="checkbox" className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4" />
                Remember me
              </label>
              <a href="#" className="text-primary hover:underline">
                Forgot password?
              </a>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="text-body-sm text-error bg-error-container/30 border border-error/40 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary py-3 px-6 mt-2 disabled:opacity-60">
            {submitting
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
            {!submitting && <Icon name="arrow_forward" size={18} />}
          </button>

          <div className="flex items-center gap-3 text-body-sm text-on-surface-variant my-2">
            <span className="flex-1 border-t border-outline-variant" />
            or
            <span className="flex-1 border-t border-outline-variant" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialButton icon="g_translate" label="Google" />
            <SocialButton icon="apple" label="Apple" />
          </div>

          <p className="text-body-sm text-on-surface-variant text-center mt-auto">
            {mode === 'signin' ? (
              <>
                New to AmaZara?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="text-primary hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>

      {/* Visual */}
      <div className="hidden lg:block relative bg-primary text-on-primary">
        <img
          src={HERO_IMG}
          alt="Marketplace"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="relative z-10 h-full flex flex-col justify-end p-10 bg-gradient-to-t from-primary/80 to-transparent">
          <span className="text-label-md uppercase tracking-wider text-secondary-fixed-dim">
            Professional Excellence in Commerce
          </span>
          <h2 className="text-display-lg leading-tight mt-3">
            One marketplace, every essential.
          </h2>
          <p className="text-body-lg text-primary-fixed-dim mt-4 max-w-md">
            Join thousands of buyers and sellers building trusted commerce on AmaZara.
          </p>
          <div className="flex items-center gap-6 mt-8 text-body-sm">
            <div className="flex items-center gap-2"><Icon name="verified" /> Verified sellers</div>
            <div className="flex items-center gap-2"><Icon name="local_shipping" /> Global shipping</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, ...rest }) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface mb-1 block">{label}</span>
      <div className="relative">
        <input className="field w-full pl-10 pr-3 py-2.5 text-body-sm" {...rest} />
        <Icon name={icon} className="absolute left-3 top-2.5 text-outline" size={20} />
      </div>
    </label>
  );
}

function SocialButton({ icon, label }) {
  return (
    <button
      type="button"
      className="border border-outline-variant rounded-lg py-2.5 px-3 inline-flex items-center justify-center gap-2 text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add frontend/src/pages/AuthPage.jsx && git commit -m "feat(frontend): wire AuthPage to real API via AuthContext"
```

---

## Task 13: Manual end-to-end verification

This is a verification task — no code changes, no commit. If anything fails, treat it as a bug and stop to investigate.

- [ ] **Step 1: Bring the full stack up**

Three terminals:

1. MySQL:
   ```bash
   cd /home/anhnt2112/Documents/temp/amazara/backend && docker compose up -d mysql
   docker compose ps   # wait for healthy
   ```
2. Backend:
   ```bash
   cd /home/anhnt2112/Documents/temp/amazara/backend && npm run start:dev
   ```
3. Frontend:
   ```bash
   cd /home/anhnt2112/Documents/temp/amazara/frontend && npm run dev
   ```

- [ ] **Step 2: Sign up as a seller**

Open `http://localhost:5173/auth`. Switch to **Create your account**, toggle **Store Owner**, fill:
- Full name: `Jane Seller`
- Email: `jane.seller@example.com`
- Password: `hunter2hunter2`

Submit. Expected: page navigates to `/store`. In DevTools → Application → Local Storage, `amazara.auth.token` is set (a JWT — 3 dot-separated segments) and `amazara.auth.user.role === "seller"`.

- [ ] **Step 3: Verify `/auth/me`**

In a terminal:
```bash
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin'))['amazara.auth.token'])" <<<'{}' 2>/dev/null || echo "")
# (easier: copy the token from DevTools and paste below)
curl -s -H "Authorization: Bearer <paste-token>" http://localhost:3000/auth/me
```
Expected: `{"id":"1","email":"jane.seller@example.com","fullName":"Jane Seller","role":"seller"}` (or whatever id).

- [ ] **Step 4: Log out and sign back in**

Clear `amazara.auth.token` and `amazara.auth.user` from local storage (or open an incognito window). Go to `/auth`, **Sign in** with the same email and password. Expected: redirect to `/store`, token re-stored.

- [ ] **Step 5: Wrong password**

Sign in with the correct email and password `wrongpassword1`. Expected: inline red error "Invalid credentials", no redirect, no token written.

- [ ] **Step 6: Duplicate email on register**

Switch to **Create your account**. Submit `jane.seller@example.com` again with any password and any role. Expected: inline error "Email already registered" (status 409), no redirect.

- [ ] **Step 7: Sign up as a buyer**

Sign up `john.buyer@example.com` / `hunter2hunter2` / **Buyer**. Expected: redirect to `/` (home page), token + user stored, user role is `"buyer"`.

If all seven steps pass, the feature is functionally complete.

---

## Task 14: Project docs (`docs/` + `CLAUDE.md`)

**Files:**
- Create: `docs/README.md`, `docs/features/auth.md`, `CLAUDE.md`

- [ ] **Step 1: Write `docs/README.md`**

```markdown
# AmaZara docs

Indexed list of completed product features. Each feature gets a self-contained page
under `features/` summarizing what shipped, the API contract, and how to run it
locally. Design specs live under `superpowers/specs/`; implementation plans live
under `superpowers/plans/`.

## Completed features

| Date       | Feature              | Doc                        |
|------------|----------------------|----------------------------|
| 2026-05-12 | Auth (register/login)| [features/auth.md](features/auth.md) |
```

- [ ] **Step 2: Write `docs/features/auth.md`**

```markdown
# Auth (register / login)

**Shipped:** 2026-05-12
**Spec:** [`../superpowers/specs/2026-05-12-auth-design.md`](../superpowers/specs/2026-05-12-auth-design.md)
**Plan:** [`../superpowers/plans/2026-05-12-auth-implementation.md`](../superpowers/plans/2026-05-12-auth-implementation.md)

## Summary

Email + password authentication for AmaZara. Users register with `email`,
`password`, `fullName`, and a `role` of `buyer` or `seller`. Passwords are
hashed with bcrypt (cost 12). Successful register/login returns a JWT
(`accessToken`, HS256, 7-day TTL) that the React frontend stores in
`localStorage` and sends on subsequent requests via the `Authorization: Bearer`
header.

## API

Base URL (dev): `http://localhost:3000`. All requests and responses are JSON.

### `POST /auth/register`

Request body:
```json
{ "email": "jane@example.com", "password": "hunter2hunter2", "fullName": "Jane Doe", "role": "buyer" }
```

Responses:
- `201 Created` → `{ "user": { id, email, fullName, role }, "accessToken": "<jwt>" }`
- `400 Bad Request` → validation error (`message` is an array of issues)
- `409 Conflict` → email already registered

### `POST /auth/login`

Request body:
```json
{ "email": "jane@example.com", "password": "hunter2hunter2" }
```

Responses:
- `200 OK` → same shape as register success
- `400 Bad Request` → validation error
- `401 Unauthorized` → `{ "message": "Invalid credentials", ... }` for both wrong
  password and unknown email (intentional, to avoid user enumeration)

### `GET /auth/me`

Header: `Authorization: Bearer <jwt>`.

Responses:
- `200 OK` → `{ id, email, fullName, role }`
- `401 Unauthorized` → missing/invalid/expired token

## Data model

Table `users` (MySQL 8.0):

| Column          | Type                          | Constraints                              |
|-----------------|-------------------------------|------------------------------------------|
| `id`            | `BIGINT UNSIGNED`             | PK, AUTO_INCREMENT                       |
| `email`         | `VARCHAR(255)`                | UNIQUE, NOT NULL, stored lowercased+trimmed |
| `password_hash` | `VARCHAR(255)`                | NOT NULL, bcrypt cost 12                 |
| `full_name`     | `VARCHAR(255)`                | NOT NULL                                 |
| `role`          | `ENUM('buyer','seller')`      | NOT NULL, default `'buyer'`              |
| `created_at`    | `TIMESTAMP`                   | NOT NULL, default `CURRENT_TIMESTAMP`    |
| `updated_at`    | `TIMESTAMP`                   | NOT NULL, default `CURRENT_TIMESTAMP` ON UPDATE |

Schema is auto-managed by TypeORM `synchronize: true` in dev. Replace with
migrations before production.

## Local development

```bash
# Terminal 1 — MySQL
cd backend && cp .env.example .env && docker compose up -d mysql

# Terminal 2 — backend
cd backend && npm install && npm run start:dev

# Terminal 3 — frontend
cd frontend && cp .env.example .env && npm install && npm run dev
```

Frontend: http://localhost:5173 — open `/auth`.
Backend: http://localhost:3000.
MySQL: localhost:3306 (dev schema `amazara`, test schema `amazara_test`).

## Tests

```bash
cd backend
npm test                          # unit tests (UsersService)
npm run test:e2e                  # e2e tests against amazara_test (MySQL container must be up)
```

## Known limitations / follow-ups

- No refresh tokens. Access token TTL is 7 days.
- No email verification or password reset.
- Role is stored but no route-level role guards yet.
- Google / Apple buttons in the UI are visual stubs.
- `synchronize: true` for dev; migrations are a future task.
- No rate limiting on `/auth/*`.
```

- [ ] **Step 3: Write `CLAUDE.md`** at the repo root

```markdown
# AmaZara — Notes for Claude

Marketplace project with a React + Vite storefront and a NestJS + MySQL backend.

## Layout

| Path                              | What it is                                       |
|-----------------------------------|--------------------------------------------------|
| `frontend/`                       | React 18 + Vite 5 + Tailwind. Storefront + seller dashboard. |
| `backend/`                        | NestJS 10 + TypeORM + MySQL. JWT auth.           |
| `backend/docker-compose.yml`      | MySQL 8.0 (dev) + init script for `amazara_test` schema. |
| `backend/Dockerfile`              | Multi-stage prod image for the API.              |
| `docs/`                           | Feature docs (`features/`), design specs (`superpowers/specs/`), plans (`superpowers/plans/`). |

## Common commands

```bash
# Backend
cd backend && docker compose up -d mysql        # start MySQL
cd backend && npm run start:dev                 # NestJS on :3000
cd backend && npm test                          # unit tests
cd backend && npm run test:e2e                  # e2e tests (needs MySQL up)

# Frontend
cd frontend && npm run dev                      # Vite on :5173
cd frontend && npm run build
```

## Conventions

- **UI language is English only.** Do not introduce other locales in markup, copy, or alt text.
- Backend imports: NestJS modules per domain (`auth/`, `users/`, ...). Each module exports a service when other modules need it.
- Frontend services: one file per resource in `src/services/*`. They use the `api` wrapper from `services/api.js` so the base URL, auth header, and error handling stay in one place.
- Auth: JWT stored in `localStorage` under `amazara.auth.token`. User profile under `amazara.auth.user`. The `api` wrapper auto-injects the `Authorization: Bearer` header and clears storage on 401. Use the `useAuth()` hook from `context/AuthContext.jsx` for `login`, `register`, `logout`, `user`, `isAuthenticated`.
- Passwords are bcrypt-hashed (cost 12). `password_hash` has `select: false` on the entity; only `UsersService.findByEmailWithHash` returns it.
- Tests: backend uses Jest. Unit tests live next to the source file as `*.spec.ts`. E2E tests in `backend/test/*.e2e-spec.ts` run against the `amazara_test` MySQL schema. Frontend has no test harness yet.
- Every new feature must add a page under `docs/features/<feature>.md` and a row in `docs/README.md`'s completed-features table.

## Environment variables

Backend (`backend/.env`, see `backend/.env.example`):
- `PORT`, `FRONTEND_ORIGIN`
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- Docker-only: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_PORT`
- Test-only: `TEST_DATABASE_NAME` (defaults to `amazara_test`)

Frontend (`frontend/.env`, see `frontend/.env.example`):
- `VITE_API_BASE_URL` — defaults to `http://localhost:3000`. Set to empty for relative requests, or to the deployed API origin in prod.
```

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara && git add docs/ CLAUDE.md && git commit -m "docs: add CLAUDE.md and auth feature doc"
```

---

## Done

After Task 14, the feature is complete. To recap, the user-visible deliverables are:

- A backend (`backend/`) running on port 3000 with `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
- MySQL 8.0 via `docker compose up -d mysql`, with `amazara` (dev) and `amazara_test` schemas.
- The frontend `AuthPage.jsx` performing real registration + login through `AuthContext`, with role-based redirect to `/` (buyer) or `/store` (seller).
- E2E tests in `backend/test/auth.e2e-spec.ts` covering all three endpoints.
- `docs/features/auth.md` summarizing the shipped feature, and `CLAUDE.md` at the repo root.
