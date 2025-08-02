import { getCachedData, setCachedData } from './crypto/cryptoCacheService';
import { rssEngine, type NormalizedArticle } from './rssEngine';

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  imageUrl?: string;
}

export interface NewsFetchResult {
  data: NewsArticle[];
  fromCache: boolean;
  cacheAge?: number;
}

const CACHE_KEY = 'market-news';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const STALE_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour (for fallback)

// RSS sources with their display names
const RSS_SOURCES = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://news.bitcoin.com/feed/',
  'https://cryptoslate.com/feed/',
  'https://decrypt.co/feed',
];

class NewsService {
  async fetchNews(force: boolean = false): Promise<NewsFetchResult> {
    console.log('[NEWS_SERVICE] Starting news fetch', { force });

    // If not forced, try to serve from cache first
    if (!force) {
      const cached = getCachedData<NewsArticle[]>(CACHE_KEY);
      if (cached) {
        console.log('[NEWS_SERVICE] Serving from cache');
        return {
          data: cached.data,
          fromCache: true,
          cacheAge: Date.now() - cached.timestamp
        };
      }
    }

    try {
      console.log('[NEWS_SERVICE] Fetching fresh news data via RSS Engine');
      
      // Use RSS Engine to fetch and normalize articles
      const normalizedArticles = await rssEngine.fetchAll(RSS_SOURCES, force);
      
      if (normalizedArticles.length === 0) {
        console.warn('[NEWS_SERVICE] No articles fetched from RSS Engine');
        return await this.handleApiFailure();
      }

      // Convert normalized articles to legacy format
      const legacyArticles = this.convertToLegacyFormat(normalizedArticles);
      
      // Take top 50 articles
      const topArticles = legacyArticles.slice(0, 50);
      
      // Cache the results
      setCachedData(CACHE_KEY, topArticles, CACHE_DURATION);
      
      console.log('[NEWS_SERVICE] Successfully fetched and cached news:', topArticles.length);
      
      return {
        data: topArticles,
        fromCache: false
      };
    } catch (error) {
      console.error('[NEWS_SERVICE] Error fetching news:', error);
      return await this.handleApiFailure();
    }
  }

  private convertToLegacyFormat(normalizedArticles: NormalizedArticle[]): NewsArticle[] {
    return normalizedArticles.map(article => ({
      title: article.title,
      source: article.source,
      publishedAt: new Date(article.publishedAt).toISOString(),
      summary: article.summary, // RSS Engine guarantees this is never empty
      url: article.url,
      imageUrl: article.imageUrl
    }));
  }

  private async handleApiFailure(): Promise<NewsFetchResult> {
    // Try to get stale cache data (up to 1 hour old)
    const staleCacheKey = `cryptovertx-cache-${CACHE_KEY}`;
    try {
      const itemStr = localStorage.getItem(staleCacheKey);
      if (itemStr) {
        const cacheEntry = JSON.parse(itemStr);
        const cacheAge = Date.now() - cacheEntry.timestamp;
        
        if (cacheAge <= STALE_CACHE_MAX_AGE) {
          console.log(`[NEWS_STALE_CACHE] Using stale cache data (${Math.round(cacheAge / 1000)}s old) as fallback`);
          return {
            data: cacheEntry.data,
            fromCache: true,
            cacheAge
          };
        } else {
          console.warn(`[NEWS_STALE_CACHE_TOO_OLD] Stale cache is too old (${Math.round(cacheAge / 1000)}s), not using`);
        }
      }
    } catch (cacheError) {
      console.error('[NEWS_STALE_CACHE_ERROR] Error reading stale cache:', cacheError);
    }

    // If no stale cache available, return empty array
    console.error('[NEWS_TOTAL_FAILURE] No fresh data or usable stale cache available');
    return {
      data: [],
      fromCache: false
    };
  }
}

export const newsService = new NewsService(); 