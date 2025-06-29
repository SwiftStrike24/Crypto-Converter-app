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
  CACHE_STORAGE_KEY_COIN_DETAILS,
  METADATA_CACHE_DURATION,
  COIN_DETAILS_CACHE_DURATION,
  ICON_CACHE_STORAGE_PREFIX,
  MAX_METADATA_REQUESTS_PER_SESSION_LIMIT,
  POPULAR_TOKEN_IDS_TO_PRELOAD,
  API_CONFIG,
  MAX_API_RETRIES,
  COINGECKO_RATE_LIMIT_COOLDOWN,
  RECENT_DATA_THRESHOLD,
} from '../constants/cryptoConstants';
import {
  fetchCoinMarkets,
  fetchSimplePrice,
  fetchCoinDetails,
  searchCoinGecko,
  isCoinGeckoApiRateLimited,
  getCoinGeckoRetryAfterSeconds,
  RequestPriority,
  getApiPerformanceMetrics,
  getPublicApiStatus,
} from '../services/crypto/cryptoApiService'; // Corrected path
import {
  getCachedData,
  setCachedData,
} from '../services/crypto/cryptoCacheService'; // Corrected path
import { CoinDetailedMetadata } from '../utils/stablecoinDetection';

interface CryptoPriceData {
  price: number | null; // Allow price to be null for estimated/pending states
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
  isCoinGeckoRateLimitedGlobal: boolean; // Add global rate limit state to the context
  isUsingApiFallback: boolean; // NEW: Expose the fallback status
  getCoinGeckoRetryAfterSeconds: () => number; // Add retry countdown helper
  getApiMetrics: () => any; // Add API performance metrics
  getCoinDetails: (coinId: string) => Promise<CoinDetailedMetadata | null>; // Add detailed coin metadata fetching
  coinDetailsCache: Record<string, CoinDetailedMetadata>; // Add cache for detailed coin metadata
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
  // Add the global rate limit state
  const [isCoinGeckoRateLimitedGlobal, setIsCoinGeckoRateLimitedGlobal] = useState<boolean>(false);
  const [isUsingApiFallback, setIsUsingApiFallback] = useState<boolean>(false); // NEW: State for fallback status

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
  const [coinDetailsCache, setCoinDetailsCache] = useState<Record<string, CoinDetailedMetadata>>({});

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
    const knownSymbol = symbol.toUpperCase(); // Ensure consistent casing for lookup
    const usdRateEntry = CONVERSION_RATES[knownSymbol];
    const usdRate = usdRateEntry ? usdRateEntry.usd : null; // Get rate or null if not found
    
    console.log(`💰 [CryptoContext] getEstimatedPrice for symbol: ${symbol}, Found in CONVERSION_RATES: ${!!usdRateEntry}, Computed usdRate: ${usdRate}`); // Log
    
    // Use real exchange rates if available, otherwise fallback to the approximate values
    const ratioEUR = (exchangeRates?.EUR || 0.92);
    const ratioCAD = (exchangeRates?.CAD || 1.36);
    
