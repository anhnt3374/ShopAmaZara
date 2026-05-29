# Category Filter: Live Search + Selected Chips — Design

**Date:** 2026-05-29
**Status:** Approved, pending implementation

## Goal

Make the category filter on the search results page easy to use when there are
many categories: add a live-search box to narrow the list, and surface the
already-selected categories as chips at the top so the user no longer has to
scroll the full list to find what they picked.

## Scope

Frontend only. The new logic (search state, filtering, chips) is significant
enough to live in its own component rather than inline in the already-large
`SearchResultPage.jsx`.

- **Create:** `frontend/src/components/CategoryFilter.jsx`
- **Modify:** `frontend/src/pages/SearchResultPage.jsx` — replace the existing
  inline Categories checkbox block with
  `<CategoryFilter categories={categoryList} selected={selectedCats} onToggle={toggleCategory} />`.

The source of truth stays unchanged: selected categories live in the `category`
URL params, managed by the existing `toggleCategory` / `updateParam` logic in
`SearchResultPage`. `CategoryFilter` is presentational — it does not own the
selection state.

## Component: `CategoryFilter`

**Props:**
- `categories: string[]` — the full list of available categories (already loaded
  into `categoryList` from `getProductFacets()`).
- `selected: string[]` — currently selected categories.
- `onToggle: (category: string) => void` — toggles a category's selection.

**Internal state:** `query` (the search text) — the only state the component owns.

**Layout (top to bottom), matching the existing filter sidebar styling:**

1. **Search box.** A text input with a leading search icon. When `query` is
   non-empty, show a trailing × button that clears it. `aria-label="Search categories"`.
2. **Selected chips.** Each entry in `selected` renders as a rounded chip with a
   × button; clicking × calls `onToggle(category)` to deselect it. Each × has an
   `aria-label` of the form `Remove <category>`. If `selected` is empty, render
   neither the chips area nor the divider below it.
3. **Divider.** A thin horizontal rule, shown only when there is at least one chip.
4. **List.** Checkbox rows for every category that is **not** in `selected`
   **and** matches `query`. Matching is client-side, case-insensitive substring.
   Rows keep the existing styling and the `max-h-72 overflow-auto` scroll
   container. Clicking a row calls `onToggle(category)`; the item then moves up
   into the chips area and disappears from the list.

## Empty / loading states

- `categories` empty (facets not loaded yet): show "Loading…" (current behavior).
- `categories` non-empty but `query` matches nothing among the unselected items:
  show a "No categories match" line in place of the list.

## Accessibility

- Search input: `aria-label="Search categories"`.
- Each chip's remove button: `aria-label={`Remove ${category}`}`.
- Checkboxes keep their existing label association (clickable `<label>` wrapping
  the input and text).

## Testing

The frontend has no test harness (per `CLAUDE.md`). Verify visually on `/search`:

- Typing in the search box filters the list (case-insensitive substring); clearing
  it (or the × button) restores the full unselected list.
- Selecting a category moves it into the chips area and removes it from the list.
- Clicking a chip's × deselects it; it returns to the list.
- With nothing selected, no chips area and no divider are shown.
- A query matching nothing shows "No categories match".
- Selection still drives results and the URL `category` params exactly as before.

## Documentation

Per project convention, add `docs/features/category-filter-live-search.md` and a
row in the completed-features table in `docs/README.md`.
