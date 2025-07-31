import { getCachedData, setCachedData } from './crypto/cryptoCacheService';
import { ipcRenderer } from 'electron';

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
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Bitcoin.com', url: 'https://news.bitcoin.com/feed/' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
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
      console.log('[NEWS_SERVICE] Fetching fresh news data');
      
      // Use IPC to fetch news from main process
      const response = await ipcRenderer.invoke('fetch-news-data', RSS_SOURCES);
      
      if (response && response.success) {
        const allArticles: NewsArticle[] = [];
        
        // Process all successful results
        response.results.forEach((result: any) => {
          if (result.success && result.data) {
            // Process and normalize the data from main process
            const normalizedArticles = result.data.map((item: any): NewsArticle => ({
              title: item.title || 'Untitled',
              source: item.source,
              publishedAt: item.publishedAt || new Date().toISOString(),
              summary: this.extractSummary(item.summary || ''),
              url: item.url || '',
              imageUrl: this.extractImageUrl(item.imageUrl || item.summary || '')
            }));
            
            allArticles.push(...normalizedArticles);
          }
        });

        if (allArticles.length === 0) {
          console.warn('[NEWS_SERVICE] No articles fetched from any source');
          return await this.handleApiFailure();
        }

        // Sort by publication date (newest first)
        allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        
        // Take top 50 articles
        const topArticles = allArticles.slice(0, 50);
        
        // Cache the results
        setCachedData(CACHE_KEY, topArticles, CACHE_DURATION);
        
        console.log('[NEWS_SERVICE] Successfully fetched and cached news:', topArticles.length);
        
        return {
          data: topArticles,
          fromCache: false
        };
      } else {
        console.warn('[NEWS_SERVICE] API response failed, trying cache fallback');
        return await this.handleApiFailure();
      }
    } catch (error) {
      console.error('[NEWS_SERVICE] Error fetching news:', error);
      return await this.handleApiFailure();
    }
  }



  private extractSummary(htmlContent: string): string {
    // Remove HTML tags and get first 150 characters
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    return textContent.length > 150 ? textContent.substring(0, 147) + '...' : textContent;
  }

  private extractImageUrl(content: string): string | undefined {
    if (!content) return undefined;
    
    // If content is already a direct URL
    if (content.startsWith('http') && (content.includes('.jpg') || content.includes('.png') || content.includes('.webp'))) {
      return content;
    }
    
    // Try to extract image URL from HTML content
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
    return imgMatch ? imgMatch[1] : undefined;
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