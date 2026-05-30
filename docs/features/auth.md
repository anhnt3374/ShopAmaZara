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

Logout (`useAuth().logout`, clears token + user) is surfaced in the UI as a
**Sign out** button in the side nav for both roles — buyer (`AccountSideNav`)
and seller (`StoreSideNav`). Both confirm first (`confirm('Sign out of your
account?')`), then clear the session and redirect to `/`.

## API

Base URL (dev): `http://localhost:3000`. All requests and responses are JSON.

### `POST /auth/register`

Request body:

```json
{
  "email": "jane@example.com",
  "password": "hunter2hunter2",
  "fullName": "Jane Doe",
  "role": "buyer"
}
```

Responses:
- `201 Created` → `{ "user": { id, email, fullName, role }, "accessToken": "<jwt>" }`
- `400 Bad Request` → validation error (`message` is an array of issues)
- `409 Conflict` → email already registered

### `POST /auth/login`

Request body (`role` is optional):

```json
{ "email": "jane@example.com", "password": "hunter2hunter2", "role": "buyer" }
```

Responses:
- `200 OK` → same shape as register success
- `400 Bad Request` → validation error (includes `role` not in `buyer`/`seller`)
- `401 Unauthorized` → `{ "message": "Invalid credentials", ... }` for both wrong
  password and unknown email (intentional, to avoid user enumeration)
- `401 Unauthorized` → `{ "message": "This account is not registered as a <role> account.", ... }`
  when `role` is supplied and does not match the account's role

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
# Recommended: bring up the full stack in Docker
docker compose up -d
# Frontend: http://localhost:5173, Backend: http://localhost:3000, MySQL: localhost:3306

# Alternative: run only MySQL in Docker; run backend / frontend natively
docker compose up -d mysql
cd backend && npm install && npm run start:dev    # http://localhost:3000
cd frontend && cp .env.example .env && npm install && npm run dev   # http://localhost:5173
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
- `synchronize: true` for dev; migrations are a future task.
- No rate limiting on `/auth/*`.
