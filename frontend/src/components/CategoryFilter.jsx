import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';

export default function CategoryFilter({ categories, selected, onToggle }) {
  const [query, setQuery] = useState('');

  const unselectedMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter(
      (c) => !selected.includes(c) && (q === '' || c.toLowerCase().includes(q)),
    );
  }, [categories, selected, query]);

  if (categories.length === 0) {
    return <p className="text-body-sm text-on-surface-variant">Loading…</p>;
  }

  return (
    <div>
      <div className="relative mb-3">
        <Icon
          name="search"
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search categories"
          placeholder="Search categories…"
          className="field w-full py-2 pl-9 pr-9 text-body-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear category search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {selected.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 bg-primary-container text-on-primary-container rounded-full pl-3 pr-1.5 py-1 text-body-sm"
              >
                <span className="truncate max-w-[10rem]">{c}</span>
                <button
                  type="button"
                  onClick={() => onToggle(c)}
                  aria-label={`Remove ${c}`}
                  className="p-0.5 rounded-full hover:bg-on-primary/20"
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
          <hr className="border-outline-variant mb-3" />
        </>
      )}

      {unselectedMatches.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No categories match</p>
      ) : (
        <ul className="space-y-2 text-body-sm text-on-surface max-h-72 overflow-auto scrollbar-thin pr-1">
          {unselectedMatches.map((c) => (
            <li key={c}>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  // always false: selected items are removed from this list and shown as chips above
                  checked={false}
                  onChange={() => onToggle(c)}
                  className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                />
                <span className="group-hover:text-primary transition-colors truncate">{c}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
