import { api } from './api.js';
import { mockProducts, mockProductDetail } from '../mocks/products.js';

const USE_MOCKS = !import.meta.env.VITE_API_BASE_URL;

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null || v === '') continue;
        sp.append(key, v);
      }
    } else {
      sp.append(key, value);
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function listProducts(params = {}) {
  if (USE_MOCKS) return Promise.resolve({ items: mockProducts, total: mockProducts.length, page: 1, limit: mockProducts.length });
  return api.get(`/products${buildQuery(params)}`);
}

export async function getProductFacets(params = {}) {
  if (USE_MOCKS) {
    const cats = [...new Set(mockProducts.map((p) => p.category))];
    const brands = [...new Set(mockProducts.map((p) => p.brand))];
    const prices = mockProducts.map((p) => p.price);
    return Promise.resolve({ categories: cats, brands, priceRange: { min: Math.min(...prices), max: Math.max(...prices) } });
  }
  return api.get(`/products/facets${buildQuery(params)}`);
}

export async function getProduct(id) {
  if (USE_MOCKS) return Promise.resolve(mockProductDetail(id));
  return api.get(`/products/${id}`);
}
