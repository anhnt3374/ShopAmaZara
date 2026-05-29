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
