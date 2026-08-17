'use client';

export const AUTH_TOKEN_STORAGE_KEY = 'poultry_token';
export const AUTH_USER_STORAGE_KEY = 'poultry_user';
export const AUTH_STATE_CLEARED_EVENT = 'poultry-auth-state-cleared';

export interface StoredAuthUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'DATA_ENTRY';
}

export function isJwtExpired(token: string) {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return true;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return Boolean(payload.exp && payload.exp * 1000 < Date.now());
  } catch {
    return true;
  }
}

export function loadStoredAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function loadStoredAuthUser() {
  if (typeof window === 'undefined') return null;
  const storedUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);
  if (!storedUser) return null;
  try {
    return JSON.parse(storedUser) as StoredAuthUser;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: StoredAuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_STATE_CLEARED_EVENT));
}
