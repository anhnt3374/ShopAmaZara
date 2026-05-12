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
