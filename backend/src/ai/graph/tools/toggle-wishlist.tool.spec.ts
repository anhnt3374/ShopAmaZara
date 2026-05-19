import { makeToggleWishlistTool } from './toggle-wishlist.tool';

describe('toggle_wishlist tool', () => {
  it('calls add when action=add', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn();
    const pushed: unknown[] = [];
    const tool = makeToggleWishlistTool({
      wishlist: { add, remove } as unknown as never,
    });
    const out = await tool.invoke(
      { productId: 'p1', action: 'add' },
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
    expect(add).toHaveBeenCalledWith('u1', 'p1');
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.parse(out as string)).toMatchObject({ ok: true, state: 'added' });
    expect(pushed[0]).toMatchObject({ type: 'toast', kind: 'success' });
  });

  it('calls remove when action=remove', async () => {
    const add = jest.fn();
    const remove = jest.fn().mockResolvedValue(undefined);
    const pushed: unknown[] = [];
    const tool = makeToggleWishlistTool({
      wishlist: { add, remove } as unknown as never,
    });
    const out = await tool.invoke(
      { productId: 'p1', action: 'remove' },
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
    expect(add).not.toHaveBeenCalled();
    expect(JSON.parse(out as string)).toMatchObject({ ok: true, state: 'removed' });
    expect(pushed[0]).toMatchObject({ type: 'toast', kind: 'info' });
  });

  it('returns ok:false when service throws', async () => {
    const add = jest.fn().mockRejectedValue(new Error('boom'));
    const tool = makeToggleWishlistTool({
      wishlist: { add, remove: jest.fn() } as unknown as never,
    });
    const out = await tool.invoke(
      { productId: 'p1', action: 'add' },
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
});
