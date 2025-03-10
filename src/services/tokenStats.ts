import { handleApiError } from '../utils/errorHandling';
import { rateLimiter, COINGECKO_RATE_LIMITS, shouldUseCache, setCacheWithTimestamp, getCacheWithTimestamp } from '../utils/rateLimiter';
import axios, { AxiosError } from 'axios';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const CRYPTOCOMPARE_API_URL = 'https://data-api.cryptocompare.com/onchain/v2/historical/supply/days';
const CACHE_TTL = 30 * 1000; // 30 seconds cache for regular data
const EXTENDED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache for fallback data

interface TokenStatsResponse {
  marketCap: number;
  volume24h: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  dataSource: 'coingecko' | 'cryptocompare';
  hasFullData: boolean;
}

interface CoinGeckoResponse {
  market_data: {
    market_cap: { [key: string]: number };
    total_volume: { [key: string]: number };
    fully_diluted_valuation: { [key: string]: number };
    circulating_supply: number;
    total_supply: number;
    max_supply: number | null;
  };
}

interface CryptoCompareResponse {
  Data: {
    SUPPLY_CIRCULATING: number;
    SUPPLY_TOTAL: number;
    SUPPLY_MAX: number;
    SUPPLY_BURNT: number;
    SUPPLY_STAKED: number;
    SUPPLY_FUTURE: number;
    SUPPLY_ISSUED: number;
    SUPPLY_LOCKED: number;
  }[];
  Err: Record<string, unknown>;
}

