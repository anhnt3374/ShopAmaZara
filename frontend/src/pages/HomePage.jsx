import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { listProducts } from '../services/products.js';

const HERO_IMG =
  'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80';
const AUDIO_IMG =
  'https://images.unsplash.com/photo-1518443895914-2261a72d83d1?auto=format&fit=crop&w=800&q=80';
const WATCH_IMG =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

const categories = [
  { icon: 'devices', label: 'Electronics' },
  { icon: 'checkroom', label: 'Apparel' },
  { icon: 'chair', label: 'Home & Garden' },
  { icon: 'sports_basketball', label: 'Sports' },
  { icon: 'auto_awesome', label: 'Beauty' },
  { icon: 'toys', label: 'Toys' },
];

export default function HomePage() {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    listProducts().then((res) => setProducts(res.items));
  }, []);

  return (
    <div className="container-max py-gutter flex flex-col gap-12">
      {/* Hero bento */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-unit md:h-[500px]">
        <div className="md:col-span-2 bg-primary-container text-on-primary rounded-xl p-8 flex flex-col justify-end relative overflow-hidden group min-h-[260px]">
          <img
            src={HERO_IMG}
            alt="Premium workspace"
            className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay group-hover:scale-105 transition-transform duration-700"
          />
          <div className="relative z-10 max-w-md">
            <span className="inline-block px-3 py-1 bg-secondary-container text-on-secondary-container text-label-md rounded-full mb-4">
              Summer Sale
            </span>
            <h1 className="text-display-lg mb-4">Elevate Your Tech Essentials</h1>
            <p className="text-body-lg text-primary-fixed-dim mb-8">
              Discover premium gadgets and accessories designed for professional excellence.
            </p>
            <Link
              to="/search"
              className="bg-surface text-primary px-6 py-3 rounded-lg text-label-md hover:bg-surface-container-low transition-colors inline-flex items-center gap-2"
            >
              Shop Collection
              <Icon name="arrow_forward" size={20} />
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-unit">
          <Link
            to="/search?cat=Audio"
            className="flex-1 bg-surface-container rounded-xl p-6 relative overflow-hidden group min-h-[200px]"
          >
            <img
              src={AUDIO_IMG}
              alt="Premium headphones"
              className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-multiply group-hover:scale-105 transition-transform duration-700"
            />
            <div className="relative z-10 flex flex-col h-full justify-between">
              <span className="text-label-md text-on-surface-variant uppercase tracking-wider">
                Audio Deals
              </span>
              <div>
                <h2 className="text-headline-md text-on-surface mb-2">Premium Sound</h2>
                <span className="text-primary text-label-md inline-flex items-center gap-1">
                  Up to 40% Off <Icon name="chevron_right" size={16} />
                </span>
              </div>
            </div>
          </Link>
          <Link
            to="/search?cat=Watches"
            className="flex-1 bg-tertiary-container rounded-xl p-6 relative overflow-hidden group min-h-[200px]"
          >
            <img
              src={WATCH_IMG}
              alt="Smart watches"
              className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-multiply group-hover:scale-105 transition-transform duration-700"
            />
            <div className="relative z-10 flex flex-col h-full justify-between">
              <span className="text-label-md text-on-tertiary-container uppercase tracking-wider">
                New Arrivals
              </span>
              <div>
                <h2 className="text-headline-md text-on-tertiary mb-2">Smart Watches</h2>
                <span className="text-primary-fixed-dim text-label-md inline-flex items-center gap-1">
                  Explore Range <Icon name="chevron_right" size={16} />
                </span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-headline-lg text-on-surface">Shop by Category</h2>
          <Link to="/search" className="text-label-md text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-unit">
          {categories.map((c) => (
            <Link
              key={c.label}
              to={`/search?cat=${encodeURIComponent(c.label)}`}
              className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary hover:shadow-lifted transition-all"
            >
              <Icon name={c.icon} className="text-primary" size={32} />
              <span className="text-body-sm text-on-surface text-center">{c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trending */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-headline-lg text-on-surface">Trending Now</h2>
          <Link to="/search" className="text-label-md text-primary hover:underline">
            See all products
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-container-low border border-outline-variant rounded-xl p-6">
        {[
          { icon: 'local_shipping', title: 'Free shipping', body: 'On orders over $50' },
          { icon: 'verified_user', title: '2-year warranty', body: 'Every product covered' },
          { icon: 'replay', title: '30-day returns', body: 'No questions asked' },
          { icon: 'support_agent', title: '24/7 support', body: 'Reach us anytime' },
        ].map((it) => (
          <div key={it.title} className="flex items-start gap-3">
            <Icon name={it.icon} className="text-primary" size={28} />
            <div>
              <div className="text-label-md text-on-surface">{it.title}</div>
              <div className="text-body-sm text-on-surface-variant">{it.body}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
