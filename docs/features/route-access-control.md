# Route access control + role-aware header

Frontend authorization layer. Routes are partitioned into three tiers and enforced
with React Router guard components; the top header adapts to the viewer's role. This
is a client-side UX layer — the backend already enforces auth/role on every endpoint.

## Tiers

| Tier | Routes | Guard |
|------|--------|-------|
| Public | `/`, `/search`, `/product/:id`, `/policy`, `/policy/:section`, `*` | none |
| Buyer (`role==='buyer'`) | `/cart`, `/wishlist`, `/checkout`, `/orders`, `/orders/:id`, `/messages`, `/messages/:conversationId`, `/account`, `/account/addresses` | `RequireRole role="buyer"` |
| Seller (`role==='seller'`) | `/store`, `/store/orders`, `/store/inventory`, `/store/products/new`, `/store/products/:id`, `/store/messages` | `RequireRole role="seller"` |
| Auth | `/auth` | `RedirectIfAuthed` |

## Components

- `components/routing/RequireRole.jsx` — pathless layout route. Unauthenticated →
  `/auth` (saving `state.from`); wrong role → that user's home; else `<Outlet/>`.
- `components/routing/RedirectIfAuthed.jsx` — sends a logged-in user off `/auth` to
  their home.
- `components/routing/roleHome.js` — `roleHome(user)`: seller → `/store`, else `/`.
- `hooks/useBuyerAction.js` — `run(action)`: runs `action` for an authenticated buyer,
  otherwise redirects to `/auth`. Used to gate add-to-cart and wishlist buttons that
  appear on public pages.

In `router.jsx` the seller guard wraps **above** `StoreLayout` (no sidebar flash for
non-sellers); the buyer guard nests **inside** `UserLayout` (the header/footer shell is
shared with public pages).

## Redirect behaviour

- Guarded route while logged out → `/auth`, remembering the origin; `AuthPage` returns
  there after a successful login (`location.state.from`), else the role home.
- Logged in on the wrong tier → the user's own home (buyer `/`, seller `/store`).
- `/auth` while already logged in → role home.

## Header (`TopNavBar`)

| Viewer | Nav links | Buyer-tool icons (♡ 🛒 💬) | Account icon |
|--------|-----------|---------------------------|--------------|
| Guest | Shop · Deals · Support | shown (clicks bounce to `/auth` via guards) | `/auth` |
| Buyer | Shop · Deals · Support | shown, functional | `/account` |
| Seller | Shop · Deals · Support · Dashboard | hidden | `/store` |

## Cart + wishlist

Both are buyer-only. `CartContext` / `WishlistContext` hold no guest state (no
`localStorage`, no login-merge) — they hydrate from the server only when authenticated.
The add/heart buttons on `ProductCard` and `ProductDetailPage` are wrapped with
`useBuyerAction`, so a guest or seller clicking them is sent to `/auth`. The floating
chatbot FAB stays visible to everyone but routes non-buyers to `/auth` on click.

## Verify locally

```bash
docker compose up -d   # or: cd frontend && npm run dev
```

Seeded accounts (password `password123`): buyer `buyer01@amazara.local`, seller
`seller01@amazara.local`. Check: guest hitting `/cart` `/orders` `/account` `/store`
→ `/auth`; buyer hitting `/store/*` → `/`; seller hitting `/cart` `/account` → `/store`;
guest clicking add/♡/chat → `/auth` then back to origin after login.
