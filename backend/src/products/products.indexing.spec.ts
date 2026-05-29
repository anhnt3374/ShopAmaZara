import { ProductsService } from './products.service';

function repoStub(overrides: any = {}) {
  return {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (e: any) => e),
    remove: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((e: any) => e),
    ...overrides,
  } as any;
}

describe('ProductsService indexing hooks', () => {
  it('createForStore fires indexProduct with the saved product', async () => {
    const indexer = { indexProduct: jest.fn().mockResolvedValue(undefined), removeProduct: jest.fn(), indexProducts: jest.fn() };
    const products = repoStub();
    const reviews = repoStub();
    const svc = new ProductsService(products, reviews, indexer as any);
    const saved = await svc.createForStore('s1', {
      name: 'X', brand: 'B', category: 'C', price: 10, stock: 5,
    } as any);
    expect(indexer.indexProduct).toHaveBeenCalledWith(saved);
  });

  it('deleteForStore fires removeProduct', async () => {
    const indexer = { indexProduct: jest.fn(), removeProduct: jest.fn().mockResolvedValue(undefined), indexProducts: jest.fn() };
    const product = { id: 'p1', storeId: 's1' };
    const products = repoStub({ findOne: jest.fn().mockResolvedValue(product) });
    const svc = new ProductsService(products, repoStub(), indexer as any);
    await svc.deleteForStore('s1', 'p1');
    expect(indexer.removeProduct).toHaveBeenCalledWith('p1');
  });

  it('a rejected index promise does not bubble to the caller', async () => {
    const indexer = {
      indexProduct: jest.fn().mockRejectedValue(new Error('qdrant down')),
      removeProduct: jest.fn(),
      indexProducts: jest.fn(),
    };
    const svc = new ProductsService(repoStub(), repoStub(), indexer as any);
    await expect(
      svc.createForStore('s1', { name: 'X', brand: 'B', category: 'C', price: 10, stock: 5 } as any),
    ).resolves.toBeDefined();
  });
});
