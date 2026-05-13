import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getProduct } from '../services/products.js';
import { listOrders } from '../services/orders.js';

const TABS = ['All', 'Paid', 'Shipped', 'Delivered', 'Cancelled'];

export default function OrderManagementPage() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('All');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const { addItem } = useCart();

  useEffect(() => {
    setLoading(true);
    listOrders()
      .then((r) => setOrders(r.items))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    if (tab === 'All') return orders;
    return orders.filter((o) => o.status === tab);
  }, [orders, tab]);

  const reorder = async (order) => {
    let added = 0;
    for (const it of order.items) {
      try {
        const p = await getProduct(it.productId);
        if (!p) {
          toast.info(`Skipped: "${it.name}" no longer available`);
          continue;
        }
        // Map the backend product shape to the cart's expected shape.
        addItem(
          {
            id: p.id,
            name: p.name,
            subtitle: p.subtitle ?? p.brand ?? '',
            price: Number(p.price ?? 0),
            image: p.imageFirst ?? p.image ?? '',
          },
          it.quantity,
        );
        added += 1;
      } catch {
        toast.info(`Skipped: "${it.name}"`);
      }
    }
    if (added > 0) navigate('/cart');
  };

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <header>
          <h1 className="text-headline-lg text-on-surface mb-1">Order Management</h1>
          <p className="text-body-md text-on-surface-variant">
            Track, manage and view the history of your purchases.
          </p>
        </header>

        <div className="border-b border-outline-variant overflow-x-auto">
          <div className="flex gap-8 min-w-max">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`pb-3 border-b-2 text-label-md transition-colors ${
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {t === 'All' ? 'All Orders' : t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">Loading orders…</p>
        ) : visible.length === 0 ? (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-10 text-center">
            <Icon name="receipt_long" size={40} className="text-outline" />
            <p className="text-headline-md text-on-surface mt-2">No orders here</p>
            <p className="text-body-sm text-on-surface-variant">
              When you buy something, it appears here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {visible.map((o) => (
              <li
                key={o.id}
                className="bg-surface border border-outline-variant rounded-xl hover:border-primary transition-colors"
              >
                <div className="p-6 flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-data-mono bg-surface-container-high px-3 py-1 rounded-full text-on-surface">
                          #{o.id}
                        </span>
                        <span className="text-body-sm text-on-surface-variant">
                          Ordered on{' '}
                          {new Date(o.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <div className="flex gap-3">
                      {(o.items ?? []).slice(0, 3).map((it) => (
                        <div
                          key={it.id}
                          className="w-16 h-16 rounded-lg overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center text-body-sm text-on-surface-variant px-1 text-center"
                          title={it.name}
                        >
                          {it.name}
                        </div>
                      ))}
                      {(o.items?.length ?? 0) > 3 && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-outline-variant bg-surface flex items-center justify-center text-label-md text-on-surface-variant">
                          +{o.items.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="md:w-60 flex flex-col justify-between border-t md:border-t-0 md:border-l border-outline-variant pt-6 md:pt-0 md:pl-6">
                    <div className="mb-4">
                      <p className="text-label-md text-on-surface-variant uppercase tracking-wider mb-1">
                        Total Amount
                      </p>
                      <p className="text-headline-md text-on-surface">
                        ${Number(o.total).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link to={`/orders/${o.id}`} className="btn-primary py-2 text-center">
                        View Details
                      </Link>
                      <button
                        onClick={() => reorder(o)}
                        className="py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        Reorder
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
