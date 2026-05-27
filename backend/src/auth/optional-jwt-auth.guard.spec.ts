import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard.handleRequest', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when authentication succeeded', () => {
    const user = { id: '7' };
    expect(guard.handleRequest(null, user, null, {} as any)).toBe(user);
  });

  it('returns undefined (never throws) when there is no/invalid token', () => {
    expect(guard.handleRequest(null, false, { message: 'No auth token' }, {} as any)).toBeUndefined();
  });

  it('returns undefined even when passport reports an error', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false, null, {} as any)).toBeUndefined();
  });
});
