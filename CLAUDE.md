# AmaZara — Notes for Claude

Marketplace project with a React + Vite storefront and a NestJS + MySQL backend.

## Layout

| Path                              | What it is                                       |
|-----------------------------------|--------------------------------------------------|
| `frontend/`                       | React 18 + Vite 5 + Tailwind. Storefront + seller dashboard. |
| `backend/`                        | NestJS 10 + TypeORM + MySQL. JWT auth.           |
| `docker-compose.yml` (root)       | Full-stack dev: MySQL + backend (NestJS, watch) + frontend (Vite HMR). |
| `backend/Dockerfile`              | Multi-stage prod image for the API.              |
| `backend/Dockerfile.dev`          | Dev image for the API (used by root compose).    |
| `frontend/Dockerfile`             | Multi-stage prod image (nginx) for the SPA.      |
| `frontend/Dockerfile.dev`         | Dev image for the SPA (used by root compose).    |
| `backend/docker/init.sql`         | MySQL init script that creates `amazara_test` schema. |
| `docs/`                           | Feature docs (`features/`), design specs (`superpowers/specs/`), plans (`superpowers/plans/`). |

## Common commands

```bash
# Full stack (recommended)
docker compose up -d                          # MySQL + backend (:3000) + frontend (:5173)
docker compose logs -f backend                # tail backend
docker compose down                           # stop everything (volumes persist)
docker compose down -v                        # nuke including data

# Native backend dev (no Docker for the app, MySQL only via Docker)
docker compose up -d mysql
cd backend && npm install && npm run start:dev

# Native frontend dev
cd frontend && npm install && npm run dev

# Tests
cd backend && npm test                        # unit
cd backend && npm run test:e2e                # e2e (needs MySQL up via `docker compose up -d mysql`)
```

## Conventions

- **UI language is English only.** This applies to ALL user-facing strings — page headings, buttons, form labels, validation messages, toast/snackbar text, alt text, policy/support copy, error pages, and the chatbot system prompt. Do not introduce Vietnamese (or any other locale) in markup, JSX text, default values, mock data, or seed copy. When porting or fixing pages, scan for residual Vietnamese strings and translate them; do not leave them mixed.
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
- Embedding warmup: `EMBED_WARMUP_ENABLED` (default true), `EMBED_WARMUP_DELAY_MS` (default 5000), `EMBED_WARMUP_INTERVAL_MS` (default 300000)

Frontend (`frontend/.env`, see `frontend/.env.example`):
- `VITE_API_BASE_URL` — defaults to `http://localhost:3000`. Set to empty for relative requests, or to the deployed API origin in prod.
