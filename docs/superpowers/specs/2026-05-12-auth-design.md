# Auth (register / login) — Design Spec

**Date:** 2026-05-12
**Status:** Approved (pending written-spec review)
**Scope:** Email/password registration + login, with `fullName` and `role` (buyer/seller).
**Stack:** NestJS + TypeORM + MySQL 8.0 (Docker), JWT (HS256). React/Vite frontend integrates with the new API.

## Goals

1. Real registration and login that replace the mocked submit in `frontend/src/pages/AuthPage.jsx`.
2. Passwords stored hashed (bcrypt, cost 12). Plain passwords never logged or returned.
3. Backend is independently runnable. MySQL runs in Docker for local dev. A `Dockerfile` for the NestJS app is included so the backend can be containerized for deploy later.
4. Document the feature under `docs/features/auth.md`, and initialize `CLAUDE.md` at the repo root.
5. UI text remains English-only.

## Non-goals

- Refresh tokens / token rotation.
- Email verification, password reset, OAuth social login (Google/Apple buttons in the UI remain non-functional stubs for now).
- Role-based authorization middleware beyond storing the `role` on the user. `/store` admin pages do not yet check role server-side; that's a follow-up.
- Production-grade secrets management. `.env` files are used for local dev.

## Repository layout

```
amazara/
├── frontend/                       (existing)
│   ├── src/
│   │   ├── context/AuthContext.jsx    (new)
│   │   ├── services/auth.js           (new)
│   │   ├── services/api.js            (modified — injects Bearer token)
│   │   └── pages/AuthPage.jsx         (modified — calls real API)
│   └── .env.example                   (modified — add VITE_API_BASE_URL)
├── backend/                        (new)
│   ├── docker-compose.yml          (MySQL service only)
│   ├── Dockerfile                  (multi-stage build for future deploy)
│   ├── .dockerignore
│   ├── .env.example
│   ├── .gitignore
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── package.json
│   ├── README.md
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── dto/
│   │   │       ├── register.dto.ts
│   │   │       └── login.dto.ts
│   │   └── users/
│   │       ├── users.module.ts
│   │       ├── users.service.ts
│   │       └── user.entity.ts
│   └── test/
│       ├── auth.e2e-spec.ts
│       └── jest-e2e.json
├── docs/
│   ├── README.md                   (index of completed features)
│   ├── features/auth.md            (this feature's completion summary)
│   └── superpowers/specs/2026-05-12-auth-design.md  (this file)
└── CLAUDE.md                       (new — repo-wide guidance)
```

## Database schema

MySQL 8.0. Schema is auto-created on backend boot via TypeORM `synchronize: true` (dev only — a follow-up will introduce migrations before production).

Table `users`:

| Column          | Type                          | Constraints                              |
|-----------------|-------------------------------|------------------------------------------|
| `id`            | `BIGINT UNSIGNED`             | PK, AUTO_INCREMENT                       |
| `email`         | `VARCHAR(255)`                | UNIQUE, NOT NULL                         |
| `password_hash` | `VARCHAR(255)`                | NOT NULL                                 |
| `full_name`     | `VARCHAR(255)`                | NOT NULL                                 |
| `role`          | `ENUM('buyer','seller')`      | NOT NULL, DEFAULT `'buyer'`              |
| `created_at`    | `TIMESTAMP`                   | NOT NULL, DEFAULT `CURRENT_TIMESTAMP`    |
| `updated_at`    | `TIMESTAMP`                   | NOT NULL, DEFAULT `CURRENT_TIMESTAMP` ON UPDATE `CURRENT_TIMESTAMP` |

Unique index on `email`. Email is stored lowercased and trimmed at the service layer.

## API contract

Base URL (dev): `http://localhost:3000`. JSON only. All errors follow Nest's default shape: `{ statusCode, message, error }`. Validation errors return `message` as a string array.

### POST `/auth/register`

Request body:
```json
{
  "email": "jane@example.com",
  "password": "hunter2hunter2",
  "fullName": "Jane Doe",
  "role": "buyer"
}
```

Validation:
- `email` — required, valid email, max 255 chars, normalized (lowercase, trim).
- `password` — required, min 8 chars, max 128 chars.
- `fullName` — required, non-empty after trim, max 255 chars.
- `role` — required, one of `"buyer"` | `"seller"`.

