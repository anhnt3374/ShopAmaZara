import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import OrderStatusBadge from '../components/OrderStatusBadge.jsx';
import OrderTimeline from '../components/OrderTimeline.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cancelOrder, getOrder } from '../services/orders.js';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const o = await getOrder(id);
      setOrder(o);
    } catch (err) {
      if (err?.status === 403 || err?.status === 404) {
        toast.error('Order unavailable');
        navigate('/orders', { replace: true });
        return;
      }
      toast.error(err?.message ?? 'Could not load order');
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <div className="container-max py-8">Loading…</div>;

  const onCancel = async () => {
    if (!confirm('Cancel this order? Stock will be restored.')) return;
    setBusy(true);
    try {
      await cancelOrder(id);
      toast.success('Order cancelled');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const addr = order.shipping_address;

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <nav className="flex items-center gap-2 text-on-surface-variant text-label-md mb-2">
              <Link to="/account" className="hover:text-primary">Account</Link>
              <Icon name="chevron_right" size={14} />
              <Link to="/orders" className="hover:text-primary">Orders</Link>
              <Icon name="chevron_right" size={14} />
              <span className="text-on-surface">#{order.id}</span>
            </nav>
            <h1 className="text-headline-lg text-on-surface">Order Details</h1>
          </div>
          {order.status === 'Paid' && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="border border-outline px-6 py-2 rounded-lg text-label-md text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          <section className="md:col-span-8 bg-surface border border-outline-variant rounded-xl p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-headline-md text-on-surface">Status</h2>
              <OrderStatusBadge status={order.status} />
            </div>
            <OrderTimeline order={order} />
          </section>

          <div className="md:col-span-4 flex flex-col gap-gutter">
            <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="location_on" size={18} className="text-primary" />
                <h3 className="text-label-md uppercase tracking-wider text-on-surface-variant">
                  Shipping Address
                </h3>
              </div>
              <p className="font-semibold text-on-surface">{addr.recipientName}</p>
              <p className="text-body-sm text-on-surface-variant leading-relaxed mt-1">
                {addr.line1}
                {addr.line2 ? <><br />{addr.line2}</> : null}
                <br />
                {addr.city}, {addr.region} {addr.postalCode}
                <br />
                {addr.country}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-2">{addr.phone}</p>
              <p className="text-body-sm text-on-surface-variant mt-3">
                Method: {order.shippingMethod}
              </p>
            </section>
            <section className="bg-surface-container border border-outline-variant rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="credit_card" size={18} className="text-primary" />
                <h3 className="text-label-md uppercase tracking-wider text-on-surface-variant">
                  Payment Method
                </h3>
              </div>
              <p className="font-semibold text-on-surface">
                {order.payment.method === 'card'
                  ? `Card ending in ${order.payment.last4 ?? '----'}`
                  : order.payment.method === 'ewallet'
                  ? 'E-wallet'
                  : order.payment.method === 'bank'
                  ? 'Bank transfer'
                  : 'Cash on delivery'}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Txn: {order.payment.txnId}
              </p>
            </section>
          </div>

          <section className="md:col-span-8 bg-surface border border-outline-variant rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <h3 className="text-headline-md text-on-surface">Order Items ({order.items.length})</h3>
            </div>
            <ul className="divide-y divide-outline-variant">
              {order.items.map((it) => (
                <li key={it.id} className="px-6 py-5 flex gap-4">
                  <Link
                    to={`/product/${it.productId}`}
                    className="w-20 h-20 flex-none rounded-lg overflow-hidden border border-outline-variant bg-surface-container"
                    title={it.name}
                  >
                    {it.image ? (
                      <img
                        src={it.image}
                        alt={it.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-body-xs text-on-surface-variant text-center px-1">
                        {it.name}
                      </div>
                    )}
                  </Link>
                  <div className="flex-grow flex flex-col justify-between min-w-0">
                    <Link
                      to={`/product/${it.productId}`}
                      className="text-body-md text-primary font-semibold hover:underline truncate"
                    >
                      {it.name}
                    </Link>
                    <div className="text-body-sm text-on-surface-variant">
                      ${Number(it.price).toFixed(2)} · Qty {it.quantity}
                    </div>
                    <div className="flex justify-end">
                      <span className="text-headline-md text-on-surface">
                        ${(Number(it.price) * it.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="md:col-span-4">
            <div className="bg-surface-container-high border border-outline-variant rounded-xl p-6 md:sticky md:top-24">
              <h3 className="text-headline-md text-on-surface mb-4">Order Summary</h3>
              <div className="space-y-2 text-body-md">
                <Row label="Subtotal" value={`$${Number(order.subtotal).toFixed(2)}`} />
                <Row label={`Shipping (${order.shippingMethod})`} value={`$${Number(order.shipping).toFixed(2)}`} />
                <Row label="Tax (8%)" value={`$${Number(order.tax).toFixed(2)}`} />
              </div>
              <div className="border-t border-outline-variant pt-4 mt-4 flex justify-between items-center">
                <span className="text-headline-md text-on-surface">Total</span>
                <span className="text-headline-lg text-primary">${Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          </aside>
        </div>
      </main>
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
