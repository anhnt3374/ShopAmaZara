import { api } from './api.js';
import { mockInventory } from '../mocks/inventory.js';

const USE_MOCKS = !import.meta.env.VITE_API_BASE_URL;

export async function listInventory() {
  if (USE_MOCKS) return Promise.resolve({ items: mockInventory });
  return api.get('/inventory');
}
