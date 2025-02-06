import { cache } from './cache';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

class RateLimiter {
  private static instance: RateLimiter;
  private buckets: Map<string, TokenBucket> = new Map();
  
  private constructor() {}

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  async checkRateLimit(
    key: string,
    maxTokens: number,
    refillRate: number,
    refillInterval: number
  ): Promise<boolean> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Calculate tokens to add based on time passed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed / refillInterval) * refillRate;
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now - (timePassed % refillInterval);
    }

    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  async waitForToken(
    key: string,
    maxTokens: number,
    refillRate: number,
    refillInterval: number,
    maxWaitTime: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkRateLimit(key, maxTokens, refillRate, refillInterval)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }
}

// CoinGecko rate limits
export const COINGECKO_RATE_LIMITS = {
  FREE_TIER: {
    maxTokens: 10,
    refillRate: 10,
    refillInterval: 60000, // 1 minute
    maxWaitTime: 15000
  },
  PRO_TIER: {
    maxTokens: 500,
    refillRate: 500,
    refillInterval: 60000,
    maxWaitTime: 30000
  }
};

export const rateLimiter = RateLimiter.getInstance();

// Helper function to check if we should use cache
export function shouldUseCache(key: string, ttl: number): boolean {
  const cachedData = cache.get(key);
  if (!cachedData) return false;
  
  const cacheAge = Date.now() - cachedData.timestamp;
  return cacheAge < ttl;
}

// Helper to store data with timestamp
export function setCacheWithTimestamp(key: string, data: any, ttl: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now()
  }, ttl);
}

export function getCacheWithTimestamp(key: string): { data: any; timestamp: number } | null {
  return cache.get(key);
} 