async function fetchWithFallback(url: string, options: any = {}): Promise<any> {
  const proxyUrls = [
    'https://api.coingecko.com/api/v3', // Direct API first
    'https://api.allorigins.win/raw?url=',
    'https://api.allorigins.win/get?url=',
    'https://bypass-cors.vercel.app/api?url=',
    'https://corsproxy.org/?'
  ];

  const headers = {
    ...options.headers,
    'Accept': 'application/json'
  };

  // Remove problematic headers when using proxies
  const proxyHeaders = {
    ...headers
  };
  delete proxyHeaders['x-cg-demo-api-key'];
  delete proxyHeaders['origin'];
  delete proxyHeaders['x-requested-with'];

  // Try direct request first with all headers
  try {
    const response = await axios.get(url, {
      ...options,
      headers,
      timeout: 5000
    });
    return response.data;
  } catch (error: unknown) {
    if ((error as AxiosError).response?.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    console.log('Primary fetch failed, attempting proxy fallback:', error);
  }

  // Try each proxy with exponential backoff
  for (let i = 0; i < proxyUrls.length; i++) {
    try {
      const proxyUrl = proxyUrls[i];
      
      // Skip the direct API URL in proxy attempts
      if (proxyUrl === 'https://api.coingecko.com/api/v3') continue;

      const encodedUrl = encodeURIComponent(url);
      const finalUrl = proxyUrl.includes('?') ? `${proxyUrl}${encodedUrl}` : `${proxyUrl}${url}`;
      
      const response = await axios.get(finalUrl, {
        ...options,
        headers: proxyHeaders,
        timeout: 10000
      });

      // Handle different proxy response formats
      if (response.data.contents) {
        return JSON.parse(response.data.contents);
      }
      return response.data;
    } catch (proxyError: unknown) {
      console.log(`Proxy attempt ${i + 1} failed:`, proxyError);
      
      if ((proxyError as AxiosError).response?.status === 429) {
        throw new Error('Rate limit exceeded');
      }

      // Wait before trying next proxy (exponential backoff)
      if (i < proxyUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw new Error('All fetch attempts failed');
}

async function fetchTokenStatsFromCryptoCompare(cryptoId: string): Promise<TokenStatsResponse> {
  console.log('📊 Fetching token stats from CryptoCompare:', cryptoId);
  
  const params = {
    asset: cryptoId.toUpperCase(),
    asset_lookup_priority: "SYMBOL",
    api_key: import.meta.env.VITE_CRYPTOCOMPARE_API_KEY
  };

  const url = new URL(CRYPTOCOMPARE_API_URL);
  url.search = new URLSearchParams(params).toString();

  try {
    const response = await axios.get<CryptoCompareResponse>(url.toString(), {
      headers: {
        "Content-type": "application/json; charset=UTF-8",
        "Authorization": `Apikey ${import.meta.env.VITE_CRYPTOCOMPARE_API_KEY}`
      },
      timeout: 10000
    });

    if (response.data.Err && Object.keys(response.data.Err).length > 0) {
      throw new Error('CryptoCompare API returned an error');
    }

    const supplyData = response.data.Data[0];
    if (!supplyData) {
      throw new Error('No supply data available from CryptoCompare');
    }

    // Check if we have valid data (not -1 or null)
    const hasValidSupplyData = 
      supplyData.SUPPLY_MAX !== -1 && 
      supplyData.SUPPLY_MAX !== null &&
      supplyData.SUPPLY_FUTURE !== -1 &&
      supplyData.SUPPLY_FUTURE !== null;

    // If we have no valid data, throw an error to trigger cache usage
    if (!hasValidSupplyData) {
      throw new Error('Invalid supply data from CryptoCompare');
    }

    return {
      marketCap: 0,
      volume24h: 0,
      fdv: 0,
      circulatingSupply: supplyData.SUPPLY_CIRCULATING || 0,
      totalSupply: supplyData.SUPPLY_TOTAL || 0,
      maxSupply: supplyData.SUPPLY_MAX > 0 ? supplyData.SUPPLY_MAX : null,
      dataSource: 'cryptocompare',
      hasFullData: hasValidSupplyData
    };
  } catch (error) {
    console.error('CryptoCompare API error:', error);
    throw error;
  }
}

async function fetchTokenStatsFromCoinGecko(cryptoId: string, currency: string): Promise<TokenStatsResponse> {
  const rateLimitKey = 'coingecko_token_stats';
  const hasToken = await rateLimiter.waitForToken(
    rateLimitKey,
    COINGECKO_RATE_LIMITS.FREE_TIER.maxTokens,
    COINGECKO_RATE_LIMITS.FREE_TIER.refillRate,
    COINGECKO_RATE_LIMITS.FREE_TIER.refillInterval,
    COINGECKO_RATE_LIMITS.FREE_TIER.maxWaitTime
  );

  if (!hasToken) {
    throw new Error('Rate limit exceeded. Switching to fallback API.');
  }

  const currencyKey = currency.toLowerCase();
  const apiUrl = `${COINGECKO_API_URL}/coins/${cryptoId}`;
  const queryParams = new URLSearchParams({
    localization: 'false',
    tickers: 'false',
    market_data: 'true',
    community_data: 'false',
    developer_data: 'false',
    sparkline: 'false'
  }).toString();

  const response = await fetchWithFallback(
    `${apiUrl}?${queryParams}`,
    {
      headers: {
        'x-cg-demo-api-key': import.meta.env.VITE_COINGECKO_API_KEY || ''
      }
    }
  );

  const data = response as CoinGeckoResponse;
  
  if (!data.market_data) {
    throw new Error(`No market data found for ${cryptoId}`);
  }

  const marketData = data.market_data;
  return {
    marketCap: marketData.market_cap[currencyKey] || 0,
    volume24h: marketData.total_volume[currencyKey] || 0,
    fdv: marketData.fully_diluted_valuation[currencyKey] || 0,
    circulatingSupply: marketData.circulating_supply || 0,
    totalSupply: marketData.total_supply || 0,
    maxSupply: marketData.max_supply,
    dataSource: 'coingecko',
    hasFullData: true
  };
}

export async function getTokenStats(cryptoId: string, currency: string): Promise<TokenStatsResponse> {
  const cacheKey = `stats-${cryptoId}-${currency}`;

  try {
    // Check cache first with longer validity during stress
    const cachedData = getCacheWithTimestamp(cacheKey);
    if (cachedData) {
      const cacheAge = Date.now() - cachedData.timestamp;
      // Use cache for up to 15 minutes during stress
      if (cacheAge < EXTENDED_CACHE_TTL * 3) {
        console.log(`📊 Using cached data for ${cryptoId} (age: ${Math.round(cacheAge / 1000)}s)`);
        return cachedData.data;
      }
    }

    let error: Error | null = null;
    let stats: TokenStatsResponse | null = null;

    // Try CoinGecko first
    try {
      console.log('📊 Attempting to fetch from CoinGecko:', cryptoId);
      stats = await fetchTokenStatsFromCoinGecko(cryptoId, currency);
      
      if (stats.marketCap === 0 && stats.volume24h === 0 && stats.fdv === 0) {
        console.log('Invalid market data from CoinGecko, will try fallback');
      } else {
        setCacheWithTimestamp(cacheKey, stats, CACHE_TTL);
        return stats;
      }
    } catch (e) {
      error = e as Error;
      console.log('CoinGecko failed, attempting CryptoCompare fallback:', e);
    }

    // Try CryptoCompare as fallback
    try {
      const fallbackStats = await fetchTokenStatsFromCryptoCompare(cryptoId);
      setCacheWithTimestamp(cacheKey, fallbackStats, EXTENDED_CACHE_TTL);
      return fallbackStats;
    } catch (e) {
      console.error('Both APIs failed:', e);
      
      // If we have stats from CoinGecko with zeros, use it instead of nothing
      if (stats) {
        console.log('Using partial CoinGecko data as last resort');
        setCacheWithTimestamp(cacheKey, stats, CACHE_TTL);
        return stats;
      }
      
      // If both APIs fail and we have cached data, use it regardless of age
      if (cachedData) {
        console.log(`📊 Using expired cache for ${cryptoId} as fallback`);
        return cachedData.data;
      }
      
      throw error || e;
    }
  } catch (error) {
    console.error(`Error fetching token stats for ${cryptoId}:`, error);
    
    // Last resort - return empty data with proper typing rather than throwing
    return {
      marketCap: 0,
      volume24h: 0,
      fdv: 0,
      circulatingSupply: 0,
      totalSupply: 0,
      maxSupply: null,
      dataSource: 'coingecko',
      hasFullData: false
    };
  }
} 