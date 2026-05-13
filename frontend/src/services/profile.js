import { api } from './api.js';

export const getMe = () => api.get('/me');
export const updateMe = (patch) => api.patch('/me', patch);
