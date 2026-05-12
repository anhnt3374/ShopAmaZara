import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StoresService } from '../../stores/stores.service';
import { SellerStoreGuard } from './seller-store.guard';

function ctx(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SellerStoreGuard', () => {
  let guard: SellerStoreGuard;
  const stores = { findByOwnerId: jest.fn() };

  beforeEach(async () => {
    stores.findByOwnerId.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SellerStoreGuard,
        { provide: StoresService, useValue: stores },
      ],
    }).compile();
    guard = moduleRef.get(SellerStoreGuard);
  });

  it('attaches the store and returns true when the seller owns one', async () => {
    const req: any = { user: { id: '7' } };
    stores.findByOwnerId.mockResolvedValue({ id: 's1' });
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.store).toEqual({ id: 's1' });
  });

  it('throws 403 when the user owns no store', async () => {
    stores.findByOwnerId.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctx({ user: { id: '99' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 403 when no user is on the request', async () => {
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
