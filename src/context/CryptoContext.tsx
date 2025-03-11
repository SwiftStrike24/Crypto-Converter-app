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
  tokenMetadata: Record<string, any>;
  defaultCryptoIds: { [key: string]: string };
  checkAndUpdateMissingIcons: () => Promise<number>;
  setTokenMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
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
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache (increased from 5 minutes)
const MIN_API_INTERVAL = 60 * 1000; // 60 seconds between API calls (free tier limit)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds base delay for retries
const DEBOUNCE_DELAY = 300; // 300ms debounce delay (reduced from 500ms)
const BATCH_WINDOW = 500; // 500ms batch window (reduced from 1s)
const MAX_BATCH_SIZE = 25; // Maximum number of tokens to request in a single batch
const PRELOAD_POPULAR_TOKENS = true; // Enable preloading of popular tokens
const CACHE_STORAGE_KEY = 'cryptovertx-price-cache';
const METADATA_CACHE_KEY = 'cryptovertx-metadata-cache';
const METADATA_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days for metadata (increased from 7)
const ICON_CACHE_PREFIX = 'crypto_icon_';
const MAX_METADATA_REQUESTS_PER_SESSION = 3; // Limit metadata API calls per session

// Popular tokens to preload
const POPULAR_TOKENS = [
  'bitcoin', 'ethereum', 'solana', 'ripple', 'cardano', 
  'polkadot', 'dogecoin', 'shiba-inu', 'avalanche-2', 'chainlink',
  'uniswap', 'polygon', 'litecoin', 'binancecoin', 'tron'
];

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

