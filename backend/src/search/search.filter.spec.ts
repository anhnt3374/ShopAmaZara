import { buildFilter } from './search.filter';

describe('buildFilter', () => {
  it('always requires isPublished=true', () => {
    const f = buildFilter({});
    expect(f.must).toContainEqual({ key: 'isPublished', match: { value: true } });
    expect(f.must).toHaveLength(1);
  });

  it('adds MatchAny for category/brand/storeId and value match for gender/age', () => {
    const f = buildFilter({
      category: ['Shoes', 'Bags'],
      brand: ['Acme'],
      storeId: ['s1'],
      gender: 'women',
      ageGroup: 'adult',
    });
    expect(f.must).toContainEqual({ key: 'category', match: { any: ['Shoes', 'Bags'] } });
    expect(f.must).toContainEqual({ key: 'brand', match: { any: ['Acme'] } });
    expect(f.must).toContainEqual({ key: 'storeId', match: { any: ['s1'] } });
    expect(f.must).toContainEqual({ key: 'targetGender', match: { value: 'women' } });
    expect(f.must).toContainEqual({ key: 'targetAgeGroup', match: { value: 'adult' } });
  });

  it('adds a price range with gte/lte when provided', () => {
    expect(buildFilter({ minPrice: 10, maxPrice: 50 }).must).toContainEqual({ key: 'price', range: { gte: 10, lte: 50 } });
    expect(buildFilter({ minPrice: 10 }).must).toContainEqual({ key: 'price', range: { gte: 10 } });
    expect(buildFilter({ maxPrice: 50 }).must).toContainEqual({ key: 'price', range: { lte: 50 } });
  });

  it('omits empty arrays', () => {
    const f = buildFilter({ category: [], brand: undefined });
    expect(f.must).toHaveLength(1); // only isPublished
  });
});
