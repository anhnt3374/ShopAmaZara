import { api } from './api.js';
import { mockConversations, mockMessages, mockFaqs } from '../mocks/chat.js';

const USE_MOCKS = !import.meta.env.VITE_API_BASE_URL;

export async function listConversations() {
  if (USE_MOCKS) return Promise.resolve({ items: mockConversations });
  return api.get('/chat/conversations');
}

export async function listMessages(conversationId) {
  if (USE_MOCKS) return Promise.resolve({ items: mockMessages(conversationId) });
  return api.get(`/chat/conversations/${conversationId}/messages`);
}

export async function listFaqs() {
  if (USE_MOCKS) return Promise.resolve({ items: mockFaqs });
  return api.get('/faqs');
}

export async function sendMessage(conversationId, text) {
  if (USE_MOCKS) return Promise.resolve({ id: Date.now(), text, from: 'user', at: new Date().toISOString() });
  return api.post(`/chat/conversations/${conversationId}/messages`, { text });
}
