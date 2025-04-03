import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
const MIN_API_INTERVAL = 30 * 1000; // 30 seconds between API calls (free tier limit)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds base delay for retries
const BATCH_WINDOW = 500; // 500ms batch window (reduced from 1s)
const MAX_BATCH_SIZE = 25; // Maximum number of tokens to request in a single batch
const PRELOAD_POPULAR_TOKENS = true; // Enable preloading of popular tokens
const CACHE_STORAGE_KEY = 'cryptovertx-price-cache';
const METADATA_CACHE_KEY = 'cryptovertx-metadata-cache';
const METADATA_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days for metadata (increased from 7)
const ICON_CACHE_PREFIX = 'crypto_icon_';
const MAX_METADATA_REQUESTS_PER_SESSION = 1000; // Limit metadata API calls per session

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

// API configuration for 2025
const API_CONFIG = {
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3',
    FALLBACK_URLS: [
      'https://api.coingecko.com/api/v3',
      'https://coingecko.azurewebsites.net/api/proxy',
      'https://api.coincap.io/v2'
    ],
    CACHE_DURATION: 10 * 60 * 1000, // 10 minutes
    BATCH_SIZE: 25,
    REQUEST_SPACING: 500, // milliseconds between requests
    RETRY_ATTEMPTS: 5
  },
  CRYPTOCOMPARE: {
    BASE_URL: 'https://data-api.cryptocompare.com/spot/v1/historical/hours',
    CACHE_DURATION: 15 * 60 * 1000 // 15 minutes
  }
};

