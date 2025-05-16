import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios'; // Restored for isAxiosError
import { useExchangeRates } from './ExchangeRatesContext';
import {
  DEFAULT_CRYPTO_IDS,
  CONVERSION_RATES,
  STORAGE_KEY_CUSTOM_TOKENS,
  PRICE_CACHE_DURATION,
  MIN_API_INTERVAL,
  API_RETRY_DELAY,
  PRICE_UPDATE_BATCH_WINDOW,
  PRICE_UPDATE_MAX_BATCH_SIZE,
  PRELOAD_POPULAR_TOKENS_ENABLED,
  CACHE_STORAGE_KEY_PRICES,
  CACHE_STORAGE_KEY_METADATA,
  METADATA_CACHE_DURATION,
  ICON_CACHE_STORAGE_PREFIX,
  MAX_METADATA_REQUESTS_PER_SESSION_LIMIT,
  POPULAR_TOKEN_IDS_TO_PRELOAD,
  API_CONFIG,
  MAX_API_RETRIES,
} from '../constants/cryptoConstants';
import {
  fetchCoinMarkets,
  fetchSimplePrice,
  searchCoinGecko,
  isCoinGeckoApiRateLimited,
} from '../services/crypto/cryptoApiService'; // Corrected path
import {
  getCachedData,
  setCachedData,
} from '../services/crypto/cryptoCacheService'; // Corrected path

interface CryptoPriceData {
  price: number;
  change24h: number | null; // Can be null if API doesn't provide it
  low24h?: number | null; // New field for 24h low
  high24h?: number | null; // New field for 24h high
}

interface RequestQueue {
  pendingSymbols: Set<string>;
  isProcessing: boolean;
  lastProcessed: number;
  batchTimer: NodeJS.Timeout | null;
}

interface TokenMarketData {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  market_cap_rank?: number;
  current_price?: number;
  price_change_percentage_24h?: number;
  low_24h?: number;
  high_24h?: number;
  // Add other fields as needed based on actual API response and usage
}

