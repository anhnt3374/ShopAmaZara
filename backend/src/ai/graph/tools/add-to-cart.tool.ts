import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { CartService } from '../../../cart/cart.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  productId: z.string(),
  qty: z.number().int().min(1).max(99).default(1),
});

export function makeAddToCartTool(deps: { cart: CartService }) {
  return new DynamicStructuredTool({
    name: 'add_to_cart',
    description: "Add a product to the current user's cart.",
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.cart.add(ctx.userId, {
          productId: input.productId,
          quantity: input.qty,
        } as Parameters<CartService['add']>[1]);
        const { items } = await deps.cart.list(ctx.userId);
        const productName =
          items.find((it) => it.productId === input.productId)?.product.name ??
          'item';
        ctx.pushBlock({
          type: 'toast',
          kind: 'success',
          text: `Added ${productName} to your cart`,
        });
        return JSON.stringify({ ok: true, cartCount: items.length });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
