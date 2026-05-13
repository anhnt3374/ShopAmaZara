import { api } from './api.js';

export async function fetchCart() {
  return api.get('/me/cart');
}

export async function addCartItem(productId, quantity) {
  return api.post('/me/cart', { productId, quantity });
}

export async function updateCartItem(productId, quantity) {
  return api.patch(`/me/cart/${productId}`, { quantity });
}

export async function removeCartItem(productId) {
  return api.delete(`/me/cart/${productId}`);
}

export async function clearServerCart() {
  return api.delete('/me/cart');
}
