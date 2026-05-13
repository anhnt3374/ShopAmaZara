import { api } from './api.js';

export async function fetchWishlist() {
  return api.get('/me/wishlist');
}

export async function addWishlistItem(productId) {
  return api.post('/me/wishlist', { productId });
}

export async function removeWishlistItem(productId) {
  return api.delete(`/me/wishlist/${productId}`);
}
