import { api } from './api.js';

export const listInventory = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/store/inventory${qs ? `?${qs}` : ''}`);
};

export const listStoreProducts = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)),
  ).toString();
  return api.get(`/store/products${qs ? `?${qs}` : ''}`);
};

export const getStoreProduct = (id) => api.get(`/store/products/${id}`);
export const createStoreProduct = (payload) => api.post('/store/products', payload);
export const updateStoreProduct = (id, payload) => api.patch(`/store/products/${id}`, payload);
export const deleteStoreProduct = (id) => api.delete(`/store/products/${id}`);
