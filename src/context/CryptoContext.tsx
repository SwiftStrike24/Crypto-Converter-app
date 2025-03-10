import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

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
  isPending: (symbol: string) => boolean;
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

// Approximate conversion rates for estimating prices
const CONVERSION_RATES: Record<string, Record<string, number>> = {
  BTC: { usd: 65000, eur: 59800, cad: 88400 },
  ETH: { usd: 3500, eur: 3220, cad: 4760 },
  SOL: { usd: 145, eur: 133, cad: 197 },
  USDC: { usd: 1, eur: 0.92, cad: 1.36 },
  XRP: { usd: 0.52, eur: 0.48, cad: 0.71 }
};

const STORAGE_KEY = 'cryptovertx-tokens';

// CoinGecko API configuration
const API_BASE = 'https://api.coingecko.com/api/v3';

// Cache and rate limiting configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const MIN_API_INTERVAL = 60 * 1000; // 60 seconds between API calls (free tier limit)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds base delay for retries
const DEBOUNCE_DELAY = 300; // 300ms debounce delay (reduced from 500ms)
const BATCH_WINDOW = 1000; // 1 second batch window (reduced from 2s)
const MAX_BATCH_SIZE = 25; // Maximum number of tokens to request in a single batch

// Add request queue interface
interface RequestQueue {
  pendingSymbols: Set<string>;
  isProcessing: boolean;
  lastProcessed: number;
  batchTimer: NodeJS.Timeout | null;
}

// API response tracking
interface ApiStatus {
  coinGeckoAvailable: boolean;
  cryptoCompareAvailable: boolean;
  coinGeckoResetTime: number | null;
  cryptoCompareResetTime: number | null;
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
  const apiStatus = useRef<ApiStatus>({
    coinGeckoAvailable: true,
    cryptoCompareAvailable: true,
    coinGeckoResetTime: null,
    cryptoCompareResetTime: null
  });
  
  // Track which symbols are pending price updates
  const pendingPriceUpdates = useRef<Set<string>>(new Set());

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

  // Check if a symbol is pending price update
  const isPending = useCallback((symbol: string) => {
    return pendingPriceUpdates.current.has(symbol);
  }, []);

  // Get estimated price for a symbol based on similar tokens
  const getEstimatedPrice = (symbol: string): Record<string, number> => {
    // Use default values for known tokens
    if (CONVERSION_RATES[symbol]) {
      return CONVERSION_RATES[symbol];
    }
    
    // For unknown tokens, use USDC as a placeholder (stable coin value)
    return CONVERSION_RATES.USDC;
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

  // Parse retry-after header to get milliseconds to wait
  const getMillisToWait = (retryAfterHeader: string | null): number => {
    if (!retryAfterHeader) return MIN_API_INTERVAL;
    
    let millisToWait = Math.round(parseFloat(retryAfterHeader) * 1000);
    if (isNaN(millisToWait)) {
      millisToWait = Math.max(0, new Date(retryAfterHeader).getTime() - Date.now());
    }
    return millisToWait > 0 ? millisToWait : MIN_API_INTERVAL;
  };

  // Enhanced error handling with exponential backoff
  const handleApiError = useCallback((err: any, apiName: 'coinGecko' | 'cryptoCompare') => {
    console.error(`${apiName} API Error:`, err);
    let errorMessage = 'Failed to fetch prices. Retrying...';
    let retryDelay = RETRY_DELAY;
    
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.headers['retry-after'];
        const resetTime = err.response.headers['x-ratelimit-reset'];
        
        errorMessage = 'Rate limit exceeded. Please wait...';
        retryDelay = getMillisToWait(retryAfter);
        
        // Update API status
        if (apiName === 'coinGecko') {
          apiStatus.current.coinGeckoAvailable = false;
          apiStatus.current.coinGeckoResetTime = resetTime ? parseInt(resetTime) * 1000 : Date.now() + retryDelay;
          
          // Schedule reset of availability
          setTimeout(() => {
            apiStatus.current.coinGeckoAvailable = true;
            apiStatus.current.coinGeckoResetTime = null;
          }, retryDelay);
        } else {
          apiStatus.current.cryptoCompareAvailable = false;
          apiStatus.current.cryptoCompareResetTime = resetTime ? parseInt(resetTime) * 1000 : Date.now() + retryDelay;
          
          // Schedule reset of availability
          setTimeout(() => {
            apiStatus.current.cryptoCompareAvailable = true;
            apiStatus.current.cryptoCompareResetTime = null;
          }, retryDelay);
        }
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

    return retryDelay;
  }, []);

  // Enhanced batch processing with smart API selection
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

      // Process all pending symbols in one batch, but limit batch size
      const allPendingSymbols = Array.from(requestQueue.current.pendingSymbols);
      const symbolsToProcess = allPendingSymbols.slice(0, MAX_BATCH_SIZE);
      
      // Remove processed symbols from the queue
      symbolsToProcess.forEach(symbol => requestQueue.current.pendingSymbols.delete(symbol));
      
      // Add symbols to pending updates set
      symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.add(symbol));
      
