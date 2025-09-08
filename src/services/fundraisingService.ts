import { getCachedData, setCachedData } from './crypto/cryptoCacheService';
import { ipcRenderer } from 'electron';
import type { NewsFetchResult, NewsArticle } from './newsService';

export interface FundraisingArticle extends NewsArticle {
  chains?: string[];
  tokenless?: boolean;
  fundingStage?: string;
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
      const response = await ipcRenderer.invoke('fetch-fundraising-news', normalizedFilters);
      if (response && response.success && Array.isArray(response.data)) {
        const articles: FundraisingArticle[] = response.data;
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
