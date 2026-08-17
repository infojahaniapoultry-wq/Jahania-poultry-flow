import axios from 'axios';
import { clearAllCachedPageData, REPORT_CACHE_STORAGE_KEY } from './page-cache';
import { clearAuthSession, loadStoredAuthToken } from './auth-session';

// Vercel injects NEXT_PUBLIC_API_URL at build time. Keep a production fallback
// so the deployed app can still reach the live API if the project variable was
// added to the wrong Vercel project or the deployment was not rebuilt yet.
const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://jahania-poultry-flow-beta.vercel.app/api'
    : 'http://localhost:3010/api');
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
