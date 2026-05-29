import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../products/product.entity';
import { UserAddress } from '../addresses/address.entity';
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
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(UserAddress), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('throws BadRequest when productIds is empty after cart filter', async () => {
    manager.find.mockResolvedValue([]); // cart_items
    await expect(
      service.checkout('u1', { productIds: ['p1'], addressId: '1', shippingMethod: 'Standard', payment: { method: 'card', cardLast4: '4242' } } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Conflict when stock UPDATE affects zero rows', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.findOne.mockResolvedValueOnce({ id: '1', userId: 'u1', recipientName: 'R', phone: 'P', line1: 'L1', line2: null, city: 'C', region: 'R', postalCode: '00000', country: 'US' }); // address
    manager.query.mockResolvedValueOnce({ affectedRows: 0 } as any);
    await expect(
      service.checkout('u1', { productIds: ['p1'], addressId: '1', shippingMethod: 'Standard', payment: { method: 'card', cardLast4: '4242' } } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates order, decrements stock, deletes cart rows on success', async () => {
    manager.find
      .mockResolvedValueOnce([{ productId: 'p1', quantity: 2 }]) // cart_items
      .mockResolvedValueOnce([{ id: 'p1', name: 'A', price: '10.00', storeId: 's1' }]); // products
    manager.findOne.mockResolvedValueOnce({ id: '1', userId: 'u1', recipientName: 'R', phone: 'P', line1: 'L1', line2: null, city: 'C', region: 'R', postalCode: '00000', country: 'US' }); // address
    manager.query.mockResolvedValueOnce({ affectedRows: 1 });
    manager.save
      .mockResolvedValueOnce({ id: '101', total: '20.00' }) // order
      .mockResolvedValueOnce([{ id: '500' }]); // order items
    manager.delete.mockResolvedValue({ affected: 1 });

    const result = await service.checkout('u1', { productIds: ['p1'], addressId: '1', shippingMethod: 'Standard', payment: { method: 'card', cardLast4: '4242' } } as any);
    expect(result.orderId).toBe('101');
    expect(result.total).toBe(26.6);
    expect(manager.delete).toHaveBeenCalled();
  });
});

describe('OrdersService.cancelForBuyer', () => {
  let svc: OrdersService;
  const manager = {
    findOne: jest.fn(),
    update: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;

  function setOrderFindOne(val: any) {
    manager.findOne.mockResolvedValue(val);
  }
  function setManagerUpdate(impl: (...args: any[]) => any) {
    manager.update.mockImplementation(impl);
  }
  function setManagerQuery(impl: (...args: any[]) => any) {
    manager.query.mockImplementation(impl);
  }

  beforeEach(async () => {
    Object.values(manager).forEach((f) => (f as jest.Mock).mockReset());
    manager.update.mockResolvedValue({ affected: 1 });
    manager.query.mockResolvedValue({ affectedRows: 1 });

    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(UserAddress), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(OrdersService);
  });

  it('throws NotFound if order missing', async () => {
    setOrderFindOne(null);
    await expect(svc.cancelForBuyer('u1', 'o1')).rejects.toThrow(/not found/i);
  });

  it('forbids cancelling not-owned orders', async () => {
    setOrderFindOne({ id: 'o1', buyerId: 'other', status: 'Paid', items: [] });
    await expect(svc.cancelForBuyer('u1', 'o1', 'changed mind')).rejects.toThrow(/not your/i);
  });

  it('rejects cancelling Delivered orders', async () => {
    setOrderFindOne({ id: 'o1', buyerId: 'u1', status: 'Delivered', items: [] });
    await expect(svc.cancelForBuyer('u1', 'o1')).rejects.toThrow(/delivered/i);
  });

  it('cancels Paid order, restocks items, returns ok', async () => {
    setOrderFindOne({
      id: 'o1', buyerId: 'u1', status: 'Paid',
      items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
    });
    const updateCalls: any[] = [];
    setManagerUpdate((entity: any, criteria: any, partial: any) => {
      updateCalls.push({ entity, criteria, partial });
      return { affected: 1 };
    });
    const queryCalls: any[] = [];
    setManagerQuery((sql: string, params: any[]) => {
      queryCalls.push({ sql, params });
      return { affectedRows: 1 };
    });

    const out = await svc.cancelForBuyer('u1', 'o1', 'no longer needed');
    expect(out).toEqual({ ok: true });

    // Assert 2 restock queries
    expect(queryCalls).toHaveLength(2);
    expect(queryCalls[0]).toMatchObject({ params: [2, 'p1'] });
    expect(queryCalls[1]).toMatchObject({ params: [1, 'p2'] });

    // Assert Order.update with status=Cancelled, cancelledAt set
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].criteria).toEqual({ id: 'o1' });
    expect(updateCalls[0].partial.status).toBe('Cancelled');
    expect(updateCalls[0].partial.cancelledAt).toBeInstanceOf(Date);
  });

  it('idempotent on already-Cancelled order', async () => {
    setOrderFindOne({ id: 'o1', buyerId: 'u1', status: 'Cancelled', items: [] });
    const out = await svc.cancelForBuyer('u1', 'o1');
    expect(out).toEqual({ ok: true });
    // Assert NO update or restock queries
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });
});

describe('OrdersService.buildPreorder', () => {
  let svc: OrdersService;
  let productRepo: { findOne: jest.Mock };
  let addressRepo: { findOne: jest.Mock };

  const dataSource = {
    transaction: jest.fn(),
  } as unknown as DataSource;

  beforeEach(async () => {
    productRepo = { findOne: jest.fn() };
    addressRepo = { findOne: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(UserAddress), useValue: addressRepo },
      ],
    }).compile();
    svc = mod.get(OrdersService);
  });

  it('throws if items empty', async () => {
    await expect(svc.buildPreorder('u1', [], undefined, 'cod')).rejects.toThrow(/items/i);
  });

  it('throws if stock insufficient', async () => {
    productRepo.findOne.mockResolvedValue({ id: 'p1', name: 'X', price: '10.00', stock: 0, storeId: 's1' });
    addressRepo.findOne.mockResolvedValue({ id: 'a1', userId: 'u1', recipientName: 'R', phone: 'P', line1: 'L1', line2: null, city: 'C', region: 'R', postalCode: '00000', country: 'US' });
    await expect(svc.buildPreorder('u1', [{ productId: 'p1', qty: 1 }], 'a1', 'cod'))
      .rejects.toThrow(/stock/i);
  });

  it('returns a preorder draft with computed total', async () => {
    productRepo.findOne.mockImplementation(async ({ where: { id } }: { where: { id: string } }) => ({
      id, name: `prod-${id}`, price: '10.00', stock: 5, storeId: `store-${id}`,
    }));
    addressRepo.findOne.mockResolvedValue({
      id: 'a1', userId: 'u1',
      recipientName: 'Alice', phone: '555-1234',
      line1: '123 Main St', line2: null,
      city: 'Springfield', region: 'IL', postalCode: '62701', country: 'US',
    });
    const draft = await svc.buildPreorder('u1', [
      { productId: 'p1', qty: 2 }, { productId: 'p2', qty: 1 },
    ], 'a1', 'cod');
    expect(draft.total).toBe('30.00');
    expect(draft.items).toHaveLength(2);
    expect(draft.preorderId).toMatch(/^PRE-[A-Z0-9]{6}$/);
    expect(draft.expiresAt).toBeGreaterThan(Date.now());
    expect(draft.items[0].storeId).toBe('store-p1');
    expect(draft.shipping.line1).toBe('123 Main St');
    expect(draft.shipping.recipientName).toBe('Alice');
  });
});

