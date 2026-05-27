import { api } from './api.js';

// Fire-and-forget: a failed view track must never disrupt the page.
export function recordView(productId) {
  return api.post('/me/events/view', { productId }).catch(() => null);
}
