import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

interface CryptoPriceData {
  price: number;
  change24h: number | null; // Can be null if API doesn't provide it
  low24h?: number | null; // New field for 24h low
  high24h?: number | null; // New field for 24h high
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
  defaultCryptoIds: { [key: string]: string };
  checkAndUpdateMissingIcons: () => Promise<number>;
  setTokenMetadata: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  isApiRateLimited: (apiName: 'coingecko' | 'cryptocompare') => boolean;
}

interface CacheData {
  prices: Record<string, Record<string, CryptoPriceData>>;
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
const LOW_HIGH_CACHE_DURATION = 60 * 60 * 1000; // 60 minutes

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
      // 'https://coingecko.azurewebsites.net/api/proxy', // Removed unreliable proxy
      // 'https://api.coincap.io/v2' // Temporarily disable coincap fallback for simplicity
    ],
    CACHE_DURATION: 10 * 60 * 1000, // 10 minutes
    BATCH_SIZE: 25,
    REQUEST_SPACING: 1000, // milliseconds between requests (increased from 500ms)
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
  rateLimitCooldownUntil: number; // Timestamp until which rate limit is active
}

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for crypto prices and loading status
  const [prices, setPrices] = useState<Record<string, Record<string, CryptoPriceData>>>({});
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
    activeProviders: ['coingecko'], // Simplified to only use coingecko for now
    providerIndex: 0,
    lastRequestTime: 0,
    consecutiveErrors: 0,
    rateLimitCooldownUntil: 0 // Initialize cooldown timestamp
  });
  
  // Track which symbols are pending price updates
  const pendingPriceUpdates = useRef<Set<string>>(new Set());

  // Add token metadata cache
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Track metadata API calls per session
  const metadataRequestCount = useRef<number>(0);

  const tokenIconCache = useRef<Record<string, string>>({});

  // Track when we last fetched low/high data for each symbol
  const lowHighLastFetch = useRef<Record<string, number>>({});

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
  const getEstimatedPrice = (symbol: string): Record<string, CryptoPriceData> => {
    const rates = CONVERSION_RATES[symbol] || CONVERSION_RATES.USDC;
    return {
      usd: { price: rates.usd, change24h: null },
      eur: { price: rates.eur, change24h: null },
      cad: { price: rates.cad, change24h: null },
    };
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

    // *** Add upfront rate limit check ***
    if (isApiRateLimited('coingecko')) {
      const cooldownSeconds = Math.ceil((apiStatus.current.rateLimitCooldownUntil - Date.now()) / 1000);
      console.warn(`[fetchWithSmartRetry] Rate limit active. Cooldown: ${cooldownSeconds}s. Aborting request.`);
      throw new Error(`API rate limit active. Please wait ${cooldownSeconds} seconds.`);
    }

    // Ensure we start with the primary provider (index 0)
    apiStatus.current.providerIndex = 0;
    const triedProviders = new Set<string>();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Check rate limit before each attempt inside the loop as well
      if (isApiRateLimited('coingecko')) {
        const cooldownSeconds = Math.ceil((apiStatus.current.rateLimitCooldownUntil - Date.now()) / 1000);
        console.warn(`[fetchWithSmartRetry] Rate limit active during retry. Cooldown: ${cooldownSeconds}s. Aborting.`);
        throw lastError || new Error(`API rate limit active during retry. Please wait ${cooldownSeconds} seconds.`);
      }

      try {
        const currentProvider = apiStatus.current.activeProviders[apiStatus.current.providerIndex];
        triedProviders.add(currentProvider);

        let targetUrl = url;
        // Simplified: Only use the primary URL for now (index 0)
        // Fallback logic removed for simplicity to address CORS/reliability issues
        if (apiStatus.current.providerIndex > 0) {
           console.warn('Fallback provider logic currently disabled.');
           // Skip to next attempt or break if only one provider
           if (apiStatus.current.activeProviders.length === 1) break;
           apiStatus.current.providerIndex = (apiStatus.current.providerIndex + 1) % apiStatus.current.activeProviders.length;
           continue; // Try next provider (if any) or fail
        }

        // Space out requests
        const now = Date.now();
        const timeSinceLastRequest = now - apiStatus.current.lastRequestTime;
        const minSpacingTime = API_CONFIG.COINGECKO.REQUEST_SPACING;
        if (timeSinceLastRequest < minSpacingTime) {
          await new Promise(resolve => setTimeout(resolve, minSpacingTime - timeSinceLastRequest));
        }

        // Make the request
        console.debug(`[fetchWithSmartRetry] Attempt ${attempt + 1}: GET ${targetUrl}`);
        const response = await axios.get(targetUrl, config);
        apiStatus.current.lastRequestTime = Date.now();
        apiStatus.current.consecutiveErrors = 0; // Reset errors on success
        return response; // Success

      } catch (error: any) {
        lastError = error;
        apiStatus.current.lastRequestTime = Date.now(); // Update time even on error
        apiStatus.current.consecutiveErrors++;
        console.error(`[fetchWithSmartRetry] Attempt ${attempt + 1} failed:`, error.message);

        // *** Specific 429 handling ***
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const cooldownDuration = MIN_API_INTERVAL * 2; // Cooldown for 60 seconds on 429
          apiStatus.current.rateLimitCooldownUntil = Date.now() + cooldownDuration;
          console.warn(`[fetchWithSmartRetry] Received 429. Rate limit cooldown activated for ${cooldownDuration / 1000}s.`);
          // Throw immediately on 429, don't cycle providers for this error
          throw new Error(`API rate limit hit (429). Cooldown active.`);
        }

        // Simplified: Only retry the primary provider with backoff
        // Fallback provider cycling removed
        if (attempt < maxRetries - 1) {
           const backoffTime = Math.min(API_CONFIG.COINGECKO.REQUEST_SPACING * Math.pow(2, attempt), 15000); // Max 15s backoff
           console.log(`[fetchWithSmartRetry] Waiting ${backoffTime}ms before retry...`);
           await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
           console.error(`[fetchWithSmartRetry] Max retries (${maxRetries}) reached. Failing request.`);
           break; // Max retries reached
        }
      }
    }

    // If loop finishes without success, throw the last recorded error
    console.error('[fetchWithSmartRetry] All attempts failed.');
    throw lastError || new Error('All API attempts failed after retries.');
  };

  // Enhanced getCachedPrices with localStorage fallback
  const getCachedPrices = (): Record<string, Record<string, CryptoPriceData>> | null => {
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
        const cachedData: CacheData = JSON.parse(cachedPricesJson);
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
  const setCachePrices = (newPrices: Record<string, Record<string, CryptoPriceData>>) => {
    const cacheData: CacheData = {
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

      // Determine which symbols need low/high data refresh
      const symbolsNeedingLowHigh = symbolsToProcess.filter(symbol => {
        const lastFetch = lowHighLastFetch.current[symbol] || 0;
        return now - lastFetch > LOW_HIGH_CACHE_DURATION;
      });

      // If any symbols need low/high data, use /coins/markets
      if (symbolsNeedingLowHigh.length > 0) {
        try {
          // Use /coins/markets to get full price data including low/high
          const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, {
            params: {
              vs_currency: 'usd',
              ids: relevantIds.join(','),
              per_page: MAX_BATCH_SIZE,
              page: 1,
              sparkline: false,
              price_change_percentage: '24h'
            },
            timeout: 10000
          });
          
          if (response.data && Array.isArray(response.data)) {
            // Convert array response to map for easier access
            const marketsData: Record<string, any> = {};
            response.data.forEach((coin: any) => {
              marketsData[coin.id] = coin;
            });
            
            priceData = marketsData;
            
            // Update lastFetch timestamps for all symbols that got low/high data
            symbolsNeedingLowHigh.forEach(symbol => {
              lowHighLastFetch.current[symbol] = now;
            });
          }
          
          lastApiCall.current = Date.now();
          requestSuccessful = true;
        } catch (error) {
          // Error is already handled in fetchWithSmartRetry
          apiStatus.current.consecutiveErrors++;
          
          // Fallback to /simple/price if /coins/markets fails
          try {
            const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, {
              params: {
                ids: relevantIds.join(','),
                vs_currencies: 'usd,eur,cad',
                include_24hr_change: true,
                precision: 'full'
              },
              timeout: 10000
            });
            
            priceData = response.data;
            lastApiCall.current = Date.now();
            requestSuccessful = true;
          } catch (fallbackError) {
            // Both attempts failed
            apiStatus.current.consecutiveErrors++;
          }
        }
      } else {
        // If no symbols need low/high, use simpler /simple/price endpoint
        try {
          const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, {
            params: {
              ids: relevantIds.join(','),
              vs_currencies: 'usd,eur,cad',
              include_24hr_change: true,
              precision: 'full'
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
      }

      // Update prices with merged data
      const existingPrices = getCachedPrices() || {};
      const newPrices = { ...existingPrices };

      symbolsToProcess.forEach(symbol => {
        const id = cryptoIds[symbol];
        const tokenPriceData = priceData[id]; // Get data for this specific crypto ID

        if (id && tokenPriceData) {
          if ('current_price' in tokenPriceData) {
            // Process data from /coins/markets
            const usdPrice = tokenPriceData.current_price;
            const usdChange = tokenPriceData.price_change_percentage_24h ?? null;
            const usdLow = tokenPriceData.low_24h ?? null;
            const usdHigh = tokenPriceData.high_24h ?? null;
            
            // We only have USD values from /coins/markets, convert for other currencies
            const ratioEUR = 0.92; // Approximate EUR/USD rate
            const ratioCAD = 1.36; // Approximate CAD/USD rate
            
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
            // Process data from /simple/price
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
                low24h: existingUsdData?.low24h ?? null,
                high24h: existingUsdData?.high24h ?? null
              },
              eur: { 
                price: eurPrice, 
                change24h: eurChange,
                low24h: existingEurData?.low24h ?? null,
                high24h: existingEurData?.high24h ?? null
              },
              cad: { 
                price: cadPrice, 
                change24h: cadChange,
                low24h: existingCadData?.low24h ?? null,
                high24h: existingCadData?.high24h ?? null
              }
            };
          }
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
      const estimatedPriceData = getEstimatedPrice(upperSymbol);
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
      const response = await axios.get(`${API_BASE}/simple/price`, {
        params: {
          ids: lowerId,
          vs_currencies: 'usd,eur,cad',
          precision: 'full',
          include_24hr_change: true
        },
        timeout: 5000 // Short timeout for faster response
      });
      
      if (response.data && response.data[lowerId]) {
        const data = response.data[lowerId];
        // Update prices with actual API data
        setPrices(prev => ({
          ...prev,
          [upperSymbol]: {
            usd: { price: data.usd, change24h: data.usd_24h_change ?? null },
            eur: { price: data.eur, change24h: data.eur_24h_change ?? null },
            cad: { price: data.cad, change24h: data.cad_24h_change ?? null },
          }
        }));
        
        // Update cache with new data
        const cachedPrices = getCachedPrices() || {};
        if (!cachedPrices[upperSymbol]) cachedPrices[upperSymbol] = {};
        cachedPrices[upperSymbol].usd = { price: data.usd, change24h: data.usd_24h_change ?? null };
        cachedPrices[upperSymbol].eur = { price: data.eur, change24h: data.eur_24h_change ?? null };
        cachedPrices[upperSymbol].cad = { price: data.cad, change24h: data.cad_24h_change ?? null };
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

    // *** Also trigger a price update specifically for the new token ***
    queuePriceUpdate([upperSymbol], true); // Ensure price (including % change) is fetched
  }, [cryptoIds, queuePriceUpdate, fetchTokenMetadata, getCachedPrices, setCachePrices, getEstimatedPrice]);

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

    Object.keys(defaultCryptoIds).forEach(key => {
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
        }
        highPrioritySymbols.push(upperSymbol);
        const iconCacheKey = `${ICON_CACHE_PREFIX}${upperSymbol.toLowerCase()}`;
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
      const defaultTokens = Object.keys(defaultCryptoIds);
      const existingCustomTokens = prev.filter(token =>
        !defaultTokens.includes(token) && !newSymbols.includes(token)
      );
      const allCustomTokens = [...existingCustomTokens, ...newSymbols].sort();
      return [...defaultTokens, ...allCustomTokens];
    });
    
    setPrices(newPrices);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storageIds));

    // Immediately dispatch the event to update UI components
    window.dispatchEvent(tokenUpdateEvent);

    // Queue immediate price update with high priority
    queuePriceUpdate(highPrioritySymbols, true);

    // Start fetching metadata immediately in the background, in controlled batches
    fetchMetadataInBatches(newTokenIds);
  }, [cryptoIds, prices, queuePriceUpdate, fetchTokenMetadata, tokenMetadata, getEstimatedPrice]);

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

  // Function to check if a specific API is currently rate-limited
  const isApiRateLimited = useCallback((apiName: 'coingecko' | 'cryptocompare'): boolean => {
    if (apiName === 'coingecko') {
      if (apiStatus.current.rateLimitCooldownUntil > Date.now()) {
        return true; // Cooldown is active
      }
      // Optional: Keep consecutive error check as a secondary fallback?
      // if (apiStatus.current.consecutiveErrors > 3) {
      //   return true;
      // }
    }
    // Add similar logic for cryptocompare if needed
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
        defaultCryptoIds,
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
