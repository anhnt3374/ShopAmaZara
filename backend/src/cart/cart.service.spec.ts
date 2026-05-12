import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  const items = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };
  const products = { findOne: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    for (const fn of Object.values(items)) (fn as jest.Mock).mockReset();
    for (const fn of Object.values(products)) (fn as jest.Mock).mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(CartItem), useValue: items },
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    service = moduleRef.get(CartService);
  });

  it('add() inserts a new row when none exists', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 10 });
    items.findOne.mockResolvedValue(null);
    items.create.mockImplementation((v) => v);
    items.save.mockImplementation((v) => Promise.resolve({ id: '1', ...v }));
    const out = await service.add('u1', { productId: 'p1', quantity: 2 } as any);
    expect(out.item.quantity).toBe(2);
  });

  it('add() increments quantity on duplicate productId', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 10 });
    items.findOne.mockResolvedValue({ id: '1', userId: 'u1', productId: 'p1', quantity: 1 });
    items.save.mockImplementation((v) => Promise.resolve(v));
    const out = await service.add('u1', { productId: 'p1', quantity: 3 } as any);
    expect(out.item.quantity).toBe(4);
  });

  it('add() rejects when product not found', async () => {
    products.findOne.mockResolvedValue(null);
    await expect(
      service.add('u1', { productId: 'missing', quantity: 1 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('add() rejects when requested quantity exceeds stock', async () => {
    products.findOne.mockResolvedValue({ id: 'p1', stock: 1 });
    items.findOne.mockResolvedValue(null);
    await expect(
      service.add('u1', { productId: 'p1', quantity: 5 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update() with quantity=0 deletes the row', async () => {
    items.findOne.mockResolvedValue({ id: '1' });
    items.delete.mockResolvedValue({ affected: 1 });
    const out = await service.update('u1', 'p1', { quantity: 0 } as any);
    expect(out).toBeNull();
    expect(items.delete).toHaveBeenCalled();
  });

  it('list() returns hydrated items with subtotal', async () => {
    items.find.mockResolvedValue([
      { id: '1', productId: 'p1', quantity: 2 },
      { id: '2', productId: 'p2', quantity: 1 },
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
        stock: 5,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
      {
        id: 'p2',
        name: 'D',
        brand: 'B',
        category: 'C',
        storeId: 's',
        price: '4.50',
        discount: 0,
        stock: 5,
        imageFirst: 'i',
        shortDescription: null,
        availableColors: [],
      },
    ]);
    const out = await service.list('u1');
    expect(out.items).toHaveLength(2);
    expect(out.subtotal).toBe(24.5);
  });
});
