import { ProductsService } from './products.service';

function qbStub() {
  const qb: any = {};
  for (const m of ['andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}
function prod(id: string): any {
  return {
    id, name: id, shortDescription: null, brand: 'B', category: 'C', storeId: 's', sku: null,
    price: '10.00', salePrice: null, discount: 0, imageFirst: '', stock: 5, isPublished: true,
    availableColors: null,
  };
}
const cfg = { get: (k: string, d?: string) => (k === 'EMBEDDINGS_ENABLED' ? 'true' : d) } as any;
const reviewsRepo = {} as any;

describe('ProductsService.list semantic routing', () => {
  it('q present -> semantic; ranked order; sort ignored; SQL not used', async () => {
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p2', score: 0.9, components: {} }, { id: 'p1', score: 0.5, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1'), prod('p2')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    const res = await svc.list({ q: 'shoes', sort: 'price-asc', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).not.toHaveBeenCalled();
    expect(res.items.map((i) => i.id)).toEqual(['p2', 'p1']);
    expect(res.total).toBe(2);
  });

  it('semantic returns [] -> falls back to SQL', async () => {
    const search = { search: jest.fn().mockResolvedValue([]) };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('semantic throws -> falls back to SQL', async () => {
    const search = { search: jest.fn().mockRejectedValue(new Error('qdrant down')) };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('q absent -> SQL path, search not called', async () => {
    const search = { search: jest.fn() };
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg);
    await svc.list({ page: 1, limit: 24 } as any);
    expect(search.search).not.toHaveBeenCalled();
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('no SearchService injected -> SQL path', async () => {
    const products = { createQueryBuilder: jest.fn().mockReturnValue(qbStub()), findBy: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, undefined, cfg);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any);
    expect(products.createQueryBuilder).toHaveBeenCalled();
  });

  it('userId present -> fetches preference vectors and forwards as userPreference', async () => {
    const pref = { desc: [1, 0] };
    const preference = { getPreferenceVectors: jest.fn().mockResolvedValue(pref) };
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p1', score: 0.9, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg, preference as any);
    await svc.list({ q: 'shoes', page: 1, limit: 24 } as any, '7');
    expect(preference.getPreferenceVectors).toHaveBeenCalledWith('7');
    expect(search.search.mock.calls[0][0].userPreference).toEqual(pref);
  });

  it('preference fetch error -> unpersonalized search still returns', async () => {
    const preference = { getPreferenceVectors: jest.fn().mockRejectedValue(new Error('pref down')) };
    const search = { search: jest.fn().mockResolvedValue([{ id: 'p1', score: 0.9, components: {} }]) };
    const products = { findBy: jest.fn().mockResolvedValue([prod('p1')]), createQueryBuilder: jest.fn() };
    const svc = new ProductsService(products as any, reviewsRepo, undefined, search as any, cfg, preference as any);
    const res = await svc.list({ q: 'shoes', page: 1, limit: 24 } as any, '7');
    expect(res.items.map((i: any) => i.id)).toEqual(['p1']);
    expect(search.search.mock.calls[0][0].userPreference).toBeUndefined();
  });
});
