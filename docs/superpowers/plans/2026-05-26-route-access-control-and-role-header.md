# Route Access Control + Role-Aware Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a three-tier (public / buyer / seller) access model on the React frontend's routes and make the top header reflect the viewer's role.

**Architecture:** Two small guard components (`RequireRole`, `RedirectIfAuthed`) used as pathless layout-route `element` wrappers in `router.jsx` group the protected routes and perform redirects. Cart and wishlist become buyer-only: their contexts drop guest `localStorage` persistence, and a `useBuyerAction` hook bounces non-buyers to `/auth` from the public add/heart buttons. `TopNavBar` derives links and icon visibility from `user.role`.

**Tech Stack:** React 18, react-router-dom ^6.26 (`Outlet`, `Navigate`, nested/pathless routes), Vite. Spec: `docs/superpowers/specs/2026-05-26-route-access-control-and-role-header-design.md`.

**Note on verification:** The frontend has no automated test harness. Each task is verified with `npm run lint` + `npm run build` (compile/lint gate) and, where behavior changes, a manual browser check against a running dev server (`docker compose up -d` or `cd frontend && npm run dev`). Use seeded accounts — buyer `buyer01@amazara.local`, seller `seller01@amazara.local`, password `password123`.

---

## File Structure

**Create:**
- `frontend/src/components/routing/roleHome.js` — pure helper: a user's home route by role.
- `frontend/src/components/routing/RequireRole.jsx` — guard: requires auth + matching role, else redirect.
- `frontend/src/components/routing/RedirectIfAuthed.jsx` — guard for `/auth`: sends logged-in users home.
- `frontend/src/hooks/useBuyerAction.js` — wraps an action; redirects non-buyers to `/auth`.

**Modify:**
- `frontend/src/router.jsx` — wrap route groups with the guards.
- `frontend/src/pages/AuthPage.jsx` — honor `location.state.from` after login.
- `frontend/src/components/TopNavBar.jsx` — role-aware links, icons, account target.
- `frontend/src/context/CartContext.jsx` — remove guest persistence + login-merge.
- `frontend/src/context/WishlistContext.jsx` — remove guest persistence + login-merge.
- `frontend/src/components/ProductCard.jsx` — guard add-to-cart + wishlist via `useBuyerAction`.
- `frontend/src/pages/ProductDetailPage.jsx` — guard add/heart; fix post-login return path.
- `frontend/src/components/FloatingChatbot.jsx` — non-buyers' FAB click → `/auth`.

---

### Task 1: Guard helper + components

**Files:**
- Create: `frontend/src/components/routing/roleHome.js`
- Create: `frontend/src/components/routing/RequireRole.jsx`
- Create: `frontend/src/components/routing/RedirectIfAuthed.jsx`

- [ ] **Step 1: Create `roleHome.js`**

```js
// Home route for a user based on their role. Sellers live under /store; everyone
// else (buyers) lands on the storefront root.
export function roleHome(user) {
  return user?.role === 'seller' ? '/store' : '/';
}
```

- [ ] **Step 2: Create `RequireRole.jsx`**

```jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from './roleHome.js';

// Pathless layout guard. Renders the nested routes only when the viewer is
// authenticated AND has the required role. Unauthenticated -> /auth (remembering
// where they were). Wrong role -> that user's own home.
export default function RequireRole({ role }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (user?.role !== role) {
    return <Navigate to={roleHome(user)} replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 3: Create `RedirectIfAuthed.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from './roleHome.js';

