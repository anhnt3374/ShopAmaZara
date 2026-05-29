import { QdrantService } from './qdrant.service';
import { ATTR_VECTOR, DESC_VECTOR, IMAGE_VECTOR } from './qdrant.constants';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    QDRANT_COLLECTION: 'products',
    EMBEDDINGS_ENABLED: 'true',
    ...overrides,
  };
  return { get: (k: string, d?: string) => values[k] ?? d } as any;
}

function makeClient() {
  return {
    createCollection: jest.fn().mockResolvedValue(undefined),
    createPayloadIndex: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    setPayload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ points: [] }),
    retrieve: jest.fn().mockResolvedValue([]),
  };
}

describe('QdrantService', () => {
  it('ensureCollection creates the collection with 3 named cosine vectors', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.ensureCollection();
    expect(client.createCollection).toHaveBeenCalledTimes(1);
    const [name, cfg] = client.createCollection.mock.calls[0];
    expect(name).toBe('products');
    expect(Object.keys(cfg.vectors).sort()).toEqual(['attr', 'desc', 'image']);
    expect(cfg.vectors[DESC_VECTOR]).toEqual({ size: 384, distance: 'Cosine' });
    expect(cfg.vectors[IMAGE_VECTOR]).toEqual({ size: 768, distance: 'Cosine' });
    expect(client.createPayloadIndex).toHaveBeenCalled();
  });

  it('ensureCollection swallows "already exists" from createCollection', async () => {
    const client = makeClient();
    client.createCollection.mockRejectedValueOnce(new Error('Collection already exists'));
    const svc = new QdrantService(client as any, makeConfig());
    await expect(svc.ensureCollection()).resolves.toBeUndefined();
  });

  it('ensureCollection re-throws a non-exists createCollection error (e.g. bad URL)', async () => {
    const client = makeClient();
    client.createCollection.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const svc = new QdrantService(client as any, makeConfig());
    await expect(svc.ensureCollection()).rejects.toThrow(/ECONNREFUSED/);
  });

  it('upsert sends only the present named vectors (image omitted when absent)', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsert('p1', { desc: [1], attr: [2] }, { category: 'shoes' });
    const [, body] = client.upsert.mock.calls[0];
    const pt = body.points[0];
    expect(pt.id).toBe('p1');
    expect(pt.vector).toEqual({ [DESC_VECTOR]: [1], [ATTR_VECTOR]: [2] });
    expect(pt.vector[IMAGE_VECTOR]).toBeUndefined();
    expect(pt.payload).toEqual({ category: 'shoes' });
  });

  it('upsert includes image when present', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsert('p1', { desc: [1], attr: [2], image: [3] }, {});
    const pt = client.upsert.mock.calls[0][1].points[0];
    expect(pt.vector[IMAGE_VECTOR]).toEqual([3]);
  });

  it('setPayload and deletePoint call the client', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.setPayload('p1', { rating: 4.5 });
    expect(client.setPayload).toHaveBeenCalledWith('products', { payload: { rating: 4.5 }, points: ['p1'] });
    await svc.deletePoint('p1');
    expect(client.delete).toHaveBeenCalledWith('products', { points: ['p1'] });
  });

  it('upsertMany([]) is a no-op', async () => {
    const client = makeClient();
    const svc = new QdrantService(client as any, makeConfig());
    await svc.upsertMany([]);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('searchVector returns the point ids as strings', async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ points: [{ id: 'a' }, { id: 2 }] });
    const svc = new QdrantService(client as any, makeConfig());
    const ids = await svc.searchVector('desc', [1, 2], { must: [] }, 50);
    expect(ids).toEqual(['a', '2']);
    const [name, body] = client.query.mock.calls[0];
    expect(name).toBe('products');
    expect(body).toMatchObject({ using: 'desc', limit: 50, query: [1, 2] });
  });

  it('retrieveWithVectors maps payload + named vectors, [] for no ids', async () => {
    const client = makeClient();
    expect(await new QdrantService(client as any, makeConfig()).retrieveWithVectors([])).toEqual([]);
    client.retrieve.mockResolvedValue([
      { id: 'p1', payload: { category: 'shoes' }, vector: { desc: [1], attr: [2], image: [3] } },
      { id: 'p2', payload: null, vector: { desc: [4] } },
    ]);
    const out = await new QdrantService(client as any, makeConfig()).retrieveWithVectors(['p1', 'p2']);
    expect(out[0]).toEqual({ id: 'p1', payload: { category: 'shoes' }, vectors: { desc: [1], attr: [2], image: [3] } });
    expect(out[1]).toEqual({ id: 'p2', payload: {}, vectors: { desc: [4] } });
  });
});