Responses:
- `201 Created`:
  ```json
  {
    "user": { "id": 1, "email": "jane@example.com", "fullName": "Jane Doe", "role": "buyer" },
    "accessToken": "<jwt>"
  }
  ```
- `400 Bad Request` — validation failure.
- `409 Conflict` — email already registered.

### POST `/auth/login`

Request body:
```json
{ "email": "jane@example.com", "password": "hunter2hunter2" }
```

Validation: same email/password rules as register.

Responses:
- `200 OK` — same shape as register success.
- `400 Bad Request` — validation failure.
- `401 Unauthorized` — invalid email or password. Message is intentionally generic ("Invalid credentials") to avoid user-enumeration.

### GET `/auth/me`

Headers: `Authorization: Bearer <jwt>`.

Responses:
- `200 OK` — `{ "id": 1, "email": "...", "fullName": "...", "role": "buyer" }`.
- `401 Unauthorized` — missing/invalid/expired token.

## JWT

- Algorithm: HS256.
- Secret: `process.env.JWT_SECRET` (required at boot; backend fails to start if missing).
- TTL: `JWT_EXPIRES_IN` (default `7d`).
- Payload: `{ sub: <userId>, email, role }`.
- Verified by `JwtStrategy` (passport-jwt) extracting from `Authorization: Bearer`.

## Module breakdown

### `users` module

- `User` entity — maps to `users` table; column names use `snake_case` via TypeORM column options.
- `UsersService`:
  - `findByEmail(email): Promise<User | null>` — normalized lookup.
  - `create({ email, passwordHash, fullName, role }): Promise<User>` — throws `ConflictException` on duplicate (catches MySQL `ER_DUP_ENTRY` 1062 as a safety net in addition to the pre-check).
  - `findById(id): Promise<User | null>`.

### `auth` module

- `AuthService`:
  - `register(dto)` — hash password, delegate to `UsersService.create`, sign JWT, return `{ user, accessToken }`.
  - `login(dto)` — find user by email, `bcrypt.compare`, sign JWT on success, else throw `UnauthorizedException('Invalid credentials')`.
  - `signToken(user)` — wraps `JwtService.signAsync`.
  - `sanitize(user)` — strips `passwordHash` (and any other server-only fields) before returning.
- `AuthController`:
  - `POST /auth/register` → `authService.register`.
  - `POST /auth/login` → `authService.login`.
  - `GET /auth/me` (with `@UseGuards(JwtAuthGuard)`) → returns `sanitize(req.user)`.
- `JwtStrategy` — validates payload, loads user by `sub`, returns user (without hash) for `req.user`.
- `JwtAuthGuard` — thin wrapper around passport `AuthGuard('jwt')`.

### Global app concerns

- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` enabled globally.
- CORS enabled for `process.env.FRONTEND_ORIGIN` (default `http://localhost:5173`).
- Global prefix: none (endpoints are `/auth/*` at root).
- TypeORM config from `DATABASE_*` env vars; `synchronize: true` in dev, `false` otherwise.

## Frontend integration

### New: `src/services/auth.js`

Exposes `register`, `login`, `me`. Uses the existing `api` wrapper. Returns the parsed `{ user, accessToken }` payload to the caller.

### New: `src/context/AuthContext.jsx`

- Provides `{ user, accessToken, login, register, logout, isAuthenticated }`.
- On mount, hydrates from `localStorage` keys `amazara.auth.token` and `amazara.auth.user`.
- `login`/`register` call the service, persist both values, update state.
- `logout` clears storage and state.
- Provider wraps the app at `main.jsx` (or `router.jsx`, whichever is the existing root).

### Modified: `src/services/api.js`

- Read token from `localStorage.getItem('amazara.auth.token')` inside `request` and add `Authorization: Bearer <token>` header when present.
- On `401`, clear the stored token/user (callers can react via context if they wish). Keep the existing `ApiError` contract.

### Modified: `src/pages/AuthPage.jsx`

- Convert inputs to controlled fields (`email`, `password`, `fullName` for signup).
- Track `role` from the existing toggle (already in state).
- Sign-in submit → `authContext.login({ email, password })`. On success: navigate by role (`seller` → `/store`, `buyer` → `/`). On `ApiError`, show inline message above the submit button.
- Sign-up submit → `authContext.register({ email, password, fullName, role })`. Same redirect/error rules.
- Loading state disables the submit button and shows "Signing in…" / "Creating account…".
- Validation errors from the API (array of messages) are concatenated into the displayed message.

