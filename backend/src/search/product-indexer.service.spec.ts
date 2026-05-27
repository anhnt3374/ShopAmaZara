import { ProductIndexerService } from './product-indexer.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBEDDINGS_ENABLED: 'true', ...overrides };
  return { get: (k: string, d?: string) => values[k] ?? d } as any;
}

const baseProduct: any = {
  id: 'p1',
  name: 'Red Runner',
  shortDescription: 'Lightweight shoe',
  longDescription: 'A breathable running shoe.',
  availableColors: ['red', 'black'],
  availableSizes: ['40', '41'],
  material: 'mesh',
  targetGender: 'men',
  targetAgeGroup: 'adult',
  imageFirst: 'http://img/1.jpg',
  storeId: 's1',
  category: 'Shoes',
  brand: 'Acme',
  price: '59.90',
  discount: 10,
  isPublished: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function deps() {
  const text = { embed: jest.fn().mockImplementation(async (texts: string[]) => texts.map(() => [0.1])) };
  const image = { embedImages: jest.fn().mockResolvedValue({ vectors: [[0.9]], failed: [] }) };
  const qdrant = { upsert: jest.fn().mockResolvedValue(undefined), setPayload: jest.fn(), deletePoint: jest.fn() };
  const reviews = {
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avg: '4.5', cnt: '2' }),
    }),
  };
  return { text, image, qdrant, reviews };
}

describe('ProductIndexerService builders', () => {
  const { text, image, qdrant, reviews } = deps();
  const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());

  it('buildDescText labels and skips empty parts', () => {
    expect(svc.buildDescText(baseProduct)).toBe(
      'name: Red Runner | short description: Lightweight shoe | description: A breathable running shoe.',
    );
    expect(svc.buildDescText({ ...baseProduct, shortDescription: null, longDescription: null })).toBe(
      'name: Red Runner',
    );
  });

  it('buildAttrText labels, joins arrays, skips empty', () => {
    expect(svc.buildAttrText(baseProduct)).toBe(
      'color: red, black | sizes: 40, 41 | material: mesh | gender: men | age: adult',
    );
    expect(svc.buildAttrText({ ...baseProduct, availableColors: null, availableSizes: null, material: null })).toBe(
      'gender: men | age: adult',
    );
  });

  it('buildPayload maps the filter/boost fields', () => {
    const pl = svc.buildPayload(baseProduct, { rating: 4.5, reviewCount: 2 });
    expect(pl).toMatchObject({
      storeId: 's1',
      category: 'Shoes',
      price: 59.9,
      discount: 10,
      rating: 4.5,
      reviewCount: 2,
      targetGender: 'men',
      isPublished: true,
    });
  });
});

describe('ProductIndexerService.indexProduct', () => {
  it('embeds desc+attr+image and upserts a full point', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.indexProduct(baseProduct);
    expect(text.embed).toHaveBeenCalledTimes(1); // desc + attr batched into one call
    expect(text.embed.mock.calls[0][0]).toHaveLength(2);
    expect(image.embedImages).toHaveBeenCalledWith(['http://img/1.jpg']);
    const [id, vectors, payload] = qdrant.upsert.mock.calls[0];
    expect(id).toBe('p1');
    expect(vectors).toEqual({ desc: [0.1], attr: [0.1], image: [0.9] });
    expect(payload.rating).toBe(4.5);
    expect(payload.reviewCount).toBe(2);
  });

  it('omits the image vector when the image embed fails', async () => {
    const { text, image, qdrant, reviews } = deps();
    image.embedImages.mockResolvedValue({ vectors: [[0]], failed: [0] });
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.indexProduct(baseProduct, { rating: 0, reviewCount: 0 });
    const vectors = qdrant.upsert.mock.calls[0][1];
    expect(vectors.image).toBeUndefined();
    expect(vectors.desc).toBeDefined();
  });

  it('is a no-op when EMBEDDINGS_ENABLED=false', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await svc.indexProduct(baseProduct);
    expect(qdrant.upsert).not.toHaveBeenCalled();
    expect(text.embed).not.toHaveBeenCalled();
  });

  it('refreshStats does a payload-only update', async () => {
    const { text, image, qdrant, reviews } = deps();
    const svc = new ProductIndexerService(text as any, image as any, qdrant as any, reviews as any, makeConfig());
    await svc.refreshStats('p1');
    expect(qdrant.setPayload).toHaveBeenCalledWith('p1', { rating: 4.5, reviewCount: 2 });
    expect(text.embed).not.toHaveBeenCalled();
  });
});
