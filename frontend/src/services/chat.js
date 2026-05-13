import { api } from './api.js';

export const listChats = () => api.get('/me/chats');
export const openSystemChat = () => api.post('/me/chats/system');
export const openStoreChat = (storeId) => api.post(`/me/chats/store/${storeId}`);
export const listMessages = (id, { before, limit } = {}) => {
  const qs = new URLSearchParams();
  if (before) qs.set('before', before);
  if (limit) qs.set('limit', String(limit));
  const s = qs.toString();
  return api.get(`/me/chats/${id}/messages${s ? `?${s}` : ''}`);
};
export const sendMessage = (id, body) =>
  api.post(`/me/chats/${id}/messages`, { body });
export const markRead = (id) => api.patch(`/me/chats/${id}/read`);

// Store-side -----------------------------------------------------------
export const listStoreChats = () => api.get('/store/chats');
export const listStoreMessages = (id, { before, limit } = {}) => {
  const qs = new URLSearchParams();
  if (before) qs.set('before', before);
  if (limit) qs.set('limit', String(limit));
  const s = qs.toString();
  return api.get(`/store/chats/${id}/messages${s ? `?${s}` : ''}`);
};
export const sendStoreMessage = (id, body) =>
  api.post(`/store/chats/${id}/messages`, { body });
export const markStoreRead = (id) => api.patch(`/store/chats/${id}/read`);
