# Products — catalog

Public catalog APIs backed by MySQL. Data is seeded from
`products.enriched.csv` via `npm run seed:products` in `backend/`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List with `q`, `category[]`, `brand[]`, `storeId[]`, `minPrice`, `maxPrice`, `gender`, `ageGroup`, `sort`, `page`, `limit`. |
| GET | `/products/:id` | Full detail view (parsed JSON columns). |
| GET | `/products/facets` | Distinct categories, brands, price range. Optional `q` narrows it. |

## Response shapes

`ProductSummary`: `id`, `name`, `subtitle`, `brand`, `category`, `storeId`,
`price`, `discount`, `originalPrice`, `image`, `inStock`, `stock`, `colors`.

`ProductDetail` adds `description`, `images`, `highlights`, `availableColors`,
`availableSizes`, `material`, `targetGender`, `targetAgeGroup`, `tags`.

Fields the frontend mocks use but the CSV does not include (`rating`,
`reviewCount`, `features`, `reviews`) are omitted from API responses.

## Search

Case-insensitive `LIKE` across `name`, `brand`, and the `tags` JSON column.
No FULLTEXT index yet.
