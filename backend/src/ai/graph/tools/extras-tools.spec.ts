import { makeLookupOrderTool } from './lookup-order.tool';
import { makeSuggestSimilarTool } from './suggest-similar.tool';

const baseCtx = () => ({
  userId: 'u1',
  conversationId: 'c1',
  pushBlock: jest.fn(),
  getPendingPreorder: jest.fn().mockReturnValue(null),
  setPendingPreorder: jest.fn(),
});

describe('extras tools', () => {
  it('lookup_order: list when no id', async () => {
    const listForBuyer = jest.fn().mockResolvedValue([
      {
        id: 'o1',
        status: 'Paid',
        total: '10.00',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const ctx = baseCtx();
    const tool = makeLookupOrderTool({
      orders: { listForBuyer, findOneForBuyer: jest.fn() } as unknown as never,
    });
    const out = await tool.invoke({}, { configurable: ctx as never });
    expect(listForBuyer).toHaveBeenCalledWith('u1', undefined);
    expect(JSON.parse(out as string).items).toHaveLength(1);
    expect(ctx.pushBlock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'orders' }),
    );
  });

  it('lookup_order: single when id given', async () => {
    const findOneForBuyer = jest.fn().mockResolvedValue({
      id: 'o1',
      status: 'Paid',
      total: '10',
      createdAt: new Date(),
    });
    const ctx = baseCtx();
    const tool = makeLookupOrderTool({
      orders: { findOneForBuyer, listForBuyer: jest.fn() } as unknown as never,
    });
    await tool.invoke({ orderId: 'o1' }, { configurable: ctx as never });
    expect(findOneForBuyer).toHaveBeenCalledWith('u1', 'o1');
  });

  it('suggest_similar: pushes upsell block', async () => {
    const suggest = jest.fn().mockResolvedValue([
      { id: 'p2', name: 'Y', price: '10', images: [], stock: 3 },
    ]);
    const ctx = baseCtx();
    const tool = makeSuggestSimilarTool({
      products: { suggest } as unknown as never,
    });
    await tool.invoke(
      { seedProductIds: ['p1'], mode: 'similar' },
      { configurable: ctx as never },
    );
    expect(ctx.pushBlock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'products', mode: 'upsell' }),
    );
  });
});
