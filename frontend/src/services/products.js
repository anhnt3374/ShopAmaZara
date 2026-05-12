import { api } from './api.js';
import { mockProducts, mockProductDetail } from '../mocks/products.js';

// Per-resource service. Each function returns a promise so swapping to a
// real backend later only requires removing the `mock` fallback.

const USE_MOCKS = !import.meta.env.VITE_API_BASE_URL;

export async function listProducts(params = {}) {
  if (USE_MOCKS) return Promise.resolve({ items: mockProducts, total: mockProducts.length });
  const search = new URLSearchParams(params).toString();
  return api.get(`/products${search ? `?${search}` : ''}`);
}

export async function getProduct(id) {
  if (USE_MOCKS) return Promise.resolve(mockProductDetail(id));
  return api.get(`/products/${id}`);
}
