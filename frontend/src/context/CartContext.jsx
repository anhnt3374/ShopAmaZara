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
  addCartItem,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '../services/cart.js';

const CartContext = createContext(null);

// Server's CartItemView -> the local row shape the rest of the app uses
function mapServerRow(row, previousSelectedMap) {
  const p = row.product ?? {};
  const previousSelected = previousSelectedMap?.get(row.productId);
  return {
    id: row.productId,
    name: p.name ?? 'Unknown product',
    subtitle: p.subtitle ?? '',
    price: Number(p.price ?? 0),
    image: p.image ?? '',
    quantity: row.quantity,
    selected: previousSelected ?? true,
  };
}

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const refetchFromServer = useCallback(async () => {
    try {
      const res = await fetchCart();
      const prevSelected = new Map(itemsRef.current.map((i) => [i.id, i.selected]));
      const mapped = (res.items ?? []).map((row) => mapServerRow(row, prevSelected));
      setItems(mapped);
      return mapped;
    } catch (err) {
      toast.error(err?.message || 'Could not load cart');
      return null;
    }
  }, [toast]);

  // Cart is buyer-only: hydrate from the server when logged in, clear otherwise.
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    refetchFromServer();
  }, [isAuthenticated, refetchFromServer]);

  const addItem = useCallback(
    (product, quantity = 1) => {
      // Optimistic local update
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === product.id);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: product.id,
              name: product.name,
              subtitle: product.subtitle,
              price: Number(product.price ?? 0),
              image: product.image,
              quantity,
              selected: true,
            },
          ];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      });
      toast.success(
        quantity > 1
          ? `Added ${quantity} × "${product.name}" to cart`
          : `Added "${product.name}" to cart`,
      );

      if (!isAuthenticated) return;
      addCartItem(product.id, quantity).catch(async (err) => {
        toast.error(err?.message || 'Could not add to cart');
        await refetchFromServer();
      });
    },
    [isAuthenticated, refetchFromServer, toast],
  );

  const removeItem = useCallback(
    (id) => {
      const removed = itemsRef.current.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (removed) toast.info(`Removed "${removed.name}" from cart`);

      if (!isAuthenticated) return;
      removeCartItem(id).catch(async (err) => {
        toast.error(err?.message || 'Could not remove from cart');
        await refetchFromServer();
      });
    },
    [isAuthenticated, refetchFromServer, toast],
  );

  const updateQuantity = useCallback(
    (id, quantity) => {
      const nextQty = Math.max(1, quantity);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: nextQty } : i)));

      if (!isAuthenticated) return;
      updateCartItem(id, nextQty).catch(async (err) => {
        toast.error(err?.message || 'Could not update quantity');
        await refetchFromServer();
      });
    },
    [isAuthenticated, refetchFromServer, toast],
  );

  const toggleSelected = useCallback((id) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  }, []);

  const setAllSelected = useCallback((selected) => {
    setItems((prev) => prev.map((i) => ({ ...i, selected })));
  }, []);

  // Called after a successful checkout. Backend deletes the bought rows
  // server-side inside the checkout transaction, so locally we just drop them.
  const clearSelected = useCallback(() => {
    setItems((prev) => prev.filter((i) => !i.selected));
  }, []);

  const value = useMemo(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const selectedItems = items.filter((i) => i.selected);
    const subtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const allSelected = items.length > 0 && items.every((i) => i.selected);
    return {
      items,
      count,
      subtotal,
      selectedItems,
      allSelected,
      addItem,
      removeItem,
      updateQuantity,
      toggleSelected,
      setAllSelected,
      clearSelected,
    };
  }, [
    items,
    addItem,
    removeItem,
    updateQuantity,
    toggleSelected,
    setAllSelected,
    clearSelected,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
