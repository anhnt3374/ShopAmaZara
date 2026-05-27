import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock, ProductItem } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  query: z.string().min(1),
  maxPrice: z.number().int().positive().optional(),
  minPrice: z.number().int().nonnegative().optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(12).default(8),
});

export function makeSearchProductsTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'search_products',
    description:
      'Search the catalog with a natural-language query plus optional price/category filters. Returns up to 8 products by default.',
    schema: Schema,
    func: async (input, _runManager, config) => {
      const ctx = ctxFromConfig(config);

      const { items } = await deps.products.list({
        q: input.query,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        category: input.category ? [input.category] : undefined,
        page: 1,
        limit: input.limit,
      } as any, ctx.userId);

      const productItems: ProductItem[] = items.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        price: String(p.price),
        // ProductSummary exposes `image` (singular). Fall back to entity
        // shapes (`imageFirst`, `images[0]`) in case the underlying service
        // ever returns the raw row instead of the summary.
        image:
          p.image ??
          p.imageFirst ??
          (Array.isArray(p.images) ? p.images[0] : null) ??
          null,
        rating: p.rating,
        storeName: p.storeName,
        stock: p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'],
      }));

      const block: ContentBlock = { type: 'products', mode: 'list', items: productItems };
      ctx.pushBlock(block);

      return JSON.stringify({
        ui_rendered: true,
        count: productItems.length,
        // Compact handle for follow-up references ("the second one", etc.).
        // Do NOT list these back to the user — the UI is already showing them.
        items: productItems.map((p) => ({ id: p.id, name: p.name, price: p.price })),
        note: 'Carousel is already rendered in the chat UI. Reply in one short sentence and do not repeat product details.',
      });
    },
  });
}
