import { getCachedDataFresh, getCachedDataAllowStale, setCachedData } from './crypto/cryptoCacheService';

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  imageUrl?: string;
  // New fields
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;
  categories?: string[];
  relatedSources?: string[];
  isHighImpact?: boolean; // True if sentiment score >= 3 or <= -3
  // Optional metadata (used by fundraising view)
  chains?: string[];
  tokenless?: boolean;
  fundingStage?: string;
  investors?: string[];
}

export interface NewsFetchResult {
  data: NewsArticle[];
  fromCache: boolean;
  cacheAge?: number;
}

const CACHE_KEY = 'market-news';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const STALE_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour (for fallback)

class NewsService {
  async fetchNews(force: boolean = false): Promise<NewsFetchResult> {
    console.log('[NEWS_SERVICE] Starting news fetch', { force });

    // If not forced, try to serve from cache first
    if (!force) {
      const cached = getCachedDataFresh<NewsArticle[]>(CACHE_KEY);
      if (cached) {
        console.log('[NEWS_SERVICE] Serving from cache');
        return {
          data: cached.data,
          fromCache: true,
          cacheAge: cached.ageMs
        };
      }
    }

    try {
      console.log('[NEWS_SERVICE] Fetching fresh news data');

      // Use preload API to fetch news from main process
      if (typeof window.cryptovertx?.news?.fetchMarket !== 'function') {
        console.warn('[NEWS_SERVICE] Preload API not available');
        return await this.handleApiFailure();
      }

      const response = await window.cryptovertx.news.fetchMarket(force);

      if (response && response.success) {
        const allArticles: NewsArticle[] = [];

        // Process all successful results
        if (response.results && Array.isArray(response.results)) {
          response.results.forEach((result: any) => {
            if (result.success && result.data) {
              const normalizedArticles = result.data.map((item: any): NewsArticle => ({
                title: item.title || 'Untitled',
                source: item.source,
                publishedAt: item.publishedAt || new Date().toISOString(),
                summary: item.summary || '',
                url: item.url || '',
                imageUrl: this.extractImageUrl(item.imageUrl || item.summary || ''),
                sentiment: item.sentiment,
                sentimentScore: item.sentimentScore,
                categories: item.categories,
                relatedSources: item.relatedSources,
                isHighImpact: item.isHighImpact,
                // Preserve fundraising fields if present
                chains: item.chains,
                tokenless: item.tokenless,
                fundingStage: item.fundingStage,
                investors: item.investors
              }));

              allArticles.push(...normalizedArticles);
            }
          });
        }

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
    const cached = getCachedDataAllowStale<NewsArticle[]>(CACHE_KEY);
    if (cached && cached.ageMs <= STALE_CACHE_MAX_AGE) {
      console.log(`[NEWS_STALE_CACHE] Using stale cache data (${Math.round(cached.ageMs / 1000)}s old) as fallback`);
      return {
        data: cached.data,
        fromCache: true,
        cacheAge: cached.ageMs,
      };
    }

    if (cached) {
      console.warn(`[NEWS_STALE_CACHE_TOO_OLD] Stale cache is too old (${Math.round(cached.ageMs / 1000)}s), not using`);
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
