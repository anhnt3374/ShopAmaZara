# AmaZara docs

Indexed list of completed product features. Each feature gets a self-contained page
under `features/` summarizing what shipped, the API contract, and how to run it
locally. Design specs live under `superpowers/specs/`; implementation plans live
under `superpowers/plans/`.

## Completed features

| Date       | Feature              | Doc                        |
|------------|----------------------|----------------------------|
| 2026-05-12 | Auth (register/login)| [features/auth.md](features/auth.md) |
| 2026-05-12 | Stores foundation | [features/stores.md](features/stores.md) |
| 2026-05-13 | Products catalog  | [features/products.md](features/products.md) |
| 2026-05-13 | Wishlist | [features/wishlist.md](features/wishlist.md) |
| 2026-05-13 | Cart | [features/cart.md](features/cart.md) |
| 2026-05-13 | Orders (buyer) | [features/orders.md](features/orders.md) |
| 2026-05-13 | Profile (PATCH /me, addresses) | [features/profile.md](features/profile.md) |
| 2026-05-13 | Addresses (CRUD)               | [features/addresses.md](features/addresses.md) |
| 2026-05-14 | Chat (buyer↔store + system echo) | [features/chat.md](features/chat.md) |
| 2026-05-14 | Seller product CRUD + image upload + bulk import | [features/products.md](features/products.md) |
| 2026-05-14 | Reviews (CRUD + product detail aggregate) | [features/reviews.md](features/reviews.md) |
| 2026-05-19 | Chatbot — shopping agent (LangGraph + Groq) | [features/chatbot.md](features/chatbot.md) |
| 2026-05-26 | Route access control + role-aware header | [features/route-access-control.md](features/route-access-control.md) |
| 2026-05-28 | Semantic search + personalization (embeddings, Qdrant, behavior, re-rank) | [features/semantic-search-personalization.md](features/semantic-search-personalization.md) |
| 2026-05-29 | Product card color swatches | [features/product-card-color-swatches.md](features/product-card-color-swatches.md) |
| 2026-05-29 | Category filter live search | [features/category-filter-live-search.md](features/category-filter-live-search.md) |
| 2026-05-30 | Embedding model warmup (periodic keep-alive) | [features/embedding-warmup.md](features/embedding-warmup.md) |
| 2026-05-31 | Chatbot — Policy Agent (policy Q&A, no RAG) | [features/chatbot-policy-agent.md](features/chatbot-policy-agent.md) |
