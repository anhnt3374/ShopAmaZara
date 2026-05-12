import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { WishlistItem } from './wishlist-item.entity';
import { WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  let service: WishlistService;
  const items = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };
  const products = { find: jest.fn() };

  beforeEach(async () => {
    for (const fn of Object.values(items)) (fn as jest.Mock).mockReset();
    products.find.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: getRepositoryToken(WishlistItem), useValue: items },
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    service = moduleRef.get(WishlistService);
  });

  it('add() inserts when none exists', async () => {
    items.findOne.mockResolvedValue(null);
    items.create.mockImplementation((v) => v);
    items.save.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1' });
    const out = await service.add('u1', 'p1');
    expect(items.save).toHaveBeenCalled();
    expect(out.item.productId).toBe('p1');
  });

  it('add() is idempotent — returns existing row without inserting', async () => {
    items.findOne.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1' });
    const out = await service.add('u1', 'p1');
    expect(items.save).not.toHaveBeenCalled();
    expect(out.item.id).toBe('1');
  });

  it('remove() deletes by composite key', async () => {
    items.delete.mockResolvedValue({ affected: 1 });
    await service.remove('u1', 'p1');
    expect(items.delete).toHaveBeenCalledWith({ userId: 'u1', productId: 'p1' });
  });

  it('list() returns ProductSummary for each wishlisted product', async () => {
    items.find.mockResolvedValue([
      { productId: 'p1' },
      { productId: 'p2' },
    ]);
    products.find.mockResolvedValue([
      {
        id: 'p1',
        name: 'A',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '10.00',
        discount: 0,
        stock: 1,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
      {
        id: 'p2',
        name: 'A2',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '20.00',
        discount: 0,
        stock: 0,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
    ]);
    const out = await service.list('u1');
    expect(out.items).toHaveLength(2);
    expect(out.items[1].inStock).toBe(false);
  });
});
