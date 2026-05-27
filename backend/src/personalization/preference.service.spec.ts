import { PreferenceService } from './preference.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as any;
}

function makeDeps(opts: { affinity?: any[]; orderPrice?: any; points?: any[]; enabled?: boolean }) {
  const events = { query: jest.fn().mockResolvedValue(opts.affinity ?? []) };
  const orders = { query: jest.fn().mockResolvedValue([opts.orderPrice ?? { min: null, max: null, avg: null, count: '0' }]) };
  const qdrant = { retrieveWithVectors: jest.fn().mockResolvedValue(opts.points ?? []) };
  const config = makeConfig({ EMBEDDINGS_ENABLED: opts.enabled === false ? 'false' : 'true' });
  return { events, orders, qdrant, config };
}

describe('PreferenceService.getPreferenceVectors', () => {
  it('aggregates liked products into an L2-normalized vector per named vector', async () => {
    const affinity = [
      { productId: 'a', score: '2' },
      { productId: 'b', score: '1' },
    ];
    const points = [
      { id: 'a', payload: {}, vectors: { desc: [1, 0], attr: [1, 0], image: [0, 1] } },
      { id: 'b', payload: {}, vectors: { desc: [0, 1] } },
    ];
    const { events, orders, qdrant, config } = makeDeps({ affinity, points });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    const v = await svc.getPreferenceVectors('7');
    const n = Math.hypot(2, 1);
    expect(v.desc![0]).toBeCloseTo(2 / n, 5);
    expect(v.desc![1]).toBeCloseTo(1 / n, 5);
    expect(v.attr).toEqual([1, 0]);
    expect(v.image![0]).toBeCloseTo(0, 5);
    expect(v.image![1]).toBeCloseTo(1, 5);
  });

  it('returns {} when the user has no positive history', async () => {
    const { events, orders, qdrant, config } = makeDeps({ affinity: [] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    expect(await svc.getPreferenceVectors('7')).toEqual({});
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('returns {} (no Qdrant call) when EMBEDDINGS_ENABLED=false', async () => {
    const { events, orders, qdrant, config } = makeDeps({ enabled: false, affinity: [{ productId: 'a', score: '2' }] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    expect(await svc.getPreferenceVectors('7')).toEqual({});
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('caches the computed entry (second call does not re-query events)', async () => {
    const { events, orders, qdrant, config } = makeDeps({ affinity: [] });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    await svc.getPreferenceVectors('7');
    await svc.getPreferenceVectors('7');
    expect(events.query).toHaveBeenCalledTimes(1);
  });
});

describe('PreferenceService.getProfile', () => {
  it('tallies colors/sizes from payloads and aggregates order price', async () => {
    const affinity = [{ productId: 'a', score: '2' }, { productId: 'b', score: '1' }];
    const points = [
      { id: 'a', payload: { color: 'red, black', sizes: 'M, L' }, vectors: { desc: [1, 0] } },
      { id: 'b', payload: { color: 'red', sizes: 'M' }, vectors: { desc: [0, 1] } },
    ];
    const orderPrice = { min: '10.00', max: '90.00', avg: '50.000000', count: '3' };
    const { events, orders, qdrant, config } = makeDeps({ affinity, points, orderPrice });
    const svc = new PreferenceService(events as any, orders as any, qdrant as any, config);
    const profile = await svc.getProfile('7');
    expect(profile.topColors[0]).toEqual({ value: 'red', count: 2 });
    expect(profile.topSizes.find((s: any) => s.value === 'M')).toEqual({ value: 'M', count: 2 });
    expect(profile.orderPrice).toEqual({ min: 10, max: 90, avg: 50, count: 3 });
  });
});
