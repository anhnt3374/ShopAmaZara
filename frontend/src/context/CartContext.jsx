import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'amazara.cart.v1';
const CartContext = createContext(null);

function load() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    save(items);
  }, [items]);

  const addItem = useCallback((product, quantity = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === product.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            subtitle: product.subtitle,
            price: product.price,
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
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id, quantity) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i)),
    );
  }, []);

  const toggleSelected = useCallback((id) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  }, []);

  const setAllSelected = useCallback((selected) => {
    setItems((prev) => prev.map((i) => ({ ...i, selected })));
  }, []);

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
  }, [items, addItem, removeItem, updateQuantity, toggleSelected, setAllSelected, clearSelected]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
