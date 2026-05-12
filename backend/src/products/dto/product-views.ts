import { Product } from '../product.entity';

export interface ProductSummary {
  id: string;
  name: string;
  subtitle: string | null;
  brand: string;
  category: string;
  storeId: string;
  price: number;
  discount: number;
  originalPrice: number | null;
  image: string;
  inStock: boolean;
  stock: number;
  colors: string[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  images: string[];
  highlights: unknown;
  availableColors: unknown;
  availableSizes: unknown;
  material: string | null;
  targetGender: string | null;
  targetAgeGroup: string | null;
  tags: unknown;
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

function originalPrice(price: number, discount: number): number | null {
  if (!discount || discount <= 0) return null;
  return Math.round((price / (1 - discount / 100)) * 100) / 100;
}

function colorHexes(availableColors: unknown): string[] {
  const arr = asArray<{ hex?: string }>(availableColors);
  return arr.map((c) => c?.hex).filter((h): h is string => typeof h === 'string');
}

export function toProductSummary(p: Product): ProductSummary {
  const price = Number(p.price);
  return {
    id: p.id,
    name: p.name,
    subtitle: p.shortDescription,
    brand: p.brand,
    category: p.category,
    storeId: p.storeId,
    price,
    discount: p.discount,
    originalPrice: originalPrice(price, p.discount),
    image: p.imageFirst,
    inStock: p.stock > 0,
    stock: p.stock,
    colors: colorHexes(p.availableColors),
  };
}

export function toProductDetail(p: Product): ProductDetail {
  return {
    ...toProductSummary(p),
    description: p.longDescription,
    images: [p.imageFirst],
    highlights: asJson(p.highlights),
    availableColors: asJson(p.availableColors),
    availableSizes: asJson(p.availableSizes),
    material: p.material,
    targetGender: p.targetGender,
    targetAgeGroup: p.targetAgeGroup,
    tags: asJson(p.tags),
  };
}
