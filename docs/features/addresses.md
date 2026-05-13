# Addresses

Per-user shipping address book. At most one row per user has `is_default = 1`,
enforced inside the service via a transaction on create / update / delete.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me/addresses` | — | Default first. |
| POST | `/me/addresses` | `{ label, recipientName, phone, line1, line2?, city, region, postalCode, country, isDefault? }` | First address auto-becomes default. |
| PATCH | `/me/addresses/:id` | partial | 403 if not owner. Setting `isDefault: true` unsets others. |
| DELETE | `/me/addresses/:id` | — | If was default, promotes the most recent remaining. |

Used by `/orders/checkout` (snapshots the chosen address onto the order) and the
`AddressesPage` (`/account/addresses`).