      const relevantIds = symbolsToProcess
        .map(symbol => cryptoIds[symbol])
        .filter(Boolean);

      if (relevantIds.length === 0) {
        symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.delete(symbol));
        return;
      }

      let priceData: Record<string, any> = {};
      let usedFallbackApi = false;

      // Try CoinGecko if available
      if (apiStatus.current.coinGeckoAvailable) {
        try {
          const response = await axios.get(`${API_BASE}/simple/price`, {
            params: {
              ids: relevantIds.join(','),
              vs_currencies: 'usd,eur,cad',
              precision: 18
            },
            timeout: 15000
          });
          priceData = response.data;
          lastApiCall.current = now;
        } catch (coinGeckoError) {
          console.log('CoinGecko API failed, switching to CryptoCompare');
          const retryDelay = handleApiError(coinGeckoError, 'coinGecko');
          
          // If we need to wait too long, try the fallback API
          if (retryDelay > 10000 && apiStatus.current.cryptoCompareAvailable) {
            usedFallbackApi = true;
          } else {
            throw coinGeckoError; // Re-throw to trigger the catch block
          }
        }
      } else {
        // CoinGecko not available, use fallback
        usedFallbackApi = true;
      }
      
      // Use CryptoCompare as fallback if needed
      if (usedFallbackApi && apiStatus.current.cryptoCompareAvailable) {
        try {
          const fallbackResponses = await Promise.allSettled(
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
                  },
                  timeout: 15000
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
            if (curr.status === 'fulfilled' && curr.value) {
              acc[cryptoIds[curr.value.symbol]] = curr.value.prices;
            }
            return acc;
          }, {} as Record<string, any>);

          lastApiCall.current = now;
        } catch (fallbackError) {
          handleApiError(fallbackError, 'cryptoCompare');
          throw fallbackError;
        }
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
        // Remove from pending updates
        pendingPriceUpdates.current.delete(symbol);
      });

      setPrices(newPrices);
      setCachePrices(newPrices);
      setLastUpdated(new Date());
      retryCount.current = 0;

      // Only set error if using fallback API and there's a specific issue
      if (usedFallbackApi && Object.keys(newPrices).length < symbolsToProcess.length) {
        setError('Some prices may be delayed or unavailable');
      } else {
        setError(null);
      }

      // Process remaining symbols if any
      if (requestQueue.current.pendingSymbols.size > 0) {
        // Schedule next batch with appropriate delay
        updateTimeout.current = setTimeout(() => {
          requestQueue.current.isProcessing = false;
          processBatchRequests();
        }, MIN_API_INTERVAL);
      } else {
        requestQueue.current.isProcessing = false;
      }

    } catch (err) {
      // If both APIs failed, wait and retry
      const retryDelay = Math.min(
        MIN_API_INTERVAL * 2,
        RETRY_DELAY * Math.pow(2, retryCount.current)
      );
      
      retryCount.current++;
      
      if (retryCount.current <= MAX_RETRIES) {
        updateTimeout.current = setTimeout(() => {
          requestQueue.current.isProcessing = false;
          processBatchRequests();
        }, retryDelay);
      } else {
        // Max retries reached, clear queue and reset
        // But don't clear pending symbols, just mark as not processing
        const failedSymbols = Array.from(requestQueue.current.pendingSymbols);
        failedSymbols.forEach(symbol => pendingPriceUpdates.current.delete(symbol));
        requestQueue.current.isProcessing = false;
        retryCount.current = 0;
        setError('Failed to fetch prices after multiple attempts. Please try again later.');
      }
    } finally {
      setLoading(false);
      requestQueue.current.lastProcessed = Date.now();
    }
  }, [cryptoIds, handleApiError]);

  // Enhanced queue management with smart batching
  const queuePriceUpdate = useCallback((symbols: string[]) => {
    if (!symbols.length) return;
    
    clearDebounceTimer();
    clearUpdateTimeout();
    
    // Add symbols to the queue
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

  // Debounced version of queuePriceUpdate for UI interactions
  const debouncedQueueUpdate = useCallback(
    debounce((symbols: string[]) => queuePriceUpdate(symbols), DEBOUNCE_DELAY),
    [queuePriceUpdate]
  );

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

    // Queue all tokens for update
    queuePriceUpdate(Object.keys(cryptoIds));
  }, [cryptoIds, queuePriceUpdate]);

  // Modified addCrypto to use the queue system with debouncing and immediate placeholder values
  const addCrypto = useCallback(async (symbol: string, id?: string) => {
    if (!id) {
      console.warn(`No CoinGecko ID provided for symbol ${symbol}`);
      return;
    }

    const upperSymbol = symbol.toUpperCase();
    const lowerId = id.toLowerCase();

    // Check if token already exists
    if (cryptoIds[upperSymbol] === lowerId) {
      return; // Token already exists with same ID
    }

    // Add to pending updates
    pendingPriceUpdates.current.add(upperSymbol);

    // Update state with the new token
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

    // Add placeholder price immediately to prevent "NA" display
    setPrices(prev => {
      // Only add placeholder if no price exists yet
      if (!prev[upperSymbol]) {
        const estimatedPrice = getEstimatedPrice(upperSymbol);
        return {
          ...prev,
          [upperSymbol]: estimatedPrice
        };
      }
      return prev;
    });

    // Use debounced queue update for single token additions
    debouncedQueueUpdate([upperSymbol]);
  }, [cryptoIds, debouncedQueueUpdate]);

  // Modified addCryptos to use the queue system with batching and immediate placeholder values
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    if (!tokens.length) return;
    
    const newCryptoIds = { ...cryptoIds };
    const newSymbols: string[] = [];
    const storageIds = { ...cryptoIds };
    const newPrices = { ...prices };

    // Remove default tokens from storage object
    Object.keys(defaultCryptoIds).forEach(key => {
      delete storageIds[key];
    });

    tokens.forEach(({ symbol, id }) => {
      const upperSymbol = symbol.toUpperCase();
      const lowerId = id.toLowerCase();
      
      // Only add if it's a new token or has a different ID
      if (newCryptoIds[upperSymbol] !== lowerId) {
        newCryptoIds[upperSymbol] = lowerId;
        storageIds[upperSymbol] = lowerId;
        newSymbols.push(upperSymbol);
        
        // Add to pending updates
        pendingPriceUpdates.current.add(upperSymbol);
        
        // Add placeholder price
        if (!newPrices[upperSymbol]) {
          newPrices[upperSymbol] = getEstimatedPrice(upperSymbol);
        }
      }
    });
    
    // If no new tokens, return early
    if (newSymbols.length === 0) return;
    
    // Update prices with placeholders
    setPrices(newPrices);
    
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
  }, [cryptoIds, prices, queuePriceUpdate]);

  const deleteCrypto = useCallback((symbol: string) => {
    // Don't allow deletion of default tokens
    if (Object.keys(defaultCryptoIds).includes(symbol)) {
      return;
    }

    // Remove from pending updates if present
    pendingPriceUpdates.current.delete(symbol);

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
    
    // Also remove from prices
    setPrices(prev => {
      const newPrices = { ...prev };
      delete newPrices[symbol];
      return newPrices;
    });
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
      if (requestQueue.current.batchTimer) {
        clearTimeout(requestQueue.current.batchTimer);
      }
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
      getCryptoId,
      isPending
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