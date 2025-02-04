import { handleApiError } from '../utils/errorHandling';
import { cache } from '../utils/cache';
import axios from 'axios';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

interface TokenStatsResponse {
  marketCap: number;
  volume24h: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
}

// Track API requests for rate limiting
const apiRequestTracker: number[] = [];
const RATE_LIMIT = {
  MAX_REQUESTS: 30,
  TIME_WINDOW: 60 * 1000 // 1 minute
};

function isRateLimited(): boolean {
  const now = Date.now();
  // Clean old requests
  while (apiRequestTracker.length > 0 && now - apiRequestTracker[0] > RATE_LIMIT.TIME_WINDOW) {
    apiRequestTracker.shift();
  }
  return apiRequestTracker.length >= RATE_LIMIT.MAX_REQUESTS;
}

function trackRequest(): void {
  apiRequestTracker.push(Date.now());
}

export async function getTokenStats(cryptoId: string, currency: string): Promise<TokenStatsResponse> {
  const cacheKey = `stats-${cryptoId}-${currency}`;
  const ttl = 30 * 1000; // 30 seconds cache

  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Check rate limit
    if (isRateLimited()) {
      throw new Error('Rate limit exceeded');
    }

    const currencyKey = currency.toLowerCase();

    // First, try to get detailed token data
    const response = await axios.get(`${COINGECKO_API_URL}/coins/${cryptoId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
        sparkline: false
      },
      headers: {
        'x-cg-demo-api-key': import.meta.env.VITE_COINGECKO_API_KEY || '',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    const data = response.data;
    
    if (!data.market_data) {
      throw new Error(`No market data found for ${cryptoId}`);
    }

    const marketData = data.market_data;
    const stats = {
      marketCap: marketData.market_cap[currencyKey] || 0,
      volume24h: marketData.total_volume[currencyKey] || 0,
      fdv: marketData.fully_diluted_valuation[currencyKey] || 0,
      circulatingSupply: marketData.circulating_supply || 0,
      totalSupply: marketData.total_supply || 0,
      maxSupply: marketData.max_supply
    };

    // Validate the data
    if (stats.marketCap === 0 && stats.volume24h === 0 && stats.fdv === 0) {
      throw new Error(`Invalid market data for ${cryptoId}`);
    }

    // Cache the result
    cache.set(cacheKey, stats, ttl);
    
    // Track the request for rate limiting
    trackRequest();

    console.log(`📊 Token Stats for ${cryptoId}:`, stats);
    return stats;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
} 