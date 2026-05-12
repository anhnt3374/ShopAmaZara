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
