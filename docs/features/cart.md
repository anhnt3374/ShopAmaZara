# Cart

Per-user cart, persisted in MySQL behind `JwtAuthGuard`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me/cart` | — | Returns `{ items, subtotal }`. Each item hydrates the product summary. |
| POST | `/me/cart` | `{ productId, quantity }` | Adds or increments. 400 if cumulative qty > stock. |
| PATCH | `/me/cart/:productId` | `{ quantity }` | `quantity = 0` deletes the row. 400 if qty > stock. |
| DELETE | `/me/cart/:productId` | — | 204, no-op for missing rows. |
| DELETE | `/me/cart` | — | Clears the entire cart. |

Schema: `cart_items(id, user_id, product_id, quantity, created_at, updated_at)`
with a unique index on `(user_id, product_id)`.