// Guard for /auth: a logged-in user has no business on the auth page, so send
// them to their role home.
export default function RedirectIfAuthed() {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={roleHome(user)} replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 4: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS (no eslint errors; build succeeds). The new files are not yet imported anywhere, so behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/routing/
git commit -m "feat(fe): add route guard components (RequireRole, RedirectIfAuthed)"
```

---

### Task 2: Wire guards into the router

**Files:**
- Modify: `frontend/src/router.jsx`

- [ ] **Step 1: Replace `router.jsx` with the guarded structure**

The seller guard wraps **above** `StoreLayout` (so the sidebar never flashes for
non-sellers); the buyer guard nests **inside** `UserLayout` (the header/footer shell is
shared with public pages). Full new file:

```jsx
import { createBrowserRouter } from 'react-router-dom';
import UserLayout from './layouts/UserLayout.jsx';
import StoreLayout from './layouts/StoreLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import RequireRole from './components/routing/RequireRole.jsx';
import RedirectIfAuthed from './components/routing/RedirectIfAuthed.jsx';
import HomePage from './pages/HomePage.jsx';
import ProductDetailPage from './pages/ProductDetailPage.jsx';
import SearchResultPage from './pages/SearchResultPage.jsx';
import CartPage from './pages/CartPage.jsx';
import WishlistPage from './pages/WishlistPage.jsx';
import UserChatPage from './pages/UserChatPage.jsx';
import PolicyPage from './pages/PolicyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import StoreInventoryPage from './pages/store/StoreInventoryPage.jsx';
import StoreOrderManagementPage from './pages/store/StoreOrderManagementPage.jsx';
import StoreChatPage from './pages/store/StoreChatPage.jsx';
import StoreProductFormPage from './pages/store/StoreProductFormPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import OrderManagementPage from './pages/OrderManagementPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AddressesPage from './pages/AddressesPage.jsx';

export const router = createBrowserRouter([
  {
    element: <UserLayout />,
    children: [
      // Public
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <SearchResultPage /> },
      { path: '/product/:id', element: <ProductDetailPage /> },
      { path: '/policy', element: <PolicyPage /> },
      { path: '/policy/:section', element: <PolicyPage /> },
      // Buyer-only
      {
        element: <RequireRole role="buyer" />,
        children: [
          { path: '/cart', element: <CartPage /> },
          { path: '/wishlist', element: <WishlistPage /> },
          { path: '/messages', element: <UserChatPage /> },
          { path: '/messages/:conversationId', element: <UserChatPage /> },
          { path: '/checkout', element: <CheckoutPage /> },
          { path: '/orders', element: <OrderManagementPage /> },
          { path: '/orders/:id', element: <OrderDetailPage /> },
          { path: '/account', element: <ProfilePage /> },
          { path: '/account/addresses', element: <AddressesPage /> },
        ],
      },
    ],
  },
  {
    // Seller-only
    element: <RequireRole role="seller" />,
    children: [
      {
        element: <StoreLayout />,
        children: [
          { path: '/store', element: <StoreOrderManagementPage /> },
          { path: '/store/orders', element: <StoreOrderManagementPage /> },
          { path: '/store/inventory', element: <StoreInventoryPage /> },
          { path: '/store/products/new', element: <StoreProductFormPage /> },
          { path: '/store/products/:id', element: <StoreProductFormPage /> },
          { path: '/store/messages', element: <StoreChatPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      {
        element: <RedirectIfAuthed />,
        children: [{ path: '/auth', element: <AuthPage /> }],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

- [ ] **Step 2: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification (dev server running)**

- Logged out: visit `/cart`, `/orders`, `/account`, `/store` → each redirects to `/auth`.
- Log in as `buyer01@amazara.local` → visit `/store` → redirects to `/`.
- Log in as `seller01@amazara.local` → visit `/cart` → redirects to `/store`. Visit `/store` → loads.
- While logged in, visit `/auth` → redirects to role home.
- Public pages (`/`, `/search`, `/product/:id`, `/policy`) load for everyone.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.jsx
git commit -m "feat(fe): guard buyer/seller routes and redirect authed users off /auth"
```

---

### Task 3: Honor `from` after login

**Files:**
- Modify: `frontend/src/pages/AuthPage.jsx`

- [ ] **Step 1: Import `useLocation`**

Change line 2 from:

```jsx
import { Link, useNavigate } from 'react-router-dom';
```

to:

```jsx
import { Link, useLocation, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Read location in the component**

After `const navigate = useNavigate();` (line 19) add:

```jsx
  const location = useLocation();
```

- [ ] **Step 3: Navigate to `from` when present**

Replace line 30:

```jsx
      navigate(user.role === 'seller' ? '/store' : '/');
```

with:

```jsx
      const from = location.state?.from;
      navigate(from || (user.role === 'seller' ? '/store' : '/'), { replace: true });
```

(A `from` that mismatches the role self-corrects: the target route's guard redirects to the correct home.)

- [ ] **Step 4: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

- Logged out, visit `/orders` → bounced to `/auth`. Log in as `buyer01` → land back on `/orders` (not `/`).
- Logged out, log in directly from `/auth` with no `from` → buyer lands on `/`, seller on `/store`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AuthPage.jsx
git commit -m "feat(fe): return to originating page after login"
```

---

### Task 4: Role-aware header

**Files:**
- Modify: `frontend/src/components/TopNavBar.jsx`

- [ ] **Step 1: Remove the module-level `links` array**

Delete lines 8-13 (the static array, which hard-codes a `Sell → /store` link for everyone):

```jsx
const links = [
  { to: '/', label: 'Shop', end: true },
  { to: '/search', label: 'Deals' },
  { to: '/store', label: 'Sell' },
  { to: '/policy', label: 'Support' },
];
```

- [ ] **Step 2: Derive role-based config inside the component**

Replace:

```jsx
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
```

with:

```jsx
  const { isAuthenticated, user } = useAuth();
  const [query, setQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSeller = isAuthenticated && user?.role === 'seller';
  const showBuyerTools = !isSeller; // guests + buyers see cart/wishlist/messages
  const accountTo = isSeller ? '/store' : isAuthenticated ? '/account' : '/auth';
  const links = [
    { to: '/', label: 'Shop', end: true },
    { to: '/search', label: 'Deals' },
    { to: '/policy', label: 'Support' },
    ...(isSeller ? [{ to: '/store', label: 'Dashboard' }] : []),
  ];
```

- [ ] **Step 3: Gate the buyer-tool icons (wishlist + cart + messages)**

Wrap the three NavLinks (the `to="/wishlist"`, `to="/cart"`, and `to="/messages"` blocks, currently lines 79-111) in a `showBuyerTools` fragment. The block becomes:

```jsx
          {showBuyerTools && (
            <>
              <NavLink
                to="/wishlist"
                aria-label="Wishlist"
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all relative"
              >
                <Icon name="favorite" />
                {wishlistIds.length > 0 && (
                  <span className="absolute top-1 right-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                    {wishlistIds.length}
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/cart"
                aria-label="Cart"
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all relative"
              >
                <Icon name="shopping_cart" />
                {count > 0 && (
                  <span className="absolute top-1 right-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                    {count}
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/messages"
                aria-label="Messages"
                className="hidden sm:inline-flex p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
              >
                <Icon name="chat" />
              </NavLink>
            </>
          )}
```

- [ ] **Step 4: Point the account icon at the role-correct target**

Replace:

```jsx
          <NavLink
            to={isAuthenticated ? '/account' : '/auth'}
            aria-label="Account"
```

with:

```jsx
          <NavLink
            to={accountTo}
            aria-label="Account"
```

(The mobile menu already maps the same `links` array, so it inherits "no Sell / Dashboard-for-seller" automatically — no further change.)

- [ ] **Step 5: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Manual verification**

- Guest: header shows Shop/Deals/Support + ♡ 🛒 💬 + account icon (→ `/auth`). No "Sell".
- Buyer (`buyer01`): same links; ♡ 🛒 💬 functional; account icon → `/account`.
- Seller (`seller01`) on a public page (e.g. `/`): links show **Dashboard**; ♡ 🛒 💬 hidden; account icon → `/store`. Check mobile menu (narrow viewport) shows Dashboard and no Sell.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/TopNavBar.jsx
git commit -m "feat(fe): make top header role-aware (links, buyer tools, account target)"
```

---

### Task 5: `useBuyerAction` hook

**Files:**
- Create: `frontend/src/hooks/useBuyerAction.js`

- [ ] **Step 1: Create the hook**

```js
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Returns run(action): if the viewer is an authenticated buyer, run the action;
// otherwise redirect to /auth (remembering where to return). Used to gate
// buyer-only actions (add to cart, wishlist) that live on public pages.
export function useBuyerAction() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (action) => {
      if (!isAuthenticated || user?.role !== 'buyer') {
        navigate('/auth', {
          state: { from: location.pathname + location.search },
        });
        return;
      }
      action();
    },
    [isAuthenticated, user, navigate, location],
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS. (Not imported anywhere yet.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useBuyerAction.js
git commit -m "feat(fe): add useBuyerAction hook to gate buyer-only actions"
```

---

### Task 6: Cart + wishlist become buyer-only (drop guest state)

**Files:**
- Modify: `frontend/src/context/CartContext.jsx`
- Modify: `frontend/src/context/WishlistContext.jsx`

- [ ] **Step 1: CartContext — remove `localStorage` helpers**

Delete the `STORAGE_KEY`, `load`, and `save` definitions (lines 19, 22-37), keeping the
context creation line. After the imports, this region becomes:

```jsx
const CartContext = createContext(null);

// Server's CartItemView -> the local row shape the rest of the app uses
function mapServerRow(row, previousSelectedMap) {
```

- [ ] **Step 2: CartContext — start empty, drop `wasAuthRef`**

Replace:

```jsx
  const [items, setItems] = useState(load);
  const itemsRef = useRef(items);
  const wasAuthRef = useRef(isAuthenticated);

  useEffect(() => {
    itemsRef.current = items;
    if (!isAuthenticated) save(items);
  }, [items, isAuthenticated]);
```

with:

```jsx
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
```

- [ ] **Step 3: CartContext — hydrate-only effect**

Replace the entire "Hydrate / sync on auth state change" effect (lines 80-114):

```jsx
  // Hydrate / sync on auth state change
  useEffect(() => {
    const justLoggedIn = isAuthenticated && !wasAuthRef.current;
    const justLoggedOut = !isAuthenticated && wasAuthRef.current;
    wasAuthRef.current = isAuthenticated;

    if (!isAuthenticated) {
      if (justLoggedOut) setItems(load());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (justLoggedIn) {
          // Best-effort: push guest cart to server
          const guest = itemsRef.current;
          if (guest.length) {
            await Promise.all(
              guest.map((g) => addCartItem(g.id, g.quantity).catch(() => null)),
            );
            save([]);
          }
        }
        if (cancelled) return;
        await refetchFromServer();
      } catch {
        /* refetchFromServer already toasted */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
```

with:

```jsx
  // Cart is buyer-only: hydrate from the server when logged in, clear otherwise.
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    refetchFromServer();
  }, [isAuthenticated, refetchFromServer]);
```

- [ ] **Step 4: WishlistContext — remove `localStorage` helpers**

Delete `STORAGE_KEY` (line 18) and the `loadIds` (21-28) and `saveIds` (30-36) functions,
keeping the context creation line. After the imports this region becomes:

```jsx
const WishlistContext = createContext(null);

function pickIdAndName(idOrProduct) {
```

- [ ] **Step 5: WishlistContext — start empty, drop `wasAuthRef`**

Replace:

```jsx
  // `ids` always tracks the set of wishlisted product ids (used by `has(id)`)
  const [ids, setIds] = useState(loadIds);
  // `products` is the hydrated server view, only populated when logged in
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const idsRef = useRef(ids);
  const wasAuthRef = useRef(isAuthenticated);

  useEffect(() => {
    idsRef.current = ids;
    // Only persist to localStorage when logged out — server is source of truth otherwise
    if (!isAuthenticated) saveIds(ids);
  }, [ids, isAuthenticated]);
```

with:

```jsx
  // `ids` tracks the set of wishlisted product ids (used by `has(id)`)
  const [ids, setIds] = useState([]);
  // `products` is the hydrated server view, only populated when logged in
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const idsRef = useRef(ids);

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);
```

- [ ] **Step 6: WishlistContext — hydrate-only effect**

Replace the entire "Hydrate / sync on auth state change" effect (lines 65-108):

```jsx
  // Hydrate / sync on auth state change
  useEffect(() => {
    const justLoggedIn = isAuthenticated && !wasAuthRef.current;
    const justLoggedOut = !isAuthenticated && wasAuthRef.current;
    wasAuthRef.current = isAuthenticated;

    if (!isAuthenticated) {
      setProducts([]);
      if (justLoggedOut) {
        // Reset guest state to whatever's in localStorage (which we no longer sync on logged in)
        setIds(loadIds());
      }
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (justLoggedIn) {
          // Best-effort: push any guest-state ids to the server before hydrating
          const guestIds = idsRef.current;
          if (guestIds.length) {
            await Promise.all(
              guestIds.map((pid) => addWishlistItem(pid).catch(() => null)),
            );
            saveIds([]);
          }
        }
        const res = await fetchWishlist();
        if (cancelled) return;
        const items = res.items ?? [];
        setIds(items.map((p) => p.id));
        setProducts(items);
      } catch (err) {
        if (!cancelled) toast.error(err?.message || 'Could not load wishlist');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
```

with:

```jsx
  // Wishlist is buyer-only: hydrate from the server when logged in, clear otherwise.
  useEffect(() => {
    if (!isAuthenticated) {
      setIds([]);
      setProducts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWishlist();
        if (cancelled) return;
        const items = res.items ?? [];
        setIds(items.map((p) => p.id));
        setProducts(items);
      } catch (err) {
        if (!cancelled) toast.error(err?.message || 'Could not load wishlist');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, toast]);
```

- [ ] **Step 7: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS. Watch for unused-variable lint errors — `addCartItem` (Cart) and
`addWishlistItem` (Wishlist) must still be imported because `addItem` / `toggle` use them.
`fetchCart` / `fetchWishlist` are still used by the hydrate paths.

- [ ] **Step 8: Manual verification**

- Logged-in buyer: cart + wishlist still load from the server, add/remove persist across reload.
- Log out: cart count and wishlist badge drop to 0 (no lingering guest state).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/context/CartContext.jsx frontend/src/context/WishlistContext.jsx
git commit -m "refactor(fe): make cart and wishlist server-only (drop guest persistence)"
```

---

### Task 7: Gate ProductCard add + heart

**Files:**
- Modify: `frontend/src/components/ProductCard.jsx`

- [ ] **Step 1: Import and use the hook**

Replace:

```jsx
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const isWishlisted = has(product.id);
```

with:

```jsx
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useBuyerAction } from '../hooks/useBuyerAction.js';

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const runBuyerAction = useBuyerAction();
  const isWishlisted = has(product.id);
```

- [ ] **Step 2: Guard the wishlist heart**

Replace:

```jsx
        onClick={() => toggle(product)}
```

with:

```jsx
        onClick={() => runBuyerAction(() => toggle(product))}
```

- [ ] **Step 3: Guard add-to-cart**

Replace:

```jsx
            onClick={() => addItem(product)}
```

with:

```jsx
            onClick={() => runBuyerAction(() => addItem(product))}
```

- [ ] **Step 4: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

- Guest on `/search` or `/`: click a product's heart or add-to-cart button → redirected to `/auth`. After logging in as `buyer01`, lands back on the originating list page.
- Seller on `/`: same buttons also redirect to `/auth` (→ `/store`).
- Buyer: heart and add-to-cart work as before.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ProductCard.jsx
git commit -m "feat(fe): require buyer login for ProductCard add-to-cart and wishlist"
```

---

### Task 8: Gate ProductDetailPage add + heart, fix return path

**Files:**
- Modify: `frontend/src/pages/ProductDetailPage.jsx`

- [ ] **Step 1: Import and use the hook**

Replace:

```jsx
import { useChat } from '../context/ChatContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
```

with:

```jsx
import { useChat } from '../context/ChatContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useBuyerAction } from '../hooks/useBuyerAction.js';
```

Then, after `const { has, toggle } = useWishlist();` (line 28) add:

```jsx
  const runBuyerAction = useBuyerAction();
```

- [ ] **Step 2: Fix the post-login return path**

Replace (line 86):

```jsx
      navigate('/auth', { state: { from: `/products/${id}` } });
```

with:

```jsx
      navigate('/auth', { state: { from: `/product/${id}` } });
```

- [ ] **Step 3: Guard the wishlist heart**

Replace:

```jsx
              onClick={() => toggle(product)}
```

with:

```jsx
              onClick={() => runBuyerAction(() => toggle(product))}
```

- [ ] **Step 4: Guard "Add to Cart" and "Buy Now"**

There are two buttons that call `addItem(product, qty)` (the "Add to Cart" and "Buy Now"
buttons). Replace **both** occurrences of:

```jsx
              onClick={() => addItem(product, qty)}
```

with:

```jsx
              onClick={() => runBuyerAction(() => addItem(product, qty))}
```

(Use Edit with `replace_all` since the two lines are identical.)

- [ ] **Step 5: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Manual verification**

- Guest on `/product/:id`: heart, "Add to Cart", and "Buy Now" each redirect to `/auth`. After logging in as `buyer01`, lands back on the same `/product/:id` page (verifies the singular-path fix).
- Buyer: all three work as before.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProductDetailPage.jsx
git commit -m "feat(fe): require buyer login for product detail add/wishlist; fix return path"
```

---

### Task 9: FloatingChatbot FAB for non-buyers

**Files:**
- Modify: `frontend/src/components/FloatingChatbot.jsx`

- [ ] **Step 1: Import router hooks**

Replace line 2:

```jsx
import { Link } from 'react-router-dom';
```

with:

```jsx
import { Link, useLocation, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Gate the FAB click**

Replace:

```jsx
export default function FloatingChatbot() {
  const { open, toggleChat, closeChat, view, setView, unreadTotal } = useChat();
  const fabBadge = unreadTotal > 0;
```

with:

```jsx
export default function FloatingChatbot() {
  const { open, toggleChat, closeChat, view, setView, unreadTotal } = useChat();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isBuyer = isAuthenticated && user?.role === 'buyer';
  const fabBadge = unreadTotal > 0;

  function handleFabClick() {
    if (!isBuyer) {
      navigate('/auth', { state: { from: location.pathname + location.search } });
      return;
    }
    toggleChat();
  }
```

(`useAuth` is already imported at the top of this file.)

- [ ] **Step 3: Wire the handler to the FAB button**

Replace:

```jsx
          onClick={toggleChat}
```

with:

```jsx
          onClick={handleFabClick}
```

- [ ] **Step 4: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Manual verification**

- Guest on `/`: the floating chat FAB is visible; clicking it → `/auth`.
- Seller on `/`: FAB visible; clicking it → `/auth` → `/store`.
- Buyer on `/`: clicking the FAB opens the chat panel as before.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FloatingChatbot.jsx
git commit -m "feat(fe): send non-buyers to /auth when opening the floating chatbot"
```

---

### Task 10: Full-flow manual regression

**Files:** none (verification only)

- [ ] **Step 1: Run the stack**

Run: `docker compose up -d` (or `cd frontend && npm run dev` with backend up). Wait for `http://localhost:5173`.

- [ ] **Step 2: Walk the checklist from the spec**

- Guest → `/cart`, `/wishlist`, `/orders`, `/account`, `/store` each redirect to `/auth`.
- Buyer (`buyer01@amazara.local`) → `/store/*` redirects to `/`; cart/wishlist/checkout/orders/messages/account all work.
- Seller (`seller01@amazara.local`) → `/cart`, `/account`, `/messages` redirect to `/store`; store pages work.
- Authenticated user opening `/auth` → role home.
- Guest clicks Add-to-cart / wishlist heart / floating chat → `/auth`; after login returns to the originating page.
- Header: guest vs buyer vs seller show the correct links/icons (desktop + mobile).
- Seller hitting `/store` shows no sidebar flash before content.

- [ ] **Step 3: Update feature docs**

Per `CLAUDE.md`, features get documented. Add a short page `docs/features/route-access-control.md` summarizing the three-tier model and the guard components, and add a row to the completed-features table in `docs/README.md` (date `2026-05-26`).

- [ ] **Step 4: Commit docs**

```bash
git add docs/features/route-access-control.md docs/README.md
git commit -m "docs: document route access control + role-aware header"
```

---

## Self-Review

**Spec coverage:**
- Access tiers + guards → Tasks 1, 2. ✓
- Redirect rules (unauth → /auth+from; wrong role → role home; /auth-when-authed → home) → Tasks 1, 2; after-login `from` → Task 3. ✓
- Role-aware header (links, buyer-tool icons, account target, mobile) → Task 4. ✓
- Cart + wishlist buyer-only (drop guest persistence + merge) → Task 6; action guards on public pages → Tasks 5, 7, 8. ✓
- FloatingChatbot non-buyer → /auth → Task 9. ✓
- Incidental bug fix (`/products/${id}` → `/product/${id}`) → Task 8 Step 2. ✓
- Manual test checklist → Task 10. ✓

**Type/name consistency:** `roleHome(user)` defined in Task 1, imported in `RequireRole`/`RedirectIfAuthed` (Task 1) — `AuthPage` (Task 3) inlines the equivalent ternary intentionally. `useBuyerAction()` returns a single `run(action)` callback, used consistently in Tasks 7-8 as `runBuyerAction(() => ...)`. `showBuyerTools` / `isSeller` / `accountTo` only used within Task 4. No dangling references.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓
