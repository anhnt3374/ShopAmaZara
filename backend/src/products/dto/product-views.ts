import { Product } from '../product.entity';

export interface ProductSummary {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  storeId: string;
  sku: string | null;
  price: number;
  salePrice: number | null;
  discount: number;
  originalPrice: number | null;
  image: string;
  inStock: boolean;
  stock: number;
  isPublished: boolean;
  colors: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  model: string | null;
  trackInventory: boolean;
  images: string[];
  highlights: unknown;
  availableColors: unknown;
  availableSizes: unknown;
  material: string | null;
  targetGender: string | null;
  targetAgeGroup: string | null;
  tags: unknown;
  rating: number;
  reviewCount: number;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function colorHexes(availableColors: unknown): string[] {
  const arr = asArray<{ hex?: string }>(availableColors);
  return arr.map((c) => c?.hex).filter((h): h is string => typeof h === 'string');
}

function imagesArray(p: Product): string[] {
  const arr = asArray<string>(p.images);
  if (arr.length) return arr;
  return p.imageFirst ? [p.imageFirst] : [];
}

export function toProductSummary(p: Product): ProductSummary {
  const price = Number(p.price);
  const salePrice = p.salePrice == null ? null : Number(p.salePrice);
  return {
    id: p.id,
    name: p.name,
    subtitle: p.shortDescription,
    brand: p.brand,
    category: p.category,
    storeId: p.storeId,
    sku: p.sku,
    price,
    salePrice,
    discount: p.discount,
    originalPrice: salePrice == null ? null : price,
    image: p.imageFirst,
    inStock: p.stock > 0,
    stock: p.stock,
    isPublished: p.isPublished,
    colors: colorHexes(p.availableColors),
  };
}

export function toProductDetail(
  p: Product,
  stats: { rating: number; reviewCount: number } = { rating: 0, reviewCount: 0 },
): ProductDetail {
  return {
    ...toProductSummary(p),
    description: p.longDescription,
    model: p.model,
    trackInventory: p.trackInventory,
    images: imagesArray(p),
    highlights: asJson(p.highlights),
    availableColors: asJson(p.availableColors),
    availableSizes: asJson(p.availableSizes),
    material: p.material,
    targetGender: p.targetGender,
    targetAgeGroup: p.targetAgeGroup,
    tags: asJson(p.tags),
    rating: stats.rating,
    reviewCount: stats.reviewCount,
  };
}
