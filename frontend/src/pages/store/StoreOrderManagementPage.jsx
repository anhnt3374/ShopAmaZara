import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { listOrders } from '../../services/orders.js';

const STATUS_STYLES = {
  Processing: 'bg-secondary-container/20 text-secondary border border-secondary-container/40',
  Shipped: 'bg-primary-container/15 text-primary border border-primary-container/30',
  Delivered: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  Cancelled: 'bg-error-container text-on-error-container border border-error/30',
};

export default function StoreOrderManagementPage() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    listOrders().then((res) => setOrders(res.items));
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'All' && o.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, statusFilter, query]);

  const totals = useMemo(() => {
    const all = orders.length;
    const processing = orders.filter((o) => o.status === 'Processing').length;
    const revenue = orders.reduce((sum, o) => sum + o.total, 0);
    return { all, processing, revenue };
  }, [orders]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-on-surface">Orders</h1>
          <p className="text-body-sm text-on-surface-variant">
            Manage incoming orders and fulfillment.
          </p>
        </div>
        <button className="btn-primary px-4 py-2 text-body-sm">
          <Icon name="download" size={18} /> Export CSV
        </button>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon="receipt_long" label="Total orders" value={totals.all} accent="primary" />
        <StatCard icon="hourglass_top" label="Processing" value={totals.processing} accent="secondary" />
        <StatCard
          icon="payments"
          label="Revenue"
          value={`$${totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          accent="tertiary"
        />
      </section>

      {/* Filters */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order, customer, email…"
            className="field w-full py-2 pl-10 pr-3 text-body-sm"
          />
          <Icon name="search" size={20} className="absolute left-3 top-2.5 text-outline" />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin">
          {['All', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-body-sm whitespace-nowrap transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-label-md uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Items</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filtered.map((o, idx) => (
                <tr
                  key={o.id}
                  className={idx % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/50'}
                >
                  <td className="px-4 py-3 text-data-mono text-primary">{o.id}</td>
                  <td className="px-4 py-3">
                    <div className="text-on-surface">{o.customer}</div>
                    <div className="text-body-sm text-on-surface-variant">{o.email}</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{o.date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-1 rounded-full ${STATUS_STYLES[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-data-mono text-on-surface-variant hidden sm:table-cell">{o.items}</td>
                  <td className="px-4 py-3 text-right text-data-mono text-on-surface font-semibold">
                    ${o.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary">
                      <Icon name="more_horiz" size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-on-surface-variant">No orders match those filters.</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  const accents = {
    primary: 'bg-primary-container/10 text-primary',
    secondary: 'bg-secondary-container/20 text-secondary',
    tertiary: 'bg-tertiary-container/10 text-tertiary',
  };
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${accents[accent]}`}>
        <Icon name={icon} size={24} />
      </div>
      <div>
        <div className="text-body-sm text-on-surface-variant">{label}</div>
        <div className="text-headline-md text-on-surface font-bold">{value}</div>
      </div>
    </div>
  );
}
