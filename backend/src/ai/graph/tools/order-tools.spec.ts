import {
  makeCreatePreorderTool,
  makeConfirmOrderTool,
  makeCancelOrderTool,
} from './order-tools';

const baseCtx = (overrides: Partial<Record<string, unknown>> = {}) => ({
  userId: 'u1',
  conversationId: 'c1',
  pushBlock: jest.fn(),
  getPendingPreorder: jest.fn().mockReturnValue(null),
  setPendingPreorder: jest.fn(),
  ...overrides,
});

describe('order tools', () => {
  it('create_preorder builds draft, sets pendingPreorder, pushes confirm_card', async () => {
    const draft = {
      preorderId: 'PRE-ABC123',
      items: [
        {
          productId: 'p1',
          storeId: 's1',
          qty: 1,
          unitPrice: '10.00',
          name: 'X',
        },
      ],
      addressId: 'a1',
      shipping: {
        recipientName: 'A',
        phone: '1',
        line1: 'L1',
        line2: null,
        city: 'C',
        region: 'R',
        postalCode: 'P',
        country: 'CO',
      },
      paymentMethod: 'cod' as const,
      total: '10.00',
      expiresAt: Date.now() + 60_000,
    };
    const buildPreorder = jest.fn().mockResolvedValue(draft);
    const ctx = baseCtx();
    const tool = makeCreatePreorderTool({
      orders: { buildPreorder } as unknown as never,
    });
    const out = await tool.invoke(
      { items: [{ productId: 'p1', qty: 1 }], addressId: 'a1', paymentMethod: 'cod' },
      { configurable: ctx as never },
    );
    expect(buildPreorder).toHaveBeenCalledWith('u1', [{ productId: 'p1', qty: 1 }], 'a1', 'cod');
    expect(ctx.setPendingPreorder).toHaveBeenCalledWith(draft);
    expect(ctx.pushBlock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'confirm_card', preorderId: 'PRE-ABC123' }),
    );
    expect(JSON.parse(out as string)).toMatchObject({ preorderId: 'PRE-ABC123' });
  });

  it('confirm_order finalizes when draft id matches', async () => {
    const draft = {
      preorderId: 'PRE-X',
      items: [],
      addressId: 'a',
      shipping: {} as never,
      paymentMethod: 'cod' as const,
      total: '10',
      expiresAt: Date.now() + 60_000,
    };
    const createFromPreorder = jest
      .fn()
      .mockResolvedValue({ orderId: 'o1', total: '10', status: 'Paid' });
    const ctx = baseCtx({ getPendingPreorder: jest.fn().mockReturnValue(draft) });
    const tool = makeConfirmOrderTool({
      orders: { createFromPreorder } as unknown as never,
    });
    const out = await tool.invoke(
      { preorderId: 'PRE-X' },
      { configurable: ctx as never },
    );
    expect(createFromPreorder).toHaveBeenCalledWith('u1', draft);
    expect(ctx.setPendingPreorder).toHaveBeenCalledWith(null);
    expect(ctx.pushBlock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'order_success', orderId: 'o1' }),
    );
    expect(JSON.parse(out as string)).toMatchObject({ orderId: 'o1' });
  });

  it('confirm_order returns expired when draft is missing', async () => {
    const ctx = baseCtx();
    const tool = makeConfirmOrderTool({
      orders: { createFromPreorder: jest.fn() } as unknown as never,
    });
    const out = await tool.invoke(
      { preorderId: 'PRE-X' },
      { configurable: ctx as never },
    );
    expect(JSON.parse(out as string)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('confirm_order returns expired when draft id mismatches', async () => {
    const ctx = baseCtx({
      getPendingPreorder: jest
        .fn()
        .mockReturnValue({ preorderId: 'PRE-Y', items: [], expiresAt: Date.now() + 1 } as never),
    });
    const tool = makeConfirmOrderTool({
      orders: { createFromPreorder: jest.fn() } as unknown as never,
    });
    const out = await tool.invoke(
      { preorderId: 'PRE-X' },
      { configurable: ctx as never },
    );
    expect(JSON.parse(out as string)).toMatchObject({ ok: false, error: 'expired' });
  });

  it('cancel_order calls OrdersService.cancelForBuyer', async () => {
    const cancelForBuyer = jest.fn().mockResolvedValue({ ok: true });
    const ctx = baseCtx();
    const tool = makeCancelOrderTool({
      orders: { cancelForBuyer } as unknown as never,
    });
    const out = await tool.invoke(
      { orderId: 'o1', reason: 'no' },
      { configurable: ctx as never },
    );
    expect(cancelForBuyer).toHaveBeenCalledWith('u1', 'o1', 'no');
    expect(JSON.parse(out as string)).toMatchObject({ ok: true });
  });
});
