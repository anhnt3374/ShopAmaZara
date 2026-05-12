import { api } from './api.js';

export function register({ email, password, fullName, role }) {
  return api.post('/auth/register', { email, password, fullName, role });
}

export function login({ email, password }) {
  return api.post('/auth/login', { email, password });
}

export function me() {
  return api.get('/auth/me');
}
