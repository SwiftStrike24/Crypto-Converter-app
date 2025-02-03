export interface CacheItem<T> {
  data: T;
  expiry: number;
}

export class Cache<T> {
  private store: Map<string, CacheItem<T>> = new Map();

  set(key: string, data: T, ttl: number): void {
    this.store.set(key, { data, expiry: Date.now() + ttl });
  }

  get(key: string): T | null {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.data;
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const cache = new Cache<any>(); 