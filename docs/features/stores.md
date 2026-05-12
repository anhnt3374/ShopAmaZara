# Stores

Each row in `products.enriched.csv` belongs to a `store_id`. The seed command
provisions one MySQL `stores` row per distinct `store_id` and one seller user
that owns it.

## Seeding

```bash
docker compose up -d mysql
cd backend && npm install && npm run seed:products
```

The script is idempotent — rerunning only inserts what is missing.

## Seller credentials

- email: `seller-<store-uuid>@amazara.local`
- password: `seller123`

The full 36-char store UUID is used in the email to guarantee uniqueness —
shorter prefixes risk a silent collision where two stores share an owner.

The seed log prints a few example emails. To list more:

```bash
docker compose exec mysql mysql -uamazara -pamazara amazara \
  -e "SELECT email FROM users WHERE role='seller' LIMIT 5;"
```

Existing rows seeded before this change still carry the legacy
`seller-<first-8-of-store-uuid>@amazara.local` form. No data migration is
provided; the next clean reseed after
`TRUNCATE TABLE users; TRUNCATE TABLE stores;` produces the new pattern.

## Schema

`stores(id CHAR(36) PK, name, slug UNIQUE, owner_id → users.id, created_at)`.
