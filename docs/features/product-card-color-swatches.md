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
