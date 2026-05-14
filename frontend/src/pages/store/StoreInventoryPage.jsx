import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listStoreProducts } from '../../services/inventory.js';
import ImportProductModal from './ImportProductModal.jsx';
import InventoryKpiCards from './InventoryKpiCards.jsx';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
];

export default function StoreInventoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, kpi: null });
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const res = await listStoreProducts({ status, q, page, limit: 20 });
      setData(res);
    } catch (err) {
      toast.error(err?.message ?? 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(reload, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, page]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(data.total / 20)), [data.total]);

  return (
    <div className="space-y-gutter">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg">Inventory Management</h1>
          <p className="text-body-sm text-on-surface-variant">Manage your catalog and stock.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImportOpen(true)} className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm">
            <Icon name="upload" size={18} /> Import
          </button>
          <Link to="/store/products/new" className="btn-primary px-4 py-2 inline-flex items-center gap-2">
            <Icon name="add" size={18} /> Add Product
          </Link>
        </div>
      </header>

      <InventoryKpiCards kpi={data.kpi} />

      <div className="bg-surface border border-outline-variant rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search SKU, name, or brand…"
            className="field w-full pl-10 pr-3 py-2 text-body-sm"
          />
          <Icon name="search" size={20} className="absolute left-3 top-2.5 text-outline" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setStatus(t.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-body-sm whitespace-nowrap transition-colors ${
                status === t.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead className="bg-surface-container-low text-on-surface-variant text-label-md uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">SKU</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Category</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Stock</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-surface-container-low cursor-pointer"
                  onClick={() => navigate(`/store/products/${p.id}`)}
                >
                  <td className="px-4 py-3 flex items-center gap-3">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-12 h-12 rounded object-cover bg-surface-container-low" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-surface-container-low flex items-center justify-center">
                        <Icon name="image" className="text-outline" size={18} />
                      </div>
                    )}
                    <span className="text-on-surface">{p.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-data-mono text-on-surface-variant">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-on-surface-variant">{p.category}</td>
                  <td className="px-4 py-3 text-right text-data-mono">${Number(p.price).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right hidden sm:table-cell text-data-mono ${p.stock === 0 ? 'text-error' : p.stock <= 10 ? 'text-secondary' : 'text-on-surface'}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge product={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/store/products/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline text-body-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data.items.length === 0 && (
          <div className="p-10 text-center text-on-surface-variant">No products match those filters.</div>
        )}
        {pageCount > 1 && (
          <div className="px-4 py-3 border-t border-outline-variant flex justify-between items-center">
            <span className="text-body-sm text-on-surface-variant">
              Page {page} of {pageCount} · {data.total} products
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-outline-variant disabled:opacity-50 text-body-sm"
              >
                Prev
              </button>
              <button
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-outline-variant disabled:opacity-50 text-body-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ImportProductModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={reload}
      />
    </div>
  );
}

function StatusBadge({ product }) {
  if (!product.isPublished) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container text-on-surface-variant">
        Draft
      </span>
    );
  }
  if (product.stock === 0) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-error-container text-on-error-container">
        Out of Stock
      </span>
    );
  }
  if (product.stock <= 10) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-secondary-container/20 text-secondary">
        Low Stock
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
      Active
    </span>
  );
}
