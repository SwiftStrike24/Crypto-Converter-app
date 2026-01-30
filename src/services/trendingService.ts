import { fetchTrendingEndpointData, fetchCoinMarkets, RequestPriority } from './crypto/cryptoApiService';
import { getCachedDataFresh, getCachedDataAllowStale, setCachedData } from './crypto/cryptoCacheService';

export interface ITrendingToken {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

export interface TrendingFetchResult {
  data: ITrendingToken[];
  fromCache: boolean;
  cacheAge?: number;
}

const CACHE_KEY = 'trending-tokens';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STALE_CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes (for fallback)

class TrendingService {
  async fetchTrendingTokens(): Promise<TrendingFetchResult> {
    const cached = getCachedDataFresh<ITrendingToken[]>(CACHE_KEY);
    
    // Return fresh cache if available
    if (cached) {
      console.log(`📊 [TRENDING_CACHE_HIT] Using cached trending data (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
      return {
        data: cached.data,
        fromCache: true,
        cacheAge: cached.ageMs
      };
    }

    try {
      // Step 1: Fetch the list of trending coin IDs from the dedicated endpoint.
      console.log('🔄 [TRENDING_FETCH_START] Fetching fresh trending data from API');
      const trendingResponse = await fetchTrendingEndpointData(RequestPriority.HIGH);
      if (!trendingResponse?.coins || trendingResponse.coins.length === 0) {
        console.warn('⚠️ [TRENDING_FETCH_WARN] Trending endpoint returned no coins.');
        return await this.handleApiFailure();
      }
      
      const trendingCoinIds = trendingResponse.coins.map((coin: any) => coin.item.id);

      // Step 2: Fetch the detailed market data for these specific trending coins.
      const enrichedData = await fetchCoinMarkets(trendingCoinIds, 'usd', RequestPriority.HIGH);

      if (!enrichedData || !Array.isArray(enrichedData)) {
        console.error('🔴 [TRENDING_FETCH_ERROR] Unexpected trending token data format after enrichment:', enrichedData);
        return await this.handleApiFailure();
      }
      
      // The data from /coins/markets is already in the format we need.
      // We just need to ensure we only include the coins that were in our trending list.
      const finalTrendingTokens = enrichedData.filter(token => trendingCoinIds.includes(token.id));
      
      if (finalTrendingTokens.length === 0) {
        console.warn('⚠️ [TRENDING_FETCH_WARN] No valid trending tokens after filtering');
        return await this.handleApiFailure();
      }
      
      setCachedData<ITrendingToken[]>(CACHE_KEY, finalTrendingTokens, CACHE_DURATION);
      console.log(`✅ [TRENDING_FETCH_SUCCESS] Cached ${finalTrendingTokens.length} trending tokens`);
      
      return {
        data: finalTrendingTokens,
        fromCache: false
      };
    } catch (error) {
      console.error('🔴 [TRENDING_FETCH_ERROR] Failed to fetch trending tokens:', error);
      return await this.handleApiFailure();
    }
  }

  private async handleApiFailure(): Promise<TrendingFetchResult> {
    // Try to get stale cache data (up to 30 minutes old)
    const cached = getCachedDataAllowStale<ITrendingToken[]>(CACHE_KEY);
    if (cached && cached.ageMs <= STALE_CACHE_MAX_AGE) {
      console.log(`🔄 [TRENDING_STALE_CACHE] Using stale cache data (${Math.round(cached.ageMs / 1000)}s old) as fallback`);
      return {
        data: cached.data,
        fromCache: true,
        cacheAge: cached.ageMs,
      };
    }

    if (cached) {
      console.warn(`⚠️ [TRENDING_STALE_CACHE_TOO_OLD] Stale cache is too old (${Math.round(cached.ageMs / 1000)}s), not using`);
    }

    // If no stale cache available, return empty array with error indicator
    console.error('❌ [TRENDING_TOTAL_FAILURE] No fresh data or usable stale cache available');
    throw new Error('Failed to fetch trending tokens and no cached data available');
  }

  // Method to get cache status for UI indicators
  getCacheStatus(): { hasCache: boolean; cacheAge: number | null; isStale: boolean } {
    const cached = getCachedDataAllowStale<ITrendingToken[]>(CACHE_KEY);
    if (cached) {
      return {
        hasCache: true,
        cacheAge: cached.ageMs,
        isStale: cached.isStale,
      };
    }
    
    return { hasCache: false, cacheAge: null, isStale: false };
  }
}

export const trendingService = new TrendingService(); 
