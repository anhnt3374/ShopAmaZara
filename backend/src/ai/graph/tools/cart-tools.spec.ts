import { makeAddToCartTool } from './add-to-cart.tool';
import { makeRemoveFromCartTool } from './remove-from-cart.tool';

describe('cart tools', () => {
  it('add_to_cart calls cart.add and pushes toast', async () => {
    const add = jest.fn().mockResolvedValue({ item: { productId: 'p1' } });
    const list = jest.fn().mockResolvedValue({
      items: [{ productId: 'p1', product: { name: 'X' } }],
      subtotal: 10,
    });
    const pushed: unknown[] = [];
    const tool = makeAddToCartTool({ cart: { add, list } as unknown as never });
    const out = await tool.invoke(
      { productId: 'p1', qty: 2 },
      {
        configurable: {
          userId: 'u1',
          conversationId: 'c1',
          pushBlock: (b: unknown) => pushed.push(b),
          getPendingPreorder: () => null,
          setPendingPreorder: () => undefined,
        },
      },
    );
    expect(add).toHaveBeenCalledWith('u1', { productId: 'p1', quantity: 2 });
    expect(pushed[0]).toMatchObject({ type: 'toast', kind: 'success' });
    expect(JSON.parse(out as string)).toMatchObject({ ok: true, cartCount: 1 });
  });

  it('add_to_cart returns ok:false when service throws', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Insufficient stock'));
    const tool = makeAddToCartTool({
      cart: { add, list: jest.fn() } as unknown as never,
    });
    const out = await tool.invoke(
      { productId: 'p1', qty: 99 },
      {
        configurable: {
          userId: 'u1',
          conversationId: 'c1',
          pushBlock: () => undefined,
          getPendingPreorder: () => null,
          setPendingPreorder: () => undefined,
        },
      },
    );
    expect(JSON.parse(out as string)).toMatchObject({ ok: false });
  });

  it('remove_from_cart calls cart.remove and pushes toast', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const pushed: unknown[] = [];
    const tool = makeRemoveFromCartTool({
      cart: { remove } as unknown as never,
    });
    await tool.invoke(
      { productId: 'p1' },
      {
        configurable: {
          userId: 'u1',
          conversationId: 'c1',
          pushBlock: (b: unknown) => pushed.push(b),
          getPendingPreorder: () => null,
          setPendingPreorder: () => undefined,
        },
      },
    );
    expect(remove).toHaveBeenCalledWith('u1', 'p1');
    expect(pushed[0]).toMatchObject({ type: 'toast', kind: 'info' });
  });
});
