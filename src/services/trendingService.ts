import { fetchTrendingEndpointData, fetchCoinMarkets, RequestPriority } from './crypto/cryptoApiService';
import { getCachedData, setCachedData } from './crypto/cryptoCacheService';

export interface ITrendingToken {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  total_volume: number;
}

const CACHE_KEY = 'trending-tokens';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class TrendingService {
  async fetchTrendingTokens(): Promise<ITrendingToken[]> {
    const cached = getCachedData<ITrendingToken[]>(CACHE_KEY);
    if (cached) {
      return cached.data;
    }

    try {
      // Step 1: Fetch the list of trending coin IDs from the dedicated endpoint.
      const trendingResponse = await fetchTrendingEndpointData(RequestPriority.HIGH);
      if (!trendingResponse?.coins || trendingResponse.coins.length === 0) {
        console.warn('Trending endpoint returned no coins.');
        return [];
      }
      
      const trendingCoinIds = trendingResponse.coins.map((coin: any) => coin.item.id);

      // Step 2: Fetch the detailed market data for these specific trending coins.
      const enrichedData = await fetchCoinMarkets(trendingCoinIds, 'usd', RequestPriority.HIGH);

      if (!enrichedData || !Array.isArray(enrichedData)) {
        console.error('Unexpected trending token data format after enrichment:', enrichedData);
        return [];
      }
      
      // The data from /coins/markets is already in the format we need.
      // We just need to ensure we only include the coins that were in our trending list.
      const finalTrendingTokens = enrichedData.filter(token => trendingCoinIds.includes(token.id));
      
      setCachedData<ITrendingToken[]>(CACHE_KEY, finalTrendingTokens, CACHE_DURATION);
      
      return finalTrendingTokens;
    } catch (error) {
      console.error('Failed to fetch trending tokens:', error);
      throw error;
    }
  }
}

export const trendingService = new TrendingService(); 