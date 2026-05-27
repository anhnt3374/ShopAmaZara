import { TextEmbeddingClient } from './text-embedding.client';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBED_BATCH_SIZE: '2', ...overrides };
  return {
    get: (key: string, def?: string) => values[key] ?? def,
  } as any;
}

describe('TextEmbeddingClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('batches by EMBED_BATCH_SIZE and concatenates vectors in order', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[1], [2]], dim: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[3]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new TextEmbeddingClient(makeConfig());
    const out = await client.embed(['a', 'b', 'c']);

    expect(out).toEqual([[1], [2], [3]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forwards is_query', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ vectors: [[1]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new TextEmbeddingClient(makeConfig());
    await client.embed(['q'], { isQuery: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.is_query).toBe(true);
  });

  it('returns [] for empty input without calling fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const client = new TextEmbeddingClient(makeConfig());
    expect(await client.embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when disabled', async () => {
    const client = new TextEmbeddingClient(makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await expect(client.embed(['a'])).rejects.toThrow(/disabled/);
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const client = new TextEmbeddingClient(makeConfig());
    await expect(client.embed(['a'])).rejects.toThrow(/500/);
  });
});
