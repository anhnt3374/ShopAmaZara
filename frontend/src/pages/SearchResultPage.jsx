import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import { getProductFacets, listProducts } from '../services/products.js';

const PAGE_SIZE = 24;

export default function SearchResultPage() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'featured';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const selectedCats = params.getAll('category');

  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: PAGE_SIZE });
  const [facets, setFacets] = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMinDraft, setPriceMinDraft] = useState(minPrice);
  const [priceMaxDraft, setPriceMaxDraft] = useState(maxPrice);

  useEffect(() => {
    getProductFacets()
      .then(setFacets)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setPriceMinDraft(minPrice);
    setPriceMaxDraft(maxPrice);
  }, [minPrice, maxPrice]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProducts({
      q: q || undefined,
      category: selectedCats.length ? selectedCats : undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      sort,
      page,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, page, minPrice, maxPrice, selectedCats.join('|')]);

  function updateParam(mutator) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutator(next);
        // Any filter change resets to page 1 unless mutator set it itself
        if (!next.has('__keepPage')) next.delete('page');
        next.delete('__keepPage');
        return next;
      },
      { replace: true },
    );
  }

  function setPage(n) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (n <= 1) next.delete('page');
        else next.set('page', String(n));
        return next;
      },
      { replace: false },
    );
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleCategory(cat) {
    updateParam((next) => {
      const current = next.getAll('category');
      next.delete('category');
      const after = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
      for (const c of after) next.append('category', c);
    });
  }

  function setSort(value) {
    updateParam((next) => {
      if (!value || value === 'featured') next.delete('sort');
      else next.set('sort', value);
    });
  }

  function applyPriceRange() {
    updateParam((next) => {
      if (priceMinDraft) next.set('minPrice', priceMinDraft);
      else next.delete('minPrice');
      if (priceMaxDraft) next.set('maxPrice', priceMaxDraft);
      else next.delete('maxPrice');
    });
  }

  function clearAllFilters() {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const keepQ = prev.get('q');
        if (keepQ) next.set('q', keepQ);
        return next;
      },
      { replace: true },
    );
    setPriceMinDraft('');
    setPriceMaxDraft('');
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const firstIndex = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(page * PAGE_SIZE, data.total);
  const categoryList = facets.categories.length ? facets.categories : selectedCats;

  const filters = (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-4">
        <h2 className="text-headline-md text-on-surface">Filters</h2>
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-label-md text-primary hover:underline"
        >
          Clear all
        </button>
      </div>

      <div>
        <h3 className="text-label-md text-on-surface-variant mb-3 uppercase tracking-wider">
          Categories
        </h3>
        <CategoryFilter
          categories={categoryList}
          selected={selectedCats}
          onToggle={toggleCategory}
        />
      </div>

      <div>
        <h3 className="text-label-md text-on-surface-variant mb-3 uppercase tracking-wider">
          Price Range
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={priceMinDraft}
            onChange={(e) => setPriceMinDraft(e.target.value)}
            onBlur={applyPriceRange}
            onKeyDown={(e) => e.key === 'Enter' && applyPriceRange()}
            className="field w-full py-2 px-3 text-body-sm"
            placeholder="Min"
            type="number"
            min="0"
          />
          <span className="text-on-surface-variant">-</span>
          <input
            value={priceMaxDraft}
            onChange={(e) => setPriceMaxDraft(e.target.value)}
            onBlur={applyPriceRange}
            onKeyDown={(e) => e.key === 'Enter' && applyPriceRange()}
            className="field w-full py-2 px-3 text-body-sm"
            placeholder="Max"
            type="number"
            min="0"
          />
        </div>
        {facets.priceRange?.max ? (
          <p className="text-body-sm text-on-surface-variant mt-2">
            Catalog range: ${facets.priceRange.min} – ${facets.priceRange.max}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="container-max py-8 grid grid-cols-1 md:grid-cols-12 gap-gutter">
      <aside className="hidden md:block md:col-span-3">
        <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin pr-2">
          {filters}
        </div>
      </aside>

      {filtersOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="relative z-10 ml-auto h-full w-80 bg-surface-container-lowest p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <span className="text-headline-md text-on-surface">Filters</span>
              <button
                onClick={() => setFiltersOpen(false)}
                className="p-2 rounded-full hover:bg-surface-container"
              >
                <Icon name="close" />
              </button>
            </div>
            {filters}
          </div>
        </div>
      )}

      <section className="md:col-span-9">
        <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
          <span className="text-body-sm text-on-surface-variant">
            {data.total === 0 ? (
              'No products found'
            ) : (
              <>
                Showing <span className="text-on-surface font-semibold">{firstIndex}–{lastIndex}</span>{' '}
                of <span className="text-on-surface font-semibold">{data.total}</span> products
                {q ? (
                  <>
                    {' '}for <span className="text-on-surface font-semibold">"{q}"</span>
                  </>
                ) : null}
              </>
            )}
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
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-12 text-center text-on-surface-variant">
            <Icon name="hourglass_top" /> Loading products…
          </div>
        ) : data.items.length === 0 ? (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-12 text-center">
            <Icon name="search_off" className="text-outline" size={48} />
            <p className="text-headline-md text-on-surface mt-4">No products match those filters</p>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Try widening your price range or removing categories.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function paginationRange(current, total) {
  // Returns an array like [1, '…', 4, 5, 6, '…', 192]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const withGaps = [];
  for (let i = 0; i < pages.length; i++) {
    withGaps.push(pages[i]);
    if (i < pages.length - 1 && pages[i + 1] - pages[i] > 1) {
      withGaps.push('…');
    }
  }
  return withGaps;
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const items = useMemo(() => paginationRange(page, totalPages), [page, totalPages]);
  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-center gap-1 flex-wrap"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 h-9 rounded-md border border-outline-variant bg-surface text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-body-sm"
      >
        <Icon name="chevron_left" size={18} />
        <span className="hidden sm:inline">Prev</span>
      </button>

      {items.map((it, idx) =>
        it === '…' ? (
          <span
            key={`gap-${idx}`}
            className="px-2 h-9 flex items-center text-on-surface-variant select-none"
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => onChange(it)}
            aria-current={it === page ? 'page' : undefined}
            className={`min-w-9 h-9 px-3 rounded-md text-body-sm font-medium border transition-colors ${
              it === page
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-on-surface border-outline-variant hover:bg-surface-container'
            }`}
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 h-9 rounded-md border border-outline-variant bg-surface text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-body-sm"
      >
        <span className="hidden sm:inline">Next</span>
        <Icon name="chevron_right" size={18} />
      </button>
    </nav>
  );
}
