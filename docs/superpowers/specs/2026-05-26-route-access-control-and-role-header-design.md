# Route access control + role-aware header — design

## Problem

The frontend has no route-level authorization. `router.jsx` and the three layouts
(`UserLayout`, `StoreLayout`, `AuthLayout`) never check auth state or role, so every
URL is reachable by anyone. Pages only guard *actions* (e.g. clicking checkout while
logged out bounces to `/auth`); direct navigation to `/store`, `/account`, `/orders`,
etc. is wide open. The top header (`TopNavBar`) is identical for guests, buyers, and
sellers — it shows a `Sell → /store` link and buyer tools (cart/wishlist/messages) to
everyone, including users who cannot use them.

Goal: enforce a three-tier access model at the routing layer and make the header
reflect the viewer's role.

## Access tiers

| Tier | Routes | Guard |
|------|--------|-------|
| Public (anyone, incl. guests + sellers) | `/`, `/search`, `/product/:id`, `/policy`, `/policy/:section`, `*` | none |
| Buyer (authenticated, `role === 'buyer'`) | `/cart`, `/wishlist`, `/checkout`, `/orders`, `/orders/:id`, `/messages`, `/messages/:conversationId`, `/account`, `/account/addresses` | `RequireRole role="buyer"` |
| Seller (authenticated, `role === 'seller'`) | `/store`, `/store/orders`, `/store/inventory`, `/store/products/new`, `/store/products/:id`, `/store/messages` | `RequireRole role="seller"` |
| Auth | `/auth` | `RedirectIfAuthed` |

## Redirect rules

`role` comes from `useAuth()` → `user.role` (`'buyer' | 'seller'`). `isAuthenticated`
is `Boolean(token && user)`. Helper: `roleHome(user) = user?.role === 'seller' ? '/store' : '/'`.

- **Not authenticated** on a guarded route → `<Navigate to="/auth" replace state={{ from }}>`
  where `from = location.pathname + location.search`.
- **Authenticated, wrong role** → `<Navigate to={roleHome(user)} replace>`
  (buyer hitting `/store/*` → `/`; seller hitting a buyer route → `/store`).
- **`/auth` while authenticated** → `<Navigate to={roleHome(user)} replace>`.
- **After login** (`AuthPage`): navigate to `location.state?.from` if present, else
  `roleHome(user)`. A stale `from` that mismatches the role self-corrects (the target
  route's guard re-redirects to the correct home).

## Component design (approach: pathless guard-layout routes)

Two small components render `<Outlet/>` when access is allowed, else `<Navigate>`.
They are used as `element` wrappers in `router.jsx`, grouping routes under one guard.

- `RequireRole({ role })` — `frontend/src/components/routing/RequireRole.jsx`
  - reads `useAuth()` + `useLocation()`
  - `!isAuthenticated` → Navigate `/auth` with `state.from`
  - `user.role !== role` → Navigate `roleHome(user)`
  - else `<Outlet/>`
- `RedirectIfAuthed()` — `frontend/src/components/routing/RedirectIfAuthed.jsx`
  - `isAuthenticated` → Navigate `roleHome(user)`
  - else `<Outlet/>`

### Router structure (`frontend/src/router.jsx`)

The seller guard wraps **above** `StoreLayout` so the seller sidebar never flashes for
non-sellers. The buyer guard nests **inside** `UserLayout` (the header/footer shell is
shared with public pages, so showing it briefly during a redirect is fine).

```
UserLayout
├─ public: /, /search, /product/:id, /policy, /policy/:section
└─ RequireRole role="buyer"
   └─ /cart, /wishlist, /checkout, /orders, /orders/:id,
      /messages, /messages/:conversationId, /account, /account/addresses

RequireRole role="seller"
└─ StoreLayout
   └─ /store, /store/orders, /store/inventory,
      /store/products/new, /store/products/:id, /store/messages

AuthLayout
└─ RedirectIfAuthed
   └─ /auth

* → NotFoundPage   (public)
```

## Role-aware header (`TopNavBar`)

Derive `role = user?.role` from `useAuth()`. Applies to both the desktop bar and the
mobile menu (both currently map the same `links` array).

| Viewer | Nav links | Right-side icons | Account icon target |
|--------|-----------|------------------|---------------------|
| Guest | Shop · Deals · Support | ♡ 🛒 💬 shown (clicking navigates to the route → buyer guard bounces to `/auth`) | `/auth` |
| Buyer | Shop · Deals · Support | ♡ 🛒 💬 (functional) | `/account` |
| Seller | Shop · Deals · Support · **Dashboard** (`/store`) | ♡ 🛒 💬 hidden | `/store` |

- The old `Sell → /store` nav link is removed for guests/buyers and replaced by a
  `Dashboard → /store` link shown only to sellers.
- Guest icon clicks need no special handler — the NavLink navigates to the buyer route
  and the route guard redirects to `/auth`.
- `StoreSideNav` (the seller sidebar) is unchanged.

## Cart + wishlist become buyer-only

Both are buyer-tier capabilities. Guests can no longer hold a local cart/wishlist.

- `CartContext` and `WishlistContext`: remove the guest `localStorage` persistence and
  the now-dead "merge guest items on login" branches. `items`/`ids` start empty and are
  only hydrated from the server when authenticated.
- New hook `useBuyerAction()` — `frontend/src/hooks/useBuyerAction.js`:
  ```js
  // returns run(action): if not authenticated → navigate('/auth', { state: { from } });
  // else action()
  ```
- Apply `useBuyerAction` to the guest-reachable action buttons on **public** pages:
  - `ProductCard.jsx` — "Add to cart" (`addItem`) and wishlist heart (`toggle`).
  - `ProductDetailPage.jsx` — "Add to cart" buttons and wishlist heart.
  - (Cart-add inside `OrderManagementPage`, `WishlistPage`, and the chatbot
    `ProductListBlock` are already behind buyer-only routes — no change needed.)
- Guest header badges for ♡/🛒 are 0 (empty state), consistent with the above.

## FloatingChatbot

The floating chat stays rendered for everyone on non-`/messages` routes (unchanged
visibility). Its toggle handler is gated: if the viewer is not an authenticated buyer,
clicking navigates to `/auth` instead of opening the chat. (For a logged-in seller this
means `/auth` → `RedirectIfAuthed` → `/store`; acceptable.)

## Incidental bug fix

`ProductDetailPage.jsx:86` builds the post-login return path as `/products/${id}`
(plural), but the route is `/product/:id` (singular). Fix to `/product/${id}` so login
returns to the product page instead of 404.

## Out of scope

- Backend authorization is unchanged (JWT guards + role checks already exist server-side;
  this work is purely the frontend routing/UX layer).
- No new pages or backend routes.
- Seller signup entry point: guests register as a seller via the `/auth` page's
  buyer/seller toggle (the header no longer carries a "Sell" CTA).

## Manual test checklist (golden path)

- Guest → `/cart`, `/wishlist`, `/orders`, `/account`, `/store` each redirect to `/auth`.
- Buyer → `/store/*` redirects to `/`.
- Seller → `/cart`, `/account`, `/messages` redirect to `/store`.
- Authenticated user opening `/auth` redirects to role home.
- Guest clicks "Add to cart" / wishlist heart / floating chat → `/auth`; after login,
  returns to the originating page (`from`).
- Header shows the correct links/icons for guest vs buyer vs seller (desktop + mobile).
- Seller sidebar does not flash when a buyer hits `/store`.
