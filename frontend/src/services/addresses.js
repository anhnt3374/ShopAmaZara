import { api } from './api.js';

export const listAddresses = () => api.get('/me/addresses');
export const createAddress = (data) => api.post('/me/addresses', data);
export const updateAddress = (id, data) => api.patch(`/me/addresses/${id}`, data);
export const deleteAddress = (id) => api.delete(`/me/addresses/${id}`);
