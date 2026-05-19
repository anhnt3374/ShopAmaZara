import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ProductsService } from '../../../products/products.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  seedProductIds: z.array(z.string()).min(1).max(4),
  mode: z.enum(['similar', 'complementary']),
});

export function makeSuggestSimilarTool(deps: { products: ProductsService }) {
  return new DynamicStructuredTool({
    name: 'suggest_similar',
    description:
      'Recommend related products. mode=similar (same category) or complementary (different category, same store).',
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const out = await deps.products.suggest(input.seedProductIds, input.mode);
      const items = out.map((p) => ({
        id: String(p.id),
        name: p.name,
        price: String(p.price),
        image: p.images?.[0] ?? null,
        stock: (p.stock === 0
          ? 'out'
          : p.stock < 5
            ? 'low'
            : 'in_stock') as 'out' | 'low' | 'in_stock',
        actions: ['view', 'wishlist', 'add_to_cart'] as Array<
          'view' | 'wishlist' | 'add_to_cart'
        >,
      }));
      const block: ContentBlock = { type: 'products', mode: 'upsell', items };
      ctx.pushBlock(block);
      return JSON.stringify({
        count: items.length,
        items: items.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      });
    },
  });
}
