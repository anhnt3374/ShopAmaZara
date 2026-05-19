import { makeCompareProductsTool } from './compare-products.tool';

describe('compare_products tool', () => {
  it('looks up products and pushes a compare-mode block', async () => {
    const findManyByIds = jest.fn().mockResolvedValue([
      { id: '1', name: 'A', price: '10', images: [], rating: 4, stock: 5 },
      { id: '2', name: 'B', price: '20', images: [], rating: 5, stock: 5 },
    ]);
    const pushed: any[] = [];
    const tool = makeCompareProductsTool({ products: { findManyByIds } as any });
    const out = await tool.invoke(
      { productIds: ['1', '2'] },
      { configurable: { userId: 'u1', conversationId: 'c1', pushBlock: (b: any) => pushed.push(b), getPendingPreorder: () => null, setPendingPreorder: () => undefined } },
    );
    expect(findManyByIds).toHaveBeenCalledWith(['1', '2']);
    expect(pushed[0]).toMatchObject({ type: 'products', mode: 'compare' });
    expect(JSON.parse(out).items).toHaveLength(2);
  });
});