// Parse retry-after header to get milliseconds to wait
const getMillisToWait = (retryAfterHeader: string | null): number => {
  if (!retryAfterHeader) return MIN_API_INTERVAL;
  
  let millisToWait = Math.round(parseFloat(retryAfterHeader) * 1000);
  if (isNaN(millisToWait)) {
    millisToWait = Math.max(0, new Date(retryAfterHeader).getTime() - Date.now());
  }
  return millisToWait > 0 ? millisToWait : MIN_API_INTERVAL;
};

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for crypto prices and loading status
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

  // Refs for managing API requests and caching
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

  // Add token metadata cache
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Track metadata API calls per session
  const metadataRequestCount = useRef<number>(0);

  const tokenIconCache = useRef<Record<string, string>>({});

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

  // Load cache from localStorage on init
  useEffect(() => {
    try {
      // Load price cache
      const cachedPricesJson = localStorage.getItem(CACHE_STORAGE_KEY);
      if (cachedPricesJson) {
        const cachedData = JSON.parse(cachedPricesJson);
        if (cachedData && cachedData.timestamp && Date.now() - cachedData.timestamp < CACHE_DURATION) {
          cache.current = cachedData;
          setPrices(cachedData.prices);
          setLastUpdated(new Date(cachedData.timestamp));
        }
      }
      
      // Load metadata cache
      const metadataJson = localStorage.getItem(METADATA_CACHE_KEY);
      if (metadataJson) {
        const metadataCache = JSON.parse(metadataJson);
        if (metadataCache && metadataCache.timestamp && Date.now() - metadataCache.timestamp < METADATA_CACHE_DURATION) {
          setTokenMetadata(metadataCache.data || {});
        } else {
          // Metadata cache expired, fetch fresh data later
          fetchTokenMetadata();
        }
      } else {
        // No metadata cache, fetch fresh data
        fetchTokenMetadata();
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
  }, []);

  // Preload popular tokens
  useEffect(() => {
    if (PRELOAD_POPULAR_TOKENS) {
      // Wait a bit after initial load to not block UI
      const timer = setTimeout(() => {
        // First, ensure all default tokens are loaded
        const defaultTokenIds = Object.values(defaultCryptoIds);
        const missingDefaultTokens = defaultTokenIds.filter(id => 
          !tokenMetadata[id]
        );
        
        // Then add popular tokens
        const popularTokenIds = POPULAR_TOKENS.filter(id => 
          !Object.values(cryptoIds).includes(id) && !defaultTokenIds.includes(id)
        );
        
        const tokensToFetch = [...missingDefaultTokens, ...popularTokenIds];
        
        if (tokensToFetch.length > 0) {
          fetchTokenMetadata(tokensToFetch);
        }
      }, 1000); // Reduced from 2000ms to 1000ms for faster loading
      
      return () => clearTimeout(timer);
    }
  }, []);

  // Save cache to localStorage when updated
  useEffect(() => {
    if (cache.current) {
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache.current));
      } catch (error) {
        console.error('Error saving price cache:', error);
      }
    }
  }, [prices]);

  // Enhanced token icon caching with better error handling and validation
  const cacheTokenIcon = (symbol: string, imageUrl: string) => {
    if (!symbol || !imageUrl) return;
    
    try {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_PREFIX}${normalizedSymbol}`;
      
      // Store in localStorage
      localStorage.setItem(iconCacheKey, imageUrl);
      
      // Also store in memory cache
      tokenIconCache.current[normalizedSymbol] = imageUrl;
      
      // If we have an ID for this symbol, also cache by ID
      const id = cryptoIds[symbol.toUpperCase()];
      if (id) {
        const idIconCacheKey = `${ICON_CACHE_PREFIX}id-${id.toLowerCase()}`;
        localStorage.setItem(idIconCacheKey, imageUrl);
        
        // Update metadata if needed
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
      
      console.log(`Cached icon for ${symbol}`);
    } catch (error) {
      console.error('Error caching token icon:', error);
    }
  };

  // Function to ensure all token icons are properly cached
  const ensureAllIconsCached = () => {
    // Get all tokens that should have icons
    const tokensToCheck = Object.keys(cryptoIds);
    let missingIconsCount = 0;
    
    // Check which tokens are missing icons and update from metadata if available
    tokensToCheck.forEach(symbol => {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_PREFIX}${normalizedSymbol}`;
      const id = cryptoIds[symbol];
      
      // Check if we have the icon in metadata
      if (tokenMetadata[id]?.image) {
        // Make sure it's also in localStorage
        if (!localStorage.getItem(iconCacheKey)) {
          localStorage.setItem(iconCacheKey, tokenMetadata[id].image);
          tokenIconCache.current[normalizedSymbol] = tokenMetadata[id].image;
        }
      } else {
        // Check if we have it in localStorage
        const cachedIcon = localStorage.getItem(iconCacheKey);
        if (cachedIcon) {
          // Update metadata with the cached icon
          setTokenMetadata(prev => ({
            ...prev,
            [id]: {
              ...(prev[id] || {}),
              image: cachedIcon
            }
          }));
        } else {
          missingIconsCount++;
        }
      }
    });
    
    return missingIconsCount;
  };

  // Enhanced function to check and update missing token icons with better caching and proactive fetching
  const checkAndUpdateMissingIcons = async () => {
    // Get all tokens that should have icons
    const tokensToCheck = Object.keys(cryptoIds);
    const missingIconTokens: string[] = [];
    const missingIconSymbols: string[] = [];
    
    // Check which tokens are missing icons
    tokensToCheck.forEach(symbol => {
      const normalizedSymbol = symbol.toLowerCase();
      const iconCacheKey = `${ICON_CACHE_PREFIX}${normalizedSymbol}`;
      const id = cryptoIds[symbol];
      
      // Check if we have the icon in metadata or cache
      const hasMetadataIcon = tokenMetadata[id]?.image;
      const hasCachedIcon = localStorage.getItem(iconCacheKey) || tokenIconCache.current[normalizedSymbol];
      
      if (!hasMetadataIcon && !hasCachedIcon) {
        missingIconTokens.push(id);
        missingIconSymbols.push(symbol);
      } else if (!hasMetadataIcon && hasCachedIcon) {
        // If we have a cached icon but no metadata, update the metadata
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
    });
    
    // Log missing icons for debugging
    if (missingIconTokens.length > 0) {
      console.log(`Found ${missingIconTokens.length} tokens with missing icons: ${missingIconSymbols.join(', ')}`);
    }
    
    // If we have missing icons, fetch them
    if (missingIconTokens.length > 0) {
      console.log(`Fetching missing icons for ${missingIconTokens.length} tokens`);
      
      // Try to fetch using the search API first for better results
      try {
        for (const symbol of missingIconSymbols) {
          // Skip if we're rate limited
          if (!apiStatus.current.coinGeckoAvailable) {
            break;
          }
          
          // Use search API to get better matches
          const searchResponse = await axios.get(`${API_BASE}/search`, {
            params: { query: symbol },
            timeout: 5000
          });
          
          if (searchResponse.data && searchResponse.data.coins && searchResponse.data.coins.length > 0) {
            // Find the best match
            const exactMatch = searchResponse.data.coins.find(
              (coin: any) => coin.symbol.toLowerCase() === symbol.toLowerCase()
            );
            
            const bestMatch = exactMatch || searchResponse.data.coins[0];
            
            if (bestMatch && bestMatch.large) {
              // Cache the icon
              cacheTokenIcon(symbol, bestMatch.large);
              
              // Update metadata
              const id = cryptoIds[symbol];
              setTokenMetadata(prev => ({
                ...prev,
                [id]: {
                  ...(prev[id] || {}),
                  image: bestMatch.large,
                  symbol: symbol.toUpperCase(),
                  name: bestMatch.name || prev[id]?.name || symbol.toUpperCase()
                }
              }));
              
              // Remove from missing list
              const index = missingIconTokens.indexOf(cryptoIds[symbol]);
              if (index > -1) {
                missingIconTokens.splice(index, 1);
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
      if (missingIconTokens.length > 0) {
        await fetchTokenMetadata(missingIconTokens);
      }
    }
    
    return missingIconTokens.length;
  };

  // Enhanced token metadata fetching with better rate limit handling and fallbacks
  const fetchTokenMetadata = useCallback(async (specificTokens?: string[]) => {
    try {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION) {
        console.log('Reached maximum metadata requests per session, using cached data only');
        return;
      }
      
      // Check if CoinGecko API is available
      if (!apiStatus.current.coinGeckoAvailable) {
        const resetTime = apiStatus.current.coinGeckoResetTime;
        if (resetTime && resetTime > Date.now()) {
          console.log(`CoinGecko API rate limited, will retry after ${new Date(resetTime).toLocaleTimeString()}`);
          return;
        }
        // Reset availability if the reset time has passed
        apiStatus.current.coinGeckoAvailable = true;
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
        const aIsDefault = Object.values(defaultCryptoIds).includes(a);
        const bIsDefault = Object.values(defaultCryptoIds).includes(b);
        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        
        const aIsPopular = POPULAR_TOKENS.includes(a);
        const bIsPopular = POPULAR_TOKENS.includes(b);
        if (aIsPopular && !bIsPopular) return -1;
        if (!aIsPopular && bIsPopular) return 1;
        return 0;
      });
      
      // Split into smaller chunks of 20 (reduced from 25 to be more conservative with API limits)
      const chunks: string[][] = [];
      for (let i = 0; i < prioritizedTokens.length; i += 20) {
        chunks.push(prioritizedTokens.slice(i, i + 20));
      }
      
      // Process chunks sequentially to respect rate limits
      const newMetadata = { ...cachedMetadata };
      
      // Process only the first chunk immediately, queue the rest for later
      if (chunks.length > 0) {
        const firstChunk = chunks[0];
        try {
          // Increment the metadata request counter
          metadataRequestCount.current += 1;
          
          const response = await axios.get(`${API_BASE}/coins/markets`, {
            params: {
              vs_currency: 'usd',
              ids: firstChunk.join(','),
              per_page: 20,
              page: 1,
              sparkline: false,
              locale: 'en'
            },
            timeout: 10000,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          
          if (response.data && Array.isArray(response.data)) {
            response.data.forEach(token => {
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
          
          // Save to cache
          localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify({
            data: newMetadata,
            timestamp: Date.now()
          }));
          
          // Reset CoinGecko API status
          apiStatus.current.coinGeckoAvailable = true;
          apiStatus.current.coinGeckoResetTime = null;
          
          // Process remaining chunks with delay, but only if we haven't reached the limit
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION) {
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
            }, 6000); // Wait 6 seconds before processing next chunk (increased from 5s)
          }
        } catch (error: any) {
          console.error('Error fetching token metadata chunk:', error);
          
          // Handle rate limiting
          if (error.response && error.response.status === 429) {
            apiStatus.current.coinGeckoAvailable = false;
            
            // Parse retry-after header if available
            const retryAfter = error.response.headers['retry-after'];
            const millisToWait = getMillisToWait(retryAfter);
            
            apiStatus.current.coinGeckoResetTime = Date.now() + millisToWait;
            
            console.log(`CoinGecko API rate limited, will retry after ${new Date(apiStatus.current.coinGeckoResetTime).toLocaleTimeString()}`);
            
            // Schedule retry after the rate limit expires
            setTimeout(() => {
              apiStatus.current.coinGeckoAvailable = true;
              apiStatus.current.coinGeckoResetTime = null;
              
              // Retry with a smaller batch
              if (specificTokens && specificTokens.length > 0) {
                fetchTokenMetadata(specificTokens.slice(0, 10));
              }
            }, millisToWait + 1000); // Add 1 second buffer
          }
          
          // Continue with next chunk even if this one fails
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION) {
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
            }, 10000); // Wait longer (10s) before trying next chunk after an error
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchTokenMetadata:', error);
    }
  }, [cryptoIds, tokenMetadata, cacheTokenIcon, getMillisToWait]);
  
  // Enhanced function to process remaining metadata chunks with proper delays and error handling
  const processRemainingMetadataChunks = async (
    chunks: string[][],
    existingMetadata: Record<string, any>
  ) => {
    const newMetadata = { ...existingMetadata };
    
    for (let i = 0; i < chunks.length; i++) {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION) {
        console.log('Reached maximum metadata requests per session, stopping further requests');
        break;
      }
      
      // Check if CoinGecko API is available
      if (!apiStatus.current.coinGeckoAvailable) {
        const resetTime = apiStatus.current.coinGeckoResetTime;
        if (resetTime && resetTime > Date.now()) {
          console.log(`CoinGecko API rate limited, will retry after ${new Date(resetTime).toLocaleTimeString()}`);
          
          // Schedule retry after the rate limit expires
          setTimeout(() => {
            apiStatus.current.coinGeckoAvailable = true;
            apiStatus.current.coinGeckoResetTime = null;
            
            // Retry with remaining chunks
            if (chunks.length > i) {
              processRemainingMetadataChunks(chunks.slice(i), newMetadata);
            }
          }, resetTime - Date.now() + 1000); // Add 1 second buffer
          
          break;
        }
        // Reset availability if the reset time has passed
        apiStatus.current.coinGeckoAvailable = true;
      }
      
      const chunk = chunks[i];
      try {
        // Add exponential backoff between chunks
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 6000 * (i + 1)));
        }
        
        // Increment the metadata request counter
        metadataRequestCount.current += 1;
        
        const response = await axios.get(`${API_BASE}/coins/markets`, {
          params: {
            vs_currency: 'usd',
            ids: chunk.join(','),
            per_page: 20,
            page: 1,
            sparkline: false,
            locale: 'en'
          },
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach(token => {
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
          
          // Save to cache after each successful batch
          localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify({
            data: newMetadata,
            timestamp: Date.now()
          }));
        }
      } catch (error: any) {
        console.error(`Error fetching token metadata chunk ${i + 1}:`, error);
        
        // Handle rate limiting
        if (error.response && error.response.status === 429) {
          apiStatus.current.coinGeckoAvailable = false;
          
          // Parse retry-after header if available
          const retryAfter = error.response.headers['retry-after'];
          const millisToWait = getMillisToWait(retryAfter);
          
          apiStatus.current.coinGeckoResetTime = Date.now() + millisToWait;
          
          console.log(`CoinGecko API rate limited, will retry after ${new Date(apiStatus.current.coinGeckoResetTime).toLocaleTimeString()}`);
          
          // Schedule retry after the rate limit expires
          setTimeout(() => {
            apiStatus.current.coinGeckoAvailable = true;
            apiStatus.current.coinGeckoResetTime = null;
            
            // Retry with remaining chunks
            if (chunks.length > i) {
              processRemainingMetadataChunks(chunks.slice(i), newMetadata);
            }
          }, millisToWait + 1000); // Add 1 second buffer
          
          break;
        }
        
        // Wait longer before trying the next chunk after an error
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  };

  // Enhanced getCachedPrices with localStorage fallback
  const getCachedPrices = () => {
    if (cache.current) {
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
    }
    
    // Try to load from localStorage if no memory cache
    try {
      const cachedPricesJson = localStorage.getItem(CACHE_STORAGE_KEY);
      if (cachedPricesJson) {
        const cachedData = JSON.parse(cachedPricesJson);
        if (cachedData && cachedData.timestamp && Date.now() - cachedData.timestamp < CACHE_DURATION) {
          cache.current = cachedData;
          return cachedData.prices;
        }
      }
    } catch (error) {
      console.error('Error loading cache from localStorage:', error);
    }
    
    return null;
  };

  // Enhanced setCachePrices with localStorage persistence
  const setCachePrices = (newPrices: Record<string, Record<string, number>>) => {
    const cacheData = {
      prices: newPrices,
      timestamp: Date.now()
    };
    
    cache.current = cacheData;
    
    // Persist to localStorage
    try {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving cache to localStorage:', error);
    }
  };

  const getCryptoId = useCallback((symbol: string) => {
    return cryptoIds[symbol];
  }, [cryptoIds]);

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
          
          // Reset retry count on success
          retryCount.current = 0;
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

  // Enhanced queuePriceUpdate with priority handling
  const queuePriceUpdate = useCallback((symbols: string[], highPriority: boolean = false) => {
    if (!symbols.length) return;
    
    clearDebounceTimer();
    clearUpdateTimeout();
    
    // Add symbols to the queue
    symbols.forEach(symbol => requestQueue.current.pendingSymbols.add(symbol));
    
    // Clear existing batch timer
    if (requestQueue.current.batchTimer) {
      clearTimeout(requestQueue.current.batchTimer);
    }
    
    // Start a new batch window - shorter for high priority updates
    const batchDelay = highPriority ? 100 : BATCH_WINDOW;
    requestQueue.current.batchTimer = setTimeout(() => {
      if (!requestQueue.current.isProcessing) {
        processBatchRequests();
      }
    }, batchDelay);
    
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

  // Enhanced addCryptos with immediate feedback, optimistic updates, and better metadata handling
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    if (!tokens.length) return;
    
    const newCryptoIds = { ...cryptoIds };
    const newSymbols: string[] = [];
    const storageIds = { ...cryptoIds };
    const newPrices = { ...prices };
    const highPrioritySymbols: string[] = [];
    const newTokenIds: string[] = [];
    
    // Create a dispatch event to notify all components of token additions
    const tokenUpdateEvent = new CustomEvent('cryptoTokensUpdated', {
      detail: { 
        action: 'add',
        tokens: tokens.map(t => t.symbol.toUpperCase())
      }
    });

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
        newTokenIds.push(lowerId);
        
        // Add to pending updates
        pendingPriceUpdates.current.add(upperSymbol);
        
        // Add placeholder price
        if (!newPrices[upperSymbol]) {
          newPrices[upperSymbol] = getEstimatedPrice(upperSymbol);
        }
        
        // Add to high priority list for immediate update
        highPrioritySymbols.push(upperSymbol);
        
        // Cache a minimal icon placeholder for immediate display
        const iconCacheKey = `${ICON_CACHE_PREFIX}${upperSymbol.toLowerCase()}`;
        if (!localStorage.getItem(iconCacheKey)) {
          // Create a simple data URI for the token's first letter
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
            
            const placeholderIcon = canvas.toDataURL();
            localStorage.setItem(iconCacheKey, placeholderIcon);
          }
        }
      }
    });
    
    // If no new tokens, return early
    if (newSymbols.length === 0) return;
    
    // Update prices with placeholders immediately
    setPrices(newPrices);
    
    // Save only custom tokens to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));
    
    // Immediately update cryptoIds and availableCryptos
    setCryptoIds(newCryptoIds);

    const defaultTokens = Object.keys(defaultCryptoIds);
    
    // Optimistic update for availableCryptos to ensure immediate UI update
    setAvailableCryptos(prev => {
      // Ensure we don't add duplicates and maintain sorting order
      const existingCustomTokens = prev.filter(token => !defaultTokens.includes(token));
      const allCustomTokens = [...new Set([...existingCustomTokens, ...newSymbols])].sort();
      return [...defaultTokens, ...allCustomTokens];
    });

    // Pre-populate metadata with basic info for immediate UI display
    const updatedMetadata = { ...tokenMetadata };
    tokens.forEach(({ symbol, id }) => {
      const upperSymbol = symbol.toUpperCase();
      const lowerId = id.toLowerCase();
      
      // Add minimal metadata if we don't have any yet
      if (!updatedMetadata[lowerId]) {
        updatedMetadata[lowerId] = {
          symbol: upperSymbol,
          name: upperSymbol, // Use symbol as fallback name until we fetch real data
          icon_fetching: true // Flag to indicate we're fetching the icon
        };
      }
    });
    
    // Update metadata state with a batched update
    setTokenMetadata(updatedMetadata);

    // Dispatch token update event to notify components
    window.dispatchEvent(tokenUpdateEvent);

    // Immediately try to fetch metadata for new tokens with high priority
    if (newTokenIds.length > 0) {
      try {
        // First check if we already have some metadata cached
        const cachedMetadata = { ...tokenMetadata };
        const missingTokenIds = newTokenIds.filter(id => !cachedMetadata[id]);
        
        if (missingTokenIds.length > 0) {
          // Prioritize fetching metadata for these tokens
          fetchTokenMetadata(missingTokenIds);
          
          // Also force an immediate check for icons
          setTimeout(checkAndUpdateMissingIcons, 50);
        }
      } catch (error) {
        console.error('Error pre-fetching token metadata:', error);
      }
    }

    // Queue high priority update for the new symbols with higher priority
    queuePriceUpdate(highPrioritySymbols, true);
    
    // Start a micro-batch of immediate UI updates to ensure dropdown reflects new tokens
    setTimeout(() => {
      // Force a metadata update for UI without waiting for API
      setTokenMetadata(currentMetadata => {
        const updatedMetadata = { ...currentMetadata };
        newTokenIds.forEach((id, index) => {
          if (updatedMetadata[id]) {
            // Ensure the metadata has required fields for UI rendering
            updatedMetadata[id] = {
              ...updatedMetadata[id],
              symbol: newSymbols[index],
              name: updatedMetadata[id].name || newSymbols[index],
              image: updatedMetadata[id].image || null
            };
          }
        });
        return updatedMetadata;
      });
      
      // Dispatch another update event after metadata is updated
      window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));
      
      // Trigger a price update after minimal delay
      updatePrices(true);
    }, 100);
  }, [cryptoIds, prices, queuePriceUpdate, fetchTokenMetadata, tokenMetadata, checkAndUpdateMissingIcons, updatePrices]);

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

  // Preload default token icons
  const preloadDefaultTokenIcons = useCallback(async () => {
    // Only preload if we don't have the icons cached already
    const defaultTokens = Object.keys(defaultCryptoIds);
    const defaultTokenIds = Object.values(defaultCryptoIds);
    
    // Check which default tokens need icon preloading
    const tokensNeedingIcons = defaultTokens.filter(symbol => {
      const iconCacheKey = `${ICON_CACHE_PREFIX}${symbol.toLowerCase()}`;
      return !localStorage.getItem(iconCacheKey);
    });
    
    if (tokensNeedingIcons.length === 0) {
      return; // All icons are already cached
    }
    
    // Fetch metadata for default tokens
    try {
      const response = await axios.get(`${API_BASE}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          ids: defaultTokenIds.join(','),
          per_page: defaultTokenIds.length,
          page: 1,
          sparkline: false,
          locale: 'en'
        },
        timeout: 10000
      });
      
      if (response.data && Array.isArray(response.data)) {
        const newMetadata = { ...tokenMetadata };
        
        response.data.forEach(token => {
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
        
        // Save to cache
        localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify({
          data: newMetadata,
          timestamp: Date.now()
        }));
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
      clearDebounceTimer();
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
        defaultCryptoIds,
        checkAndUpdateMissingIcons,
        setTokenMetadata
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
