import { RedisSearchCache } from './redis-search-cache';

function makeRedis(overrides: Record<string, jest.Mock> = {}) {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    ...overrides,
  } as any;
}

describe('RedisSearchCache', () => {
  afterEach(() => jest.restoreAllMocks());

  it('namespaces keys and parses JSON on get', async () => {
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(JSON.stringify([{ id: '1' }])),
    });
    const cache = new RedisSearchCache(redis);
    expect(await cache.get('q')).toEqual([{ id: '1' }]);
    expect(redis.get).toHaveBeenCalledWith('search:q');
  });

  it('returns null (degrades) when get throws', async () => {
    const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('down')) });
    const cache = new RedisSearchCache(redis);
    expect(await cache.get('q')).toBeNull();
  });

  it('writes with a PX ttl on set', async () => {
    const redis = makeRedis();
    const cache = new RedisSearchCache(redis);
    await cache.set('q', [{ id: '1' }] as any, 60000);
    expect(redis.set).toHaveBeenCalledWith('search:q', JSON.stringify([{ id: '1' }]), 'PX', 60000);
  });

  it('onModuleDestroy quits the client gracefully', async () => {
    const redis = makeRedis();
    const cache = new RedisSearchCache(redis);
    await cache.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('onModuleDestroy force-disconnects if quit fails', async () => {
    const redis = makeRedis({ quit: jest.fn().mockRejectedValue(new Error('offline')) });
    const cache = new RedisSearchCache(redis);
    await cache.onModuleDestroy();
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });
});
