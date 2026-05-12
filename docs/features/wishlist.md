# Wishlist

Per-user saved products, persisted on the server behind `JwtAuthGuard`.

| Method | Path | Body | Behaviour |
|--------|------|------|-----------|
| GET | `/me/wishlist` | — | Returns the user's wishlisted `ProductSummary`s. |
| POST | `/me/wishlist` | `{ productId }` | Idempotent. Returns the row whether new or existing. |
| DELETE | `/me/wishlist/:productId` | — | Returns 204; missing rows are a no-op. |

Schema: `wishlist_items(id, user_id, product_id, created_at)` with a unique
index on `(user_id, product_id)`.
