import Icon from '../../components/Icon.jsx';

const TILES = [
  { key: 'total', label: 'Total Products', icon: 'inventory_2', color: 'text-primary' },
  { key: 'inStock', label: 'In Stock', icon: 'check_circle', color: 'text-emerald-700' },
  { key: 'lowStock', label: 'Low Stock', icon: 'warning', color: 'text-secondary' },
  { key: 'outOfStock', label: 'Out of Stock', icon: 'cancel', color: 'text-error' },
];

export default function InventoryKpiCards({ kpi }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {TILES.map((t) => (
        <div key={t.key} className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Icon name={t.icon} className={t.color} size={20} />
            <span className="text-body-sm">{t.label}</span>
          </div>
          <p className={`text-headline-lg font-bold mt-2 ${t.key === 'outOfStock' || t.key === 'lowStock' ? t.color : 'text-on-surface'}`}>
            {kpi?.[t.key] ?? 0}
          </p>
        </div>
      ))}
    </section>
  );
}
