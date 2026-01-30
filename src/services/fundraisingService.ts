import { getCachedData, setCachedData } from './crypto/cryptoCacheService';
import type { NewsFetchResult, NewsArticle } from './newsService';

export interface FundraisingArticle extends NewsArticle {
  chains?: string[];
  tokenless?: boolean;
  fundingStage?: string;
  fundingAmount?: string;
  valuation?: string;
  leadInvestor?: string;
  investors?: string[];
}

export interface FundraisingFetchResult extends Omit<NewsFetchResult, 'data'> {
  data: FundraisingArticle[];
}

const CACHE_KEY = 'fundraising-news';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export interface FundraisingFilters {
  chains?: string[]; // e.g., ['SOL', 'ETH', 'SUI', 'ETH_L2s']
}

class FundraisingService {
  async fetchFundraising(force: boolean = false, filters: FundraisingFilters = {}): Promise<FundraisingFetchResult> {
    const normalizedFilters: FundraisingFilters = {
      chains: Array.isArray(filters.chains) ? filters.chains : [],
    };

    if (!force) {
      const cached = getCachedData<FundraisingArticle[]>(CACHE_KEY);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          cacheAge: Date.now() - cached.timestamp,
        };
      }
    }

    try {
      // Use preload API to fetch fundraising news
      if (typeof window.cryptovertx?.news?.fetchFundraising !== 'function') {
        console.warn('[FUNDRAISING_SERVICE] Preload API not available');
        return { data: [], fromCache: false };
      }

      const response = await window.cryptovertx.news.fetchFundraising(normalizedFilters, force);
      if (response && response.success && Array.isArray(response.data)) {
        const articles: FundraisingArticle[] = (response.data as any[]).map((item: any): FundraisingArticle => ({
          title: item?.title || 'Untitled',
          source: item?.source || item?._source || 'Unknown',
          publishedAt: item?.publishedAt || new Date().toISOString(),
          summary: item?.summary || '',
          url: item?.url || item?.link || '',
          imageUrl: item?.imageUrl,
          sentiment: item?.sentiment,
          sentimentScore: item?.sentimentScore,
          categories: item?.categories,
          relatedSources: item?.relatedSources,
          isHighImpact: item?.isHighImpact,
          chains: item?.chains,
          tokenless: item?.tokenless,
          fundingStage: item?.fundingStage,
          fundingAmount: item?.fundingAmount,
          valuation: item?.valuation,
          leadInvestor: item?.leadInvestor,
          investors: item?.investors,
        }));
        setCachedData(CACHE_KEY, articles, CACHE_DURATION);
        return { data: articles, fromCache: false };
      }
      return { data: [], fromCache: false };
    } catch (error) {
      // Fall back to cache if available
      const cached = getCachedData<FundraisingArticle[]>(CACHE_KEY);
      if (cached) {
        return {
          data: cached.data,
          fromCache: true,
          cacheAge: Date.now() - cached.timestamp,
        };
      }
      return { data: [], fromCache: false };
    }
  }
}

export const fundraisingService = new FundraisingService();
