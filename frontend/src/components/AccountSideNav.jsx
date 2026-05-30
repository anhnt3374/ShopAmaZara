import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';

const links = [
  { to: '/account', icon: 'account_circle', label: 'Profile', end: true },
  { to: '/orders', icon: 'list_alt', label: 'My Orders' },
  { to: '/account/addresses', icon: 'location_on', label: 'Addresses' },
];

export default function AccountSideNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    if (!confirm('Sign out of your account?')) return;
    logout();
    navigate('/');
  }

  return (
    <aside className="hidden md:flex flex-col gap-2 w-64 shrink-0 pr-4">
      <div className="mb-6 px-4">
        <h3 className="text-headline-md text-primary">Welcome back</h3>
        <p className="text-body-sm text-on-surface-variant">Manage your account</p>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `px-4 py-3 flex items-center gap-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-container text-on-primary-container font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            <Icon name={l.icon} size={20} />
            <span className="text-label-md">{l.label}</span>
          </NavLink>
        ))}
        {user?.role === 'seller' && (
          <NavLink
            to="/store"
            className="mt-4 px-4 py-3 flex items-center gap-3 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <Icon name="dashboard" size={20} />
            <span className="text-label-md">View Dashboard</span>
          </NavLink>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 px-4 py-3 flex items-center gap-3 rounded-lg text-error hover:bg-error/10 transition-colors text-left"
        >
          <Icon name="logout" size={20} />
          <span className="text-label-md">Sign out</span>
        </button>
      </nav>
    </aside>
  );
}
