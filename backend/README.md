# AmaZara Backend

NestJS + TypeORM + MySQL. See `docs/superpowers/specs/2026-05-12-auth-design.md` for the auth feature design.

## Local dev

```bash
# From the repo root
docker compose up -d                # full stack including this backend
# OR, to run only MySQL in Docker and the backend natively:
docker compose up -d mysql
cd backend && cp .env.example .env && npm install && npm run start:dev
```

Health probe: `curl http://localhost:3000/health`.

## Tests

```bash
docker compose up -d mysql          # from repo root
cd backend && npm test              # unit
cd backend && npm run test:e2e      # e2e against amazara_test schema
```
