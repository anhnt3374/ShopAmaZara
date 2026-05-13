import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService.checkout', () => {
  let service: OrdersService;
  let txCallback: any;
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => {
      txCallback = cb;
      return cb(manager);
    }),
  } as unknown as DataSource;

  beforeEach(async () => {
    Object.values(manager).forEach((fn) => (fn as jest.Mock).mockReset());
    manager.create.mockImplementation((_entity: any, data: any) => data);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('throws BadRequest when productIds is empty after cart filter', async () => {
    manager.find.mockResolvedValue([]); // cart_items
    await expect(service.checkout('u1', { productIds: ['p1'] } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws Conflict when stock UPDATE affects zero rows', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.query.mockResolvedValueOnce({ affectedRows: 0 } as any);
    await expect(
      service.checkout('u1', { productIds: ['p1'] } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates order, decrements stock, deletes cart rows on success', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.query.mockResolvedValueOnce({ affectedRows: 1 });
    manager.save
      .mockResolvedValueOnce({ id: '101', total: '20.00' }) // order
      .mockResolvedValueOnce([{ id: '500' }]); // order items
    manager.delete.mockResolvedValue({ affected: 1 });

    const result = await service.checkout('u1', { productIds: ['p1'] } as any);
    expect(result.orderId).toBe('101');
    expect(result.total).toBe(34.1);
    expect(manager.delete).toHaveBeenCalled();
  });
});

describe('OrdersService.cancel', () => {
  let service: OrdersService;
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;
  const ordersRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    Object.values(manager).forEach((f) => (f as jest.Mock).mockReset());
    Object.values(ordersRepo).forEach((f) => (f as jest.Mock).mockReset());
    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();
    service = mod.get(OrdersService);
  });

  it('cancels a Paid order, restores stock, sets cancelledAt', async () => {
    manager.findOne.mockResolvedValue({
      id: '1',
      buyerId: 'u',
      status: 'Paid',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
    manager.query.mockResolvedValue({ affectedRows: 1 });
    manager.save.mockImplementation((o) => o);

    const out = await service.cancelForBuyer('u', '1');
    expect(out.status).toBe('Cancelled');
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [2, 'p1'],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [1, 'p2'],
    );
  });

  it('refuses to cancel a Shipped order (409)', async () => {
    manager.findOne.mockResolvedValue({
      id: '1', buyerId: 'u', status: 'Shipped', items: [],
    });
    await expect(service.cancelForBuyer('u', '1')).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to cancel another user's order (403)", async () => {
    manager.findOne.mockResolvedValue({
      id: '1', buyerId: 'other', status: 'Paid', items: [],
    });
    await expect(service.cancelForBuyer('u', '1')).rejects.toMatchObject({ status: 403 });
  });
});
