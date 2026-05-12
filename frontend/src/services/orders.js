import { api } from './api.js';
import { mockOrders } from '../mocks/orders.js';

const USE_MOCKS = !import.meta.env.VITE_API_BASE_URL;

export async function listOrders(params = {}) {
  if (USE_MOCKS) return Promise.resolve({ items: mockOrders });
  const search = new URLSearchParams(params).toString();
  return api.get(`/orders${search ? `?${search}` : ''}`);
}

export async function checkout(payload) {
  if (USE_MOCKS) return Promise.resolve({ ok: true, orderId: `ORD-${Date.now()}` });
  return api.post('/orders/checkout', payload);
}
