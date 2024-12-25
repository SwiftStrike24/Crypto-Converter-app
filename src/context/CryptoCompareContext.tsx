import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface ChartDataPoint {
  timestamp: number;
  price: number;
}

interface CryptoCompareContextType {
  prices: Record<string, Record<string, number>>;
  loading: boolean;
  error: string | null;
  updatePrices: (force?: boolean) => Promise<void>;
  lastUpdated: Date | null;
  getHistoricalData: (symbol: string, currency: string, timeframe: string) => Promise<any>;
  isAvailable: boolean;
}

interface CacheData {
  prices: Record<string, Record<string, number>>;
  timestamp: number;
}

interface HistoricalCacheData {
  data: any;
  timestamp: number;
  symbol: string;
  currency: string;
  timeframe: string;
}

const CryptoCompareContext = createContext<CryptoCompareContextType | undefined>(undefined);

// Configuration
const API_BASE = 'https://data-api.cryptocompare.com';
const API_KEY = 'dafaa8324f143887025dcb9fbeddfeef656d306ec8158f851ab5007e6c93cef3';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const HISTORICAL_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_RESET = 60 * 1000; // 1 minute
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

// Add supported pairs mapping
const SUPPORTED_PAIRS: Record<string, string> = {
  'BTC': 'BTC-USDT',
  'ETH': 'ETH-USDT',
  'XRP': 'XRP-USDT',
  'SOL': 'SOL-USDT',
  // Add more pairs as needed
};

export const CryptoCompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  const cache = useRef<CacheData | null>(null);
  const historicalCache = useRef<Record<string, HistoricalCacheData>>({});
  const retryCount = useRef<number>(0);
  const rateLimitHit = useRef<boolean>(false);

  const getCacheKey = (symbol: string, currency: string, timeframe: string) => 
    `${symbol}-${currency}-${timeframe}`;

  const handleRateLimit = () => {
    rateLimitHit.current = true;
    setIsAvailable(false);
    setTimeout(() => {
      rateLimitHit.current = false;
      setIsAvailable(true);
    }, RATE_LIMIT_RESET);
  };

  const getHistoricalData = useCallback(async (
    symbol: string,
    currency: string,
    timeframe: string
  ) => {
    const cacheKey = getCacheKey(symbol, currency, timeframe);
    const cached = historicalCache.current[cacheKey];
    const now = Date.now();

    if (cached && now - cached.timestamp < HISTORICAL_CACHE_DURATION) {
      return cached.data;
    }

    if (rateLimitHit.current) {
      throw new Error('Rate limit exceeded. Using fallback API.');
    }

    try {
      // Configure parameters based on timeframe
      const limit = timeframe === '24H' ? 24 : timeframe === '7D' ? 168 : 720;

      // Get the supported trading pair or construct default
      const tradingPair = SUPPORTED_PAIRS[symbol.toUpperCase()] || `${symbol.toUpperCase()}-USDT`;

      console.log('CryptoCompare API Request:', {
        url: `${API_BASE}/spot/v1/historical/hours`,
        market: 'binance',
        tradingPair,
        limit,
        timeframe
      });

      const response = await axios.get(`${API_BASE}/spot/v1/historical/hours`, {
        params: {
          market: 'binance',
          instrument: tradingPair,
          limit,
          aggregate: 1,
          fill: 'true',
          apply_mapping: 'true',
          response_format: 'JSON',
          api_key: API_KEY
        }
      });

      console.log('CryptoCompare API Response:', {
        status: response.status,
        hasData: !!response.data?.Data,
        dataLength: response.data?.Data?.length,
        firstItem: response.data?.Data?.[0],
        error: response.data?.Err
      });

      if (response.data.Err && Object.keys(response.data.Err).length > 0) {
        throw new Error(JSON.stringify(response.data.Err));
      }

      if (!response.data.Data || !Array.isArray(response.data.Data) || response.data.Data.length === 0) {
        throw new Error('No data received from CryptoCompare');
      }

      const formattedData = response.data.Data
        .filter((item: any) => item.CLOSE && !isNaN(item.CLOSE))
        .map((item: any) => ({
          timestamp: item.TIMESTAMP * 1000,
          price: parseFloat(item.CLOSE),
        }));

      if (formattedData.length === 0) {
        throw new Error('No valid price data found');
      }

      // Sort data by timestamp to ensure proper chart rendering
      formattedData.sort((a: ChartDataPoint, b: ChartDataPoint) => a.timestamp - b.timestamp);

      // Cache the response
      historicalCache.current[cacheKey] = {
        data: formattedData,
        timestamp: now,
        symbol,
        currency,
        timeframe
      };

      return formattedData;
    } catch (error: any) {
      console.error('CryptoCompare API Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        error
      });

      if (error.response?.status === 429) {
        handleRateLimit();
      }

      // Try to provide more specific error messages
      const errorMessage = error.response?.data?.Message || 
                          error.response?.data?.Err?.Message ||
                          error.message ||
                          'Failed to fetch data from CryptoCompare';
      
      throw new Error(`CryptoCompare API Error: ${errorMessage}`);
    }
  }, []);

  const updatePrices = useCallback(async (force: boolean = false) => {
    if (!force && cache.current && Date.now() - cache.current.timestamp < CACHE_DURATION) {
      setPrices(cache.current.prices);
      return;
    }

    if (rateLimitHit.current) {
      throw new Error('Rate limit exceeded. Using fallback API.');
    }

    try {
      setLoading(true);
      setError(null);

      // Implement price fetching logic here when needed
      // For now, we'll focus on historical data as that's the primary use case

      setLastUpdated(new Date());
      retryCount.current = 0;
    } catch (error: any) {
      if (error.response?.status === 429) {
        handleRateLimit();
      }
      setError(error.message);
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++;
        setTimeout(() => updatePrices(force), RETRY_DELAY * Math.pow(2, retryCount.current));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize and set up cleanup
  useEffect(() => {
    updatePrices(true);
    return () => {
      cache.current = null;
      historicalCache.current = {};
    };
  }, [updatePrices]);

  return (
    <CryptoCompareContext.Provider value={{
      prices,
      loading,
      error,
      updatePrices,
      lastUpdated,
      getHistoricalData,
      isAvailable
    }}>
      {children}
    </CryptoCompareContext.Provider>
  );
};

export const useCryptoCompare = () => {
  const context = useContext(CryptoCompareContext);
  if (context === undefined) {
    throw new Error('useCryptoCompare must be used within a CryptoCompareProvider');
  }
  return context;
}; 