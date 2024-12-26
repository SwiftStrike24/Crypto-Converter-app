import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface CryptoContextType {
  prices: Record<string, Record<string, number>>;
  loading: boolean;
  error: string | null;
  updatePrices: (force?: boolean) => Promise<void>;
  lastUpdated: Date | null;
  addCrypto: (symbol: string, id?: string) => Promise<void>;
  addCryptos: (tokens: { symbol: string; id: string }[]) => Promise<void>;
  deleteCrypto: (symbol: string) => void;
  availableCryptos: string[];
  getCryptoId: (symbol: string) => string | undefined;
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
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const MIN_API_INTERVAL = 60 * 1000; // 60 seconds between API calls (free tier limit)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds base delay for retries
const DEBOUNCE_DELAY = 500; // 500ms debounce delay
const BATCH_WINDOW = 2000; // 2 seconds batch window

// Add request queue interface
interface RequestQueue {
  pendingSymbols: Set<string>;
  isProcessing: boolean;
  lastProcessed: number;
  batchTimer: NodeJS.Timeout | null;
}

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [availableCryptos, setAvailableCryptos] = useState<string[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const storedIds = JSON.parse(stored);
      const defaultTokens = Object.keys(defaultCryptoIds);
      const customTokens = Object.keys(storedIds).filter(token => !defaultTokens.includes(token));
      return [...defaultTokens, ...customTokens.sort()];
    }
    return Object.keys(defaultCryptoIds);
  });
  const [cryptoIds, setCryptoIds] = useState<{ [key: string]: string }>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultCryptoIds, ...JSON.parse(stored) } : defaultCryptoIds;
  });

  const cache = useRef<CacheData | null>(null);
  const lastApiCall = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const requestQueue = useRef<RequestQueue>({
    pendingSymbols: new Set(),
    isProcessing: false,
    lastProcessed: 0,
    batchTimer: null
  });

  const clearUpdateTimeout = () => {
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
      updateTimeout.current = null;
    }
  };

  const clearDebounceTimer = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  };

  const getCachedPrices = () => {
    if (!cache.current) return null;
    
    const now = Date.now();
    const age = now - cache.current.timestamp;
    
    // Return null if cache is expired
    if (age > CACHE_DURATION) {
      cache.current = null;
      return null;
    }
    
    // If cache is getting old (>80% of duration), trigger a background refresh
    if (age > CACHE_DURATION * 0.8 && !requestQueue.current.isProcessing) {
      queuePriceUpdate(Array.from(requestQueue.current.pendingSymbols));
    }
    
    return cache.current.prices;
  };

  const setCachePrices = (newPrices: Record<string, Record<string, number>>) => {
    cache.current = {
      prices: newPrices,
      timestamp: Date.now()
    };
  };

  const getCryptoId = useCallback((symbol: string) => {
    return cryptoIds[symbol];
  }, [cryptoIds]);

  // Enhanced error handling with exponential backoff
  const handleApiError = useCallback((err: any) => {
    console.error('API Error:', err);
    let errorMessage = 'Failed to fetch prices. Retrying...';
    let retryDelay = RETRY_DELAY;
    
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait...';
        retryDelay = MIN_API_INTERVAL * 2; // Double the minimum interval on rate limit
        lastApiCall.current = Date.now(); // Update last API call time
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = 'Connection timeout. Check your internet.';
      } else if (err.response?.status === 403 || err.response?.status === 401) {
        errorMessage = 'API access denied. Please check your API key.';
        retryDelay = MIN_API_INTERVAL; // Use standard interval for auth errors
      }
    }

    setError(errorMessage);

    // Use cached data if available
    const cachedPrices = getCachedPrices();
    if (cachedPrices) {
      setPrices(cachedPrices);
    }

    // Implement exponential backoff for retries
    if (retryCount.current < MAX_RETRIES) {
      retryCount.current++;
      const backoffDelay = retryDelay * Math.pow(2, retryCount.current - 1);
      setTimeout(() => processBatchRequests(), backoffDelay);
    }
  }, []);

  // Enhanced batch processing
  const processBatchRequests = useCallback(async () => {
    if (requestQueue.current.isProcessing || requestQueue.current.pendingSymbols.size === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall.current;
    
    // Respect rate limits
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const delayTime = MIN_API_INTERVAL - timeSinceLastCall;
      updateTimeout.current = setTimeout(() => processBatchRequests(), delayTime);
      return;
    }

    requestQueue.current.isProcessing = true;

    try {
      setLoading(true);
      setError(null);

      // Process all pending symbols in one batch
      const symbolsToProcess = Array.from(requestQueue.current.pendingSymbols);
      const relevantIds = symbolsToProcess
        .map(symbol => cryptoIds[symbol])
        .filter(Boolean);

      if (relevantIds.length === 0) {
        requestQueue.current.pendingSymbols.clear();
        return;
      }

      let priceData: Record<string, any> = {};
      let usedFallbackApi = false;

      try {
        // Try CoinGecko first
        const response = await axios.get(`${API_BASE}/simple/price`, {
          params: {
            ids: relevantIds.join(','),
            vs_currencies: 'usd,eur,cad',
            precision: 18
          },
          timeout: 15000
        });
        priceData = response.data;
      } catch (coinGeckoError) {
        console.log('CoinGecko API failed, switching to CryptoCompare');
        
        try {
          // Use CryptoCompare as fallback
          const fallbackResponses = await Promise.all(
            symbolsToProcess.map(async (symbol) => {
              try {
                const response = await axios.get('https://data-api.cryptocompare.com/spot/v1/historical/hours', {
                  params: {
                    market: 'binance',
                    instrument: `${symbol}-USDT`,
                    limit: 1,
                    aggregate: 1,
                    fill: 'true',
                    apply_mapping: 'true',
                    response_format: 'JSON',
                    api_key: 'dafaa8324f143887025dcb9fbeddfeef656d306ec8158f851ab5007e6c93cef3'
                  }
                });

                if (response.data.Data?.[0]) {
                  const price = parseFloat(response.data.Data[0].CLOSE);
                  return {
                    symbol,
                    prices: {
                      usd: price,
                      // Approximate EUR and CAD prices using typical conversion rates
                      eur: price * 0.92,
                      cad: price * 1.35
                    }
                  };
                }
                return null;
              } catch (error) {
                console.error(`Failed to fetch price for ${symbol} from CryptoCompare:`, error);
                return null;
              }
            })
          );

          // Convert fallback responses to CoinGecko format
          priceData = fallbackResponses.reduce((acc, curr) => {
            if (curr) {
              acc[cryptoIds[curr.symbol]] = curr.prices;
            }
            return acc;
          }, {} as Record<string, any>);

          usedFallbackApi = true;
        } catch (fallbackError) {
          console.error('Both APIs failed:', fallbackError);
          throw fallbackError;
        }
      }

      if (!priceData || Object.keys(priceData).length === 0) {
        throw new Error('No price data received from either API');
      }

      // Update prices with merged data
      const existingPrices = getCachedPrices() || {};
      const newPrices = { ...existingPrices };

      symbolsToProcess.forEach(symbol => {
        const id = cryptoIds[symbol];
        if (id && priceData[id]) {
          newPrices[symbol] = {
            usd: priceData[id].usd,
            eur: priceData[id].eur,
            cad: priceData[id].cad
          };
        }
      });

      setPrices(newPrices);
      setCachePrices(newPrices);
      setLastUpdated(new Date());
      lastApiCall.current = now;
      retryCount.current = 0;
      requestQueue.current.pendingSymbols.clear();

      // Only set error if using fallback API and there's a specific issue
      if (usedFallbackApi && Object.keys(newPrices).length < symbolsToProcess.length) {
        setError('Some prices may be delayed or unavailable');
      } else {
        setError(null);
      }

    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
      requestQueue.current.isProcessing = false;
      requestQueue.current.lastProcessed = Date.now();
    }
  }, [cryptoIds, handleApiError]);

  // Enhanced queue management with smart batching
  const queuePriceUpdate = useCallback((symbols: string[]) => {
    clearDebounceTimer();
    clearUpdateTimeout();
    
    symbols.forEach(symbol => requestQueue.current.pendingSymbols.add(symbol));
    
    // Clear existing batch timer
    if (requestQueue.current.batchTimer) {
      clearTimeout(requestQueue.current.batchTimer);
    }
    
    // Start a new batch window
    requestQueue.current.batchTimer = setTimeout(() => {
      if (!requestQueue.current.isProcessing) {
        processBatchRequests();
      }
    }, BATCH_WINDOW);
    
  }, [processBatchRequests]);

  // Modified updatePrices to use the queue system with proper debouncing
  const updatePrices = useCallback(async (force: boolean = false) => {
    clearDebounceTimer();
    clearUpdateTimeout();
    
    const now = Date.now();

    if (!force) {
      const cachedPrices = getCachedPrices();
      if (cachedPrices) {
        setPrices(cachedPrices);
        setLoading(false);
        setLastUpdated(new Date(cache.current?.timestamp || now));
        return;
      }
    }

    // Use debounced queue update
    updateTimeout.current = setTimeout(() => {
      queuePriceUpdate(Object.keys(cryptoIds));
    }, DEBOUNCE_DELAY);
  }, [cryptoIds, queuePriceUpdate]);

  // Modified addCrypto to use the queue system
  const addCrypto = useCallback(async (symbol: string, id?: string) => {
    if (!id) {
      console.warn(`No CoinGecko ID provided for symbol ${symbol}`);
      return;
    }

    const upperSymbol = symbol.toUpperCase();
    const lowerId = id.toLowerCase();

    setCryptoIds(prev => {
      const newIds = { ...prev, [upperSymbol]: lowerId };
      // Save to localStorage, but preserve default tokens
      const storageIds = { ...newIds };
      Object.keys(defaultCryptoIds).forEach(key => {
        delete storageIds[key];
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));
      return newIds;
    });

    setAvailableCryptos(prev => {
      if (!prev.includes(upperSymbol)) {
        const defaultTokens = Object.keys(defaultCryptoIds);
        const customTokens = prev.filter(token => !defaultTokens.includes(token));
        const newCustomTokens = [...customTokens, upperSymbol].sort();
        return [...defaultTokens, ...newCustomTokens];
      }
      return prev;
    });

    // Queue only the new symbol for update
    queuePriceUpdate([upperSymbol]);
  }, [queuePriceUpdate]);

  // Modified addCryptos to use the queue system
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    const newCryptoIds = { ...cryptoIds };
    const newSymbols: string[] = [];
    const storageIds = { ...cryptoIds };

    // Remove default tokens from storage object
    Object.keys(defaultCryptoIds).forEach(key => {
      delete storageIds[key];
    });

    tokens.forEach(({ symbol, id }) => {
      const upperSymbol = symbol.toUpperCase();
      newCryptoIds[upperSymbol] = id.toLowerCase();
      storageIds[upperSymbol] = id.toLowerCase();
      newSymbols.push(upperSymbol);
    });
    
    // Save only custom tokens to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));
    setCryptoIds(newCryptoIds);

    const defaultTokens = Object.keys(defaultCryptoIds);
    setAvailableCryptos(prev => {
      const existingCustomTokens = prev.filter(token => !defaultTokens.includes(token));
      const allTokens = [...new Set([...defaultTokens, ...existingCustomTokens, ...newSymbols])];
      return allTokens;
    });

    // Queue only the new symbols for update
    queuePriceUpdate(newSymbols);
  }, [cryptoIds, queuePriceUpdate]);

  const deleteCrypto = useCallback((symbol: string) => {
    // Don't allow deletion of default tokens
    if (Object.keys(defaultCryptoIds).includes(symbol)) {
      return;
    }

    setCryptoIds(prev => {
      const newCryptoIds = { ...prev };
      delete newCryptoIds[symbol];
      
      // Save only custom tokens to localStorage
      const storageIds = { ...newCryptoIds };
      Object.keys(defaultCryptoIds).forEach(key => {
        delete storageIds[key];
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));
      
      return newCryptoIds;
    });

    setAvailableCryptos(prev => prev.filter(s => s !== symbol));
  }, []);

  // Update the useEffect to use the queue system
  useEffect(() => {
    const updatePricesAndRetry = async () => {
      try {
        await updatePrices(true);
      } catch (error) {
        console.error('Failed to update prices:', error);
        updateTimeout.current = setTimeout(() => updatePricesAndRetry(), 2000);
      }
    };

    updatePricesAndRetry();

    const interval = setInterval(() => {
      updatePrices(false);
    }, CACHE_DURATION);

    return () => {
      clearInterval(interval);
      clearUpdateTimeout();
      clearDebounceTimer();
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
      addCryptos,
      deleteCrypto,
      availableCryptos,
      getCryptoId
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