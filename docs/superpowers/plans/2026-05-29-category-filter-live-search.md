# Category Filter Live Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-search box and selected-category chips to the category filter on the search results page, so users can find and review chosen categories without scrolling the full list.

**Architecture:** Extract the category filter into a new presentational `CategoryFilter` component. It owns only a local `query` string for the search box; selection stays in the `category` URL params managed by `SearchResultPage` and is passed in via props (`selected`, `onToggle`).

**Tech Stack:** React 18, Tailwind CSS with the project's Material-style tokens (`primary-container`, `on-primary`, `on-surface-variant`, `outline-variant`, the `.field` and `.scrollbar-thin` utilities), the `Icon` wrapper for Material Symbols.

---

### Task 1: Create the CategoryFilter component

**Files:**
- Create: `frontend/src/components/CategoryFilter.jsx`

There is no frontend test harness in this project (per `CLAUDE.md`), so this task uses careful code review plus the visual verification in Task 3.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/CategoryFilter.jsx` with exactly this content:

```jsx
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
                className="inline-flex items-center gap-1 bg-primary-container text-on-primary rounded-full pl-3 pr-1.5 py-1 text-body-sm"
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
```

Notes for the implementer:
- The component is presentational: it does NOT track which categories are selected — that comes from the `selected` prop. The only state is `query`.
- The bottom list intentionally shows only categories that are **not** selected (selected ones appear as chips above). Checkboxes there are always `checked={false}`; clicking calls `onToggle(c)`.
- `Icon` is the project's Material Symbols wrapper; `name="search"` and `name="close"` are valid symbol names already used elsewhere in the app.

- [ ] **Step 2: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/components/CategoryFilter.jsx
git commit -m "feat(fe): add CategoryFilter component with live search and chips"
```

---

### Task 2: Wire CategoryFilter into SearchResultPage

**Files:**
- Modify: `frontend/src/pages/SearchResultPage.jsx`

- [ ] **Step 1: Add the import**

In `frontend/src/pages/SearchResultPage.jsx`, the existing imports (lines 1-5) are:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { getProductFacets, listProducts } from '../services/products.js';
```

Add the `CategoryFilter` import after the `ProductCard` import so the block reads:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import { getProductFacets, listProducts } from '../services/products.js';
```

- [ ] **Step 2: Replace the inline category list with the component**

Find this block inside the `filters` JSX (the Categories section). The `<h3>Categories</h3>` heading stays; only the conditional list below it is replaced. Current code:

```jsx
        {categoryList.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Loading…</p>
        ) : (
          <ul className="space-y-2 text-body-sm text-on-surface max-h-72 overflow-auto scrollbar-thin pr-1">
            {categoryList.map((c) => (
              <li key={c}>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedCats.includes(c)}
                    onChange={() => toggleCategory(c)}
                    className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="group-hover:text-primary transition-colors truncate">{c}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
```

Replace that entire block with:

```jsx
        <CategoryFilter
          categories={categoryList}
          selected={selectedCats}
          onToggle={toggleCategory}
        />
```

Leave the surrounding `<div>` and the `<h3 ...>Categories</h3>` heading untouched.

- [ ] **Step 3: Verify the build compiles**

There is no test harness, so confirm the dev build has no syntax/import errors:

```bash
cd /home/anhnt2112/Documents/temp/amazara/frontend && npx vite build 2>&1 | tail -20
```

Expected: build completes without errors referencing `CategoryFilter` or `SearchResultPage`. (Pre-existing warnings unrelated to these two files are acceptable.)

- [ ] **Step 4: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add frontend/src/pages/SearchResultPage.jsx
git commit -m "feat(fe): use CategoryFilter in search results sidebar"
```

---

### Task 3: Visual verification

**Files:** none (manual verification)

- [ ] **Step 1: Start the stack**

```bash
cd /home/anhnt2112/Documents/temp/amazara && docker compose up -d
```

- [ ] **Step 2: Verify on the search page**

Open `http://localhost:5173/search` and confirm:
- Typing in the search box filters the list (case-insensitive substring); the × button and clearing the text both restore the full unselected list.
- Selecting a category moves it into the chips area above the divider and removes it from the list below.
- Clicking a chip's × deselects it; the category returns to the list.
- With nothing selected, neither the chips area nor the divider is shown.
- A search query that matches nothing among unselected items shows "No categories match".
- Selecting/deselecting still updates the results grid and the `category` URL params, and the existing "Clear all" button still clears categories.

No commit for this task (verification only).

---

### Task 4: Documentation

**Files:**
- Create: `docs/features/category-filter-live-search.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write the feature doc**

Create `docs/features/category-filter-live-search.md`:

```markdown
# Category Filter Live Search

The category filter in the search results sidebar (`/search`) has a live-search
box and shows selected categories as removable chips, so users don't have to
scroll the full list to find or review their choices.

## Behavior

- A search box filters the category list client-side (case-insensitive substring).
  A × button clears the query.
- Selected categories appear as chips above a divider. Clicking a chip's ×
  deselects it.
- The list below shows only categories that are not selected and match the
  current query. Selecting one moves it up into the chips.
- With nothing selected, no chips area or divider is shown. A query matching
  nothing shows "No categories match".

## Implementation

- `frontend/src/components/CategoryFilter.jsx` — presentational component; owns
  only the search `query`. Props: `categories`, `selected`, `onToggle`.
- `frontend/src/pages/SearchResultPage.jsx` — renders `CategoryFilter` in the
  filter sidebar; selection remains in the `category` URL params via the
  existing `toggleCategory` handler.
```

- [ ] **Step 2: Add a row to the completed-features table**

Open `docs/README.md`, find the "Completed features" table (the pipe-delimited
`| Date | Feature | Doc |` table), and append this row at the end:

```markdown
| 2026-05-29 | Category filter live search | [features/category-filter-live-search.md](features/category-filter-live-search.md) |
```

- [ ] **Step 3: Commit**

```bash
cd /home/anhnt2112/Documents/temp/amazara
git add docs/features/category-filter-live-search.md docs/README.md
git commit -m "docs: category filter live search feature"
```
