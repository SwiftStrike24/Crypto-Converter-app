import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface CryptoContextType {
  prices: Record<string, Record<string, number>>;
  loading: boolean;
  error: string | null;
  updatePrices: (force?: boolean) => Promise<void>;
  lastUpdated: Date | null;
  addCrypto: (symbol: string, id?: string) => void;
  availableCryptos: string[];
}

interface CacheData {
  prices: Record<string, Record<string, number>>;
  timestamp: number;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

// Map crypto symbols to CoinGecko IDs
const defaultCryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

const STORAGE_KEY = 'crypto-converter-tokens';

// CoinGecko API configuration
const API_BASE = 'https://api.coingecko.com/api/v3';

// Cache and rate limiting configuration
const CACHE_DURATION = 60 * 1000; // 1 minute cache
const MIN_API_INTERVAL = 30 * 1000; // 30 seconds between API calls (free tier limit)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [availableCryptos, setAvailableCryptos] = useState<string[]>(Object.keys(defaultCryptoIds));
  const [cryptoIds, setCryptoIds] = useState<{ [key: string]: string }>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultCryptoIds;
  });

  const cache = useRef<CacheData | null>(null);
  const lastApiCall = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);

  const clearUpdateTimeout = () => {
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
      updateTimeout.current = null;
    }
  };

  const getCachedPrices = (): Record<string, Record<string, number>> | null => {
    if (!cache.current) return null;
    const now = Date.now();
    if (now - cache.current.timestamp <= CACHE_DURATION) {
      return cache.current.prices;
    }
    return null;
  };

  const setCachePrices = (newPrices: Record<string, Record<string, number>>) => {
    cache.current = {
      prices: newPrices,
      timestamp: Date.now()
    };
  };

  const updatePrices = useCallback(async (force: boolean = false) => {
    const now = Date.now();

    // Check cache first unless forced update
    if (!force) {
      const cachedPrices = getCachedPrices();
      if (cachedPrices) {
        setPrices(cachedPrices);
        setLoading(false);
        return;
      }
    }

    // Respect rate limiting
    const timeSinceLastCall = now - lastApiCall.current;
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const delayTime = MIN_API_INTERVAL - timeSinceLastCall;
      clearUpdateTimeout();
      updateTimeout.current = setTimeout(() => updatePrices(force), delayTime);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_BASE}/simple/price`, {
        params: {
          ids: Object.values(cryptoIds).join(','),
          vs_currencies: 'usd,eur,cad',
          precision: 2
        },
        timeout: 10000
      });

      if (!response.data || Object.keys(response.data).length === 0) {
        throw new Error('No price data received');
      }

      setPrices(response.data);
      setCachePrices(response.data);
      setLastUpdated(new Date());
      lastApiCall.current = now;
      retryCount.current = 0;

    } catch (err) {
      console.error('API Error:', err);

      let errorMessage = 'Failed to fetch prices. Retrying...';
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait...';
        } else if (err.code === 'ECONNABORTED') {
          errorMessage = 'Connection timeout. Check your internet.';
        } else if (err.response?.status === 403) {
          errorMessage = 'API access denied. Using free tier limits.';
        }
      }

      setError(errorMessage);

      // Use cached data if available
      const cachedPrices = getCachedPrices();
      if (cachedPrices) {
        setPrices(cachedPrices);
      }

      // Implement exponential backoff retry
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++;
        const backoffDelay = RETRY_DELAY * Math.pow(2, retryCount.current - 1);
        clearUpdateTimeout();
        updateTimeout.current = setTimeout(() => updatePrices(true), backoffDelay);
      }
    } finally {
      setLoading(false);
    }
  }, [cryptoIds]);

  const addCrypto = useCallback((symbol: string, id?: string) => {
    if (!id) {
      console.warn(`Crypto symbol ${symbol} not found in cryptoIds mapping`);
      return;
    }

    setCryptoIds(prev => {
      const newIds = { ...prev, [symbol]: id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIds));
      return newIds;
    });

    if (!availableCryptos.includes(symbol)) {
      setAvailableCryptos(prev => [...prev, symbol]);
      updatePrices(true).catch(console.error);
    }
  }, [availableCryptos, updatePrices]);

  useEffect(() => {
    updatePrices(true);

    const interval = setInterval(() => {
      updatePrices(false);
    }, CACHE_DURATION);

    return () => {
      clearInterval(interval);
      clearUpdateTimeout();
    };
  }, [updatePrices]);

  return (
    <CryptoContext.Provider value={{
      prices,
      loading,
      error,
      updatePrices,
      lastUpdated,
      addCrypto,
      availableCryptos
    }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (context === undefined) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
};