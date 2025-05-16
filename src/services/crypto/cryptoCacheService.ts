interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

export interface CachedDataWithTimestamp<T> {
  data: T;
  timestamp: number;
}

function getFullCacheKey(key: string): string {
  return `cryptovertx-cache-${key}`;
}

export function setCachedData<T>(key: string, data: T, durationMs: number): void {
  const fullKey = getFullCacheKey(key);
  const now = Date.now();
  const cacheEntry: CacheEntry<T> = {
    data,
    timestamp: now,
    expiry: now + durationMs,
  };
  try {
    localStorage.setItem(fullKey, JSON.stringify(cacheEntry));
  } catch (error) {
    console.error(`[CryptoCacheService] Error setting cache for key "${key}":`, error);
    // Handle potential storage quota exceeded errors, e.g., by clearing older cache items.
  }
}

export function getCachedData<T>(key: string): CachedDataWithTimestamp<T> | null {
  const fullKey = getFullCacheKey(key);
  try {
    const itemStr = localStorage.getItem(fullKey);
    if (!itemStr) {
      return null;
    }
    const cacheEntry: CacheEntry<T> = JSON.parse(itemStr);
    const now = Date.now();

    if (now > cacheEntry.expiry) {
      localStorage.removeItem(fullKey);
      return null;
    }
    return { data: cacheEntry.data, timestamp: cacheEntry.timestamp };
  } catch (error) {
    console.error(`[CryptoCacheService] Error getting cache for key "${key}":`, error);
    localStorage.removeItem(fullKey);
    return null;
  }
}

export function removeCachedData(key: string): void {
  const fullKey = getFullCacheKey(key);
  try {
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.error(`[CryptoCacheService] Error removing cache for key "${key}":`, error);
  }
}

// Specific helpers for existing cache keys, if desired for easier transition
// export function getPriceCache(): Record<string, Record<string, any>> | null {
//   return getCachedData<Record<string, Record<string, any>>>(PRICE_CACHE_STORAGE_KEY_FROM_CONSTANTS);
// }
// export function setPriceCache(data: Record<string, Record<string, any>>): void {
//   setCachedData(PRICE_CACHE_STORAGE_KEY_FROM_CONSTANTS, data, PRICE_CACHE_DURATION_FROM_CONSTANTS);
// }

// Similarly for metadata and icons if purely localStorage based.
// Icon caching in CryptoContext also used an in-memory ref (tokenIconCache), 
// so that part will be handled by its dedicated hook later. 