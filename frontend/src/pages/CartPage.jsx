import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { getProduct } from '../services/products.js';

const SHIPPING_RATE = 12.5;
const TAX_RATE = 0.08;

export default function CartPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const {
    items,
    subtotal,
    selectedItems,
    allSelected,
    updateQuantity,
    toggleSelected,
    setAllSelected,
    removeItem,
  } = useCart();

  const { ensureStoreChat } = useChat();

  async function askAboutItem(item) {
    if (!isAuthenticated) {
      toast.error('Sign in to message the seller');
      navigate('/auth', { state: { from: '/cart' } });
      return;
    }
    try {
      let storeId = item.storeId;
      if (!storeId) {
        const p = await getProduct(item.id).catch(() => null);
        storeId = p?.storeId;
      }
      if (!storeId) {
        toast.error('Seller info unavailable');
        return;
      }
      const id = await ensureStoreChat(storeId);
      navigate(`/messages/${id}`);
    } catch (err) {
      toast.error(err?.message ?? 'Could not open chat');
    }
  }

  const totals = useMemo(() => {
    const sub = subtotal;
    const shipping = sub > 0 ? SHIPPING_RATE : 0;
    const tax = +(sub * TAX_RATE).toFixed(2);
    return { sub, shipping, tax, total: +(sub + shipping + tax).toFixed(2) };
  }, [subtotal]);

  async function onCheckout() {
    if (selectedItems.length === 0) return;
    if (!isAuthenticated) {
      toast.error('Please sign in before checking out');
      navigate('/auth', { state: { from: '/cart' } });
      return;
    }
    navigate('/checkout', {
      state: { productIds: selectedItems.map((i) => i.id) },
    });
  }

  return (
    <div className="container-max py-8 flex-1">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-headline-lg text-on-surface">Shopping Cart</h1>
        <Link to="/search" className="text-label-md text-primary hover:underline inline-flex items-center gap-1">
          <Icon name="arrow_back" size={18} /> Continue shopping
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="flex flex-col lg:flex-row gap-gutter items-start">
          <div className="flex-1 w-full min-w-0">
            <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-low">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setAllSelected(e.target.checked)}
                    className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="text-label-md text-on-surface">
                    Select All ({items.length} item{items.length === 1 ? '' : 's'})
                  </span>
                </label>
                <span className="text-body-sm text-on-surface-variant">
                  {selectedItems.length} selected
                </span>
              </div>

              <ul className="divide-y divide-outline-variant">
                {items.map((item) => (
                  <li key={item.id} className="p-4 flex gap-4 items-start">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleSelected(item.id)}
                      className="mt-2 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 shrink-0"
                    />
                    <Link to={`/product/${item.id}`} className="shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover bg-surface-container-low"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/product/${item.id}`} className="block">
                            <h3 className="text-label-md text-on-surface truncate hover:text-primary">{item.name}</h3>
                          </Link>
                          <p className="text-body-sm text-on-surface-variant truncate">{item.subtitle}</p>
                        </div>
                        <span className="text-headline-sm font-semibold text-on-surface whitespace-nowrap">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center border border-outline-variant rounded-md overflow-hidden bg-surface">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            aria-label="Decrease"
                            className="px-3 py-1 text-on-surface hover:bg-surface-container transition-colors"
                          >
                            -
                          </button>
                          <span className="px-4 py-1 text-data-mono border-x border-outline-variant bg-surface-container-low">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label="Increase"
                            className="px-3 py-1 text-on-surface hover:bg-surface-container transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => askAboutItem(item)}
                            className="text-primary hover:text-primary-container text-label-md flex items-center gap-1 transition-colors"
                          >
                            <Icon name="chat" size={16} />
                            Ask about this item
                          </button>
                          <div className="w-px h-4 bg-outline-variant" />
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-error hover:text-on-error-container text-label-md flex items-center gap-1 transition-colors"
                          >
                            <Icon name="delete" size={16} />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sticky order summary */}
          <aside className="w-full lg:w-96 lg:shrink-0">
            <div className="bg-surface border border-outline-variant rounded-lg p-6 lg:sticky lg:top-24">
              <h2 className="text-headline-md text-on-surface mb-6 border-b border-outline-variant pb-4">
                Order Summary
              </h2>
              <div className="flex flex-col gap-4 text-body-md">
                <Row label="Subtotal" value={`$${totals.sub.toFixed(2)}`} />
                <Row label="Estimated Shipping" value={`$${totals.shipping.toFixed(2)}`} />
                <Row label="Estimated Tax" value={`$${totals.tax.toFixed(2)}`} />
                <div className="border-t border-outline-variant pt-4 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-headline-md text-on-surface">Total</span>
                    <span className="text-headline-lg text-primary font-bold">
                      ${totals.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCheckout}
                disabled={selectedItems.length === 0}
                className="btn-primary w-full py-3 px-6 mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {`Checkout Selected (${selectedItems.length})`}
                <Icon name="arrow_forward" size={16} />
              </button>
              <div className="mt-4 flex items-center justify-center gap-2 text-body-sm text-on-surface-variant">
                <Icon name="lock" size={16} />
                Secure SSL Checkout
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span className="text-data-mono">{value}</span>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-12 text-center">
      <Icon name="shopping_cart" className="text-outline" size={48} />
      <p className="text-headline-md text-on-surface mt-4">Your cart is empty</p>
      <p className="text-body-sm text-on-surface-variant mt-1">
        Browse products and add them to your cart to see them here.
      </p>
      <Link to="/search" className="btn-primary inline-flex mt-6 px-6 py-2 text-body-sm">
        <Icon name="storefront" size={18} />
        Shop now
      </Link>
    </div>
  );
}
