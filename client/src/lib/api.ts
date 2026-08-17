import axios from 'axios';
import { clearAllCachedPageData, REPORT_CACHE_STORAGE_KEY } from './page-cache';
import { clearAuthSession, loadStoredAuthToken } from './auth-session';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api';
const apiBaseUrl = configuredApiUrl.replace(/\/+$/, '').endsWith('/api')
  ? configuredApiUrl.replace(/\/+$/, '')
  : `${configuredApiUrl.replace(/\/+$/, '')}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = loadStoredAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      clearAllCachedPageData();
      localStorage.removeItem(REPORT_CACHE_STORAGE_KEY);
      clearAuthSession();
    }
    return Promise.reject(err);
  }
);

export default api;
