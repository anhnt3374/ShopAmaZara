const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'amazara.auth.token';

function authHeader() {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadProductImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/uploads/product-image`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(payload?.message || `Upload failed (${res.status})`);
  }
  return payload;
}

export async function bulkImportProducts(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/store/products/bulk`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(payload?.message || `Import failed (${res.status})`);
  }
  return payload;
}

export function bulkTemplateUrl() {
  return `${API_BASE_URL}/store/products/bulk/template`;
}
