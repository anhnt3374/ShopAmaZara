import { BehaviorService, reviewWeight } from './behavior.service';

function repoStub(findResult: any = null) {
  return {
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(findResult),
  } as any;
}

describe('reviewWeight', () => {
  it('maps rating to weight', () => {
    expect(reviewWeight(5)).toBe(4);
    expect(reviewWeight(4)).toBe(3);
    expect(reviewWeight(3)).toBe(1);
    expect(reviewWeight(2)).toBe(-3);
    expect(reviewWeight(1)).toBe(-3);
  });
});

describe('BehaviorService', () => {
  it('recordPurchase inserts one row per deduped product with weight 5', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).recordPurchase('7', ['a', 'a', 'b']);
    const rows = repo.insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.type === 'purchase' && r.weight === 5 && r.userId === '7')).toBe(true);
    expect(rows.map((r: any) => r.productId).sort()).toEqual(['a', 'b']);
  });

  it('recordPurchase([]) is a no-op', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).recordPurchase('7', []);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('cart/wishlist add+remove append with the right weights', async () => {
    const repo = repoStub();
    const svc = new BehaviorService(repo);
    await svc.recordCartAdd('7', 'p');
    await svc.recordCartRemove('7', 'p');
    await svc.recordWishlistAdd('7', 'p');
    await svc.recordWishlistRemove('7', 'p');
    const weights = repo.insert.mock.calls.map((c: any[]) => c[0].weight);
    const types = repo.insert.mock.calls.map((c: any[]) => c[0].type);
    expect(types).toEqual(['add_to_cart', 'remove_from_cart', 'add_to_wishlist', 'remove_wishlist']);
    expect(weights).toEqual([4, -2, 3, -2]);
  });

  it('recordView is idempotent (skips when a view row exists)', async () => {
    const fresh = repoStub(null);
    await new BehaviorService(fresh).recordView('7', 'p');
    expect(fresh.insert).toHaveBeenCalledTimes(1);
    expect(fresh.insert.mock.calls[0][0]).toMatchObject({ type: 'view', weight: 1 });

    const dup = repoStub({ id: 'x' });
    await new BehaviorService(dup).recordView('7', 'p');
    expect(dup.insert).not.toHaveBeenCalled();
  });

  it('recordReview inserts when none, updates weight when present', async () => {
    const insertRepo = repoStub(null);
    await new BehaviorService(insertRepo).recordReview('7', 'p', 5);
    expect(insertRepo.insert.mock.calls[0][0]).toMatchObject({ type: 'review', weight: 4 });

    const existing = { id: 'r1', weight: 4 };
    const updateRepo = repoStub(existing);
    await new BehaviorService(updateRepo).recordReview('7', 'p', 2);
    expect(updateRepo.insert).not.toHaveBeenCalled();
    expect(updateRepo.save).toHaveBeenCalledWith({ id: 'r1', weight: -3 });
  });

  it('removeReview deletes the review row for the pair', async () => {
    const repo = repoStub();
    await new BehaviorService(repo).removeReview('7', 'p');
    expect(repo.delete).toHaveBeenCalledWith({ userId: '7', productId: 'p', type: 'review' });
  });
});
