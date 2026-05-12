# AmaZara

Vite + React storefront and seller dashboard. Routes follow the buyer /
seller split described in `design/the_design_system/DESIGN.md`.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build to ./dist
npm run preview   # serve the production build
```

Set `VITE_API_BASE_URL` (see `.env.example`) to point at a real backend.
While unset, services in `src/services/*.js` return mocks from `src/mocks/`,
so the UI is fully interactive without a server.

## Docker

```bash
# Production build, served by nginx on port 8080
docker compose up --build

# Dev server with HMR on port 5173 (live mounts ./ into container)
docker compose --profile dev up --build dev
```

## Project layout

| Path | What it holds |
| --- | --- |
| `src/layouts/` | `UserLayout` (sticky header/footer + floating chat), `StoreLayout` (sticky admin sidebar), `AuthLayout` |
| `src/components/` | Reusable UI primitives: `TopNavBar`, `Footer`, `FloatingChatbot`, `StoreSideNav`, `ProductCard`, `Icon` |
| `src/pages/` | Buyer pages (`HomePage`, `ProductDetailPage`, `SearchResultPage`, `CartPage`, `WishlistPage`, `UserChatPage`, `PolicyPage`, `AuthPage`) and `pages/store/*` admin pages |
| `src/services/` | `api.js` fetch wrapper + per-resource files (`products`, `orders`, `inventory`, `chat`). Each service falls back to mocks when no `VITE_API_BASE_URL` is configured |
| `src/context/` | Cart, Wishlist, and Chat providers backed by `localStorage` |
| `src/mocks/` | In-memory fixtures used until a real API is wired up |

## Layout guarantees

- **Header** is `sticky top-0` on every layout — always pinned to the viewport.
- **Footer** sits at the page bottom even on short pages (flex column with `flex-1` main).
- **Floating chat** uses fixed `bottom-6 right-6` with `z-40`; the open panel sits above the icon with internal scroll so it can't grow past the viewport. Hidden on `/messages` (which already has a chat UI) and on store admin pages.
- **Sticky sidebars**: search filters (`/search`), policy nav (`/policy`), and store admin sidebar all use `sticky top-0` / `top-24` so they remain pinned to the viewport edge while content scrolls.
- **Responsive**: every page collapses gracefully on mobile (admin sidebar becomes a drawer, filter sidebar opens as a sheet, header collapses to a hamburger menu).

## Cart (`/cart`)

Implements the **UserCart** variant from the design folder: each item has a
checkbox, a `Select All` master toggle, and the CTA is **Checkout Selected
Items**. Order totals derive only from the selected lines.

## Adding a real API

Edit `src/services/api.js` to add auth headers or interceptors. Each service
file (`products.js`, `orders.js`, etc.) gates on `VITE_API_BASE_URL`: set it
and the mock branch is bypassed without further changes.
