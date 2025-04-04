import { useState, useCallback, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import axios, { AxiosError, CancelTokenSource } from 'axios';
import { useCrypto } from '../context/CryptoContext';

// Interfaces (Consider moving ICryptoResult to a shared types file)
export interface ICryptoResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap_rank?: number;
}

interface SearchCache {
  query: string;
  results: ICryptoResult[];
  timestamp: number;
}

export type ApiStatusType = 'available' | 'limited' | 'unavailable';

// API configuration (Consider moving to a shared constants file)
const API_CONFIG = {
  COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
  COINGECKO_PRO_BASE_URL: 'https://pro-api.coingecko.com/api/v3',
  BACKUP_API_URL: 'https://api.coincap.io/v2',
  CACHE_DURATION: 10 * 60 * 1000,
  RETRY_ATTEMPTS: 5,
  RETRY_DELAY: 1000,
  SEARCH_DEBOUNCE: 300,
  MAX_CACHE_ENTRIES: 50,
  COINGECKO_RATE_LIMIT: {
    FREE_TIER: { MAX_CALLS_PER_MINUTE: 10, COOLDOWN_PERIOD: 60 * 1000 },
    PRO_TIER: { MAX_CALLS_PER_MINUTE: 100, COOLDOWN_PERIOD: 60 * 1000 }
  },
  PROXY_URLS: [
    'https://api.coingecko.com/api/v3'
  ]
};

// API config specific to search - potentially different base/fallbacks
const SEARCH_API_CONFIG = {
  BASE_URL: 'https://api.coingecko.com/api/v3',
  // FALLBACK_URL: 'https://your-proxy-or-alternative-search-api.com', // Disabled for now
  TIMEOUT: 5000, // 5 seconds timeout for search requests
  RETRY_DELAY_BASE: 1000, // 1 second base delay
  MAX_RETRIES: 3 // Reduced max retries for search
};

