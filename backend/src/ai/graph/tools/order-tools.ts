import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { OrdersService } from '../../../orders/orders.service';
import type { ContentBlock } from '../../rich-message';
import { ctxFromConfig } from './tool-context';

const PreorderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        qty: z.number().int().min(1),
      }),
    )
    .min(1),
  addressId: z.string().optional(),
  paymentMethod: z.enum(['card', 'ewallet', 'bank', 'cod']).default('cod'),
});

export function makeCreatePreorderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'create_preorder',
    description:
      'Build a draft order. ALWAYS call this before confirm_order. The user must approve via the confirm card.',
    schema: PreorderSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        const draft = await deps.orders.buildPreorder(
          ctx.userId,
          input.items,
          input.addressId,
          input.paymentMethod,
        );
        ctx.setPendingPreorder(draft);
        const block: ContentBlock = {
          type: 'confirm_card',
          preorderId: draft.preorderId,
          title: `Order ${draft.preorderId}`,
          lines: draft.items.map((it) => ({
            label: `${it.name} ×${it.qty}`,
            value: (Number(it.unitPrice) * it.qty).toFixed(2),
          })),
          total: { label: 'Total', value: draft.total },
          primary: { label: 'Confirm order', action: 'confirm_order' },
          secondary: { label: 'Cancel', action: 'cancel_order' },
          chips: [
            { label: 'Edit address', action: 'edit_address' },
            { label: 'Edit quantity', action: 'edit_qty' },
            { label: 'Edit payment', action: 'edit_payment' },
          ],
        };
        ctx.pushBlock(block);
        return JSON.stringify({
          preorderId: draft.preorderId,
          total: draft.total,
          itemCount: draft.items.length,
          expiresAt: draft.expiresAt,
        });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}

const ConfirmSchema = z.object({ preorderId: z.string() });

export function makeConfirmOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'confirm_order',
    description:
      'Finalize a preorder the user has confirmed. Only call this after the user clicked Confirm.',
    schema: ConfirmSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      const draft = ctx.getPendingPreorder();
      if (!draft || draft.preorderId !== input.preorderId) {
        return JSON.stringify({ ok: false, error: 'expired' });
      }
      try {
        const result = await deps.orders.createFromPreorder(ctx.userId, draft);
        ctx.setPendingPreorder(null);
        ctx.pushBlock({
          type: 'order_success',
          orderId: result.orderId,
          total: result.total,
        });
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}

const CancelSchema = z.object({
  orderId: z.string(),
  reason: z.string().max(200).optional(),
});

export function makeCancelOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'cancel_order',
    description: 'Cancel an existing order belonging to the user.',
    schema: CancelSchema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        await deps.orders.cancelForBuyer(ctx.userId, input.orderId, input.reason);
        ctx.pushBlock({
          type: 'toast',
          kind: 'info',
          text: `Cancelled order #${input.orderId}`,
        });
        return JSON.stringify({ ok: true });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
