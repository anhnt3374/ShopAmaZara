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

## Seller routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/orders` | Orders that contain ≥1 item from the seller's store. Each row's `items` count and `total` are the **store's slice** only, not the full order. Supports `status` and `q` filters. |
| PATCH | `/store/orders/:id` | Update overall order status (`Processing`, `Shipped`, `Delivered`, `Cancelled`). 403 if no item belongs to the caller's store. |

Note: orders carry a single status across stores in v1. If marketplace-style
multi-seller fulfillment is needed, the status field would move onto `order_items`.
