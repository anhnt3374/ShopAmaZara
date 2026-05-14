import { api } from './api.js';

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.append(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const reviewsService = {
  list(productId, params = {}) {
    return api.get(`/products/${productId}/reviews${buildQuery(params)}`);
  },
  myReview(productId) {
    return api.get(`/products/${productId}/reviews/me`);
  },
  create(productId, body) {
    return api.post(`/products/${productId}/reviews`, body);
  },
  update(id, body) {
    return api.patch(`/reviews/${id}`, body);
  },
  remove(id) {
    return api.delete(`/reviews/${id}`);
  },
};