// Enhanced API status tracker
interface ApiStatus {
  activeProviders: string[];
  providerIndex: number;
  lastRequestTime: number;
  consecutiveErrors: number;
}

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
  const requestQueue = useRef<RequestQueue>({
    pendingSymbols: new Set(),
    isProcessing: false,
    lastProcessed: 0,
    batchTimer: null
  });
  
  // Advanced API status tracking
  const apiStatus = useRef<ApiStatus>({
    activeProviders: ['coingecko', 'cryptocompare'],
    providerIndex: 0,
    lastRequestTime: 0,
    consecutiveErrors: 0
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
          if (!apiStatus.current.activeProviders.includes('coingecko')) {
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

  // Enhanced token metadata fetching with smart fallback handling
  const fetchTokenMetadata = useCallback(async (specificTokens?: string[]) => {
    try {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION) {
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
      
      // Split into smaller chunks to avoid overwhelming the API
      const chunks: string[][] = [];
      for (let i = 0; i < prioritizedTokens.length; i += API_CONFIG.COINGECKO.BATCH_SIZE) {
        chunks.push(prioritizedTokens.slice(i, i + API_CONFIG.COINGECKO.BATCH_SIZE));
      }
      
      // Process chunks sequentially with smart retries
      const newMetadata = { ...cachedMetadata };
      
      // Process the first chunk immediately
      if (chunks.length > 0) {
        const firstChunk = chunks[0];
        try {
          // Increment the metadata request counter
          metadataRequestCount.current += 1;
          
          const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, {
            params: {
              vs_currency: 'usd',
              ids: firstChunk.join(','),
              per_page: API_CONFIG.COINGECKO.BATCH_SIZE,
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
            response.data.forEach((token: any) => {
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
          
          // Reset error count on success
          apiStatus.current.consecutiveErrors = 0;
          
          // Process remaining chunks with intelligent spacing
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION) {
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * 12); // Larger spacing between batch groups
          }
        } catch (error) {
          // Increment consecutive errors
          apiStatus.current.consecutiveErrors++;
          
          // Try with a smaller batch or alternate provider
          if (specificTokens && specificTokens.length > 0) {
            setTimeout(() => {
              // Try with a smaller batch
              const smallerBatch = specificTokens.slice(0, 10);
              fetchTokenMetadata(smallerBatch);
            }, API_CONFIG.COINGECKO.REQUEST_SPACING * apiStatus.current.consecutiveErrors);
          }
          
          // Process remaining chunks with an intelligent backoff
          if (chunks.length > 1 && metadataRequestCount.current < MAX_METADATA_REQUESTS_PER_SESSION) {
            setTimeout(() => {
              processRemainingMetadataChunks(chunks.slice(1), newMetadata);
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
    existingMetadata: Record<string, any>
  ) => {
    const newMetadata = { ...existingMetadata };
    
    for (let i = 0; i < chunks.length; i++) {
      // Check if we've exceeded the maximum number of metadata requests for this session
      if (metadataRequestCount.current >= MAX_METADATA_REQUESTS_PER_SESSION) {
        break;
      }
      
      const chunk = chunks[i];
      try {
        // Add intelligent spacing between requests - increasing with consecutive successful requests
        if (i > 0) {
          const baseDelay = API_CONFIG.COINGECKO.REQUEST_SPACING * 6;
          const adaptiveDelay = Math.min(baseDelay * (i + 1), 10000); // Cap at 10 seconds
          await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
        }
        
        // Increment the metadata request counter
        metadataRequestCount.current += 1;
        
        // Use smart retry function to attempt different providers
        const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, {
          params: {
            vs_currency: 'usd',
            ids: chunk.join(','),
            per_page: API_CONFIG.COINGECKO.BATCH_SIZE,
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
          response.data.forEach((token: any) => {
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
          
          // Reset consecutive errors on success
          apiStatus.current.consecutiveErrors = 0;
        }
      } catch (error) {
        // Track consecutive errors for exponential backoff
        apiStatus.current.consecutiveErrors++;
        
        // Wait longer before trying the next chunk after an error
        const errorBackoff = Math.min(10000 * apiStatus.current.consecutiveErrors, 30000);
        await new Promise(resolve => setTimeout(resolve, errorBackoff));
      }
    }
  };

  // Smart retry function that tries different API providers
  const fetchWithSmartRetry = async (url: string, config: any): Promise<any> => {
    let lastError;
    const maxRetries = API_CONFIG.COINGECKO.RETRY_ATTEMPTS;
    
    // Ensure we start with CoinGecko for every new request sequence
    const initialProvider = 'coingecko';
    const initialProviderIndex = apiStatus.current.activeProviders.indexOf(initialProvider);
    
    // If our current provider is not CoinGecko, reset it
    if (apiStatus.current.providerIndex !== initialProviderIndex && initialProviderIndex >= 0) {
      apiStatus.current.providerIndex = initialProviderIndex;
    }
    
    // Track which providers we've already tried for this request
    const triedProviders = new Set<string>();
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use the current provider index
        const currentProvider = apiStatus.current.activeProviders[apiStatus.current.providerIndex];
        triedProviders.add(currentProvider);
        
        // If we're not using the primary provider, adjust the URL
        let targetUrl = url;
        if (apiStatus.current.providerIndex > 0) {
          // For fallback providers, adjust the URL or parameters as needed
          if (currentProvider === 'cryptocompare') {
            // Check if we're fetching currency prices (simple/price endpoint)
            const isSimplePrice = url.includes('/simple/price');
            const isMarketData = url.includes('/coins/markets');
            
            if (isSimplePrice || isMarketData) {
              try {
                // Use CryptoCompare as fallback
                const fallbackResponse = await fallbackToCryptoCompare(config.params.ids, isSimplePrice);
                
                // If we got valid data and this was a success, increment success counter
                if (fallbackResponse && fallbackResponse.data && 
                   (Array.isArray(fallbackResponse.data) || Object.keys(fallbackResponse.data).length > 0)) {
                  // Success with fallback - but immediately reset to CoinGecko for next time
                  setTimeout(() => {
                    if (initialProviderIndex >= 0) {
                      apiStatus.current.providerIndex = initialProviderIndex;
                    }
                  }, 0);
                  
                  return fallbackResponse;
                } else {
                  throw new Error('Empty response from fallback API');
                }
              } catch (fallbackError) {
                console.warn('Fallback to CryptoCompare failed, trying another method');
                // If CryptoCompare fallback fails, try proxy or return to CoinGecko
                // This prevents getting stuck in the CryptoCompare provider
                apiStatus.current.providerIndex = initialProviderIndex;
                // Continue to the next attempt
                continue;
              }
            }
          } else {
            // Use an alternative proxy URL
            const fallbackIndex = apiStatus.current.providerIndex - 1;
            targetUrl = API_CONFIG.COINGECKO.FALLBACK_URLS[fallbackIndex] || url;
          }
        }
        
        // Space out requests intelligently
        const now = Date.now();
        const timeSinceLastRequest = now - apiStatus.current.lastRequestTime;
        const minSpacingTime = API_CONFIG.COINGECKO.REQUEST_SPACING;
        
        if (timeSinceLastRequest < minSpacingTime) {
          await new Promise(resolve => setTimeout(resolve, minSpacingTime - timeSinceLastRequest));
        }
        
        // Make the request
        const response = await axios.get(targetUrl, config);
        
        // Update last request time
        apiStatus.current.lastRequestTime = Date.now();
        
        // Reset error count on success
        apiStatus.current.consecutiveErrors = 0;
        
        // On successful request, ensure we return to CoinGecko for the next request
        // But only do this if we're not already using CoinGecko
        if (currentProvider !== initialProvider && initialProviderIndex >= 0) {
          setTimeout(() => {
            apiStatus.current.providerIndex = initialProviderIndex;
          }, 0);
        }
        
        return response;
      } catch (error: any) {
        lastError = error;
        
        // Check if all providers have been tried
        if (triedProviders.size >= apiStatus.current.activeProviders.length) {
          // If all providers failed, reset to CoinGecko for next time
          if (initialProviderIndex >= 0) {
            apiStatus.current.providerIndex = initialProviderIndex;
          }
          
          // Try with a larger exponential backoff before giving up
          const finalBackoff = API_CONFIG.COINGECKO.REQUEST_SPACING * Math.pow(2, attempt + 1);
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, finalBackoff));
            
            // Clear tried providers to give them another chance with more delay
            triedProviders.clear();
            continue;
          }
          
          break;
        }
        
        // Try the next provider for the next attempt
        apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length;
        
        // Add exponential backoff
        const backoffTime = Math.min(API_CONFIG.COINGECKO.REQUEST_SPACING * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
    
    // Always reset to CoinGecko after all retries
    if (initialProviderIndex >= 0) {
      apiStatus.current.providerIndex = initialProviderIndex;
    }
    
    // If all retries failed, throw the last error
    throw lastError || new Error('All API attempts failed');
  };

  // Fallback to CryptoCompare API when CoinGecko is unavailable
  const fallbackToCryptoCompare = async (coinIds: string, isSimplePrice: boolean = true): Promise<any> => {
    // Convert CoinGecko IDs to symbols
    const allIds = coinIds.split(',');
    const symbols = allIds.map(id => {
      // Find the symbol for this ID by looking through cryptoIds
      const symbol = Object.keys(cryptoIds).find(
        sym => cryptoIds[sym].toLowerCase() === id.toLowerCase()
      );
      return symbol || id; // Fall back to using the ID if symbol not found
    });
    
    // A set of commonly supported symbols on CryptoCompare
    const commonSymbols = new Set([
      'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'ADA', 'DOGE', 'SOL', 'DOT',
      'AVAX', 'MATIC', 'SHIB', 'LINK', 'LTC', 'UNI', 'ATOM', 'XLM', 'NEAR'
    ]);
    
    // Filter symbols to only include those that are more likely to be supported
    // Skip long symbols, lowercase symbols, and very new or obscure tokens
    const likelySymbols = symbols.filter(symbol => {
      if (!symbol) return false;
      
      const upperSymbol = symbol.toUpperCase();
      
      // Always include common tokens
      if (commonSymbols.has(upperSymbol)) return true;
      
      // Skip symbols that are likely to be unsupported
      // - Very long symbols are often newer tokens
      // - Symbols with special characters
      // - Lowercase symbols are often newer tokens
      if (symbol.length > 5) return false;
      if (/[^A-Z0-9]/.test(upperSymbol)) return false;
      
      return true;
    });
    
    if (likelySymbols.length === 0) {
      // If no likely symbols, fail fast - throw error to try another provider
      throw new Error('No supported symbols for CryptoCompare');
    }
    
    // Fetch data from CryptoCompare
    const results = [];
    const priceData: Record<string, any> = {};
    
    for (const symbol of likelySymbols) {
      try {
        const upperSymbol = symbol.toUpperCase();
        const response = await axios.get(API_CONFIG.CRYPTOCOMPARE.BASE_URL, {
          params: {
            market: 'binance',
            instrument: `${upperSymbol}-USDT`,
            limit: 1,
            aggregate: 1,
            fill: 'true',
            apply_mapping: 'true',
            response_format: 'JSON',
            api_key: import.meta.env.VITE_CRYPTOCOMPARE_API_KEY || ''
          },
          timeout: 6000 // Shorter timeout for fallback
        });
        
        if (response.data?.Data?.[0]) {
          const price = parseFloat(response.data.Data[0].CLOSE);
          
          if (isSimplePrice) {
            // For simple/price endpoint, format as CoinGecko expects
            const id = cryptoIds[symbol];
            if (id) {
              priceData[id] = {
                usd: price,
                eur: price * 0.92, // Approximate conversion
                cad: price * 1.36  // Approximate conversion
              };
            }
          } else {
            // For coins/markets endpoint, format as needed
            const id = cryptoIds[symbol];
            const data = {
              id: id,
              symbol: symbol,
              name: symbol,
              current_price: price,
              image: null,
              market_cap_rank: null
            };
            results.push(data);
          }
        }
      } catch (error) {
        // Silent catch - just continue with next symbol
        continue;
      }
    }
    
    // If we got no results, throw an error to try another provider
    if (isSimplePrice && Object.keys(priceData).length === 0) {
      throw new Error('No valid price data from CryptoCompare');
    }
    
    if (!isSimplePrice && results.length === 0) {
      throw new Error('No valid market data from CryptoCompare');
    }
    
    // Return in the format expected from CoinGecko
    return isSimplePrice 
      ? { data: priceData } 
      : { data: results };
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

  // Updated error handling with smart fallback system to remove unused apiName parameter
  const handleApiError = useCallback((err: any) => {
    let retryDelay = RETRY_DELAY;
    
    if (axios.isAxiosError(err)) {
      // Silently handle rate limit errors without showing to user
      if (err.response?.status === 429) {
        retryDelay = MIN_API_INTERVAL * 2;
        
        // Try a different provider
        apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length;
      } else if (err.code === 'ECONNABORTED') {
        retryDelay = RETRY_DELAY;
        
        // Try a different provider
        apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length;
      }
    }

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
      let requestSuccessful = false;

      try {
        // Use smart retry function that tries multiple providers
        const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, {
          params: {
            ids: relevantIds.join(','),
            vs_currencies: 'usd,eur,cad',
            precision: 18
          },
          timeout: 10000
        });
        
        priceData = response.data;
        lastApiCall.current = Date.now();
        requestSuccessful = true;
      } catch (error) {
        // Error is already handled in fetchWithSmartRetry
        apiStatus.current.consecutiveErrors++;
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
        } else if (!requestSuccessful) {
          // Use estimated prices for failed requests
          newPrices[symbol] = getEstimatedPrice(symbol);
        }
        // Remove from pending updates
        pendingPriceUpdates.current.delete(symbol);
      });

      setPrices(newPrices);
      setCachePrices(newPrices);
      setLastUpdated(new Date());
      
      // Reset error indicators on success
      if (requestSuccessful) {
        setError(null);
        retryCount.current = 0;
        apiStatus.current.consecutiveErrors = 0;
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
      // Intelligent retry with exponential backoff
      const errorMultiplier = Math.min(apiStatus.current.consecutiveErrors + 1, 5);
      const retryDelay = MIN_API_INTERVAL * errorMultiplier;
      
      apiStatus.current.consecutiveErrors++;
      
      if (retryCount.current <= MAX_RETRIES) {
        retryCount.current++;
        updateTimeout.current = setTimeout(() => {
          requestQueue.current.isProcessing = false;
          processBatchRequests();
        }, retryDelay);
      } else {
        // Max retries reached, clear queue and reset
        const failedSymbols = Array.from(requestQueue.current.pendingSymbols);
        failedSymbols.forEach(symbol => pendingPriceUpdates.current.delete(symbol));
        requestQueue.current.isProcessing = false;
        retryCount.current = 0;
      }
    } finally {
      setLoading(false);
      requestQueue.current.lastProcessed = Date.now();
    }
  }, [cryptoIds, handleApiError]);

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
    const batchDelay = highPriority ? 100 : BATCH_WINDOW;
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

  // Modified addCrypto to use the queue system with immediate updates and no loading indicators
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

    // Update state with the new token immediately - do not show as pending
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

    // Add placeholder price immediately with more realistic value
    setPrices(prev => {
      // Create a more realistic price estimate based on token symbol patterns
      const estimatedPrice = getEstimatedPrice(upperSymbol);
      return {
        ...prev,
        [upperSymbol]: estimatedPrice
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
      const response = await axios.get(`${API_BASE}/simple/price`, {
        params: {
          ids: lowerId,
          vs_currencies: 'usd,eur,cad',
          precision: 'full'
        },
        timeout: 5000 // Short timeout for faster response
      });
      
      if (response.data && response.data[lowerId]) {
        // Update prices with actual API data
        setPrices(prev => ({
          ...prev,
          [upperSymbol]: response.data[lowerId]
        }));
        
        // Update cache with new data
        const cachedPrices = getCachedPrices() || {};
        cachedPrices[upperSymbol] = response.data[lowerId];
        setCachePrices(cachedPrices);
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
  }, [cryptoIds, queuePriceUpdate, fetchTokenMetadata, getCachedPrices, setCachePrices]);

  // Enhanced addCryptos with instantaneous updates and no loading indicators
  const addCryptos = useCallback(async (tokens: { symbol: string; id: string }[]) => {
    if (!tokens.length) return;
    
    const newCryptoIds = { ...cryptoIds };
    const newSymbols: string[] = [];
    const storageIds = { ...cryptoIds };
    const newPrices = { ...prices };
    const highPrioritySymbols: string[] = [];
    const newTokenIds: string[] = [];
    
    // Create a dispatch event to notify all components of token additions immediately
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
            
            const dataUrl = canvas.toDataURL('image/png');
            // Cache the placeholder icon temporarily
            localStorage.setItem(iconCacheKey, dataUrl);
          }
        }
      }
    });
    
    // No actual changes made
    if (newSymbols.length === 0) return;
    
    // Update state with all new tokens at once 
    setCryptoIds(newCryptoIds);
    
    // Update available cryptos list
    setAvailableCryptos(prev => {
      const defaultTokens = Object.keys(defaultCryptoIds);
      // Get existing custom tokens, but filter out any that might already exist
      const existingCustomTokens = prev.filter(token =>
        !defaultTokens.includes(token) && !newSymbols.includes(token)
      );

      // All custom tokens (old and new) sorted alphabetically
      const allCustomTokens = [...existingCustomTokens, ...newSymbols].sort();

      // Return with default tokens first, then custom tokens
      return [...defaultTokens, ...allCustomTokens];
    });
    
    // Set initial prices
    setPrices(newPrices);
    
    // Save custom tokens to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));
    
    // Immediately dispatch the event to update UI components
    window.dispatchEvent(tokenUpdateEvent);
    
    // Queue immediate price update with high priority
    queuePriceUpdate(highPrioritySymbols, true);
    
    // Start fetching metadata immediately in the background
    setTimeout(async () => {
      await fetchTokenMetadata(newTokenIds);
      
      // Update token metadata to ensure UI shows proper symbols
      setTokenMetadata(updatedMetadata => {
        const newMetadata = { ...updatedMetadata };
        
        // Ensure each new token has at least minimal metadata
        newTokenIds.forEach((id, index) => {
          if (newMetadata[id]) {
            // Ensure the metadata has required fields for UI rendering
            newMetadata[id] = {
              ...newMetadata[id],
              symbol: newSymbols[index],
              name: newMetadata[id].name || newSymbols[index],
              image: newMetadata[id].image || null
            };
          }
        });
        return newMetadata;
      });
      
      // Dispatch another update event after metadata is updated
      window.dispatchEvent(new CustomEvent('cryptoMetadataUpdated'));
      
      // Trigger immediate price update
      updatePrices(true);
    }, 0);
  }, [cryptoIds, prices, queuePriceUpdate, fetchTokenMetadata, tokenMetadata, updatePrices]);

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
