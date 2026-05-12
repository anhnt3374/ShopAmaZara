import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import StoreSideNav from '../components/StoreSideNav.jsx';
import Icon from '../components/Icon.jsx';

// Store admin layout. Sidebar is `sticky top-0 h-screen` on md+ so it does
// not scroll with content. On mobile it slides in from the left as a drawer.
export default function StoreLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <StoreSideNav />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-10">
            <StoreSideNav onItemClick={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Mobile top bar with menu */}
        <header className="md:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-2 rounded-full hover:bg-surface-container-high"
          >
            <Icon name="menu" />
          </button>
          <span className="text-headline-md text-primary font-bold">AmaZara</span>
          <span className="text-[10px] font-bold uppercase text-secondary-container ml-1">Seller</span>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
