import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';

function flush() {
  return new Promise((r) => setImmediate(r));
}

describe('Cart behavior hooks', () => {
  it('add fires recordCartAdd only on a new row', async () => {
    const behavior = { recordCartAdd: jest.fn().mockResolvedValue(undefined), recordCartRemove: jest.fn() };
    const items = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'c1' })),
    } as any;
    const products = { findOne: jest.fn().mockResolvedValue({ id: 'p1', name: 'X', price: '10', stock: 5 }) } as any;
    const svc = new CartService(items, products, behavior as any);
    await svc.add('7', { productId: 'p1', quantity: 1 } as any);
    await flush();
    expect(behavior.recordCartAdd).toHaveBeenCalledWith('7', 'p1');
  });

  it('add does NOT fire on a qty increment (existing row)', async () => {
    const behavior = { recordCartAdd: jest.fn(), recordCartRemove: jest.fn() };
    const items = {
      findOne: jest.fn().mockResolvedValue({ id: 'c1', userId: '7', productId: 'p1', quantity: 1 }),
      save: jest.fn().mockImplementation(async (e) => e),
    } as any;
    const products = { findOne: jest.fn().mockResolvedValue({ id: 'p1', name: 'X', price: '10', stock: 5 }) } as any;
    const svc = new CartService(items, products, behavior as any);
    await svc.add('7', { productId: 'p1', quantity: 1 } as any);
    await flush();
    expect(behavior.recordCartAdd).not.toHaveBeenCalled();
  });

  it('remove fires recordCartRemove', async () => {
    const behavior = { recordCartAdd: jest.fn(), recordCartRemove: jest.fn().mockResolvedValue(undefined) };
    const items = { delete: jest.fn().mockResolvedValue(undefined) } as any;
    const svc = new CartService(items, {} as any, behavior as any);
    await svc.remove('7', 'p1');
    await flush();
    expect(behavior.recordCartRemove).toHaveBeenCalledWith('7', 'p1');
  });
});

describe('Wishlist behavior hooks', () => {
  it('add fires recordWishlistAdd on a new row; remove fires recordWishlistRemove', async () => {
    const behavior = { recordWishlistAdd: jest.fn().mockResolvedValue(undefined), recordWishlistRemove: jest.fn().mockResolvedValue(undefined) };
    const items = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation(async (e) => ({ ...e, id: 'w1' })),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new WishlistService(items, {} as any, behavior as any);
    await svc.add('7', 'p1');
    await flush();
    expect(behavior.recordWishlistAdd).toHaveBeenCalledWith('7', 'p1');
    await svc.remove('7', 'p1');
    await flush();
    expect(behavior.recordWishlistRemove).toHaveBeenCalledWith('7', 'p1');
  });
});
