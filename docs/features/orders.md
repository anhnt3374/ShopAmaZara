# Orders

Per-buyer purchase records. Checkout is transactional: stock is decremented,
the order + items are inserted, and the matching cart rows are deleted in a
single transaction.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/orders/checkout` | `{ productIds: string[] }` | Buyer's cart rows for those IDs become an order. 400 if empty, 409 on oversell. |
| GET | `/me/orders` | — | Buyer's orders, newest first. |
| GET | `/me/orders/:id` | — | Order detail with items (snapshots). 403 for other buyers. |

Pricing: `shipping = 12.50` if subtotal > 0, `tax = 8% of subtotal`,
`total = subtotal + shipping + tax`. These rates match the frontend's
`CartPage` constants and stay in sync without coupling.

Schemas:

- `orders(id, buyer_id, subtotal, shipping, tax, total, status, created_at, updated_at)`
- `order_items(id, order_id, product_id, store_id, name_snapshot, price_snapshot, quantity)`
