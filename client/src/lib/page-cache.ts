const cache = new Map<string, unknown>();
export const REPORT_CACHE_STORAGE_KEY = 'poultryflow:reports-cache:v1';

export function getCachedPageData<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCachedPageData<T>(key: string, value: T) {
  cache.set(key, value);
}

export function clearCachedPageData(key: string) {
  cache.delete(key);
}

export function clearAllCachedPageData() {
  cache.clear();
}
