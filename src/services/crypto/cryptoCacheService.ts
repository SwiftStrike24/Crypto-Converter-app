interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

export interface CachedDataWithTimestamp<T> {
  data: T;
  timestamp: number;
}

export interface CacheReadResult<T> {
  data: T;
  timestamp: number;
  expiry: number;
  ageMs: number;
  isStale: boolean;
}

function getFullCacheKey(key: string): string {
  return `cryptovertx-cache-${key}`;
}

function safeParseCacheEntry<T>(raw: string | null, fullKey: string): CacheEntry<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.timestamp !== 'number' || typeof parsed.expiry !== 'number') return null;
    return parsed;
  } catch (error) {
    console.error(`[CryptoCacheService] Error parsing cache for key "${fullKey}":`, error);
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // ignore
    }
    return null;
  }
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

/**
 * Returns cached data only if it is still fresh (not expired).
 * Important: this does NOT evict expired entries, so stale fallback remains possible.
 */
export function getCachedDataFresh<T>(key: string): CacheReadResult<T> | null {
  const fullKey = getFullCacheKey(key);
  const entry = safeParseCacheEntry<T>(localStorage.getItem(fullKey), fullKey);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expiry) {
    return null;
  }

  return {
    data: entry.data,
    timestamp: entry.timestamp,
    expiry: entry.expiry,
    ageMs: now - entry.timestamp,
    isStale: false,
  };
}

/**
 * Returns cached data even if it is expired.
 */
export function getCachedDataAllowStale<T>(key: string): CacheReadResult<T> | null {
  const fullKey = getFullCacheKey(key);
  const entry = safeParseCacheEntry<T>(localStorage.getItem(fullKey), fullKey);
  if (!entry) return null;

  const now = Date.now();
  return {
    data: entry.data,
    timestamp: entry.timestamp,
    expiry: entry.expiry,
    ageMs: now - entry.timestamp,
    isStale: now > entry.expiry,
  };
}

// Backward-compatible helper: returns only fresh cache (no eviction)
export function getCachedData<T>(key: string): CachedDataWithTimestamp<T> | null {
  const fresh = getCachedDataFresh<T>(key);
  if (!fresh) return null;
  return { data: fresh.data, timestamp: fresh.timestamp };
}

/**
 * Explicitly prunes a cache entry if it's older than maxAgeMs.
 * Returns true if an entry was removed.
 */
export function pruneCacheKey(key: string, maxAgeMs: number): boolean {
  const fullKey = getFullCacheKey(key);
  const entry = safeParseCacheEntry<unknown>(localStorage.getItem(fullKey), fullKey);
  if (!entry) return false;
  const now = Date.now();
  if (now - entry.timestamp > maxAgeMs) {
    try {
      localStorage.removeItem(fullKey);
      return true;
    } catch {
      return false;
    }
  }
  return false;
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