describe('OrdersService.createFromPreorder', () => {
  let svc: OrdersService;

  let stockDecrementAffected = 1;
  let nextOrderId = 'o-1';

  const manager = {
    query: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
  };

  const dataSource = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;

  function setStockDecrementAffected(n: number) {
    stockDecrementAffected = n;
  }
  function setNextOrderId(id: string) {
    nextOrderId = id;
  }

  const validDraft = {
    preorderId: 'PRE-XXXXXX',
    items: [{ productId: 'p1', storeId: 's1', qty: 2, unitPrice: '10.00', name: 'Widget' }],
    addressId: 'a1',
    shipping: {
      recipientName: 'Alice',
      phone: '555-1234',
      line1: '123 Main St',
      line2: null,
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    },
    paymentMethod: 'cod' as const,
    total: '20.00',
    expiresAt: Date.now() + 60_000,
  };

  beforeEach(async () => {
    Object.values(manager).forEach((fn) => (fn as jest.Mock).mockReset());
    manager.create.mockImplementation((_entity: any, data: any) => data);

    // default: stock decrement succeeds
    manager.query.mockResolvedValue({ affectedRows: stockDecrementAffected });
    // default: save returns the object with the nextOrderId as id
    manager.save.mockImplementation(async (entityOrArr: any) => {
      if (Array.isArray(entityOrArr)) return entityOrArr;
      return { ...entityOrArr, id: nextOrderId };
    });

    const mod = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(CartItem), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(UserAddress), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(OrdersService);

    // reset to defaults
    stockDecrementAffected = 1;
    nextOrderId = 'o-1';
  });

  it('throws expired if expiresAt in past', async () => {
    const draft = { ...validDraft, expiresAt: Date.now() - 1 };
    await expect(svc.createFromPreorder('u1', draft)).rejects.toThrow(/expired/i);
  });

  it('throws Conflict when stock decrement affects 0 rows', async () => {
    setStockDecrementAffected(0);
    manager.query.mockResolvedValue({ affectedRows: 0 });
    await expect(svc.createFromPreorder('u1', validDraft)).rejects.toThrow(/stock/i);
  });

  it('creates an order with Paid status', async () => {
    setStockDecrementAffected(1);
    setNextOrderId('o-7');
    manager.query.mockResolvedValue({ affectedRows: 1 });

    const savedEntities: any[] = [];
    manager.save.mockImplementation(async (entityOrArr: any) => {
      if (Array.isArray(entityOrArr)) {
        savedEntities.push(...entityOrArr);
        return entityOrArr;
      }
      const saved = { ...entityOrArr, id: 'o-7' };
      savedEntities.push(saved);
      return saved;
    });

    const out = await svc.createFromPreorder('u1', validDraft);
    expect(out).toEqual({ orderId: 'o-7', total: '20.00', status: 'Paid' });

    // Verify the saved Order has shipping fields populated
    const savedOrder = savedEntities.find((e) => e.buyerId === 'u1');
    expect(savedOrder).toBeDefined();
    expect(savedOrder.shippingRecipient).toBe('Alice');
    expect(savedOrder.shippingLine1).toBe('123 Main St');
    expect(savedOrder.paymentMethod).toBe('cod');

    // Verify the saved OrderItem has storeId from the draft
    const savedItem = savedEntities.find((e) => e.productId === 'p1');
    expect(savedItem).toBeDefined();
    expect(savedItem.storeId).toBe('s1');
  });
});
