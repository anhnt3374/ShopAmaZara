# Product Card Color Swatches — Design

**Date:** 2026-05-29
**Status:** Approved, pending implementation

## Goal

Show the colors a product is available in on each product card in the search
results page, so shoppers can see color options without opening the product.

## Scope

Frontend-only. A single component changes:

- `frontend/src/components/ProductCard.jsx`

No backend changes. The API already returns `colors: string[]` (an array of hex
strings) on every `ProductSummary` — see `backend/src/products/dto/product-views.ts`
(`colorHexes` / `toProductSummary`). `SearchResultPage` passes each product
straight to `ProductCard`, so `product.colors` is already in hand.

## Display

- A "pill" (semi-transparent white background, blurred, fully rounded) overlaid
  on the **bottom-left of the product image**, inside the existing `<Link>` that
  wraps the image.
- Each color renders as a small round swatch (~15px), `backgroundColor` set to
  the hex value, with a thin border so white/light colors stay visible.
- Show **at most 3 swatches**. If the product has more, append a `+N` label
  where `N` is the number of remaining colors.
- If the product has **no colors** (`colors` missing or empty), render nothing —
  no pill at all.

## Behavior

- The swatches are **display-only, not interactive**. The card carries a single
  image (`imageFirst`); there are no per-color images to switch between.
- The pill sits inside the image `<Link>`, so clicking it navigates to the
  product detail page like the rest of the image.
- The pill must not interfere with the existing absolutely-positioned controls
  on the card (discount badge top-left, wishlist button top-right). It lives at
  the bottom-left, clear of both.

## Accessibility

- The swatch group carries an `aria-label` such as `"3 colors available"`.
- Individual swatch dots are `aria-hidden` — a raw hex value has no meaning to a
  screen reader, and the group label already conveys the count.

## Testing

The frontend has no test harness (per `CLAUDE.md`). Verify visually on the
`/search` page:

- A product with 1–3 colors shows exactly that many swatches, no `+N`.
- A product with >3 colors shows 3 swatches and a `+N` count.
- A product with no colors shows no pill.
- The swatch pill does not block the wishlist button or discount badge, and
  clicking it opens the product detail page.

## Documentation

Per project convention, add `docs/features/product-card-color-swatches.md` and a
row in the completed-features table in `docs/README.md`.
