import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { WishlistService } from '../../../wishlist/wishlist.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productId: z.string(),
  action: z.enum(['add', 'remove']),
});

export function makeToggleWishlistTool(deps: { wishlist: WishlistService }) {
  return new DynamicStructuredTool({
    name: 'toggle_wishlist',
    description: "Add or remove a product from the user's wishlist.",
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        if (input.action === 'add') {
          await deps.wishlist.add(ctx.userId, input.productId);
          ctx.pushBlock({
            type: 'toast',
            kind: 'success',
            text: 'Saved to wishlist',
          });
          return JSON.stringify({ ok: true, state: 'added' });
        }
        await deps.wishlist.remove(ctx.userId, input.productId);
        ctx.pushBlock({
          type: 'toast',
          kind: 'info',
          text: 'Removed from wishlist',
        });
        return JSON.stringify({ ok: true, state: 'removed' });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
