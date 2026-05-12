import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { listProducts } from '../services/products.js';

const CATEGORIES = ['Electronics', 'Apparel', 'Home & Garden', 'Sports & Outdoors'];
const RATINGS = [
  { value: 4.5, label: '4.5 & up' },
  { value: 4, label: '4.0 & up' },
  { value: 3, label: '3.0 & up' },
];

export default function SearchResultPage() {
  const [products, setProducts] = useState([]);
  const [params] = useSearchParams();
  const queryParam = params.get('q') ?? '';
  const catParam = params.get('cat') ?? '';

  const [selectedCats, setSelectedCats] = useState(() =>
    catParam ? [catParam] : [],
  );
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    listProducts().then((res) => setProducts(res.items));
  }, []);

  const filtered = useMemo(() => {
    let next = [...products];
    if (queryParam) {
      const q = queryParam.toLowerCase();
      next = next.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.subtitle.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q),
      );
    }
    if (selectedCats.length > 0) {
      next = next.filter((p) => selectedCats.includes(p.category));
    }
    if (priceMin) next = next.filter((p) => p.price >= Number(priceMin));
    if (priceMax) next = next.filter((p) => p.price <= Number(priceMax));
    if (minRating) next = next.filter((p) => p.rating >= minRating);
    if (sort === 'price-asc') next.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') next.sort((a, b) => b.price - a.price);
    if (sort === 'newest') next.sort((a, b) => b.reviewCount - a.reviewCount);
    return next;
  }, [products, queryParam, selectedCats, priceMin, priceMax, minRating, sort]);

  function toggleCategory(cat) {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  const filters = (
    <div className="space-y-6">
      <div>
        <h2 className="text-headline-md text-on-surface mb-6 border-b border-outline-variant pb-2">
          Filters
        </h2>
      </div>
      <div>
        <h3 className="text-label-md text-on-surface-variant mb-3 uppercase tracking-wider">
          Categories
        </h3>
        <ul className="space-y-2 text-body-sm text-on-surface">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedCats.includes(c)}
                  onChange={() => toggleCategory(c)}
                  className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                />
                <span className="group-hover:text-primary transition-colors">{c}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-label-md text-on-surface-variant mb-3 uppercase tracking-wider">
          Price Range
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="field w-full py-2 px-3 text-body-sm"
            placeholder="Min"
            type="number"
            min="0"
          />
          <span className="text-on-surface-variant">-</span>
          <input
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="field w-full py-2 px-3 text-body-sm"
            placeholder="Max"
            type="number"
            min="0"
          />
        </div>
      </div>
      <div>
        <h3 className="text-label-md text-on-surface-variant mb-3 uppercase tracking-wider">
          Minimum Rating
        </h3>
        <ul className="space-y-2 text-body-sm">
          <li>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                name="rating"
                type="radio"
                checked={minRating === 0}
                onChange={() => setMinRating(0)}
                className="border-outline-variant text-primary focus:ring-primary h-4 w-4"
              />
              <span>Any rating</span>
            </label>
          </li>
          {RATINGS.map((r) => (
            <li key={r.value}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  name="rating"
                  type="radio"
                  checked={minRating === r.value}
                  onChange={() => setMinRating(r.value)}
                  className="border-outline-variant text-primary focus:ring-primary h-4 w-4"
                />
                <div className="flex items-center gap-1 text-secondary-container">
                  <Icon name="star" filled size={16} />
                  <span className="text-on-surface group-hover:text-primary">{r.label}</span>
                </div>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="container-max py-8 grid grid-cols-1 md:grid-cols-12 gap-gutter">
      {/* Sticky sidebar (desktop) */}
      <aside className="hidden md:block md:col-span-3 lg:col-span-3">
        <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin pr-2">
          {filters}
        </div>
      </aside>

      {/* Mobile filters drawer */}
      {filtersOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} />
          <div className="relative z-10 ml-auto h-full w-80 bg-surface-container-lowest p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <span className="text-headline-md text-on-surface">Filters</span>
              <button onClick={() => setFiltersOpen(false)} className="p-2 rounded-full hover:bg-surface-container">
                <Icon name="close" />
              </button>
            </div>
            {filters}
          </div>
        </div>
      )}

      <section className="md:col-span-9 lg:col-span-9">
        <div className="flex justify-between items-center mb-6 gap-3">
          <span className="text-body-sm text-on-surface-variant">
            Showing {filtered.length} of {products.length} products
            {queryParam ? <> for <span className="text-on-surface font-semibold">"{queryParam}"</span></> : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="md:hidden btn-secondary px-3 py-1.5 text-body-sm"
            >
              <Icon name="filter_list" size={18} /> Filters
            </button>
            <span className="hidden sm:inline text-body-sm text-on-surface-variant">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="field py-1.5 px-3 text-body-sm"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="newest">Most Reviewed</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-12 text-center">
            <Icon name="search_off" className="text-outline" size={48} />
            <p className="text-headline-md text-on-surface mt-4">No products match those filters</p>
            <p className="text-body-sm text-on-surface-variant mt-1">Try widening your price range or removing categories.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
