import { QueryCacheService } from './query-cache.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as any;
}

function makeClient(queryResult: any = { points: [] }) {
  return {
    createCollection: jest.fn().mockResolvedValue(undefined),
    createPayloadIndex: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(queryResult),
  };
}

const HITS = [{ id: 'p1', score: 1, components: { desc: 1, attr: 0, image: 0, boost: 0 } }];

describe('QueryCacheService', () => {
  it('returns cached hits when the top match is >= threshold', async () => {
    const client = makeClient({ points: [{ id: 'q1', score: 0.98, payload: { hits: HITS } }] });
    const svc = new QueryCacheService(client as any, makeConfig({ QUERY_CACHE_THRESHOLD: '0.97' }));
    const out = await svc.lookup([1, 0], 'scopeA');
    expect(out).toEqual(HITS);
  });

  it('returns null when the top match is below threshold', async () => {
    const client = makeClient({ points: [{ id: 'q1', score: 0.9, payload: { hits: HITS } }] });
    const svc = new QueryCacheService(client as any, makeConfig({ QUERY_CACHE_THRESHOLD: '0.97' }));
    expect(await svc.lookup([1, 0], 'scopeA')).toBeNull();
  });

  it('filters by scope and unexpired entries', async () => {
    const client = makeClient({ points: [] });
    const svc = new QueryCacheService(client as any, makeConfig());
    await svc.lookup([1, 0], 'scopeA');
    const body = client.query.mock.calls[0][1];
    const must = body.filter.must;
    expect(must).toContainEqual({ key: 'scope', match: { value: 'scopeA' } });
    const exp = must.find((m: any) => m.key === 'expiresAt');
    expect(exp.range.gt).toBeGreaterThan(0);
  });

  it('store upserts a point with scope/query/hits/expiresAt', async () => {
    const client = makeClient();
    const svc = new QueryCacheService(client as any, makeConfig({ QUERY_CACHE_TTL_MS: '1000' }));
    const before = Date.now();
    await svc.store([1, 0], 'scopeA', 'red shoes', HITS);
    expect(client.upsert).toHaveBeenCalledTimes(1);
    const pt = client.upsert.mock.calls[0][1].points[0];
    expect(pt.vector).toEqual([1, 0]);
    expect(pt.payload).toMatchObject({ scope: 'scopeA', query: 'red shoes', hits: HITS });
    expect(pt.payload.expiresAt).toBeGreaterThanOrEqual(before + 1000);
  });

  it('store is a no-op for empty hits', async () => {
    const client = makeClient();
    const svc = new QueryCacheService(client as any, makeConfig());
    await svc.store([1, 0], 'scopeA', 'q', []);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('disabled (threshold 0) -> lookup/store do nothing, enabled=false', async () => {
    const client = makeClient({ points: [{ id: 'q1', score: 1, payload: { hits: HITS } }] });
    const svc = new QueryCacheService(client as any, makeConfig({ QUERY_CACHE_THRESHOLD: '0' }));
    expect(svc.enabled).toBe(false);
    expect(await svc.lookup([1, 0], 'scopeA')).toBeNull();
    await svc.store([1, 0], 'scopeA', 'q', HITS);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('best-effort: a Qdrant error in lookup yields null, not a throw', async () => {
    const client = makeClient();
    client.query.mockRejectedValue(new Error('qdrant down'));
    const svc = new QueryCacheService(client as any, makeConfig());
    await expect(svc.lookup([1, 0], 'scopeA')).resolves.toBeNull();
  });
});