    return {
      usd: { price: usdRate, change24h: null, low24h: null, high24h: null }, // price will be null if usdRate is null
      eur: { price: usdRate ? usdRate * ratioEUR : null, change24h: null, low24h: null, high24h: null },
      cad: { price: usdRate ? usdRate * ratioCAD : null, change24h: null, low24h: null, high24h: null },
    };
  }, [exchangeRates]);

  const getCryptoId = useCallback((symbol: string): string | undefined => {
    return cryptoIds[symbol.toUpperCase()] || cryptoIds[symbol.toLowerCase()];
  }, [cryptoIds]);

  const getCoinDetails = useCallback(async (coinId: string): Promise<CoinDetailedMetadata | null> => {
    // Check cache first
    if (coinDetailsCache[coinId]) {
      console.log(`🎯 [COIN_DETAILS] Cache hit for ${coinId}`);
      return coinDetailsCache[coinId];
    }

    // Check localStorage cache
    try {
      const cachedResult = getCachedData<Record<string, CoinDetailedMetadata>>(CACHE_STORAGE_KEY_COIN_DETAILS);
      if (cachedResult?.data[coinId]) {
        console.log(`💾 [COIN_DETAILS] localStorage cache hit for ${coinId}`);
        const cachedDetails = cachedResult.data[coinId];
        // Update in-memory cache
        setCoinDetailsCache(prev => ({ ...prev, [coinId]: cachedDetails }));
        return cachedDetails;
      }
    } catch (error) {
      console.error('Error reading coin details cache:', error);
    }

    // Check if we're rate limited
    if (isCoinGeckoApiRateLimited()) {
      console.warn(`🟢 [COIN_DETAILS] Rate limited, cannot fetch details for ${coinId}`);
      return null;
    }

    try {
      console.log(`🔵 [COIN_DETAILS] Fetching detailed metadata for ${coinId}`);
      const details = await fetchCoinDetails(coinId, RequestPriority.HIGH);
      
      if (details) {
        // Update in-memory cache
        setCoinDetailsCache(prev => ({ ...prev, [coinId]: details }));
        
        // Update localStorage cache
        try {
          const existingCache = getCachedData<Record<string, CoinDetailedMetadata>>(CACHE_STORAGE_KEY_COIN_DETAILS);
          const updatedCache = {
            ...(existingCache?.data || {}),
            [coinId]: details
          };
          setCachedData(CACHE_STORAGE_KEY_COIN_DETAILS, updatedCache, COIN_DETAILS_CACHE_DURATION);
        } catch (error) {
          console.error('Error caching coin details:', error);
        }
        
        console.log(`🎉 [COIN_DETAILS] Successfully fetched and cached details for ${coinId}`);
        return details;
      }
    } catch (error) {
      console.error(`🔴 [COIN_DETAILS] Error fetching details for ${coinId}:`, error);
    }

    return null;
  }, [coinDetailsCache]);

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

      // Load coin details cache
      const cachedCoinDetailsResult = getCachedData<Record<string, CoinDetailedMetadata>>(CACHE_STORAGE_KEY_COIN_DETAILS);
      if (cachedCoinDetailsResult) {
        setCoinDetailsCache(cachedCoinDetailsResult.data);
      }
    } catch (error) {
      console.error('Error loading initial cache from service:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fetchTokenMetadata should be memoized if added to deps

  useEffect(() => {
    if (PRELOAD_POPULAR_TOKENS_ENABLED) {
      const timer = setTimeout(() => {
        console.log('[PRELOAD] Starting pre-load of popular token metadata.'); // Logging
        const defaultTokenIds = Object.values(DEFAULT_CRYPTO_IDS);
        const missingDefaultTokens = defaultTokenIds.filter(id => 
          !tokenMetadata[id]
        );
        
        const popularTokenIds = POPULAR_TOKEN_IDS_TO_PRELOAD.filter(id =>
          !Object.values(cryptoIds).includes(id) && !defaultTokenIds.includes(id)
        );
        
        const tokensToFetch = [...missingDefaultTokens, ...popularTokenIds];
        
        if (tokensToFetch.length > 0) {
          fetchTokenMetadata(tokensToFetch, RequestPriority.LOW); // Pass LOW priority for preloading
        }
        console.log('[PRELOAD] Completed pre-load of popular token metadata. (Async fetch initiated if needed)'); // Logging
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
          const searchResponse = await searchCoinGecko(symbol, RequestPriority.HIGH); // Use HIGH priority for user searches
          
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
        await fetchTokenMetadata(missingIconSymbols, RequestPriority.LOW);
      }
    }
    
    return missingIconSymbols.length;
  }, [cryptoIds, getCryptoId, tokenMetadata, cacheTokenIcon]);

  // Enhanced token metadata fetching with smart fallback handling
  const fetchTokenMetadata = useCallback(async (specificTokens?: string[], priority: RequestPriority = RequestPriority.LOW) => {
    try {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
        return;
      }
      
      // Check which tokens actually need fetching
      const tokensToFetch = specificTokens || 
        Object.values(cryptoIds).filter(id => !tokenMetadata[id]);
      
      if (tokensToFetch.length > 0 && PRELOAD_POPULAR_TOKENS_ENABLED && specificTokens === tokensToFetch) { // Crude check if called by preloader
        console.log('[PRELOAD] Fetching metadata for popular/specific tokens:', tokensToFetch.join(', '));
      }

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
          
          const responseData = await fetchCoinMarkets(firstChunk, 'usd', priority); // Use passed priority
          
          const tempPreloadedPricesForState: Record<string, Record<string, CryptoPriceData>> = {}; // For Step 1

          if (responseData && Array.isArray(responseData)) {
            responseData.forEach((token: any) => {
              const tokenCoinGeckoId = token.id; // Using a different variable name to avoid conflict
              const tokenSymbolUpper = token.symbol.toUpperCase();

              if (PRELOAD_POPULAR_TOKENS_ENABLED && specificTokens?.includes(tokenCoinGeckoId)) { 
                console.log(`[METADATA_FETCH_PRICE_PROCESS] Processing price for ${tokenSymbolUpper} (ID: ${tokenCoinGeckoId}) from metadata fetch.`);
                
                const usdPrice = token.current_price;
                const usdChange = token.price_change_percentage_24h ?? null;
                const usdLow = token.low_24h ?? null;
                const usdHigh = token.high_24h ?? null;
                
                // Ensure exchangeRates are available, use fallbacks if not
                const currentExchangeRates = exchangeRates || { EUR: 0.92, CAD: 1.36 };
                const ratioEUR = currentExchangeRates.EUR;
                const ratioCAD = currentExchangeRates.CAD;

                tempPreloadedPricesForState[tokenSymbolUpper] = {
                  usd: { price: usdPrice, change24h: usdChange, low24h: usdLow, high24h: usdHigh },
                  eur: { price: usdPrice * ratioEUR, change24h: usdChange, low24h: usdLow ? usdLow * ratioEUR : null, high24h: usdHigh ? usdHigh * ratioEUR : null },
                  cad: { price: usdPrice * ratioCAD, change24h: usdChange, low24h: usdLow ? usdLow * ratioCAD : null, high24h: usdHigh ? usdHigh * ratioCAD : null }
                };
              }
              newMetadata[tokenCoinGeckoId] = {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                image: token.image,
                rank: token.market_cap_rank
              };
              
              // Cache the icon URL in localStorage to prevent future requests
              if (token.image) {
                cacheTokenIcon(token.symbol, token.image);
                if (PRELOAD_POPULAR_TOKENS_ENABLED && specificTokens === tokensToFetch) { // Crude check
                   console.log('[PRELOAD] Cached icon for token ID during metadata fetch:', token.id);
                }
              }
            });
          }
          
          // Update state with the first batch immediately
          setTokenMetadata(newMetadata);
          if (PRELOAD_POPULAR_TOKENS_ENABLED && specificTokens === tokensToFetch) { // Crude check
            console.log('[PRELOAD] Updated tokenMetadata state and cached metadata after first chunk for specificTokens.');
          }
          
          setCachedData(CACHE_STORAGE_KEY_METADATA, newMetadata, METADATA_CACHE_DURATION);

          if (Object.keys(tempPreloadedPricesForState).length > 0) {
            setPrices(prev => ({ ...prev, ...tempPreloadedPricesForState }));
            const currentPriceCache = getCachedPrices() || {};
            const updatedCache = { ...currentPriceCache, ...tempPreloadedPricesForState };
            setCachePrices(updatedCache);
            console.log('[PRELOAD/METADATA_FETCH] Updated prices state and cache with price data for symbols:', Object.keys(tempPreloadedPricesForState).join(', '));

            // If prices were updated from this metadata fetch, remove these symbols from pendingPriceUpdates
            Object.keys(tempPreloadedPricesForState).forEach(symbolUpper => {
              if (pendingPriceUpdates.current.has(symbolUpper)) {
                pendingPriceUpdates.current.delete(symbolUpper);
                console.log(`[METADATA_FETCH_PRICE_SUCCESS] Removed ${symbolUpper} from pendingPriceUpdates as price was obtained via metadata fetch.`);
              }
            });
          }
          
          // Process remaining chunks with intelligent spacing
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata, priority); // Pass priority
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * 12); // TODO: Review if this specific timing logic moves to service or hook
          }
        } catch (error) {
          // Increment consecutive errors (service might handle its own, this could be for UI feedback)
          // apiStatus.current.consecutiveErrors++; // If service handles, this might not be needed here
          console.error('Error fetching initial metadata chunk:', error); // Log error

          // Process remaining chunks with an intelligent backoff
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION_LIMIT) { // Updated variable name
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata, priority); // Pass priority
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * 15); // Longer delay after error
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchTokenMetadata:', error);
    }
  }, [cryptoIds, tokenMetadata, cacheTokenIcon]);
  
  // Enhanced function to process remaining metadata chunks with intelligent spacing
  const processRemainingMetadataChunks = async (
    chunks: string[][],
    existingMetadata: Record<string, any>,
    priority: RequestPriority // Added priority
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
        const responseData = await fetchCoinMarkets(chunk, 'usd', priority) as TokenMarketData[];
        
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
        // Set the global rate limit state when we encounter a 429
        setIsCoinGeckoRateLimitedGlobal(true);
        
        // Set a timeout to reset the rate limit state after the cooldown period
        setTimeout(() => {
          setIsCoinGeckoRateLimitedGlobal(false);
        }, COINGECKO_RATE_LIMIT_COOLDOWN);
        
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

  // Enhanced batch processing with smart API selection and cache-first strategy
  const processBatchRequests = useCallback(async () => {
    if (requestQueue.current.isProcessing || requestQueue.current.pendingSymbols.size === 0) {
      return;
    }
    
    const batchId = Date.now(); // Unique identifier for this batch to prevent timer conflicts
    const batchSize = requestQueue.current.pendingSymbols.size;
    console.log(`⚙️ [CryptoContext] Starting processBatchRequests #${batchId} - Batch Size: ${batchSize}`);

    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall.current;
    
    // Respect rate limits
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const delayTime = MIN_API_INTERVAL - timeSinceLastCall;
      console.debug(`🔵 [BATCH_DELAY] Delaying batch #${batchId} by ${delayTime}ms for rate limit spacing`);
      updateTimeout.current = setTimeout(() => processBatchRequests(), delayTime);
      return;
    }

    // Check if CoinGecko API is currently rate limited before making the request
    if (isCoinGeckoApiRateLimited()) {
      const retrySeconds = getCoinGeckoRetryAfterSeconds();
      console.warn(`🟢 [RATE_LIMIT] Batch #${batchId} blocked. Rate limited for ${retrySeconds}s. Serving cache and scheduling retry.`);
      setIsCoinGeckoRateLimitedGlobal(true);
      
      // Immediately serve cache for all pending symbols
      const allPendingSymbols = Array.from(requestQueue.current.pendingSymbols);
      serveCacheForSymbols(allPendingSymbols, batchId);
      
      // Schedule retry after cooldown
      const cooldownTime = Math.max(1000, retrySeconds * 1000);
      updateTimeout.current = setTimeout(() => {
        console.log(`🔵 [RATE_LIMIT_RETRY] Retrying batch after ${retrySeconds}s cooldown`);
        setIsCoinGeckoRateLimitedGlobal(false);
        requestQueue.current.isProcessing = false;
        processBatchRequests();
      }, cooldownTime);
      
      requestQueue.current.isProcessing = false;
      setLoading(false);
      return;
    }

    requestQueue.current.isProcessing = true;

    try {
      setLoading(true);
      setError(null);

      // Process all pending symbols in one batch, but limit batch size
      const allPendingSymbols = Array.from(requestQueue.current.pendingSymbols);
      const symbolsToProcess = allPendingSymbols.slice(0, PRICE_UPDATE_MAX_BATCH_SIZE);
      
      // Remove processed symbols from the queue
      symbolsToProcess.forEach(symbol => requestQueue.current.pendingSymbols.delete(symbol));
      
      // Add symbols to pending updates set
      symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.add(symbol));
      
      const relevantIds = symbolsToProcess
        .map(symbol => getCryptoId(symbol))
        .filter((id): id is string => Boolean(id));

      if (relevantIds.length === 0) {
        symbolsToProcess.forEach(symbol => pendingPriceUpdates.current.delete(symbol));
        requestQueue.current.isProcessing = false;
        setLoading(false);
        return;
      }

      let priceData: Record<string, any> = {};
      let requestSuccessful = false;

      // Create unique timer labels to prevent "Timer already exists" warnings
      const marketApiLabel = `API_fetchCoinMarkets_BATCH#${batchId}_[${relevantIds.length > 3 ? relevantIds.slice(0,2).join(',')+',...,'+relevantIds.slice(-1) : relevantIds.join(',')}]`;
      const simpleApiLabel = `API_fetchSimplePrice_BATCH#${batchId}_[${relevantIds.length > 3 ? relevantIds.slice(0,2).join(',')+',...,'+relevantIds.slice(-1) : relevantIds.join(',')}]`;

      // ** ALWAYS try /coins/markets first to get low/high data **
      try {
        console.time(marketApiLabel);
        const marketApiStartTime = performance.now();
        console.log(`📞 [API] Calling: ${marketApiLabel}`);
        
        const marketsDataResponse = await fetchCoinMarkets(relevantIds, 'usd', RequestPriority.NORMAL);
        
        const marketApiEndTime = performance.now();
        console.timeEnd(marketApiLabel);
        console.log(`⏱️ ${marketApiLabel} (in seconds): ${((marketApiEndTime - marketApiStartTime) / 1000).toFixed(3)} s`);
        
        if (marketsDataResponse && Array.isArray(marketsDataResponse)) {
          const marketsDataMap: Record<string, any> = {};
          marketsDataResponse.forEach((coin: any) => {
            marketsDataMap[coin.id] = coin;
          });
          priceData = marketsDataMap;
        }

        lastApiCall.current = Date.now();
        requestSuccessful = true;
        
        // Reset the rate limit state if we had a successful call
        if (isCoinGeckoRateLimitedGlobal) {
          setIsCoinGeckoRateLimitedGlobal(false);
        }
      } catch (marketsError) {
        console.warn(`🟠 [FALLBACK_MARKETS] Failed to fetch from /coins/markets, trying cache then /simple/price: ${marketsError}`);
        
        // Immediately serve cache for all symbols before trying fallback
        serveCacheForSymbols(symbolsToProcess, batchId);
        
        // Check if this is a rate limit error
        if (axios.isAxiosError(marketsError) && marketsError.response?.status === 429) {
          setIsCoinGeckoRateLimitedGlobal(true);
          
          // Set a timeout to reset the rate limit state after the cooldown period
          setTimeout(() => {
            setIsCoinGeckoRateLimitedGlobal(false);
          }, COINGECKO_RATE_LIMIT_COOLDOWN);
        }

        // ** Only try /simple/price for symbols that couldn't be served from cache **
        const uncachedSymbols = symbolsToProcess.filter(symbol => 
          pendingPriceUpdates.current.has(symbol)
        );
        
        if (uncachedSymbols.length > 0) {
          const uncachedIds = uncachedSymbols
            .map(symbol => getCryptoId(symbol))
            .filter((id): id is string => Boolean(id));
            
          if (uncachedIds.length > 0) {
            try {
              console.time(simpleApiLabel);
              const simpleApiStartTime = performance.now();
              console.log(`📞 [API] Calling (Fallback): ${simpleApiLabel}`);
              
              const simplePriceData = await fetchSimplePrice(uncachedIds, 'usd,eur,cad', RequestPriority.NORMAL);
              
              const simpleApiEndTime = performance.now();
              console.timeEnd(simpleApiLabel);
              console.log(`⏱️ ${simpleApiLabel} (in seconds): ${((simpleApiEndTime - simpleApiStartTime) / 1000).toFixed(3)} s`);
              
              priceData = simplePriceData;
              lastApiCall.current = Date.now();
              requestSuccessful = true;
              
              // Reset the rate limit state if we had a successful call
              if (isCoinGeckoRateLimitedGlobal) {
                setIsCoinGeckoRateLimitedGlobal(false);
              }
            } catch (simplePriceError) {
              console.error(`🟠 [FALLBACK_SIMPLE] Fallback to /simple/price also failed: ${simplePriceError}`);
              
              // Check if this is a rate limit error
              if (axios.isAxiosError(simplePriceError) && simplePriceError.response?.status === 429) {
                setIsCoinGeckoRateLimitedGlobal(true);
                
                // Set a timeout to reset the rate limit state after the cooldown period
                setTimeout(() => {
                  setIsCoinGeckoRateLimitedGlobal(false);
                }, COINGECKO_RATE_LIMIT_COOLDOWN);
              }
            }
          }
        } else {
          console.log(`🟡 [CACHE_SERVED_ALL] All symbols in batch #${batchId} served from cache, skipping /simple/price fallback`);
        }
      }

      // Update prices with merged data
      const existingPrices = getCachedPrices() || {};
      const newPrices = { ...existingPrices };

      symbolsToProcess.forEach(symbol => {
        const id = getCryptoId(symbol);
        const tokenPriceData = id ? priceData[id] : undefined;
        let priceSuccessfullySetForSymbol = false;

        if (id && tokenPriceData) {
          // Successfully fetched data from API
          if ('current_price' in tokenPriceData) {
            // Process data from /coins/markets
            const usdPrice = tokenPriceData.current_price;
            const usdChange = tokenPriceData.price_change_percentage_24h ?? null;
            const usdLow = tokenPriceData.low_24h ?? null;
            const usdHigh = tokenPriceData.high_24h ?? null;
            
            const ratioEUR = exchangeRates?.EUR || 0.92;
            const ratioCAD = exchangeRates?.CAD || 1.36;
            
            newPrices[symbol] = {
              usd: { price: usdPrice, change24h: usdChange, low24h: usdLow, high24h: usdHigh },
              eur: { price: usdPrice * ratioEUR, change24h: usdChange, low24h: usdLow ? usdLow * ratioEUR : null, high24h: usdHigh ? usdHigh * ratioEUR : null },
              cad: { price: usdPrice * ratioCAD, change24h: usdChange, low24h: usdLow ? usdLow * ratioCAD : null, high24h: usdHigh ? usdHigh * ratioCAD : null }
            };
          } else {
            // Process data from /simple/price (Fallback)
            const usdPrice = tokenPriceData.usd;
            const usdChange = tokenPriceData.usd_24h_change ?? null;
            const eurPrice = tokenPriceData.eur;
            const eurChange = tokenPriceData.eur_24h_change ?? null;
            const cadPrice = tokenPriceData.cad;
            const cadChange = tokenPriceData.cad_24h_change ?? null;
            
            const existingUsdData = existingPrices[symbol]?.usd;
            const existingEurData = existingPrices[symbol]?.eur;
            const existingCadData = existingPrices[symbol]?.cad;
            
            newPrices[symbol] = {
              usd: { price: usdPrice, change24h: usdChange, low24h: existingUsdData?.low24h ?? null, high24h: existingUsdData?.high24h ?? null },
              eur: { price: eurPrice, change24h: eurChange, low24h: existingEurData?.low24h ?? null, high24h: existingEurData?.high24h ?? null },
              cad: { price: cadPrice, change24h: cadChange, low24h: existingCadData?.low24h ?? null, high24h: existingCadData?.high24h ?? null }
            };
          }
          priceSuccessfullySetForSymbol = true;
          console.log(`🎉 [RECOVERY_SUCCESS] Successfully set API price for ${symbol}. Removed from pending. isPending: ${isPending(symbol)}`);
        } else if (!requestSuccessful || !pendingPriceUpdates.current.has(symbol)) {
          // Either API failed completely, or this symbol was already served from cache
          if (!newPrices[symbol]?.usd?.price) {
            const estimatedPrice = getEstimatedPrice(symbol);
            if (estimatedPrice?.usd?.price === null) {
              console.warn(`☠️ [RECOVERY_FAIL] No API data, cache, or valid estimate for ${symbol}. Keeping in pending state.`);
              newPrices[symbol] = estimatedPrice;
              // Keep in pendingPriceUpdates to show loading
            } else {
              console.warn(`🟡 [FALLBACK_ESTIMATED] Using estimated price for ${symbol}: ${JSON.stringify(estimatedPrice?.usd)}`);
              newPrices[symbol] = estimatedPrice;
              pendingPriceUpdates.current.delete(symbol);
            }
          }
        }

        // Only remove from pending updates if a real price was successfully set from the API for this symbol
        if (priceSuccessfullySetForSymbol) {
          pendingPriceUpdates.current.delete(symbol);
        }
      });

      setPrices(newPrices);
      setCachePrices(newPrices);
      setLastUpdated(new Date());

      // Reset error indicators on success
      if (requestSuccessful) {
        setError(null);
        retryCount.current = 0;
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
      console.error(`🔴 [BATCH_ERROR] Error during batch #${batchId} processing:`, err);
      
      // Check for rate limit error in the caught error
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setIsCoinGeckoRateLimitedGlobal(true);
        
        // Set a timeout to reset the rate limit state after the cooldown period
        setTimeout(() => {
          setIsCoinGeckoRateLimitedGlobal(false);
        }, COINGECKO_RATE_LIMIT_COOLDOWN);
      }
      
      // Intelligent retry with exponential backoff
      if (retryCount.current <= MAX_API_RETRIES) {
        retryCount.current++;
        const retryDelay = Math.min(API_RETRY_DELAY * Math.pow(2, retryCount.current - 1), 30000);
        console.log(`🔵 [BATCH_RETRY] Retrying batch #${batchId} in ${retryDelay}ms (attempt ${retryCount.current}/${MAX_API_RETRIES})`);
        
        updateTimeout.current = setTimeout(() => {
          requestQueue.current.isProcessing = false;
          processBatchRequests();
        }, retryDelay);
      } else {
        setError('Failed to update prices after multiple retries.');
        console.error(`☠️ [BATCH_MAX_RETRIES] Max retries reached for batch #${batchId}. Clearing queue.`);
        
        // Max retries reached, clear queue and reset
        const failedSymbols = Array.from(requestQueue.current.pendingSymbols);
        failedSymbols.forEach(symbol => {
          const newPrices = getCachedPrices() || {};
          const price = newPrices[symbol]?.usd?.price;
          if (price !== null && price !== undefined) {
            pendingPriceUpdates.current.delete(symbol);
          } else {
            console.log(`☠️ [MAX_RETRIES_PENDING] Keeping ${symbol} in pending state (null/undefined price).`);
          }
        });
        requestQueue.current.pendingSymbols.clear();
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
      console.log(`⚙️ [CryptoContext] Finished processBatchRequests #${batchId}`);
    }
  }, [getCryptoId, getEstimatedPrice, getCachedPrices, setCachePrices, handleApiError, exchangeRates, isCoinGeckoRateLimitedGlobal]);

  // Helper function to serve cache for symbols immediately
  const serveCacheForSymbols = useCallback((symbols: string[], batchId: number): string[] => {
    const existingPrices = getCachedPrices() || {};
    const newPrices = { ...prices };
    const cacheServedSymbols: string[] = [];
    
    symbols.forEach(symbol => {
      if (existingPrices[symbol]?.usd?.price !== undefined && existingPrices[symbol]?.usd?.price !== null) {
        // Valid cached price exists
        newPrices[symbol] = existingPrices[symbol];
        pendingPriceUpdates.current.delete(symbol);
        cacheServedSymbols.push(symbol);
        console.log(`🟡 [CACHE_HIT] Batch #${batchId}: Using cached price for ${symbol}: ${existingPrices[symbol].usd.price}. Removed from pending.`);
      } else {
        // No valid cache, keep in pending state
        console.log(`🟡 [CACHE_MISS] Batch #${batchId}: No cache for ${symbol}. Keeping in pending state.`);
      }
    });
    
    if (cacheServedSymbols.length > 0) {
      setPrices(newPrices);
      console.log(`🟡 [CACHE_BATCH_SERVED] Batch #${batchId}: Served ${cacheServedSymbols.length}/${symbols.length} symbols from cache`);
    }
    
    return cacheServedSymbols;
  }, [prices, getCachedPrices]);

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
      console.log(`[ADD_CRYPTO_EXISTS] Token ${upperSymbol} with ID ${lowerId} already exists.`);
      return; // Token already exists with same ID
    }
    
    console.log(`[ADD_CRYPTO_START] Adding token ${upperSymbol} with ID ${lowerId}.`);
    pendingPriceUpdates.current.add(upperSymbol); // Add to pending immediately
    console.log(`[ADD_CRYPTO_PENDING_ADD] ${upperSymbol} added to pendingPriceUpdates. isPending: ${isPending(upperSymbol)}`);


    // Update state with the new token immediately
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
      console.log(`[ADD_CRYPTO_ESTIMATED] Set estimated price for ${upperSymbol}. Current isPending status: ${isPending(upperSymbol)} (should be true)`);
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

    // Fetch metadata and full price data using fetchTokenMetadata
    fetchTokenMetadata([lowerId], RequestPriority.HIGH).then(() => {
      // Dispatch event after metadata (and potentially price) is updated
      // Ensure UI updates if price was set by fetchTokenMetadata
      window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));
      // If, for some reason, fetchTokenMetadata didn't clear the pending state (e.g., API error for price part),
      // a regular update cycle or a specific retry mechanism might be needed.
      // For now, we rely on fetchTokenMetadata to handle it.
      if (pendingPriceUpdates.current.has(upperSymbol)) {
        console.warn(`[ADD_CRYPTO_STILL_PENDING] ${upperSymbol} is still pending after fetchTokenMetadata. Regular updates should catch it.`);
      }
    }).catch(error => {
      console.error(`[ADD_CRYPTO_METADATA_FETCH_ERROR] Error fetching metadata/price for ${upperSymbol}:`, error);
      // If metadata fetch fails, it might still be in pending. Queue a general price update as a fallback.
      queuePriceUpdate([upperSymbol], true);
    });
  }, [cryptoIds, queuePriceUpdate, fetchTokenMetadata, getCachedPrices, setCachePrices, getEstimatedPrice, exchangeRates]);

  // Enhanced addCryptos with instantaneous updates and no loading indicators
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    if (!tokens.length) return;
    
    console.log(`[ADD_CRYPTOS_START] Processing batch add for ${tokens.length} tokens.`);
    const newCryptoIdsToAdd: Record<string, string> = {};
    const symbolsToProcessThisCall = new Set<string>();
    const storageIdsToUpdate = { ...cryptoIds }; // Start with current for persistence logic

    const newPricesToSet = { ...prices }; // Start with current prices state
    const metadataFetchIdsToQueue: string[] = []; // IDs that need initial data fetch (metadata + price)
    const allAddedSymbolsUpper: string[] = [];

    tokens.forEach(({ symbol, id }) => {
      const upperSymbol = symbol.toUpperCase();
      const lowerId = id.toLowerCase();
      allAddedSymbolsUpper.push(upperSymbol);
      symbolsToProcessThisCall.add(upperSymbol); // For UI event detail

      // Mark as pending for UI updates, will be cleared if data is found or fetched
      pendingPriceUpdates.current.add(upperSymbol);
      console.log(`[ADD_TOKEN_IN_BATCH_PENDING_ADD_INITIAL] ${upperSymbol} added to pendingPriceUpdates. isPending: ${isPending(upperSymbol)}`);

      if (cryptoIds[upperSymbol] === lowerId) {
        console.log(`[ADD_TOKEN_IN_BATCH_EXISTS] ${upperSymbol} (${lowerId}) already exists with same ID. Checking data freshness.`);
        // Token already exists, check if its data is recent enough
        const priceCacheEntry = getCachedData<Record<string, Record<string, CryptoPriceData>>>(CACHE_STORAGE_KEY_PRICES);
        const existingPriceDataForSymbol = priceCacheEntry?.data?.[upperSymbol];
        const metadataCacheEntry = getCachedData<Record<string, any>>(CACHE_STORAGE_KEY_METADATA);
        const existingMetadata = metadataCacheEntry?.data?.[lowerId];

        const isPriceRecent = existingPriceDataForSymbol?.usd?.price !== undefined && existingPriceDataForSymbol?.usd?.price !== null && priceCacheEntry && (Date.now() - priceCacheEntry.timestamp < RECENT_DATA_THRESHOLD);
        const isMetadataRecentAndComplete = existingMetadata?.image && metadataCacheEntry && (Date.now() - metadataCacheEntry.timestamp < RECENT_DATA_THRESHOLD);

        if (isPriceRecent && isMetadataRecentAndComplete && existingPriceDataForSymbol) { // Ensure existingPriceDataForSymbol is not undefined
          console.log(`[ADD_TOKEN_IN_BATCH_RECENT_DATA_FOUND] Recent complete data found for ${upperSymbol}. Using it and removing from pending.`);
          newPricesToSet[upperSymbol] = existingPriceDataForSymbol; // Correct assignment
          pendingPriceUpdates.current.delete(upperSymbol); // Data is recent and complete, remove from pending
        } else {
          console.log(`[ADD_TOKEN_IN_BATCH_DATA_STALE_OR_INCOMPLETE] Data for ${upperSymbol} is stale or incomplete. Queuing for fetch.`);
          if (!metadataFetchIdsToQueue.includes(lowerId)) {
            metadataFetchIdsToQueue.push(lowerId);
          }
        }
      } else {
        // New token
        newCryptoIdsToAdd[upperSymbol] = lowerId;
        storageIdsToUpdate[upperSymbol] = lowerId; // For localStorage update
        console.log(`[ADD_TOKEN_IN_BATCH_NEW] New token ${upperSymbol} (${lowerId}). Queuing for fetch.`);
        if (!newPricesToSet[upperSymbol]?.usd?.price) {
          console.log('[ADD_TOKEN_IN_BATCH_ESTIMATED_NEW] Setting estimated price for new token:', upperSymbol);
          newPricesToSet[upperSymbol] = getEstimatedPrice(upperSymbol);
        }
        if (!metadataFetchIdsToQueue.includes(lowerId)) {
          metadataFetchIdsToQueue.push(lowerId);
        }
      }
    });
    
    // Update cryptoIds state if there are new ones
    if (Object.keys(newCryptoIdsToAdd).length > 0) {
      setCryptoIds(prev => ({ ...prev, ...newCryptoIdsToAdd }));
    }

    // Update availableCryptos state
    setAvailableCryptos(prev => {
      const defaultTokensList = Object.keys(DEFAULT_CRYPTO_IDS);
      const currentCustomTokens = prev.filter(p => !defaultTokensList.includes(p));
      const allRelevantSymbols = new Set([...currentCustomTokens, ...Array.from(symbolsToProcessThisCall)]);
      const sortedCustom = Array.from(allRelevantSymbols).filter(s => !defaultTokensList.includes(s)).sort();
      return [...defaultTokensList, ...sortedCustom];
    });
    
    // Update prices state with new estimated/preloaded prices
    setPrices(newPricesToSet);

    // Update localStorage for cryptoIds
    const finalStorageIds = { ...cryptoIds, ...newCryptoIdsToAdd }; // Use the latest cryptoIds state
    const customStorageIds = { ...finalStorageIds };
    Object.keys(DEFAULT_CRYPTO_IDS).forEach(key => {
      delete customStorageIds[key];
    });
    localStorage.setItem(STORAGE_KEY_CUSTOM_TOKENS, JSON.stringify(customStorageIds)); 

    // Dispatch the event to update UI components
    window.dispatchEvent(new CustomEvent('cryptoTokensUpdated', {
      detail: {
        action: 'add',
        tokens: Array.from(symbolsToProcessThisCall) // Use symbolsToProcessThisCall
      }
    }));

    // Unified High-Priority Fetch for new/stale tokens
    if (metadataFetchIdsToQueue.length > 0) {
      console.log(`[ADD_CRYPTOS_UNIFIED_FETCH] Initiating unified fetch for ${metadataFetchIdsToQueue.length} IDs: ${metadataFetchIdsToQueue.join(', ')}`);
      try {
        const marketDataArray = await fetchCoinMarkets(metadataFetchIdsToQueue, 'usd', RequestPriority.HIGH);

        const currentMetadata = getCachedData<Record<string, any>>(CACHE_STORAGE_KEY_METADATA)?.data || tokenMetadata;
        const currentPriceCacheData = getCachedData<Record<string, Record<string, CryptoPriceData>>>(CACHE_STORAGE_KEY_PRICES)?.data || prices;
        
        const newMetadataUpdates = { ...currentMetadata };
        const newPriceUpdates = { ...currentPriceCacheData };

        marketDataArray.forEach((data: TokenMarketData) => { // Use TokenMarketData interface
          const tokenSymbolUpper = data.symbol.toUpperCase();
          
          // Update metadata
          newMetadataUpdates[data.id] = {
            symbol: tokenSymbolUpper,
            name: data.name,
            image: data.image,
            rank: data.market_cap_rank
          };
          if (data.image) {
            cacheTokenIcon(data.symbol, data.image);
          }

          // Update prices
          if (data.current_price !== null && data.current_price !== undefined) {
            const usdPrice = data.current_price;
            const usdChange = data.price_change_percentage_24h ?? null;
            const usdLow = data.low_24h ?? null;
            const usdHigh = data.high_24h ?? null;

            const currentExchangeRates = exchangeRates || { EUR: 0.92, CAD: 1.36 };
            const ratioEUR = currentExchangeRates.EUR;
            const ratioCAD = currentExchangeRates.CAD;

            newPriceUpdates[tokenSymbolUpper] = {
              usd: { price: usdPrice, change24h: usdChange, low24h: usdLow, high24h: usdHigh },
              eur: { price: usdPrice * ratioEUR, change24h: usdChange, low24h: usdLow ? usdLow * ratioEUR : null, high24h: usdHigh ? usdHigh * ratioEUR : null },
              cad: { price: usdPrice * ratioCAD, change24h: usdChange, low24h: usdLow ? usdLow * ratioCAD : null, high24h: usdHigh ? usdHigh * ratioCAD : null }
            };
            pendingPriceUpdates.current.delete(tokenSymbolUpper); // Price confirmed
            console.log(`[ADD_CRYPTOS_UNIFIED_FETCH_PRICE_SUCCESS] Price for ${tokenSymbolUpper} confirmed. Removed from pending. isPending: ${isPending(tokenSymbolUpper)}`);
          } else {
             console.warn(`[ADD_CRYPTOS_UNIFIED_FETCH_PRICE_MISSING] Price data missing for ${tokenSymbolUpper} (ID: ${data.id}) in unified fetch response. It will remain pending.`);
          }
        });

        if (Object.keys(newMetadataUpdates).length > 0) {
          setTokenMetadata(newMetadataUpdates); // Update with the full new set
          setCachedData(CACHE_STORAGE_KEY_METADATA, newMetadataUpdates, METADATA_CACHE_DURATION);
        }
        if (Object.keys(newPriceUpdates).length > 0) {
          setPrices(newPriceUpdates); // Update with the full new set
          setCachePrices(newPriceUpdates);
        }
        
        window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));

      } catch (error) {
        console.error('[ADD_CRYPTOS_UNIFIED_FETCH_ERROR]', error);
        // Tokens that failed here will remain in pendingPriceUpdates
        // and should be caught by the subsequent queuePriceUpdate
      }
    }

    // Targeted Fallback Price Queuing for any symbols still pending
    // This catches symbols that were not fetched (due to recent cache but might need refresh for price aspect),
    // or symbols whose data was missing from the unified fetch response.
    const symbolsStillNeedingPriceUpdate = allAddedSymbolsUpper.filter(symbolUpper =>
      pendingPriceUpdates.current.has(symbolUpper)
    );

    if (symbolsStillNeedingPriceUpdate.length > 0) {
      console.log('[ADD_CRYPTOS_FALLBACK_QUEUE] Queuing high-priority price update for symbols still pending after initial fetch/check:', symbolsStillNeedingPriceUpdate.join(', '));
      queuePriceUpdate(symbolsStillNeedingPriceUpdate, true);
    } else {
      console.log('[ADD_CRYPTOS_COMPLETE] All added tokens had prices resolved via initial fetch or recent cache. No further price queue needed.');
    }

  }, [cryptoIds, prices, tokenMetadata, queuePriceUpdate, fetchTokenMetadata, getEstimatedPrice, exchangeRates, getCachedPrices, setCachePrices, cacheTokenIcon, isPending]);

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
      const responseData = await fetchCoinMarkets(defaultTokenIds, 'usd', RequestPriority.LOW);
      
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

  // NEW: Effect to periodically sync API status with the context
  useEffect(() => {
    const syncApiStatus = () => {
      const status = getPublicApiStatus();
      setIsCoinGeckoRateLimitedGlobal(status.isRateLimited);
      setIsUsingApiFallback(status.isUsingAnonymousFallback);
    };

    const interval = setInterval(syncApiStatus, 2000); // Sync every 2 seconds
    syncApiStatus(); // Initial sync

    return () => clearInterval(interval);
  }, []);

  // Function to check if a specific API is currently rate-limited
  const isApiRateLimited = useCallback((apiName: 'coingecko' | 'cryptocompare'): boolean => {
    if (apiName === 'coingecko') {
      return isCoinGeckoApiRateLimited() || isCoinGeckoRateLimitedGlobal;
    }
    // Add similar logic for cryptocompare if needed, or if it gets its own service
    if (apiName === 'cryptocompare') {
      // Placeholder: CryptoCompare rate limiting logic would go here if it had its own service
      // For now, assume it's not rate limited or managed by its own context/service
      return false;
    }
    return false;
  }, [isCoinGeckoRateLimitedGlobal]);

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
        isApiRateLimited,
        isCoinGeckoRateLimitedGlobal,
        isUsingApiFallback, // NEW: Pass fallback status to consumers
        getCoinGeckoRetryAfterSeconds: getCoinGeckoRetryAfterSeconds, // Add retry countdown helper
        getApiMetrics: getApiPerformanceMetrics, // Add API performance metrics
        getCoinDetails, // Add detailed coin metadata fetching
        coinDetailsCache, // Add cache for detailed coin metadata
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
