import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productIds: z.array(z.string()).min(2).max(4),
});

export function makeCompareProductsTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'compare_products',
    description:
      'Call this whenever the user asks to compare or contrast products ("compare A and B", "which is better?", "what is the difference?"). Pass 2-4 productIds taken from the most recent product list. Returns brand / category / price / stock / rating / highlights for each so you can write a substantive comparison.',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const products = await deps.products.findManyByIds(input.productIds);
      const items = products.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        price: String(p.price),
        image:
          p.image ??
          p.imageFirst ??
          (Array.isArray(p.images) ? p.images[0] : null) ??
          null,
        rating: p.rating,
        storeName: p.storeName,
        stock: (p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : 'in_stock') as 'out' | 'low' | 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'] as Array<'view' | 'wishlist' | 'add_to_cart'>,
      }));
      const block: ContentBlock = { type: 'products', mode: 'compare', items };
      ctx.pushBlock(block);
      return JSON.stringify({
        count: items.length,
        items: products.map((p: any) => ({
          id: p.id, name: p.name, price: p.price,
          brand: p.brand, category: p.category, stock: p.stock,
          rating: p.rating, highlights: p.highlights,
        })),
      });
    },
  });
}
