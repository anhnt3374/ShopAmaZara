import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { listInventory } from '../../services/inventory.js';

const STATUS_STYLES = {
  'In Stock': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  'Low Stock': 'bg-secondary-container/20 text-secondary border border-secondary-container/40',
  'Out of Stock': 'bg-error-container text-on-error-container border border-error/30',
};

export default function StoreInventoryPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listInventory().then((res) => setItems(res.items));
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          !query ||
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          i.sku.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );

  const kpis = useMemo(() => {
    const totalSku = items.length;
    const low = items.filter((i) => i.status === 'Low Stock').length;
    const out = items.filter((i) => i.status === 'Out of Stock').length;
    const value = items.reduce((sum, i) => sum + i.stock * i.price, 0);
    return { totalSku, low, out, value };
  }, [items]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-on-surface">Inventory</h1>
          <p className="text-body-sm text-on-surface-variant">
            Track stock levels and restock alerts across your catalog.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary px-3 py-2 text-body-sm">
            <Icon name="upload" size={18} /> Import
          </button>
          <button className="btn-primary px-3 py-2 text-body-sm">
            <Icon name="add" size={18} /> New SKU
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Total SKUs" value={kpis.totalSku} icon="inventory_2" />
          <Kpi label="Low stock" value={kpis.low} icon="trending_down" accent="secondary" />
          <Kpi label="Out of stock" value={kpis.out} icon="warning" accent="error" />
          <Kpi
            label="Stock value"
            value={`$${kpis.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon="payments"
            accent="primary"
          />
        </div>
        <div className="md:col-span-4 bg-primary-container/10 border border-primary-container/30 text-primary rounded-xl p-4 flex flex-col gap-2">
          <Icon name="auto_awesome" />
          <h2 className="text-label-md">Auto-restock suggestion</h2>
          <p className="text-body-sm">
            3 SKUs are projected to run out within 5 days based on the last 14-day velocity.
          </p>
          <button className="text-label-md self-start mt-2 inline-flex items-center gap-1 hover:underline">
            Review forecast <Icon name="arrow_forward" size={16} />
          </button>
        </div>
      </section>

      <div className="bg-surface border border-outline-variant rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by SKU or product name…"
            className="field w-full py-2 pl-10 pr-3 text-body-sm"
          />
          <Icon name="search" size={20} className="absolute left-3 top-2.5 text-outline" />
        </div>
        <button className="btn-secondary px-3 py-2 text-body-sm">
          <Icon name="filter_list" size={18} /> Filter
        </button>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-label-md uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">SKU</th>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Category</th>
                <th className="text-right px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Price</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filtered.map((i, idx) => (
                <tr
                  key={i.sku}
                  className={idx % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/50'}
                >
                  <td className="px-4 py-3 text-data-mono text-primary">{i.sku}</td>
                  <td className="px-4 py-3 text-on-surface">{i.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{i.category}</td>
                  <td className="px-4 py-3 text-right text-data-mono text-on-surface font-semibold">{i.stock}</td>
                  <td className="px-4 py-3 text-right text-data-mono text-on-surface-variant hidden sm:table-cell">${i.price.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-1 rounded-full ${STATUS_STYLES[i.status]}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary">
                      <Icon name="edit" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, accent = 'primary' }) {
  const accents = {
    primary: 'bg-primary-container/10 text-primary',
    secondary: 'bg-secondary-container/20 text-secondary',
    error: 'bg-error-container text-on-error-container',
  };
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-start justify-between">
      <div>
        <div className="text-body-sm text-on-surface-variant">{label}</div>
        <div className="text-headline-md text-on-surface font-bold mt-1">{value}</div>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accents[accent]}`}>
        <Icon name={icon} />
      </div>
    </div>
  );
}
