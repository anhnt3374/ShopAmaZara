import { BehaviorController } from './behavior.controller';

describe('BehaviorController', () => {
  it('view calls recordView with the authed user id + body productId', async () => {
    const behavior = { recordView: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new BehaviorController(behavior as any);
    await ctrl.view({ user: { id: '7' } } as any, { productId: 'p1' } as any);
    expect(behavior.recordView).toHaveBeenCalledWith('7', 'p1');
  });

  it('view swallows recordView errors (never throws to the client)', async () => {
    const behavior = { recordView: jest.fn().mockRejectedValue(new Error('db down')) };
    const ctrl = new BehaviorController(behavior as any);
    await expect(ctrl.view({ user: { id: '7' } } as any, { productId: 'p1' } as any)).resolves.toBeUndefined();
  });
});
