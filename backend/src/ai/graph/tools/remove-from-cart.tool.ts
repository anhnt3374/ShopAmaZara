import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { CartService } from '../../../cart/cart.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({ productId: z.string() });

export function makeRemoveFromCartTool(deps: { cart: CartService }) {
  return new DynamicStructuredTool({
    name: 'remove_from_cart',
    description: "Remove a product from the current user's cart.",
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.cart.remove(ctx.userId, input.productId);
        ctx.pushBlock({ type: 'toast', kind: 'info', text: 'Removed from cart' });
        return JSON.stringify({ ok: true });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
