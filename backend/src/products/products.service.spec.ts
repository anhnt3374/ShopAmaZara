import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

function makeQb(): jest.Mocked<SelectQueryBuilder<Product>> & {
  resolveResult: (rows: Product[], total: number) => void;
} {
  const qb: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  qb.resolveResult = (rows: Product[], total: number) =>
    qb.getManyAndCount.mockResolvedValue([rows, total]);
  return qb;
}

describe('ProductsService', () => {
  let service: ProductsService;
  let qb: ReturnType<typeof makeQb>;
  const repo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    qb = makeQb();
    repo.createQueryBuilder.mockReturnValue(qb);
    repo.findOne.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('list() defaults page=1, limit=24 and applies pagination', async () => {
    qb.resolveResult([], 0);
    await service.list({});
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(24);
  });

  it('list() clamps limit to max 60', async () => {
    qb.resolveResult([], 0);
    await service.list({ limit: 999 } as any);
    expect(qb.take).toHaveBeenCalledWith(60);
  });

  it('list() returns rows mapped to ProductSummary', async () => {
    const row = {
      id: 'p1',
      name: 'Tee',
      brand: 'Nike',
      category: 'Shirts',
      storeId: 's1',
      price: '40.00',
      salePrice: '32.00',
      discount: 20,
      stock: 5,
      imageFirst: 'https://img/x.png',
      shortDescription: 'A shirt',
      availableColors: [{ hex: '#000' }, { hex: '#fff' }],
    } as unknown as Product;
    qb.resolveResult([row], 1);
    const out = await service.list({});
    expect(out.total).toBe(1);
    expect(out.items[0]).toMatchObject({
      id: 'p1',
      price: 40,
      salePrice: 32,
      discount: 20,
      originalPrice: 40,
      inStock: true,
      colors: ['#000', '#fff'],
    });
  });

  it('findOne() throws NotFound when product is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toMatchObject({ status: 404 });
  });

  describe('createForStore (new fields)', () => {
    it('auto-generates SKU when blank', async () => {
      (repo.create as jest.Mock).mockImplementation((d) => d);
      (repo.save as jest.Mock).mockImplementation((p) => ({ ...p, id: 'p1' }));
      const out = await service.createForStore('store-abc-def', {
        name: 'X', brand: 'B', category: 'C', price: 10, stock: 5, imageFirst: '/x.png',
      } as any);
      expect(out.sku).toMatch(/^NX-[A-Z0-9]+-[A-Z0-9]{6}$/);
    });

    it('rejects salePrice >= price', async () => {
      await expect(
        service.createForStore('store-1', {
          name: 'X', brand: 'B', category: 'C', price: 10, salePrice: 10, stock: 5, imageFirst: '/x.png',
        } as any),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createForStore('store-1', {
          name: 'X', brand: 'B', category: 'C', price: 10, salePrice: 15, stock: 5, imageFirst: '/x.png',
        } as any),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('defaults isPublished to true and trackInventory to true', async () => {
      let saved: any = null;
      (repo.create as jest.Mock).mockImplementation((d) => d);
      (repo.save as jest.Mock).mockImplementation((p) => {
        saved = p;
        return { ...p, id: 'p2' };
      });
      await service.createForStore('store-1', {
        name: 'X', brand: 'B', category: 'C', price: 10, stock: 5, imageFirst: '/x.png',
      } as any);
      expect(saved.isPublished).toBe(true);
      expect(saved.trackInventory).toBe(true);
    });
  });
});