interface CryptoContextType {
  prices: Record<string, Record<string, CryptoPriceData>>;
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
  tokenMetadata: Record<string, any>;
  defaultCryptoIds: { [key: string]: string }; // This prop can remain as it's used for initial state
  checkAndUpdateMissingIcons: () => Promise<number>;
  setTokenMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  isApiRateLimited: (apiName: 'coingecko' | 'cryptocompare') => boolean; // Signature remains, implementation changes
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Record<string, Record<string, CryptoPriceData>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [availableCryptos, setAvailableCryptos] = useState<string[]>(() => {
    // localStorage for custom tokens is not general caching, so it remains for now
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_TOKENS);
    if (stored) {
      const storedIds = JSON.parse(stored);
      const defaultTokens = Object.keys(DEFAULT_CRYPTO_IDS); // Updated variable name
      const customTokens = Object.keys(storedIds).filter(token => !defaultTokens.includes(token));
      return [...defaultTokens, ...customTokens.sort()];
    }
    return Object.keys(DEFAULT_CRYPTO_IDS); // Updated variable name
  });
  const [cryptoIds, setCryptoIds] = useState<{ [key: string]: string }>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_TOKENS);
    return stored ? { ...DEFAULT_CRYPTO_IDS, ...JSON.parse(stored) } : DEFAULT_CRYPTO_IDS;
  });

  const { rates: exchangeRates } = useExchangeRates();

  const cache = useRef<Record<string, Record<string, CryptoPriceData>> | null>(null);
  const lastApiCall = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);
  const requestQueue = useRef<RequestQueue>({
    pendingSymbols: new Set(),
    isProcessing: false,
    lastProcessed: 0,
    batchTimer: null
  });
  
  const pendingPriceUpdates = useRef<Set<string>>(new Set());

  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  const metadataRequestCount = useRef<number>(0);

  const tokenIconCache = useRef<Record<string, string>>({});

  const getCachedPrices = useCallback((): Record<string, Record<string, CryptoPriceData>> | null => {
    const cachedResult = getCachedData<Record<string, Record<string, CryptoPriceData>>>(CACHE_STORAGE_KEY_PRICES);
    if (cachedResult) {
      cache.current = cachedResult.data;
      // Set lastUpdated here from cache timestamp if needed, but setCachePrices also does it.
      // For initial load, this ensures lastUpdated reflects cache time.
      setLastUpdated(new Date(cachedResult.timestamp)); 
      return cachedResult.data;
    }
    return null;
  }, []);

  const setCachePrices = useCallback((newPricesToCache: Record<string, Record<string, CryptoPriceData>>) => {
    setCachedData(CACHE_STORAGE_KEY_PRICES, newPricesToCache, PRICE_CACHE_DURATION);
    cache.current = newPricesToCache;
    setLastUpdated(new Date()); // Set to current time as prices are freshly set/updated
  }, []);

  const clearUpdateTimeout = () => {
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
      updateTimeout.current = null;
    }
  };

  const isPending = useCallback((symbol: string) => {
    return pendingPriceUpdates.current.has(symbol);
  }, []);

  const getEstimatedPrice = useCallback((symbol: string): Record<string, CryptoPriceData> => {
    const usdRate = CONVERSION_RATES[symbol]?.usd || CONVERSION_RATES.USDC.usd;
    console.log(`💰 [CryptoContext] getEstimatedPrice for symbol: ${symbol}, Computed usdRate: ${usdRate}`); // Log
    
    // Use real exchange rates if available, otherwise fallback to the approximate values
    const ratioEUR = (exchangeRates?.EUR || 0.92);
    const ratioCAD = (exchangeRates?.CAD || 1.36);
    
    return {
      usd: { price: usdRate, change24h: null },
      eur: { price: usdRate * ratioEUR, change24h: null },
      cad: { price: usdRate * ratioCAD, change24h: null },
    };
  }, [exchangeRates]);

  const getCryptoId = useCallback((symbol: string): string | undefined => {
    return cryptoIds[symbol.toUpperCase()] || cryptoIds[symbol.toLowerCase()];
  }, [cryptoIds]);

  useEffect(() => {
    try {
      const cachedPriceResult = getCachedData<Record<string, Record<string, CryptoPriceData>>>(CACHE_STORAGE_KEY_PRICES);
      if (cachedPriceResult) {
        cache.current = cachedPriceResult.data;
        setPrices(cachedPriceResult.data);
        setLastUpdated(new Date(cachedPriceResult.timestamp)); // Correctly use timestamp from cache
      }
      
      const cachedMetadataResult = getCachedData<Record<string, any>>(CACHE_STORAGE_KEY_METADATA);
      if (cachedMetadataResult) {
        setTokenMetadata(cachedMetadataResult.data);
      } else {
        fetchTokenMetadata(); // This should then use setCachedData internally
      }
    } catch (error) {
      console.error('Error loading initial cache from service:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fetchTokenMetadata should be memoized if added to deps

  useEffect(() => {
    if (PRELOAD_POPULAR_TOKENS_ENABLED) {
      const timer = setTimeout(() => {
        const defaultTokenIds = Object.values(DEFAULT_CRYPTO_IDS);
        const missingDefaultTokens = defaultTokenIds.filter(id => 
          !tokenMetadata[id]
        );
        
        const popularTokenIds = POPULAR_TOKEN_IDS_TO_PRELOAD.filter(id =>
          !Object.values(cryptoIds).includes(id) && !defaultTokenIds.includes(id)
        );
        
        const tokensToFetch = [...missingDefaultTokens, ...popularTokenIds];
        
        if (tokensToFetch.length > 0) {
          fetchTokenMetadata(tokensToFetch);
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const cacheTokenIcon = useCallback((symbol: string, imageUrl: string) => {
    if (!symbol || !imageUrl) return;
    try {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${normalizedSymbol}`;
      localStorage.setItem(iconCacheKey, imageUrl);
      
      tokenIconCache.current[normalizedSymbol] = imageUrl;
      
      const id = getCryptoId(symbol);
      if (id) {
        const idIconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}id-${id.toLowerCase()}`;
        localStorage.setItem(idIconCacheKey, imageUrl);
        
        if (!tokenMetadata[id]?.image) {
          setTokenMetadata(prev => ({
            ...prev,
            [id]: {
              ...(prev[id] || {}),
              image: imageUrl,
              symbol: symbol.toUpperCase()
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error caching token icon:', error);
    }
  }, [getCryptoId, tokenMetadata]);

  const ensureAllIconsCached = useCallback(() => {
    const tokensToCheck = Object.keys(cryptoIds);
    tokensToCheck.forEach(symbol => {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${normalizedSymbol}`;
      const id = getCryptoId(symbol);
      
      if (id && tokenMetadata[id]?.image) {
        if (!localStorage.getItem(iconCacheKey)) {
          localStorage.setItem(iconCacheKey, tokenMetadata[id].image);
          tokenIconCache.current[normalizedSymbol] = tokenMetadata[id].image;
        }
      } else if (id) {
        const cachedIcon = localStorage.getItem(iconCacheKey);
        if (cachedIcon) {
          setTokenMetadata(prev => ({
            ...prev,
            [id]: {
              ...(prev[id] || {}),
              image: cachedIcon
            }
          }));
        }
      }
    });
  }, [cryptoIds, getCryptoId, tokenMetadata]);

  const checkAndUpdateMissingIcons = useCallback(async () => {
    const tokensToCheck = Object.keys(cryptoIds);
    const missingIconSymbols: string[] = [];
    tokensToCheck.forEach(symbol => {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${normalizedSymbol}`;
      const id = getCryptoId(symbol);
      
      // Check if we have the icon in metadata or cache
      const hasMetadataIcon = id ? tokenMetadata[id]?.image : undefined;
      const hasCachedIcon = localStorage.getItem(iconCacheKey) || tokenIconCache.current[normalizedSymbol];
      
      if (!hasMetadataIcon && !hasCachedIcon) {
        missingIconSymbols.push(symbol);
      } else if (!hasMetadataIcon && hasCachedIcon) {
        // If we have a cached icon but no metadata, update the metadata
        if (id) {
          setTokenMetadata(prev => ({
            ...prev,
            [id]: {
              ...(prev[id] || {}),
              image: hasCachedIcon,
              symbol: symbol.toUpperCase(),
              name: prev[id]?.name || symbol.toUpperCase()
            }
          }));
        }
      }
    });
    
    // Log missing icons for debugging
    if (missingIconSymbols.length > 0) {
      console.log(`Found ${missingIconSymbols.length} tokens with missing icons: ${missingIconSymbols.join(', ')}`);
    }
    
    // If we have missing icons, fetch them
    if (missingIconSymbols.length > 0) {
      console.log(`Fetching missing icons for ${missingIconSymbols.length} tokens`);
      
      // Try to fetch using the search API first for better results
      try {
        for (const symbol of missingIconSymbols) {
          // Skip if we're rate limited
          if (isCoinGeckoApiRateLimited()) { // Updated to use service's rate limit check
            break;
          }
          
          // Use search API to get better matches
          const searchResponse = await searchCoinGecko(symbol); // Use service function
          
          if (searchResponse && searchResponse.coins && searchResponse.coins.length > 0) {
            // Find the best match
            const exactMatch = searchResponse.coins.find(
              (coin: any) => coin.symbol.toLowerCase() === symbol.toLowerCase()
            );
            
            const bestMatch = exactMatch || searchResponse.coins[0];
            
            if (bestMatch && bestMatch.large) {
              // Cache the icon
              cacheTokenIcon(symbol, bestMatch.large);
              
              // Update metadata
              const id = getCryptoId(symbol);
              if (id) {
                setTokenMetadata(prev => ({
                  ...prev,
                  [id]: {
                    ...(prev[id] || {}),
                    image: bestMatch.large,
                    symbol: symbol.toUpperCase(),
                    name: bestMatch.name || prev[id]?.name || symbol.toUpperCase()
                  }
                }));
              }
              
              // Remove from missing list
              const index = missingIconSymbols.indexOf(cryptoIds[symbol]);
              if (index > -1) {
                missingIconSymbols.splice(index, 1);
              }
            }
          }
          
          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.warn('Error using search API for icons, falling back to regular fetch:', error);
        // Continue with regular fetch for remaining tokens
      }
      
      // For any remaining tokens, use the regular fetch method
      if (missingIconSymbols.length > 0) {
        await fetchTokenMetadata(missingIconSymbols);
      }
    }
    
    return missingIconSymbols.length;
  }, [cryptoIds, getCryptoId, tokenMetadata, cacheTokenIcon]);

  // Enhanced token metadata fetching with smart fallback handling
  const fetchTokenMetadata = useCallback(async (specificTokens?: string[]) => {
    try {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
        return;
      }
      
      // Check which tokens actually need fetching
      const tokensToFetch = specificTokens || 
        Object.values(cryptoIds).filter(id => !tokenMetadata[id]);
      
      if (tokensToFetch.length === 0) return;
      
      // Check if we have any tokens in the metadata cache already
      const cachedMetadata = { ...tokenMetadata };
      const remainingTokens = tokensToFetch.filter(id => !cachedMetadata[id]);
      
      if (remainingTokens.length === 0) {
        // All tokens are already cached
        return;
      }
      
      // Prioritize tokens - default tokens first, then popular tokens, then others
      const prioritizedTokens = remainingTokens.sort((a, b) => {
        const aIsDefault = Object.values(DEFAULT_CRYPTO_IDS).includes(a); // Updated variable name
        const bIsDefault = Object.values(DEFAULT_CRYPTO_IDS).includes(b); // Updated variable name
        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        
        const aIsPopular = POPULAR_TOKEN_IDS_TO_PRELOAD.includes(a); // Updated variable name
        const bIsPopular = POPULAR_TOKEN_IDS_TO_PRELOAD.includes(b); // Updated variable name
        if (aIsPopular && !bIsPopular) return -1;
        if (!aIsPopular && bIsPopular) return 1;
        return 0;
      });
      
      // Split into smaller chunks to avoid overwhelming the API
      const chunks: string[][] = [];
      for (let i = 0; i < prioritizedTokens.length; i += API_CONFIG.COINGECKO.BATCH_SIZE) { // Updated variable name
        chunks.push(prioritizedTokens.slice(i, i + API_CONFIG.COINGECKO.BATCH_SIZE)); // Updated variable name
      }
      
      // Process chunks sequentially with smart retries
      const newMetadata = { ...cachedMetadata };
      
      // Process the first chunk immediately
      if (chunks.length > 0) {
        const firstChunk = chunks[0];
        try {
          // Increment the metadata request counter
          metadataRequestCount.current += 1;
          
          // const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, { params for fetchCoinMarkets });
          const responseData = await fetchCoinMarkets(firstChunk); // Use service function
          
          if (responseData && Array.isArray(responseData)) {
            responseData.forEach((token: any) => {
              newMetadata[token.id] = {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                image: token.image,
                rank: token.market_cap_rank
              };
              
              // Cache the icon URL in localStorage to prevent future requests
              if (token.image) {
                cacheTokenIcon(token.symbol, token.image);
              }
            });
          }
          
          // Update state with the first batch immediately
          setTokenMetadata(newMetadata);
          
          // Save to cache using the service
          setCachedData(CACHE_STORAGE_KEY_METADATA, newMetadata, METADATA_CACHE_DURATION);
          
          // Process remaining chunks with intelligent spacing
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * 12); // TODO: Review if this specific timing logic moves to service or hook
          }
        } catch (error) {
          // Increment consecutive errors (service might handle its own, this could be for UI feedback)
          // apiStatus.current.consecutiveErrors++; // If service handles, this might not be needed here
          console.error('Error fetching initial metadata chunk:', error); // Log error

          // Process remaining chunks with an intelligent backoff
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * 15); // Longer delay after error
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchTokenMetadata:', error);
    }
  }, [cryptoIds, tokenMetadata, cacheTokenIcon]); // Keep cacheTokenIcon dependency
  
  // Enhanced function to process remaining metadata chunks with intelligent spacing
  const processRemainingMetadataChunks = async (
    chunks: string[][],
    existingMetadata: Record<string, any>
  ) => {
    const newMetadata = { ...existingMetadata };
    
    for (let i = 0; i < chunks.length; i++) {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
        break;
      }
      
      const chunk = chunks[i];
      try {
        if (i > 0) {
          // Use a fixed delay from constants for retries between chunks after an error
          await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY)); 
        }
        
        metadataRequestCount.current += 1;
        const responseData = await fetchCoinMarkets(chunk) as TokenMarketData[];
        
        if (responseData && Array.isArray(responseData)) {
          responseData.forEach((token: any) => {
            newMetadata[token.id] = {
              symbol: token.symbol.toUpperCase(),
              name: token.name,
              image: token.image,
              rank: token.market_cap_rank
            };
            
            // Cache the icon URL in localStorage
            if (token.image) {
              cacheTokenIcon(token.symbol, token.image);
            }
          });
          
          // Update state with each batch
          setTokenMetadata({ ...newMetadata });
          
          // Save to cache after each successful batch using the service
          setCachedData(CACHE_STORAGE_KEY_METADATA, newMetadata, METADATA_CACHE_DURATION);
          
          // Reset consecutive errors on success (service handles its own)
          // apiStatus.current.consecutiveErrors = 0; // Service handles its own
        }
      } catch (error) {
        // Track consecutive errors for exponential backoff (service handles its own, this is for UI/batch retry)
        // apiStatus.current.consecutiveErrors++; 
        console.error(`Error processing metadata chunk ${chunk.join(',')}:`, error); // Log error

        const errorBackoff = Math.min(10000 * (API_RETRY_DELAY || 1) , 30000); // Use API_RETRY_DELAY
        // This retry logic might need to be part of the hook later
        await new Promise(resolve => setTimeout(resolve, errorBackoff));
      }
    }
  };

  // Smart retry function that tries different API providers
  // const fetchWithSmartRetry = async (url: string, config: any): Promise<any> => { ... MOVED TO SERVICE ... };

  // Updated error handling with smart fallback system to remove unused apiName parameter
  const handleApiError = useCallback((err: any) => {
    let retryDelay = API_RETRY_DELAY;
    
    if (axios.isAxiosError(err)) {
      // Silently handle rate limit errors without showing to user
      if (err.response?.status === 429) {
        retryDelay = MIN_API_INTERVAL * 2; 
        // apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length; // Service handles this
      } else if (err.code === 'ECONNABORTED') {
        retryDelay = API_RETRY_DELAY;
        // apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length; // Service handles this
      }
    }

    // Use memoized getCachedPrices
    const cached = getCachedPrices();
    if (cached) {
      setPrices(cached);
    }

    return retryDelay;
  }, [getCachedPrices]);

  // Enhanced batch processing with smart API selection
  const processBatchRequests = useCallback(async () => {
    if (requestQueue.current.isProcessing || requestQueue.current.pendingSymbols.size === 0) {
      return;
    }
    console.log(`⚙️ [CryptoContext] Starting processBatchRequests - Batch Size: ${requestQueue.current.pendingSymbols.size}`);

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
      const symbolsToProcess = allPendingSymbols.slice(0, PRICE_UPDATE_MAX_BATCH_SIZE); // Updated variable name
      
      // Remove processed symbols from the queue
      symbolsToProcess.forEach(symbol => requestQueue.current.pendingSymbols.delete(symbol));
      
      // Add symbols to pending updates set
      symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.add(symbol));
      
      const relevantIds = symbolsToProcess
        .map(symbol => getCryptoId(symbol))
        .filter((id): id is string => Boolean(id)); // Explicit type guard

      if (relevantIds.length === 0) {
        symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.delete(symbol));
        requestQueue.current.isProcessing = false; // Ensure processing flag is reset
        setLoading(false); // Ensure loading state is reset
        return;
      }

      let priceData: Record<string, any> = {};
      let requestSuccessful = false;

      // ** ALWAYS try /coins/markets first to get low/high data **
      try {
        // const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, { params for fetchCoinMarkets });
        const apiMarketCallLabel = `API_fetchCoinMarkets_BATCH_[${relevantIds.length > 3 ? relevantIds.slice(0,2).join(',')+',...,'+relevantIds.slice(-1) : relevantIds.join(',')}]`;
        console.time(apiMarketCallLabel); // Log Start
        const marketApiStartTime = performance.now(); // Capture start time
        console.log(`📞 [API] Calling: ${apiMarketCallLabel}`); // Log API call attempt
        const marketsDataResponse = await fetchCoinMarkets(relevantIds); // Use service function
        const marketApiEndTime = performance.now(); // Capture end time
        console.timeEnd(apiMarketCallLabel); // Log End (ms)
        console.log(`⏱️ ${apiMarketCallLabel} (in seconds): ${( (marketApiEndTime - marketApiStartTime) / 1000).toFixed(3)} s`); // Log (s)
        
        if (marketsDataResponse && Array.isArray(marketsDataResponse)) {
          const marketsDataMap: Record<string, any> = {};
          marketsDataResponse.forEach((coin: any) => {
            marketsDataMap[coin.id] = coin;
          });
          priceData = marketsDataMap;
        }

        lastApiCall.current = Date.now(); // Still useful for UI-level timing if needed
        requestSuccessful = true;
      } catch (marketsError) {
        console.warn('Failed to fetch from /coins/markets, falling back to /simple/price:', marketsError);
        // apiStatus.current.consecutiveErrors++; // Service handles its own error counting

        // ** Fallback to /simple/price ONLY if /coins/markets fails **
        try {
          // const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, { params for fetchSimplePrice });
          const apiSimpleCallLabel = `API_fetchSimplePrice_BATCH_[${relevantIds.length > 3 ? relevantIds.slice(0,2).join(',')+',...,'+relevantIds.slice(-1) : relevantIds.join(',')}]`;
          console.time(apiSimpleCallLabel); // Log Start
          const simpleApiStartTime = performance.now(); // Capture start time
          console.log(`📞 [API] Calling (Fallback): ${apiSimpleCallLabel}`); // Log API call attempt
          const simplePriceData = await fetchSimplePrice(relevantIds);
          const simpleApiEndTime = performance.now(); // Capture end time
          console.timeEnd(apiSimpleCallLabel); // Log End (ms)
          console.log(`⏱️ ${apiSimpleCallLabel} (in seconds): ${((simpleApiEndTime - simpleApiStartTime) / 1000).toFixed(3)} s`); // Log (s)
          priceData = simplePriceData;
          lastApiCall.current = Date.now();
          requestSuccessful = true;
        } catch (simplePriceError) {
          console.error('Fallback to /simple/price also failed:', simplePriceError);
          // apiStatus.current.consecutiveErrors++; // Service handles its own error counting
        }
      }

      // Update prices with merged data
      const existingPrices = getCachedPrices() || {};
      const newPrices = { ...existingPrices };

      symbolsToProcess.forEach(symbol => {
        const id = getCryptoId(symbol);
        const tokenPriceData = id ? priceData[id] : undefined;

        if (id && tokenPriceData) {
          if ('current_price' in tokenPriceData) {
            // Process data from /coins/markets
            const usdPrice = tokenPriceData.current_price;
            const usdChange = tokenPriceData.price_change_percentage_24h ?? null;
            const usdLow = tokenPriceData.low_24h ?? null;
            const usdHigh = tokenPriceData.high_24h ?? null;
            
            // Use dynamic exchange rates instead of hardcoded values
            const ratioEUR = exchangeRates?.EUR || 0.92;
            const ratioCAD = exchangeRates?.CAD || 1.36;
            
            newPrices[symbol] = {
              usd: {
                price: usdPrice,
                change24h: usdChange,
                low24h: usdLow,
                high24h: usdHigh
              },
              eur: {
                price: usdPrice * ratioEUR,
                change24h: usdChange,
                low24h: usdLow ? usdLow * ratioEUR : null,
                high24h: usdHigh ? usdHigh * ratioEUR : null
              },
              cad: {
                price: usdPrice * ratioCAD,
                change24h: usdChange,
                low24h: usdLow ? usdLow * ratioCAD : null,
                high24h: usdHigh ? usdHigh * ratioCAD : null
              }
            };
          } else {
            // Process data from /simple/price (Fallback)
            const usdPrice = tokenPriceData.usd;
            const usdChange = tokenPriceData.usd_24h_change ?? null;
            const eurPrice = tokenPriceData.eur;
            const eurChange = tokenPriceData.eur_24h_change ?? null;
            const cadPrice = tokenPriceData.cad;
            const cadChange = tokenPriceData.cad_24h_change ?? null;
            
            // For price update from simple/price, preserve existing low/high if available
            const existingUsdData = existingPrices[symbol]?.usd;
            const existingEurData = existingPrices[symbol]?.eur;
            const existingCadData = existingPrices[symbol]?.cad;
            
            newPrices[symbol] = {
              usd: {
                price: usdPrice,
                change24h: usdChange,
                low24h: existingUsdData?.low24h ?? null, // Keep existing low/high
                high24h: existingUsdData?.high24h ?? null // Keep existing low/high
              },
              eur: {
                price: eurPrice,
                change24h: eurChange,
                low24h: existingEurData?.low24h ?? null, // Keep existing low/high
                high24h: existingEurData?.high24h ?? null // Keep existing low/high
              },
              cad: {
                price: cadPrice,
                change24h: cadChange,
                low24h: existingCadData?.low24h ?? null, // Keep existing low/high
                high24h: existingCadData?.high24h ?? null // Keep existing low/high
              }
            };
          }
        } else if (!requestSuccessful) {
          // Use estimated prices ONLY if ALL requests failed
          newPrices[symbol] = getEstimatedPrice(symbol);
          console.warn(`⚠️ [CryptoContext] processBatchRequests: Using estimated price for ${symbol} after all API attempts failed for this batch.`);
        } else {
          // This case means the specific symbol might not have been in the successful API response, 
          // or had no price data. Keep existing or let it remain as is (potentially showing wave if still pending elsewhere).
          console.warn(`⚠️ [CryptoContext] processBatchRequests: No price data returned for ${symbol} in this batch, even if API call was partially successful.`);
        }
        // ALWAYS remove from pending updates after processing, regardless of success for this specific symbol in this batch
        pendingPriceUpdates.current.delete(symbol);
      });

      setPrices(newPrices);
      setCachePrices(newPrices); // This now uses the service via setCachePrices
      setLastUpdated(new Date());

      // Reset error indicators on success
      if (requestSuccessful) {
        setError(null);
        retryCount.current = 0; // UI-level retry count
        // apiStatus.current.consecutiveErrors = 0; // Service handles its own
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

    } catch (err) { // Catch errors that might occur outside the API calls themselves
      console.error("Error during batch processing:", err);
      // Intelligent retry with exponential backoff
      // const errorMultiplier = Math.min(apiStatus.current.consecutiveErrors + 1, 5); // Service manages its errors
      // const retryDelay = MIN_API_INTERVAL * errorMultiplier;

      // apiStatus.current.consecutiveErrors++; // Service manages its errors

      if (retryCount.current <= MAX_API_RETRIES) { // Still use MAX_API_RETRIES for UI batch retry
        retryCount.current++;
        updateTimeout.current = setTimeout(() => {
          requestQueue.current.isProcessing = false;
          processBatchRequests(); // Retry the whole batch process
        }, API_RETRY_DELAY);
      } else {
        setError('Failed to update prices after multiple retries.');
        // Max retries reached, clear queue and reset
        const failedSymbols = Array.from(requestQueue.current.pendingSymbols);
        failedSymbols.forEach(symbol => pendingPriceUpdates.current.delete(symbol)); // Ensure all pending are cleared on total failure
        requestQueue.current.pendingSymbols.clear(); // Clear the queue
        requestQueue.current.isProcessing = false;
        retryCount.current = 0;
        // Update state with cached prices as a fallback
        const cachedPrices = getCachedPrices();
        if(cachedPrices) setPrices(cachedPrices);
      }
    } finally {
      // Always ensure loading is set to false and processing flag is reset,
      // unless a retry is scheduled.
      if (!updateTimeout.current) {
          requestQueue.current.isProcessing = false;
          setLoading(false);
      }
      requestQueue.current.lastProcessed = Date.now();
      console.log(`⚙️ [CryptoContext] Finished processBatchRequests`);
    }
  }, [getCryptoId, getEstimatedPrice, getCachedPrices, setCachePrices, handleApiError, exchangeRates]); // Added missing dependencies

  // Enhanced queuePriceUpdate with priority handling
  const queuePriceUpdate = useCallback((symbols: string[], highPriority: boolean = false) => {
    if (!symbols.length) return;
    
    clearUpdateTimeout();
    
    // Add symbols to the queue
    symbols.forEach(symbol => requestQueue.current.pendingSymbols.add(symbol));
    
    // Clear existing batch timer
    if (requestQueue.current.batchTimer) {
      clearTimeout(requestQueue.current.batchTimer);
    }
    
    // Start a new batch window - shorter for high priority updates
    const batchDelay = highPriority ? 100 : PRICE_UPDATE_BATCH_WINDOW; // Updated variable name
    requestQueue.current.batchTimer = setTimeout(() => {
      if (!requestQueue.current.isProcessing) {
        processBatchRequests();
      }
    }, batchDelay);
    
  }, [processBatchRequests]);

  // Modified updatePrices to use the queue system with proper debouncing
  const updatePrices = useCallback(async (force: boolean = false) => {
    clearUpdateTimeout();
    
    const now = Date.now();

    if (!force) {
      const cachedResult = getCachedData<Record<string, Record<string, CryptoPriceData>>>(CACHE_STORAGE_KEY_PRICES);
      if (cachedResult) {
        setPrices(cachedResult.data);
        setLastUpdated(new Date(cachedResult.timestamp)); // Use timestamp from fresh cache read
        setLoading(false);
        return;
      }
    }

    // Queue all tokens for update
    queuePriceUpdate(Object.keys(cryptoIds));
  }, [cryptoIds, queuePriceUpdate]);

  // Modified addCrypto to use the queue system with immediate updates and no loading indicators
  const addCrypto = useCallback(async (symbol: string, id?: string) => {
    if (!id) {
      console.warn(`⚠️ No CoinGecko ID provided for symbol ${symbol}`);
      return;
    }

    const upperSymbol = symbol.toUpperCase();
    const lowerId = id.toLowerCase();

    // Check if token already exists
    if (cryptoIds[upperSymbol] === lowerId) {
      return; // Token already exists with same ID
    }

    // Update state with the new token immediately - do not show as pending
    setCryptoIds(prev => {
      const newIds = { ...prev, [upperSymbol]: lowerId };
      // Save to localStorage, but preserve default tokens
      const storageIds = { ...newIds };
      Object.keys(DEFAULT_CRYPTO_IDS).forEach(key => { // Updated variable name
        delete storageIds[key];
      });
      localStorage.setItem(STORAGE_KEY_CUSTOM_TOKENS, JSON.stringify(storageIds)); // Updated variable name
      return newIds;
    });

    setAvailableCryptos(prev => {
      if (!prev.includes(upperSymbol)) {
        const defaultTokens = Object.keys(DEFAULT_CRYPTO_IDS); // Updated variable name
        const customTokens = prev.filter(token => !defaultTokens.includes(token));
        const newCustomTokens = [...customTokens, upperSymbol].sort();
        return [...defaultTokens, ...newCustomTokens];
      }
      return prev;
    });

    // Add placeholder price immediately with more realistic value
    setPrices(prev => {
      // Create a more realistic price estimate based on token symbol patterns
      const estimatedPriceData = getEstimatedPrice(upperSymbol);
      console.log(`➕ [CryptoContext] addCrypto: Setting estimated/placeholder price for ${upperSymbol}`, estimatedPriceData); // Log
      return {
        ...prev,
        [upperSymbol]: estimatedPriceData
      };
    });

    // Dispatch an event to notify UI components of the new token
    window.dispatchEvent(new CustomEvent('cryptoTokensUpdated', {
      detail: { 
        action: 'add',
        tokens: [upperSymbol],
        immediate: true // Flag to indicate instant update
      }
    }));

    // Immediately fetch price data without debouncing
    try {
      // Make direct API call for this token immediately to get real price
      // const response = await axios.get(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, { params for fetchSimplePrice });
      const simplePriceData = await fetchSimplePrice([lowerId]);
      
      if (simplePriceData && simplePriceData[lowerId]) {
        const data = simplePriceData[lowerId];
        // Update prices with actual API data
        setPrices(prev => ({
          ...prev,
          [upperSymbol]: {
            usd: { price: data.usd, change24h: data.usd_24h_change ?? null },
            eur: { price: data.eur, change24h: data.eur_24h_change ?? null },
            cad: { price: data.cad, change24h: data.cad_24h_change ?? null },
          }
        }));
        
        // Update cache with new data via service
        const currentPriceCache = getCachedPrices() || {};
        if (!currentPriceCache[upperSymbol]) currentPriceCache[upperSymbol] = {};
        currentPriceCache[upperSymbol].usd = { price: data.usd, change24h: data.usd_24h_change ?? null, low24h: null, high24h: null }; // Add low/high with null for simple
        currentPriceCache[upperSymbol].eur = { price: data.eur, change24h: data.eur_24h_change ?? null, low24h: null, high24h: null };
        currentPriceCache[upperSymbol].cad = { price: data.cad, change24h: data.cad_24h_change ?? null, low24h: null, high24h: null };
        setCachePrices(currentPriceCache); // Uses service
      }
    } catch (error) {
      console.warn('Error fetching immediate price for new token:', error);
      // Still queue regular update as backup
      queuePriceUpdate([upperSymbol], true);
    }
    
    // Start fetching metadata in the background immediately
    fetchTokenMetadata([lowerId]).then(() => {
      // Dispatch event after metadata is updated
      window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));
    });

    // *** Also trigger a price update specifically for the new token ***
    queuePriceUpdate([upperSymbol], true); // Ensure price (including % change) is fetched
  }, [cryptoIds, queuePriceUpdate, fetchTokenMetadata, getCachedPrices, setCachePrices, getEstimatedPrice, exchangeRates]);

  // Enhanced function to fetch metadata in controlled batches with delays
  const fetchMetadataInBatches = async (tokenIds: string[]) => {
    const BATCH_FETCH_SIZE = 10; // Fetch metadata for 10 tokens at a time
    const DELAY_BETWEEN_BATCHES = API_CONFIG.COINGECKO.REQUEST_SPACING * 3; // Use 3x spacing between batches

    for (let i = 0; i < tokenIds.length; i += BATCH_FETCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_FETCH_SIZE);
      if (batch.length > 0) {
        try {
          await fetchTokenMetadata(batch);
          // Dispatch update after each successful batch
          window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));
        } catch (error) {
          console.error(`Error fetching metadata batch: ${batch.join(',')}`, error);
          // Decide if we should retry or skip this batch - for now, we continue
        }

        // Add delay before fetching the next batch, unless it's the last one
        if (i + BATCH_FETCH_SIZE < tokenIds.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
    }
  };

  // Enhanced addCryptos with instantaneous updates and no loading indicators
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    if (!tokens.length) return;
    
    const newCryptoIds = { ...cryptoIds };
    const newSymbols: string[] = [];
    const storageIds = { ...cryptoIds };
    const newPrices = { ...prices };
    const highPrioritySymbols: string[] = [];
    const newTokenIds: string[] = [];
    
    const tokenUpdateEvent = new CustomEvent('cryptoTokensUpdated', {
      detail: {
        action: 'add',
        tokens: tokens.map(t => t.symbol.toUpperCase())
      }
    });

    Object.keys(DEFAULT_CRYPTO_IDS).forEach(key => { // Updated variable name
      delete storageIds[key];
    });

    tokens.forEach(({ symbol, id }) => {
      const upperSymbol = symbol.toUpperCase();
      const lowerId = id.toLowerCase();
      
      if (newCryptoIds[upperSymbol] !== lowerId) {
        newCryptoIds[upperSymbol] = lowerId;
        storageIds[upperSymbol] = lowerId;
        newSymbols.push(upperSymbol);
        newTokenIds.push(lowerId);
        pendingPriceUpdates.current.add(upperSymbol);
        if (!newPrices[upperSymbol]) {
          newPrices[upperSymbol] = getEstimatedPrice(upperSymbol);
          console.log(`➕ [CryptoContext] addCryptos: Setting estimated/placeholder price for ${upperSymbol}`, newPrices[upperSymbol]); // Log
        }
        highPrioritySymbols.push(upperSymbol);
        const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${upperSymbol.toLowerCase()}`; // Updated variable name
        if (!localStorage.getItem(iconCacheKey)) {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#8b5cf6';
            ctx.beginPath();
            ctx.arc(16, 16, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(upperSymbol.charAt(0).toUpperCase(), 16, 16);
            const dataUrl = canvas.toDataURL('image/png');
            localStorage.setItem(iconCacheKey, dataUrl);
          }
        }
      }
    });
    
    if (newSymbols.length === 0) return;
    
    setCryptoIds(newCryptoIds);
    
    setAvailableCryptos(prev => {
      const defaultTokens = Object.keys(DEFAULT_CRYPTO_IDS); // Updated variable name
      const existingCustomTokens = prev.filter(token =>
        !defaultTokens.includes(token) && !newSymbols.includes(token)
      );
      const allCustomTokens = [...existingCustomTokens, ...newSymbols].sort();
      return [...defaultTokens, ...allCustomTokens];
    });
    
    setPrices(newPrices);
    localStorage.setItem(STORAGE_KEY_CUSTOM_TOKENS, JSON.stringify(storageIds)); // Updated variable name

    // Immediately dispatch the event to update UI components
    window.dispatchEvent(tokenUpdateEvent);

    // Queue immediate price update with high priority
    queuePriceUpdate(highPrioritySymbols, true);

    // Start fetching metadata immediately in the background, in controlled batches
    fetchMetadataInBatches(newTokenIds);
  }, [cryptoIds, prices, queuePriceUpdate, fetchTokenMetadata, tokenMetadata, getEstimatedPrice, exchangeRates]);

  const deleteCrypto = useCallback((symbol: string) => {
    // Don't allow deletion of default tokens
    if (Object.keys(DEFAULT_CRYPTO_IDS).includes(symbol)) { // Updated variable name
      return;
    }

    // Remove from pending updates if present
    pendingPriceUpdates.current.delete(symbol);

    setCryptoIds(prev => {
      const newCryptoIds = { ...prev };
      delete newCryptoIds[symbol];
      
      // Save only custom tokens to localStorage
      const storageIds = { ...newCryptoIds };
      Object.keys(DEFAULT_CRYPTO_IDS).forEach(key => { // Updated variable name
        delete storageIds[key];
      });
      localStorage.setItem(STORAGE_KEY_CUSTOM_TOKENS, JSON.stringify(storageIds)); // Updated variable name
      
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

  // Main interval useEffect: Depends on updatePrices
  useEffect(() => {
    // Initial fetch
    updatePrices(true);

    // Set up interval
    const interval = setInterval(() => {
      // Use updatePrices(false) which now contains the cache-check logic
      updatePrices(false);
    }, PRICE_CACHE_DURATION / 2); // Check cache more frequently (e.g., every 5 mins)

    return () => {
      clearInterval(interval);
      clearUpdateTimeout();
      if (requestQueue.current.batchTimer) {
        clearTimeout(requestQueue.current.batchTimer);
      }
    };
  }, [updatePrices]);

  // Preload default token icons
  const preloadDefaultTokenIcons = useCallback(async () => {
    // Only preload if we don't have the icons cached already
    const defaultTokens = Object.keys(DEFAULT_CRYPTO_IDS); // Updated variable name
    const defaultTokenIds = Object.values(DEFAULT_CRYPTO_IDS); // Updated variable name
    
    // Check which default tokens need icon preloading
    const tokensNeedingIcons = defaultTokens.filter(symbol => {
      const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${symbol.toLowerCase()}`; // Updated variable name
      return !localStorage.getItem(iconCacheKey);
    });
    
    if (tokensNeedingIcons.length === 0) {
      return; // All icons are already cached
    }
    
    // Fetch metadata for default tokens
    try {
      // const response = await axios.get(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, { params for fetchCoinMarkets });
      const responseData = await fetchCoinMarkets(defaultTokenIds);
      
      if (responseData && Array.isArray(responseData)) {
        const newMetadata = { ...tokenMetadata };
        
        responseData.forEach(token => {
          newMetadata[token.id] = {
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            image: token.image,
            rank: token.market_cap_rank
          };
          
          // Cache the icon URL in localStorage
          if (token.image) {
            cacheTokenIcon(token.symbol, token.image);
          }
        });
        
        // Update state with new metadata
        setTokenMetadata(newMetadata);
        
        // Save to cache using the service
        setCachedData(CACHE_STORAGE_KEY_METADATA, newMetadata, METADATA_CACHE_DURATION);
      }
    } catch (error) {
      console.error('Error preloading default token icons:', error);
    }
  }, [tokenMetadata]);

  // Call preloadDefaultTokenIcons on app startup
  useEffect(() => {
    preloadDefaultTokenIcons();
  }, [preloadDefaultTokenIcons]);

  // Set up periodic checks for missing icons
  useEffect(() => {
    // Initial check for missing icons
    const initialCheck = async () => {
      // Wait a bit after initial load to avoid overwhelming the app startup
      await new Promise(resolve => setTimeout(resolve, 5000));
      await checkAndUpdateMissingIcons();
    };
    
    initialCheck();
    
    // Set up periodic checks (every 30 minutes)
    const iconCheckInterval = setInterval(async () => {
      await checkAndUpdateMissingIcons();
    }, 30 * 60 * 1000);
    
    return () => {
      clearInterval(iconCheckInterval);
    };
  }, []);

  // Initial setup useEffect
  useEffect(() => {
    // Initial setup
    getCachedPrices();
    
    // Clean up
    return () => {
      clearUpdateTimeout();
    };
  }, []);

  // Set up event listener for beforeunload to ensure all icons are cached
  useEffect(() => {
    const handleBeforeUnload = () => {
      ensureAllIconsCached();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Function to check if a specific API is currently rate-limited
  const isApiRateLimited = useCallback((apiName: 'coingecko' | 'cryptocompare'): boolean => {
    if (apiName === 'coingecko') {
      return isCoinGeckoApiRateLimited(); // Use service function
    }
    // Add similar logic for cryptocompare if needed, or if it gets its own service
    if (apiName === 'cryptocompare') {
      // Placeholder: CryptoCompare rate limiting logic would go here if it had its own service
      // For now, assume it's not rate limited or managed by its own context/service
      return false;
    }
    return false;
  }, []);

  return (
    <CryptoContext.Provider
      value={{
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
        isPending,
        tokenMetadata,
        defaultCryptoIds: DEFAULT_CRYPTO_IDS, // Pass the imported constant
        checkAndUpdateMissingIcons,
        setTokenMetadata,
        isApiRateLimited
      }}
    >
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
