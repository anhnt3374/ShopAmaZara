# Product Card Color Swatches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a product's available colors as small swatches overlaid on the product image in the search results page.

**Architecture:** Frontend-only change to a single presentational component. The API already returns `colors: string[]` (hex strings) on every product summary, and `SearchResultPage` passes each product to `ProductCard`, so no data plumbing is needed — only rendering.

**Tech Stack:** React 18, Tailwind CSS (uses the project's Material-style design tokens: `surface`, `on-surface-variant`, etc.).

---

### Task 1: Render color swatch overlay on ProductCard

**Files:**
- Modify: `frontend/src/components/ProductCard.jsx`

There is no frontend test harness in this project (per `CLAUDE.md`), so this task uses visual verification instead of an automated test.

- [ ] **Step 1: Add the colors derivation inside the component**

In `frontend/src/components/ProductCard.jsx`, inside the `ProductCard` function, just after the existing `discountBadge` declaration (around line 11), add:

```jsx
  const MAX_SWATCHES = 3;
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const shownColors = colors.slice(0, MAX_SWATCHES);
  const extraColors = colors.length - shownColors.length;
```

- [ ] **Step 2: Add the swatch overlay inside the image link**

Find the image block (around lines 39-48):

```jsx
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-surface-container-low">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
          />
        </div>
      </Link>
```

Replace it with (adds the overlay after the `<img>`, still inside the `.relative` div):

```jsx
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-surface-container-low">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
          />
          {colors.length > 0 && (
            <div
              className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-surface/85 backdrop-blur-sm px-2 py-1 shadow-sm"
              aria-label={`${colors.length} ${colors.length === 1 ? 'color' : 'colors'} available`}
            >
              {shownColors.map((c, idx) => (
                <span
                  key={`${c}-${idx}`}
                  aria-hidden="true"
                  className="w-3.5 h-3.5 rounded-full border border-black/15 ring-1 ring-inset ring-white/40"
                  style={{ backgroundColor: c }}
                />
              ))}
              {extraColors > 0 && (
                <span aria-hidden="true" className="text-[11px] font-semibold text-on-surface-variant">
                  +{extraColors}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
```

- [ ] **Step 3: Verify visually**

Start the stack and open the search page:

```bash
docker compose up -d
```

Open `http://localhost:5173/search` and confirm:
- A product with 1–3 colors shows exactly that many swatches and no `+N`.
- A product with more than 3 colors shows 3 swatches followed by a `+N` count (N = remaining).
- A product with no colors shows no overlay pill at all.
- The pill sits at the bottom-left of the image, does not overlap or block the wishlist heart (top-right) or the discount badge (top-left), and clicking the pill opens the product detail page.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProductCard.jsx
git commit -m "feat(fe): show color swatches on product cards"
```

---

### Task 2: Add feature documentation

**Files:**
- Create: `docs/features/product-card-color-swatches.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write the feature doc**

Create `docs/features/product-card-color-swatches.md`:

```markdown
# Product Card Color Swatches

Each product card on the search results page (`/search`) shows the colors the
product is available in, as small round swatches overlaid on the bottom-left of
the product image.

## Behavior

- Swatches read from `product.colors` (an array of hex strings) returned by the
  product list API.
- At most 3 swatches are shown; if the product has more colors, a `+N` label
  follows (N = number of remaining colors).
- Products with no colors show no overlay.
- The swatches are display-only. The overlay sits inside the image link, so
  clicking it opens the product detail page.

## Implementation

- `frontend/src/components/ProductCard.jsx` — renders the overlay.
- `backend/src/products/dto/product-views.ts` — `toProductSummary` populates
  `colors` from the product's `availableColors`.
```

- [ ] **Step 2: Add a row to the completed-features table**

Open `docs/README.md`, find the "Completed features" table (the pipe-delimited
`| Date | Feature | Doc |` table), and append this row at the end:

```markdown
| 2026-05-29 | Product card color swatches | [features/product-card-color-swatches.md](features/product-card-color-swatches.md) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/features/product-card-color-swatches.md docs/README.md
git commit -m "docs: product card color swatches feature"
```
