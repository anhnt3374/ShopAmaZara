import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';

const links = [
  { to: '/', label: 'Shop', end: true },
  { to: '/search', label: 'Deals' },
  { to: '/store', label: 'Sell' },
  { to: '/policy', label: 'Support' },
];

export default function TopNavBar() {
  const navigate = useNavigate();
  const { count } = useCart();
  const { ids: wishlistIds } = useWishlist();
  const [query, setQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function submitSearch(e) {
    e.preventDefault();
    const trimmed = query.trim();
    navigate(`/search${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`);
  }

  return (
    <nav className="bg-surface/95 backdrop-blur-md text-primary sticky top-0 z-50 border-b border-outline-variant shadow-sm w-full">
      <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-16">
        <div className="flex items-center gap-unit">
          <NavLink to="/" className="text-headline-md font-bold text-primary">
            AmaZara
          </NavLink>
        </div>

        <div className="hidden md:flex items-center gap-gutter text-label-md">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                isActive
                  ? 'text-primary border-b-2 border-primary pb-1'
                  : 'text-on-surface-variant hover:text-primary transition-colors'
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-unit">
          <form onSubmit={submitSearch} className="relative hidden md:block">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field pl-10 pr-4 py-2 text-body-sm w-64"
              placeholder="Search products..."
              type="search"
            />
            <Icon
              name="search"
              className="absolute left-3 top-2.5 text-outline"
              size={20}
            />
          </form>

          <button
            onClick={() => navigate('/search')}
            aria-label="Search"
            className="md:hidden p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
          >
            <Icon name="search" />
          </button>

          <NavLink
            to="/wishlist"
            aria-label="Wishlist"
            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all relative"
          >
            <Icon name="favorite" />
            {wishlistIds.length > 0 && (
              <span className="absolute top-1 right-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                {wishlistIds.length}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/cart"
            aria-label="Cart"
            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all relative"
          >
            <Icon name="shopping_cart" />
            {count > 0 && (
              <span className="absolute top-1 right-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/messages"
            aria-label="Messages"
            className="hidden sm:inline-flex p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
          >
            <Icon name="chat" />
          </NavLink>

          <NavLink
            to="/auth"
            aria-label="Account"
            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
          >
            <Icon name="account_circle" />
          </NavLink>

          <button
            aria-label="Menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
          >
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-outline-variant bg-surface">
          <div className="px-margin-mobile py-3 flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-label-md ${
                    isActive
                      ? 'bg-surface-container text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <form onSubmit={submitSearch} className="relative mt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="field pl-10 pr-4 py-2 text-body-sm w-full"
                placeholder="Search products..."
                type="search"
              />
              <Icon name="search" className="absolute left-3 top-2.5 text-outline" size={20} />
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
