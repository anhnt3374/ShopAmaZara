# Orders

Per-buyer purchase records. Checkout is transactional: stock is decremented,
the order + items are inserted, and the matching cart rows are deleted in a
single transaction. Payment is mocked — orders go straight to `Paid`.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/orders/checkout` | `{ productIds, addressId, shippingMethod, payment }` | Snapshots shipping address from `user_addresses`. 400 if empty, 404 if address missing, 409 on oversell. |
| GET | `/me/orders` | `?status=` | Buyer's orders, newest first. Returns snapshot + timestamps. |
| GET | `/me/orders/:id` | — | Order detail with items and snapshots. 403 for other buyers. |
| PATCH | `/me/orders/:id/cancel` | — | Buyer cancel; restores stock; 409 if not in `Paid` state. |

Pricing: `shipping = 5.00` (Standard) or `15.00` (Express), `tax = 8% of subtotal`,
`total = subtotal + shipping + tax`.

Schemas:

- `orders(id, buyer_id, subtotal, shipping, tax, total, status, shipping_method, shipping_*, payment_method, payment_last4, payment_txn_id, paid_at, shipped_at, delivered_at, cancelled_at, created_at, updated_at)`
- `order_items(id, order_id, product_id, store_id, name_snapshot, price_snapshot, quantity)`

Status enum: `Paid | Shipped | Delivered | Cancelled`.

## Seller routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/store/orders` | Orders that contain ≥1 item from the seller's store. Supports `status` and `q` filters. |
| PATCH | `/store/orders/:id` | Update overall order status. Sets matching timestamp; transitioning to `Cancelled` restores stock. |
