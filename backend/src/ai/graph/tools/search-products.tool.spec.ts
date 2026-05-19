import { makeSearchProductsTool } from './search-products.tool';

describe('search_products tool', () => {
  it('calls ProductsService.list with mapped filters and pushes a products block', async () => {
    const list = jest.fn().mockResolvedValue({
      items: [{ id: '1', name: 'X', price: '10.00', images: ['img.jpg'], rating: 4.2, stock: 3 }],
      total: 1,
    });
    const pushed: any[] = [];
    const tool = makeSearchProductsTool({ products: { list } as any });
    const out = await tool.invoke(
      { query: 'bluetooth', maxPrice: 1_000_000, limit: 5 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b), getPendingPreorder: () => null, setPendingPreorder: () => undefined } },
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'bluetooth', maxPrice: 1_000_000 }),
    );
    expect(JSON.parse(out).items).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ type: 'products', mode: 'list' });
  });

  it('tool name is exactly search_products', () => {
    const tool = makeSearchProductsTool({ products: { list: jest.fn() } as any });
    expect(tool.name).toBe('search_products');
  });

  it('maps category string to array for ProductsService.list', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const pushed: any[] = [];
    const tool = makeSearchProductsTool({ products: { list } as any });
    await tool.invoke(
      { query: 'shoes', category: 'Footwear', limit: 4 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b), getPendingPreorder: () => null, setPendingPreorder: () => undefined } },
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ category: ['Footwear'] }),
    );
  });

  it('marks out-of-stock product stock as "out"', async () => {
    const list = jest.fn().mockResolvedValue({
      items: [{ id: '2', name: 'Y', price: '5.00', images: [], rating: 0, stock: 0 }],
      total: 1,
    });
    const pushed: any[] = [];
    const tool = makeSearchProductsTool({ products: { list } as any });
    await tool.invoke(
      { query: 'item', limit: 2 },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b), getPendingPreorder: () => null, setPendingPreorder: () => undefined } },
    );
    expect(pushed[0].items[0].stock).toBe('out');
  });
});
