export interface SearchFilters {
  category?: string[];
  brand?: string[];
  storeId?: string[];
  minPrice?: number;
  maxPrice?: number;
  gender?: string;
  ageGroup?: string;
}

export interface QdrantFilter {
  must: Array<Record<string, unknown>>;
}

export function buildFilter(f: SearchFilters): QdrantFilter {
  const must: Array<Record<string, unknown>> = [{ key: 'isPublished', match: { value: true } }];
  if (f.category?.length) must.push({ key: 'category', match: { any: f.category } });
  if (f.brand?.length) must.push({ key: 'brand', match: { any: f.brand } });
  if (f.storeId?.length) must.push({ key: 'storeId', match: { any: f.storeId } });
  if (f.gender) must.push({ key: 'targetGender', match: { value: f.gender } });
  if (f.ageGroup) must.push({ key: 'targetAgeGroup', match: { value: f.ageGroup } });
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (f.minPrice !== undefined) range.gte = f.minPrice;
    if (f.maxPrice !== undefined) range.lte = f.maxPrice;
    must.push({ key: 'price', range });
  }
  return { must };
}
