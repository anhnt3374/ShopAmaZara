import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { OrdersService } from '../../../orders/orders.service';
import { ctxFromConfig } from './tool-context';

const Schema = z.object({
  orderId: z.string().optional(),
  status: z.enum(['Paid', 'Shipped', 'Delivered', 'Cancelled']).optional(),
});

type OrderRow = {
  id: string;
  status: string;
  totalAmount?: string;
  total?: string;
  createdAt: Date | string;
};

const toRow = (o: OrderRow) => ({
  id: String(o.id),
  status: o.status,
  total: String(o.total ?? o.totalAmount ?? ''),
  createdAt:
    o.createdAt instanceof Date
      ? o.createdAt.toISOString()
      : String(o.createdAt),
});

export function makeLookupOrderTool(deps: { orders: OrdersService }) {
  return new DynamicStructuredTool({
    name: 'lookup_order',
    description:
      "List the user's orders (optionally filtered by status) or fetch one by id.",
    schema: Schema,
    func: async (input, _r, config) => {
      const ctx = ctxFromConfig(config);
      try {
        if (input.orderId) {
          const order = (await deps.orders.findOneForBuyer(
            ctx.userId,
            input.orderId,
          )) as unknown as OrderRow;
          const items = [toRow(order)];
          ctx.pushBlock({ type: 'orders', items });
          return JSON.stringify({ items });
        }
        const orders = (await deps.orders.listForBuyer(
          ctx.userId,
          input.status,
        )) as unknown as OrderRow[];
        const items = orders.map(toRow);
        ctx.pushBlock({ type: 'orders', items });
        return JSON.stringify({ items });
      } catch (e) {
        return JSON.stringify({ ok: false, error: (e as Error).message });
      }
    },
  });
}