export function useTokenSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<ICryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallbackApi, setUsingFallbackApi] = useState(false);
  const [currentProxyIndex, setCurrentProxyIndex] = useState(0);
  const [apiStatus, setApiStatus] = useState<ApiStatusType>('available');
  const { isApiRateLimited } = useCrypto();

  // Refs for internal state and logic
  const searchCache = useRef<Map<string, SearchCache>>(new Map());
  const searchAbortController = useRef<CancelTokenSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const lastApiCall = useRef<number>(0);
  const apiCallsThisMinute = useRef<number>(0);
  const apiRateLimitResetTime = useRef<number>(0);
  const apiKeyRef = useRef<string | null>(null);
  const coinGeckoRecoveryTimer = useRef<NodeJS.Timeout | null>(null);
  const lastFallbackTime = useRef<number>(0);

  // --- Effects --- 

  // API Key Loading & Rate Limit/Recovery Setup
  useEffect(() => {
    const savedApiKey = localStorage.getItem('coingecko_api_key'); // Replace with secure storage/env var if needed
    if (savedApiKey) {
      apiKeyRef.current = savedApiKey;
      const checkApiKey = async () => {
        try {
          await axios.get(`${API_CONFIG.COINGECKO_PRO_BASE_URL}/ping`, {
            headers: { 'x-cg-pro-api-key': savedApiKey },
            timeout: 5000
          });
          console.log('Valid CoinGecko Pro API key detected');
        } catch {
          console.log('Using free tier CoinGecko API');
        }
      };
      checkApiKey();
    }

    const rateLimitConfig = apiKeyRef.current ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
    const resetInterval = setInterval(() => { apiCallsThisMinute.current = 0; }, rateLimitConfig.COOLDOWN_PERIOD);
    
    const recoveryInterval = setInterval(() => {
      if (usingFallbackApi && Date.now() - lastFallbackTime.current > 5 * 60 * 1000) {
        console.log('Attempting to recover CoinGecko API connection...');
        setUsingFallbackApi(false); // Will attempt CoinGecko on next search
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(resetInterval);
      clearInterval(recoveryInterval);
      if (coinGeckoRecoveryTimer.current) clearTimeout(coinGeckoRecoveryTimer.current);
      searchAbortController.current?.cancel();
    };
  }, [usingFallbackApi]);

  // Clear results when search term is empty
   useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
      setError(null); // Clear errors when search is cleared
      setIsSearching(false); // Ensure searching state is reset
    }
  }, [searchTerm]);

  // --- Helper Functions (Internal to Hook) --- 

  const getCachedResults = useCallback((query: string): ICryptoResult[] | null => {
    if (!query.trim()) return null;
    const cached = searchCache.current.get(query.toLowerCase());
    if (!cached || (Date.now() - cached.timestamp > API_CONFIG.CACHE_DURATION)) {
      if (cached) searchCache.current.delete(query.toLowerCase());
      return null;
    }
    const validResults = cached.results.filter(r => r && r.id && r.symbol && r.name);
    return validResults.length > 0 ? validResults : null;
  }, []);

  const cacheResults = useCallback((query: string, resultsData: ICryptoResult[]) => {
    if (!query.trim()) return;
    const validResults = resultsData.filter(r => r && r.id && r.symbol && r.name);
    if (validResults.length === 0) return;

    searchCache.current.set(query.toLowerCase(), { query: query.toLowerCase(), results: validResults, timestamp: Date.now() });

    if (searchCache.current.size > API_CONFIG.MAX_CACHE_ENTRIES) {
      const entries = Array.from(searchCache.current.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const entriesToRemove = entries.slice(0, Math.floor(API_CONFIG.MAX_CACHE_ENTRIES * 0.2));
      entriesToRemove.forEach(([key]) => searchCache.current.delete(key));
    }
  }, []);

  const convertCoinCapResults = useCallback((data: any[]): ICryptoResult[] => {
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map(asset => {
      if (!asset || !asset.id || !asset.symbol) return null;
      return {
        id: asset.id,
        symbol: asset.symbol.toUpperCase(),
        name: asset.name || asset.id,
        image: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
        market_cap_rank: parseInt(asset.rank) || 9999
      };
    }).filter(Boolean) as ICryptoResult[];
  }, []);

  const isRateLimited = useCallback((): boolean => {
    const now = Date.now();
    if (apiRateLimitResetTime.current > 0) {
      if (now < apiRateLimitResetTime.current) return true;
      apiRateLimitResetTime.current = 0;
      apiCallsThisMinute.current = 0;
      return false;
    }
    const rateLimitConfig = apiKeyRef.current ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
    return apiCallsThisMinute.current >= rateLimitConfig.MAX_CALLS_PER_MINUTE;
  }, [apiKeyRef]);

  const trackApiCall = useCallback((resetAfter?: number): void => {
    apiCallsThisMinute.current++;
    lastApiCall.current = Date.now();
    const rateLimitConfig = apiKeyRef.current ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
    if (apiCallsThisMinute.current >= rateLimitConfig.MAX_CALLS_PER_MINUTE) {
      const cooldownTime = resetAfter ?? rateLimitConfig.COOLDOWN_PERIOD;
      apiRateLimitResetTime.current = Date.now() + cooldownTime;
      console.log(`Rate limit reached, cooling down for ${Math.ceil(cooldownTime / 1000)}s`);
    }
  }, [apiKeyRef]);

  const searchWithCoinGeckoApi = useCallback(async (query: string, signal: AbortSignal): Promise<ICryptoResult[]> => {
    if (isRateLimited()) throw new Error('Rate limit exceeded.');

    // Pro API attempt
    if (apiKeyRef.current) {
      try {
        const response = await axios.get(`${API_CONFIG.COINGECKO_PRO_BASE_URL}/search`, {
          params: { query },
          headers: { 'x-cg-pro-api-key': apiKeyRef.current },
          signal, timeout: 5000
        });
        trackApiCall();
        if (response.status === 200 && response.data?.coins) {
           return response.data.coins.slice(0, 10).map((coin: any) => ({ /* mapping */ id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name, image: coin.thumb || coin.large, market_cap_rank: coin.market_cap_rank || 9999 }));
        } else throw new Error('Invalid response from CoinGecko Pro API');
      } catch (error: any) {
        console.warn('CoinGecko Pro API failed:', error.message);
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.COOLDOWN_PERIOD;
            trackApiCall(waitTime);
            throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s.`);
        }
        // Fall through to free tier/proxies if Pro fails for other reasons
      }
    }

    // Free tier / Proxy attempt
    let proxyIdx = currentProxyIndex;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < API_CONFIG.PROXY_URLS.length; attempt++) {
      const targetUrl = API_CONFIG.PROXY_URLS[proxyIdx];
      const isDirect = targetUrl === API_CONFIG.COINGECKO_BASE_URL;
      const finalUrl = `${targetUrl}/search?query=${encodeURIComponent(query)}`;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (apiKeyRef.current && isDirect) headers['x-cg-demo-api-key'] = apiKeyRef.current;

      try {
        const response = await axios.get(finalUrl, { headers, signal, timeout: 5000 });
        trackApiCall();
        setCurrentProxyIndex((proxyIdx + 1) % API_CONFIG.PROXY_URLS.length);
         if (response.status === 200 && response.data?.coins) {
            return response.data.coins.slice(0, 10).map((coin: any) => ({ /* mapping */ id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name, image: coin.thumb || coin.large, market_cap_rank: coin.market_cap_rank || 9999 }));
        } else throw new Error('Invalid response from CoinGecko');
      } catch (error: any) {
        console.warn(`CoinGecko API attempt via ${targetUrl} failed:`, error.message);
        lastError = error;
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.COOLDOWN_PERIOD;
          trackApiCall(waitTime);
          throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s.`);
        }
        proxyIdx = (proxyIdx + 1) % API_CONFIG.PROXY_URLS.length;
      }
    }
    throw lastError || new Error('All CoinGecko API attempts failed');
  }, [isRateLimited, apiKeyRef, currentProxyIndex, trackApiCall]);

  const searchWithFallbackApi = useCallback(async (query: string, signal: AbortSignal): Promise<ICryptoResult[]> => {
    try {
      const response = await axios.get(`${API_CONFIG.BACKUP_API_URL}/assets`, {
        params: { search: query, limit: 10 },
        signal, timeout: 8000
      });
      if (!response.data?.data || !Array.isArray(response.data.data)) throw new Error('Invalid response from fallback API');
      return convertCoinCapResults(response.data.data);
    } catch (error: any) {
      console.error('Fallback API error:', error.message);
      throw new Error('Both primary and fallback APIs failed');
    }
  }, [convertCoinCapResults]);

  // --- Main Search Logic --- 

  const performSearch = useCallback(async (query: string) => {
    let lastError: any; // Declare lastError here

    if (!query) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      setApiStatus('available');
      return;
    }

    // Abort previous request if any
    if (searchAbortController.current) {
      searchAbortController.current.cancel('New search initiated');
    }
    searchAbortController.current = axios.CancelToken.source();

    setIsSearching(true);
    setError(null);
    setApiStatus('available'); // Assume available initially

    // *** Check shared rate limit status ***
    if (isApiRateLimited('coingecko')) {
      setError('Search temporarily unavailable due to API limits. Please try again shortly.');
      setIsSearching(false);
      setApiStatus('limited');
      setResults([]); // Clear results when rate limited
      return; // Stop processing if rate limited
    }

    let currentAttempt = 0;
    while (currentAttempt <= SEARCH_API_CONFIG.MAX_RETRIES) {
      try {
        const response = await axios.get(`${SEARCH_API_CONFIG.BASE_URL}/search`, {
          params: { query },
          cancelToken: searchAbortController.current.token,
          timeout: SEARCH_API_CONFIG.TIMEOUT
        });

        const searchData = response.data;
        if (searchData && searchData.coins) {
          const formattedResults = searchData.coins.map((coin: any) => ({
            id: coin.id,
            symbol: coin.symbol,
            name: coin.name,
            image: coin.large || coin.thumb
          }));
          setResults(formattedResults);
          setError(null);
          setApiStatus('available');
          setIsSearching(false);
          retryCountRef.current = 0; // Reset retry count on success
          return; // Success, exit the loop
        }
        // Handle case where response is ok but no coins found
        setResults([]);
        setError(null);
        setIsSearching(false);
        retryCountRef.current = 0;
        return;

      } catch (err: any) {
        if (axios.isCancel(err)) {
          console.log('Search request cancelled:', err.message);
          setIsSearching(false); // Ensure loading state is off if cancelled
          return; // Don't retry if cancelled
        }

        console.error(`Search attempt ${currentAttempt + 1} failed:`, err);
        lastError = err; // Store last error for final message
        currentAttempt++;

        // Specific handling for 429 Rate Limit error
        if (axios.isAxiosError(err) && err.response?.status === 429) {
          setError('Search API rate limit hit. Please wait before searching again.');
          setApiStatus('limited');
          setIsSearching(false);
          setResults([]); // Clear results on rate limit
          // No automatic retry for 429 on search, user needs to wait
          return;
        }

        if (currentAttempt <= SEARCH_API_CONFIG.MAX_RETRIES) {
          const delay = SEARCH_API_CONFIG.RETRY_DELAY_BASE * Math.pow(2, currentAttempt - 1);
          console.log(`Retrying search in ${delay}ms (attempt ${currentAttempt})`);
          await new Promise(resolve => { retryTimeoutRef.current = setTimeout(resolve, delay); });
        } else {
          // Max retries reached
          let finalErrorMessage = 'Search failed after multiple attempts.';
          if (lastError instanceof AxiosError && lastError.message) {
            finalErrorMessage = `Search failed: ${lastError.message}`;
          } else if (lastError instanceof Error) {
            finalErrorMessage = `Search failed: ${lastError.message}`;
          }
          setError(finalErrorMessage);
          setApiStatus('unavailable');
          setResults([]);
        }
      }
    } // End while loop

    setIsSearching(false); // Ensure loading state is off after all attempts

  }, [isApiRateLimited]); // Add dependency

  // --- Debounced Search Handler ---
  const debouncedSearch = useRef(
    debounce((query: string) => {
      performSearch(query);
    }, 500) // Keep debounce reasonable (e.g., 500ms)
  ).current;

  // --- Input Change Handler ---
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = event.target.value;
    setSearchTerm(newSearchTerm);
    if (newSearchTerm.trim()) {
      debouncedSearch(newSearchTerm.trim());
    } else {
      // Clear results and abort ongoing search if input is cleared
      if (searchAbortController.current) {
        searchAbortController.current.cancel('Search cleared');
      }
      setResults([]);
      setError(null);
      setIsSearching(false);
      setApiStatus('available');
      debouncedSearch.cancel(); // Cancel any pending debounced calls
    }
  };

  // --- Manual Retry Function ---
  const retrySearch = () => {
    if (searchTerm.trim()) {
      // *** Check rate limit BEFORE retrying ***
      if (isApiRateLimited('coingecko')) {
        // Optionally, calculate remaining time if needed, but a generic message is fine
        // const remainingCooldown = Math.ceil((apiStatus.current.rateLimitCooldownUntil - Date.now()) / 1000);
        setError('API rate limit is still active. Please wait a bit longer before retrying.');
        setApiStatus('limited');
        setIsSearching(false); // Ensure loading state is off
        return; // Don't proceed with retry
      }

      // Reset error and attempt search if rate limit is not active
      setError(null);
      retryCountRef.current = 0;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      performSearch(searchTerm.trim());
    }
  };

  // Cleanup timeouts and abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchAbortController.current) {
        searchAbortController.current.cancel('Component unmounted');
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  return {
    searchTerm,
    results,
    loading, // General loading state (e.g., for initial load or manual actions)
    isSearching, // More specific state for active search/debounce period
    error,
    apiStatus,
    retrySearch,
    handleSearchChange, // Expose the change handler
  };
} 