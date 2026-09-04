import axios from 'axios';
import { clearAllCachedPageData, REPORT_CACHE_STORAGE_KEY } from './page-cache';
import { clearAuthSession, loadStoredAuthToken } from './auth-session';

export const API_ACTIVITY_EVENT = 'poultry-api-activity';

type TrackedRequestConfig = {
  __poultryRequestId?: number;
  __poultryRetryCount?: number;
};

let nextRequestId = 0;
const activeRequestIds = new Set<number>();
let slowRequestTimer: number | null = null;

function emitApiActivity(active: boolean, slow = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(API_ACTIVITY_EVENT, { detail: { active, slow } }));
}

function trackRequest(config: TrackedRequestConfig) {
  if (typeof window === 'undefined' || config.__poultryRequestId) return;
  const requestId = ++nextRequestId;
  config.__poultryRequestId = requestId;
  activeRequestIds.add(requestId);
  if (activeRequestIds.size === 1) {
    emitApiActivity(true);
    slowRequestTimer = window.setTimeout(() => emitApiActivity(true, true), 1_200);
  }
}

function finishRequest(config?: TrackedRequestConfig) {
  if (typeof window === 'undefined' || !config?.__poultryRequestId) return;
  activeRequestIds.delete(config.__poultryRequestId);
  delete config.__poultryRequestId;
  if (activeRequestIds.size > 0) return;
  if (slowRequestTimer) window.clearTimeout(slowRequestTimer);
  slowRequestTimer = null;
  emitApiActivity(false);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

// Vercel injects NEXT_PUBLIC_API_URL at build time. Keep a production fallback
// so the deployed app can still reach the live API if the project variable was
// added to the wrong Vercel project or the deployment was not rebuilt yet.
const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://jahania-poultry-flow-backend.vercel.app/api'
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
  trackRequest(config as TrackedRequestConfig);
  if (typeof window !== 'undefined') {
    const token = loadStoredAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => {
    finishRequest(res.config as TrackedRequestConfig);
    return res;
  },
  async (err) => {
    const config = err.config as (TrackedRequestConfig & { method?: string }) | undefined;
    const method = config?.method?.toLowerCase();
    const retryCount = config?.__poultryRetryCount ?? 0;
    const retryableRead = ['get', 'head', 'options'].includes(method ?? '');
    const retryableStatus = !err.response || [408, 425, 429, 500, 502, 503, 504].includes(err.response.status);

    if (config && retryableRead && retryableStatus && retryCount < 2) {
      finishRequest(config);
      config.__poultryRetryCount = retryCount + 1;
      await wait(retryCount === 0 ? 350 : 1_000);
      return api.request(config as any);
    }

    finishRequest(config);
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const hadSession = Boolean(loadStoredAuthToken());
      clearAllCachedPageData();
      localStorage.removeItem(REPORT_CACHE_STORAGE_KEY);
      clearAuthSession();
      if (hadSession && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?reason=session-expired');
      }
    }
    return Promise.reject(err);
  },
);

export default api;
