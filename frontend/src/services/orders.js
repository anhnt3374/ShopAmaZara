import { api } from './api.js';

export const listOrders = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/me/orders${qs ? `?${qs}` : ''}`);
};

export const getOrder = (id) => api.get(`/me/orders/${id}`);

export const checkout = ({ productIds, addressId, shippingMethod, payment }) =>
  api.post('/orders/checkout', { productIds, addressId, shippingMethod, payment });

export const cancelOrder = (id) => api.patch(`/me/orders/${id}/cancel`);
