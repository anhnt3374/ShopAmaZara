import { ImageEmbeddingClient } from './image-embedding.client';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBED_BATCH_SIZE: '2', ...overrides };
  return { get: (key: string, def?: string) => values[key] ?? def } as any;
}

describe('ImageEmbeddingClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('offsets batch-relative failed indices to global indices', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vectors: [[1], [0]], dim: 1, failed: [1] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vectors: [[0]], dim: 1, failed: [0] }),
      });
    global.fetch = fetchMock as any;

    const client = new ImageEmbeddingClient(makeConfig());
    const out = await client.embedImages(['u0', 'u1', 'u2']);

    expect(out.vectors).toEqual([[1], [0], [0]]);
    expect(out.failed).toEqual([1, 2]);
  });

  it('embedText concatenates across batches', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[1], [2]], dim: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[3]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new ImageEmbeddingClient(makeConfig());
    expect(await client.embedText(['a', 'b', 'c'])).toEqual([[1], [2], [3]]);
  });

  it('throws when disabled', async () => {
    const client = new ImageEmbeddingClient(makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await expect(client.embedImages(['u'])).rejects.toThrow(/disabled/);
  });
});
