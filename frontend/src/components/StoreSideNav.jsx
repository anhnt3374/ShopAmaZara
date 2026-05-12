import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

const items = [
  { to: '/store', icon: 'dashboard', label: 'Dashboard', end: true },
  { to: '/store/orders', icon: 'receipt_long', label: 'Orders' },
  { to: '/store/inventory', icon: 'inventory_2', label: 'Inventory' },
  { to: '/store/messages', icon: 'forum', label: 'Messages' },
];

export default function StoreSideNav({ onItemClick }) {
  const navigate = useNavigate();
  return (
    <aside className="bg-surface-container-low border-r border-outline-variant w-64 h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-2">
        <NavLink to="/" className="text-headline-md font-bold text-primary">
          AmaZara
        </NavLink>
        <span className="text-[10px] font-bold uppercase tracking-wider text-secondary-container bg-secondary-container/10 px-2 py-0.5 rounded">
          Seller
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-label-md transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
              }`
            }
          >
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
          </NavLink>
        ))}

        <div className="pt-4 mt-4 border-t border-outline-variant space-y-1">
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
          >
            <Icon name="settings" size={20} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-label-md text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
          >
            <Icon name="storefront" size={20} />
            <span>Buyer view</span>
          </button>
        </div>
      </nav>

      <div className="p-3 border-t border-outline-variant">
        <button
          type="button"
          className="btn-primary w-full px-4 py-2 text-body-sm"
        >
          <Icon name="add" size={18} />
          Add Product
        </button>
      </div>
    </aside>
  );
}
