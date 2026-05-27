import { SearchService } from './search.service';

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as any;
}

function deps(retrieved: any[]) {
  const text = { embed: jest.fn().mockResolvedValue([[1, 0]]) };
  const image = { embedText: jest.fn().mockResolvedValue([[0, 1]]) };
  const qdrant = {
    searchVector: jest.fn().mockResolvedValue(retrieved.map((r) => r.id)),
    retrieveWithVectors: jest.fn().mockResolvedValue(retrieved),
  };
  return { text, image, qdrant };
}

describe('SearchService.search', () => {
  it('embeds query twice, fuses the weighted blend, sorts desc', async () => {
    const retrieved = [
      { id: 'p1', payload: { discount: 0, rating: 0, reviewCount: 0 }, vectors: { desc: [1, 0], attr: [1, 0], image: [0, 0] } },
      { id: 'p2', payload: { discount: 0, rating: 0, reviewCount: 0 }, vectors: { desc: [0, 0], attr: [0, 0], image: [0, 1] } },
    ];
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'red shoes' });

    expect(text.embed).toHaveBeenCalledWith(['red shoes'], { isQuery: true });
    expect(image.embedText).toHaveBeenCalledWith(['red shoes']);
    expect(qdrant.searchVector).toHaveBeenCalledTimes(3);
    expect(hits[0].id).toBe('p1');
    expect(hits[0].score).toBeCloseTo(0.8, 5);
    expect(hits[1].id).toBe('p2');
    expect(hits[1].score).toBeCloseTo(0.1, 5);
  });

  it('treats a missing named vector as 0 contribution', async () => {
    const retrieved = [{ id: 'p1', payload: {}, vectors: { desc: [1, 0] } }];
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'x' });
    expect(hits[0].score).toBeCloseTo(0.55, 5);
  });

  it('boost: review damping lowers a 1-review 5-star vs a 200-review 5-star', async () => {
    const mk = (id: string, reviewCount: number) => ({
      id,
      payload: { discount: 0, rating: 5, reviewCount },
      vectors: { desc: [0, 0], attr: [0, 0], image: [0, 0] },
    });
    const retrieved = [mk('few', 1), mk('many', 200)];
    const { text, image, qdrant } = deps(retrieved);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    const hits = await svc.search({ query: 'x' });
    const few = hits.find((h) => h.id === 'few')!;
    const many = hits.find((h) => h.id === 'many')!;
    expect(many.components.boost).toBeGreaterThan(few.components.boost);
  });

  it('returns [] when no candidates', async () => {
    const { text, image, qdrant } = deps([]);
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    expect(await svc.search({ query: 'x' })).toEqual([]);
    expect(qdrant.retrieveWithVectors).not.toHaveBeenCalled();
  });

  it('throws when query embedding is empty', async () => {
    const text = { embed: jest.fn().mockResolvedValue([]) };
    const image = { embedText: jest.fn().mockResolvedValue([]) };
    const qdrant = { searchVector: jest.fn(), retrieveWithVectors: jest.fn() };
    const svc = new SearchService(text as any, image as any, qdrant as any, makeConfig());
    await expect(svc.search({ query: 'x' })).rejects.toThrow(/embedding/);
  });
});
