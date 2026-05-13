import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';
import {
  addWishlistItem,
  fetchWishlist,
  removeWishlistItem,
} from '../services/wishlist.js';

const STORAGE_KEY = 'amazara.wishlist.v1';
const WishlistContext = createContext(null);

function loadIds() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveIds(ids) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function pickIdAndName(idOrProduct) {
  if (idOrProduct && typeof idOrProduct === 'object') {
    return { id: idOrProduct.id, name: idOrProduct.name ?? null, product: idOrProduct };
  }
  return { id: idOrProduct, name: null, product: null };
}

export function WishlistProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();

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

  const has = useCallback((id) => ids.includes(id), [ids]);

  const toggle = useCallback(
    (idOrProduct) => {
      const { id, name, product } = pickIdAndName(idOrProduct);
      const exists = idsRef.current.includes(id);

      // Optimistic local update
      setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      if (exists) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        toast.info(name ? `Removed "${name}" from wishlist` : 'Removed from wishlist');
      } else {
        if (product) {
          setProducts((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, product]));
        }
        toast.success(name ? `Added "${name}" to wishlist` : 'Added to wishlist');
      }

      // Server sync when logged in
      if (!isAuthenticated) return;
      const op = exists ? removeWishlistItem(id) : addWishlistItem(id);
      op.catch(async (err) => {
        toast.error(err?.message || 'Could not sync wishlist');
        // Re-fetch authoritative state so the UI converges
        try {
          const fresh = await fetchWishlist();
          setIds((fresh.items ?? []).map((p) => p.id));
          setProducts(fresh.items ?? []);
        } catch {
          /* ignore */
        }
      });
    },
    [isAuthenticated, toast],
  );

  const remove = useCallback(
    (idOrProduct) => {
      const { id, name } = pickIdAndName(idOrProduct);
      const wasIn = idsRef.current.includes(id);
      if (!wasIn) return;

      setIds((prev) => prev.filter((x) => x !== id));
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.info(name ? `Removed "${name}" from wishlist` : 'Removed from wishlist');

      if (!isAuthenticated) return;
      removeWishlistItem(id).catch(async (err) => {
        toast.error(err?.message || 'Could not sync wishlist');
        try {
          const fresh = await fetchWishlist();
          setIds((fresh.items ?? []).map((p) => p.id));
          setProducts(fresh.items ?? []);
        } catch {
          /* ignore */
        }
      });
    },
    [isAuthenticated, toast],
  );

  const value = useMemo(
    () => ({ ids, products, loading, has, toggle, remove }),
    [ids, products, loading, has, toggle, remove],
  );
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
