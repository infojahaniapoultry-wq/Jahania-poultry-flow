import { clearAllCachedPageData, REPORT_CACHE_STORAGE_KEY } from './page-cache';

export const BUSINESS_DATA_UPDATED_EVENT = 'business-data-updated';

export function notifyBusinessDataUpdated() {
  if (typeof window === 'undefined') return;
  clearAllCachedPageData();
  window.localStorage.removeItem(REPORT_CACHE_STORAGE_KEY);
  window.dispatchEvent(new Event(BUSINESS_DATA_UPDATED_EVENT));
}
