import { useState, useCallback, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import axios from 'axios';

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
    'https://api.coingecko.com/api/v3', 
    'https://corsproxy.org/?https://api.coingecko.com/api/v3', 
    'https://api.allorigins.win/raw?url=https://api.coingecko.com/api/v3'
  ]
};

export function useTokenSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<ICryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // Indicates active API call/debounce period
  const [error, setError] = useState<string | null>(null);
  const [usingFallbackApi, setUsingFallbackApi] = useState(false);
  const [currentProxyIndex, setCurrentProxyIndex] = useState(0);
  const [apiStatus, setApiStatus] = useState<ApiStatusType>('available');
  const [hasPaidPlan, setHasPaidPlan] = useState<boolean>(false);

  // Refs for internal state and logic
  const searchCache = useRef<Map<string, SearchCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCount = useRef<number>(0);
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
          setHasPaidPlan(true);
          console.log('Valid CoinGecko Pro API key detected');
        } catch {
          setHasPaidPlan(false);
          console.log('Using free tier CoinGecko API');
        }
      };
      checkApiKey();
    }

    const rateLimitConfig = hasPaidPlan ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
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
      abortControllerRef.current?.abort();
    };
  }, [usingFallbackApi, hasPaidPlan]);

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
    const rateLimitConfig = hasPaidPlan ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
    return apiCallsThisMinute.current >= rateLimitConfig.MAX_CALLS_PER_MINUTE;
  }, [hasPaidPlan]);

  const trackApiCall = useCallback((resetAfter?: number): void => {
    apiCallsThisMinute.current++;
    lastApiCall.current = Date.now();
    const rateLimitConfig = hasPaidPlan ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER;
    if (apiCallsThisMinute.current >= rateLimitConfig.MAX_CALLS_PER_MINUTE) {
      const cooldownTime = resetAfter ?? rateLimitConfig.COOLDOWN_PERIOD;
      apiRateLimitResetTime.current = Date.now() + cooldownTime;
      console.log(`Rate limit reached, cooling down for ${Math.ceil(cooldownTime / 1000)}s`);
    }
  }, [hasPaidPlan]);

  const searchWithCoinGeckoApi = useCallback(async (query: string, signal: AbortSignal): Promise<ICryptoResult[]> => {
    if (isRateLimited()) throw new Error('Rate limit exceeded.');

    // Pro API attempt
    if (hasPaidPlan && apiKeyRef.current) {
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
  }, [isRateLimited, hasPaidPlan, currentProxyIndex, trackApiCall]);

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
    if (!query.trim()) return;

    const cached = getCachedResults(query);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setIsSearching(false);
      setError(null);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setIsSearching(true); // Set searching state immediately
    setError(null);

    // Ensure minimum delay between API calls
    const now = Date.now();
    const timeSinceLast = now - lastApiCall.current;
    if (timeSinceLast < 1000) await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
    lastApiCall.current = Date.now();

    try {
      let searchResults: ICryptoResult[] = [];
      if (!usingFallbackApi) {
        try {
          setApiStatus('available');
          searchResults = await searchWithCoinGeckoApi(query, controller.signal);
          retryCount.current = 0;
          // Stay on CoinGecko if successful
        } catch (error: any) {
          console.warn('CoinGecko failed, switching to fallback:', error.message);
          setUsingFallbackApi(true);
          setApiStatus('unavailable');
          lastFallbackTime.current = Date.now();
          // Schedule potential recovery attempt
          if (coinGeckoRecoveryTimer.current) clearTimeout(coinGeckoRecoveryTimer.current);
          coinGeckoRecoveryTimer.current = setTimeout(() => setUsingFallbackApi(false), 10 * 60 * 1000);
          
          searchResults = await searchWithFallbackApi(query, controller.signal); 
        }
      } else {
        // Already using fallback
        setApiStatus('unavailable');
        searchResults = await searchWithFallbackApi(query, controller.signal);
        lastFallbackTime.current = Date.now(); // Update last fallback time
      }

      cacheResults(query, searchResults);
      setResults(searchResults);
      setError(null);
    } catch (error: any) {
      console.error('Search error:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          setError('API rate limit hit. Please wait a moment.'); setApiStatus('limited');
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          setError('Network timeout. Check connection.');
        } else {
          setError('Failed to fetch tokens. Please retry.');
        }
      } else if (error.name === 'AbortError') {
        return; // Aborted, do nothing
      } else {
        setError('An unexpected error occurred.');
      }

      // Retry logic
      if (retryCount.current < API_CONFIG.RETRY_ATTEMPTS) {
        retryCount.current++;
        const delay = API_CONFIG.RETRY_DELAY * Math.pow(2, retryCount.current - 1);
        console.log(`Search failed, retrying in ${delay}ms (attempt ${retryCount.current})`);
        setTimeout(() => performSearch(query), delay); 
      } else {
        // Max retries reached, potentially show cached if available
        const cachedFallback = getCachedResults(query);
        if (cachedFallback && cachedFallback.length > 0) {
          setResults(cachedFallback);
          setError('API issues. Showing cached results.');
        } else {
          setResults([]); // Ensure results are cleared if no cache
        }
      }
    } finally {
      setLoading(false);
      // Delay resetting isSearching slightly for smoother UI transition
      setTimeout(() => {
          // Check if the controller associated with this search is still the current one
          if (abortControllerRef.current === controller) {
             setIsSearching(false);
          }
      }, API_CONFIG.SEARCH_DEBOUNCE); // Align with debounce time
    }
  }, [
    usingFallbackApi, 
    getCachedResults, 
    cacheResults, 
    searchWithCoinGeckoApi, 
    searchWithFallbackApi
    // Dependencies are internal helpers or other state managed by the hook
  ]);

  // Debounced version of the search performer
  const debouncedSearch = useCallback(
    debounce((term: string) => {
      performSearch(term);
    }, API_CONFIG.SEARCH_DEBOUNCE),
    [performSearch] // performSearch is memoized with its dependencies
  );

  // --- Exposed Functions --- 

  // Function to manually trigger a retry (resets fallback state)
  const retrySearch = useCallback(() => {
    console.log('Manual retry initiated...');
    retryCount.current = 0; // Reset retry counter
    setUsingFallbackApi(false); // Attempt primary API again
    setError(null);
    performSearch(searchTerm);
  }, [searchTerm, performSearch]);

  // Handler for input changes
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = event.target.value;
    setSearchTerm(newSearchTerm);
    if (newSearchTerm.trim()) {
        setIsSearching(true); // Set searching immediately for input feedback
        debouncedSearch(newSearchTerm);
    } else {
        debouncedSearch.cancel(); // Cancel pending debounce calls
        abortControllerRef.current?.abort(); // Abort any active API call
        setIsSearching(false);
        setResults([]);
        setError(null);
    }
  }, [debouncedSearch]);


  return {
    searchTerm,
    results,
    loading, // General loading state (e.g., for initial load or manual actions)
    isSearching, // More specific state for active search/debounce period
    error,
    apiStatus,
    hasPaidPlan,
    retrySearch,
    handleSearchChange, // Expose the change handler
    // Potentially expose setSearchTerm if direct setting is needed externally
    // setSearchTerm 
  };
} 