### Modified: `frontend/.env.example`

Add `VITE_API_BASE_URL=http://localhost:3000`.

## Docker

### `backend/docker-compose.yml`

Single `mysql` service:

- Image `mysql:8.0`.
- Env from `.env`: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE=amazara`, `MYSQL_USER`, `MYSQL_PASSWORD`.
- Port mapping `${MYSQL_PORT:-3306}:3306`.
- Named volume `amazara_mysql_data` mounted at `/var/lib/mysql`.
- Init script mounted at `/docker-entrypoint-initdb.d/init.sql` that creates a second schema `amazara_test` and grants the `amazara` user access to it (so e2e tests have an isolated database without manual setup).
- Healthcheck: `mysqladmin ping -h localhost -p$$MYSQL_ROOT_PASSWORD` every 10s, retries 5.
- `restart: unless-stopped`.

The NestJS app is *not* in compose for now — it runs natively via `npm run start:dev` against the containerized MySQL. The `Dockerfile` is committed so a future `docker compose --profile app up` (or a separate compose file) can include it without further work.

### `backend/Dockerfile`

Multi-stage:

1. `node:20-alpine` build stage — `npm ci`, copy source, `npm run build` → `dist/`.
2. `node:20-alpine` runtime — copy `dist/`, copy production `node_modules` (via `npm ci --omit=dev` in a fresh layer), `EXPOSE 3000`, `CMD ["node", "dist/main.js"]`, run as a non-root user.

### `backend/.env.example`

```
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173

DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_USER=amazara
DATABASE_PASSWORD=amazara
DATABASE_NAME=amazara

MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=amazara
MYSQL_USER=amazara
MYSQL_PASSWORD=amazara
MYSQL_PORT=3306

JWT_SECRET=change-me-in-prod
JWT_EXPIRES_IN=7d
```

## Testing

Backend (`backend/test/auth.e2e-spec.ts`, Jest + supertest, `NestApplication`):

- **register-happy**: 201, returns `user` (no `passwordHash`) and `accessToken`.
- **register-duplicate-email**: second register with same email → 409.
- **register-validation**: missing fields / weak password / invalid role → 400 with messages.
- **login-happy**: 200, returns `user` + `accessToken`.
- **login-wrong-password**: 401, message `Invalid credentials`.
- **login-unknown-email**: 401, same generic message (enumeration check).
- **me-with-token**: 200, returns the registered user shape.
- **me-without-token**: 401.
- **me-with-bad-token**: 401.

E2E tests use a real MySQL instance (the one from `docker-compose.yml`) against the `amazara_test` schema created by the compose init script; the test setup truncates `users` before each test. Rationale for not using SQLite: the entity declares MySQL-specific column types (`ENUM`, `BIGINT UNSIGNED`), so testing on SQLite would diverge from production behavior.

Frontend tests: deferred — the existing project has no test harness, and adding Vitest is out of scope for this feature. The AuthPage will be smoke-tested manually against the running backend.

## Manual verification checklist

1. `cd backend && cp .env.example .env && docker compose up -d mysql && npm install && npm run start:dev` — server boots on `http://localhost:3000`, logs `Nest application successfully started`.
2. `cd frontend && cp .env.example .env && npm install && npm run dev` — UI at `http://localhost:5173`.
3. Open `/auth`, switch to **Create your account**, choose **Store Owner**, fill in fullname/email/password, submit → redirected to `/store`, JWT visible in `localStorage` under `amazara.auth.token`.
4. Sign out (clear storage), switch to **Sign in**, log in with the same credentials → redirected to `/store`.
5. Try the same email/password combo with a wrong password → inline "Invalid credentials" error, no redirect.
6. Try registering with the same email again → inline "Email already registered" error.
7. With the app open and a valid token, call `GET http://localhost:3000/auth/me` with the bearer token (curl/Postman) → returns the user JSON.

## Open items / follow-ups (not in this feature)

- Migrations (replace `synchronize: true`).
- Role-based guard for `/store` admin endpoints once those endpoints exist.
- Refresh tokens + sliding sessions.
- Email verification + password reset flow.
- Rate-limiting on `/auth/*` (e.g. `@nestjs/throttler`).
- Wire Google/Apple buttons (currently visual stubs).
