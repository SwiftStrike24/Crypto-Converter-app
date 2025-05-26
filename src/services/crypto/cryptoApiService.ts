import axios, { AxiosRequestConfig } from 'axios';
import {
  API_CONFIG,
  MIN_API_INTERVAL,
  COINGECKO_RATE_LIMIT_COOLDOWN,
  REQUEST_DEDUPLICATION_WINDOW,
  ADAPTIVE_BATCH_SIZE_MIN,
  ADAPTIVE_BATCH_SIZE_MAX,
  PRIORITY_REQUEST_DELAY,
  BACKGROUND_REQUEST_DELAY,
} from '../../constants/cryptoConstants';

// const { COINGECKO_BASE_URL } = API_CONFIG.COINGECKO; // Corrected below

// Enhanced ApiStatus interface with better rate limit tracking and performance metrics
interface ApiStatus {
  activeProviders: string[]; // Should primarily be COINGECKO
  providerIndex: number;
  lastRequestTime: number;
  consecutiveErrors: number;
  rateLimitCooldownUntil: number; // Enhanced: tracks when next request is allowed
  lastRateLimitHeaders: {
    remaining?: number;
    reset?: number;
    retryAfter?: number;
  };
  lastCoinGeckoRequestCompletionTime: number; // NEW: Track completion of any CoinGecko request
  // NEW: Performance tracking
  successfulRequests: number;
  totalRequests: number;
  averageResponseTime: number;
  currentBatchSize: number;
}

// NEW: Request deduplication tracking
interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
  requestHash: string;
}

// NEW: Request prioritization types
enum RequestPriority {
  HIGH = 'high',     // User-initiated actions (adding tokens, manual refresh)
  NORMAL = 'normal', // Regular batch updates
  LOW = 'low'        // Background updates, metadata fetching
}

// Initialize enhanced apiStatus for the service
let serviceApiStatus: ApiStatus = {
  activeProviders: ['coingecko'],
  providerIndex: 0,
  lastRequestTime: 0,
  consecutiveErrors: 0,
  rateLimitCooldownUntil: 0,
  lastRateLimitHeaders: {},
  lastCoinGeckoRequestCompletionTime: 0, // Initialize
  successfulRequests: 0,
  totalRequests: 0,
  averageResponseTime: 0,
  currentBatchSize: API_CONFIG.COINGECKO.BATCH_SIZE,
};

// NEW: Global request tracking
const pendingRequests: Map<string, PendingRequest> = new Map();

// NEW: Generate hash for request deduplication
function generateRequestHash(ids: string[], endpoint: string): string {
  return `${endpoint}:${ids.sort().join(',')}`;
}

// NEW: Clean up expired pending requests
function cleanupExpiredRequests(): void {
  const now = Date.now();
  for (const [hash, request] of pendingRequests) {
    if (now - request.timestamp > REQUEST_DEDUPLICATION_WINDOW) {
      pendingRequests.delete(hash);
    }
  }
}

// NEW: Adaptive batch size calculation based on success rate
function calculateOptimalBatchSize(): number {
  const successRate = serviceApiStatus.totalRequests > 0 
    ? serviceApiStatus.successfulRequests / serviceApiStatus.totalRequests 
    : 1;
    
  const currentSize = serviceApiStatus.currentBatchSize;
  
  if (successRate > 0.9 && currentSize < ADAPTIVE_BATCH_SIZE_MAX) {
    // High success rate - increase batch size
    return Math.min(currentSize + 5, ADAPTIVE_BATCH_SIZE_MAX);
  } else if (successRate < 0.7 && currentSize > ADAPTIVE_BATCH_SIZE_MIN) {
    // Low success rate - decrease batch size
    return Math.max(currentSize - 5, ADAPTIVE_BATCH_SIZE_MIN);
  }
  
  return currentSize;
}

// NEW: Get delay based on request priority
function getPriorityDelay(priority: RequestPriority): number {
  switch (priority) {
    case RequestPriority.HIGH:
      return PRIORITY_REQUEST_DELAY;
    case RequestPriority.NORMAL:
      return MIN_API_INTERVAL;
    case RequestPriority.LOW:
      return BACKGROUND_REQUEST_DELAY;
    default:
      return MIN_API_INTERVAL;
  }
}

export function isCoinGeckoApiRateLimited(): boolean {
  if (serviceApiStatus.rateLimitCooldownUntil > Date.now()) {
    const cooldownSeconds = Math.ceil((serviceApiStatus.rateLimitCooldownUntil - Date.now()) / 1000);
    console.warn(`🟢 [RATE_LIMIT] CoinGecko API rate limit active. Cooldown: ${cooldownSeconds}s remaining.`);
    return true;
  }
  return false;
}

export function getCoinGeckoRetryAfterSeconds(): number {
  if (serviceApiStatus.rateLimitCooldownUntil <= Date.now()) {
    return 0;
  }
  return Math.ceil((serviceApiStatus.rateLimitCooldownUntil - Date.now()) / 1000);
}

// Jittered delay utility to prevent thundering herd
function addJitter(delay: number, jitterPercent: number = 0.2): number {
  const jitterRange = delay * jitterPercent;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(100, delay + jitter); // Minimum 100ms
}

// Parse rate limit headers from CoinGecko response
function parseRateLimitHeaders(headers: any): void {
  try {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const retryAfter = headers['retry-after'];
    
    serviceApiStatus.lastRateLimitHeaders = {
      remaining: remaining ? parseInt(remaining, 10) : undefined,
      reset: reset ? parseInt(reset, 10) : undefined,
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
    };
    
    console.debug(`🔵 [RATE_LIMIT_HEADERS] Remaining: ${remaining}, Reset: ${reset}, Retry-After: ${retryAfter}`);
  } catch (error) {
    console.debug('🟡 [RATE_LIMIT_HEADERS] Failed to parse headers:', error);
  }
}

export async function fetchWithSmartRetry(url: string, config: AxiosRequestConfig, priority: RequestPriority = RequestPriority.NORMAL): Promise<any> {
  let lastError;
  const maxRetries = API_CONFIG.COINGECKO.RETRY_ATTEMPTS;
  const startTime = performance.now();
  
  // Clean up expired requests periodically
  cleanupExpiredRequests();
  
  // Generate request hash for deduplication
  const ids = config.params?.ids || '';
  const requestHash = generateRequestHash(ids.split(','), url);
  
  // Log API key presence (for diagnostics)
  const apiKey = import.meta.env.VITE_COINGECKO_API_KEY as string | undefined;
  if (url.includes(API_CONFIG.COINGECKO.BASE_URL)) { // Only for CoinGecko calls
    console.log(`🔵 [API_KEY_CHECK] CoinGecko API Key present: ${!!apiKey}. Length: ${apiKey ? apiKey.length : 0}`);
    if (apiKey && config.params) {
      config.params.x_cg_demo_api_key = apiKey;
    } else if (apiKey && !config.params) {
      config.params = { x_cg_demo_api_key: apiKey };
    }

    // NEW: Global throttle for CoinGecko requests
    const now = Date.now();
    const timeSinceLastCoinGeckoCompletion = now - serviceApiStatus.lastCoinGeckoRequestCompletionTime;
    const requiredSpacing = API_CONFIG.COINGECKO.REQUEST_SPACING; // Use the defined spacing

    if (timeSinceLastCoinGeckoCompletion < requiredSpacing) {
      const delayTime = requiredSpacing - timeSinceLastCoinGeckoCompletion;
      console.debug(`🔵 [GLOBAL_THROTTLE] Waiting ${delayTime}ms before next CoinGecko request (Priority: ${priority}).`);
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
  }

  // Check if this exact request is already pending
  const existingRequest = pendingRequests.get(requestHash);
  if (existingRequest) {
    console.debug(`🔄 [REQUEST_DEDUP] Reusing pending request: ${requestHash}`);
    return existingRequest.promise;
  }

  // Pre-emptive cooldown check - don't even attempt if rate limited
  if (isCoinGeckoApiRateLimited()) {
    const retrySeconds = getCoinGeckoRetryAfterSeconds();
    console.warn(`🟢 [RATE_LIMIT] Pre-check failed. API rate limited for ${retrySeconds}s. URL: ${url}`);
    throw new Error(`API rate limit active. Please wait ${retrySeconds}s.`);
  }

  // Create the actual request promise
  const requestPromise = (async () => {
    serviceApiStatus.totalRequests++;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Check rate limit before each attempt (could have been set by another concurrent call)
      if (isCoinGeckoApiRateLimited()) {
        const retrySeconds = getCoinGeckoRetryAfterSeconds();
        console.warn(`🟢 [RATE_LIMIT] Attempt ${attempt + 1} blocked. Rate limited for ${retrySeconds}s. URL: ${url}`);
        throw lastError || new Error(`API rate limit active during retry. Wait ${retrySeconds}s.`);
      }

      try {
        // Use priority-based delay
        const priorityDelay = getPriorityDelay(priority);
        const timeSinceLastRequest = Date.now() - serviceApiStatus.lastRequestTime;
        if (timeSinceLastRequest < priorityDelay) {
          const delayTime = priorityDelay - timeSinceLastRequest;
          console.debug(`🔵 [PRIORITY_DELAY] ${priority} priority request waiting ${delayTime}ms`);
          await new Promise(resolve => setTimeout(resolve, delayTime));
        }
        
        console.debug(`🔵 [API_CALL] ${priority} priority attempt ${attempt + 1}/${maxRetries}: GET ${url}`, config.params);
        const response = await axios.get(url, config);
        
        // Update status on success
        serviceApiStatus.lastRequestTime = Date.now();
        serviceApiStatus.consecutiveErrors = 0;
        serviceApiStatus.successfulRequests++;
        
        // Update performance metrics
        const responseTime = performance.now() - startTime;
        serviceApiStatus.averageResponseTime = 
          (serviceApiStatus.averageResponseTime * (serviceApiStatus.successfulRequests - 1) + responseTime) / serviceApiStatus.successfulRequests;
        
        // Parse rate limit headers for future requests
        parseRateLimitHeaders(response.headers);
        
        // Update last completion time for CoinGecko requests
        if (url.includes(API_CONFIG.COINGECKO.BASE_URL)) {
          serviceApiStatus.lastCoinGeckoRequestCompletionTime = Date.now();
        }
        
        // Update adaptive batch size
        if (API_CONFIG.COINGECKO.ADAPTIVE_BATCHING) {
          serviceApiStatus.currentBatchSize = calculateOptimalBatchSize();
        }
        
        console.log(`🔵 [API_CALL_SUCCESS] ${priority} priority: ${url} (${Math.round(responseTime)}ms, batch size: ${serviceApiStatus.currentBatchSize})`);
        return response; // Success
      } catch (error: any) {
        lastError = error;
        serviceApiStatus.lastRequestTime = Date.now(); // This is fine for general last request attempt time
        // Update last completion time for CoinGecko requests even on error, to space out retries
        if (url.includes(API_CONFIG.COINGECKO.BASE_URL)) {
          serviceApiStatus.lastCoinGeckoRequestCompletionTime = Date.now();
        }
        serviceApiStatus.consecutiveErrors++;
        
        if (axios.isAxiosError(error)) {
          // Parse headers even on error responses
          if (error.response?.headers) {
            parseRateLimitHeaders(error.response.headers);
          }
          
          if (error.response?.status === 429) {
            // Handle rate limit specifically
            const retryAfterHeader = error.response.headers['retry-after'];
            const cooldownDuration = retryAfterHeader 
              ? parseInt(retryAfterHeader, 10) * 1000 
              : COINGECKO_RATE_LIMIT_COOLDOWN;
              
            serviceApiStatus.rateLimitCooldownUntil = Date.now() + cooldownDuration;
            
            // Reduce batch size on rate limit
            if (API_CONFIG.COINGECKO.ADAPTIVE_BATCHING) {
              serviceApiStatus.currentBatchSize = Math.max(
                Math.floor(serviceApiStatus.currentBatchSize * 0.8), 
                ADAPTIVE_BATCH_SIZE_MIN
              );
            }
            
            console.warn(`🟢 [RATE_LIMIT] ${priority} priority CoinGecko 429. Cooldown: ${cooldownDuration / 1000}s. Reduced batch size to ${serviceApiStatus.currentBatchSize}. URL: ${url}`);
            throw new Error(`API rate limit hit (429). Cooldown active for ${cooldownDuration / 1000}s.`);
          }
        }
        
        console.error(`🟠 [API_CALL_ERROR] ${priority} priority attempt ${attempt + 1}/${maxRetries} for ${url} failed: ${error.message}`);

        if (attempt < maxRetries - 1) {
          // Jittered exponential backoff for non-429 errors
          const baseBackoff = Math.min(API_CONFIG.COINGECKO.REQUEST_SPACING * Math.pow(2, attempt), 10000);
          const backoffTime = addJitter(baseBackoff);
          
          console.log(`🔵 [RETRYING] ${priority} priority attempt ${attempt + 2}/${maxRetries} for ${url} in ${Math.round(backoffTime)}ms (with jitter)`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          console.error(`🔴 [API_CALL_FAIL] ${priority} priority: All ${maxRetries} attempts for ${url} failed. Last error: ${error.message}`);
          break; 
        }
      }
    }
    
    console.error(`🔴 [API_CALL_FAIL] ${priority} priority: Final failure for ${url} after ${maxRetries} attempts.`);
    throw lastError || new Error('All API attempts failed after retries.');
  })();

  // Store the request for deduplication
  pendingRequests.set(requestHash, {
    promise: requestPromise,
    timestamp: Date.now(),
    requestHash
  });

  // Clean up after request completes
  requestPromise.finally(() => {
    pendingRequests.delete(requestHash);
  });

  return requestPromise;
}

// Enhanced API call functions with adaptive batching and priority handling
export async function fetchCoinMarkets(ids: string[], vs_currency: string = 'usd', priority: RequestPriority = RequestPriority.NORMAL) {
  if (!ids || ids.length === 0) {
    console.warn('🟡 [FETCH_MARKETS] No IDs provided, returning empty array');
    return [];
  }
  
  // Use adaptive batch size if enabled
  const effectiveBatchSize = API_CONFIG.COINGECKO.ADAPTIVE_BATCHING 
    ? serviceApiStatus.currentBatchSize 
    : API_CONFIG.COINGECKO.BATCH_SIZE;
  
  const params = {
    vs_currency,
    ids: ids.join(','),
    per_page: Math.min(ids.length, effectiveBatchSize),
    page: 1,
    sparkline: false,
    price_change_percentage: '24h',
  };
  
  console.debug(`🔵 [FETCH_MARKETS] ${priority} priority requesting ${ids.length} coins (batch size: ${effectiveBatchSize}): ${ids.slice(0,3).join(',').substring(0,50)}${ids.length > 3 ? '...' : ''}`);
  
  try {
    const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, { params, timeout: 10000 }, priority);
    console.log(`🎉 [FETCH_MARKETS_SUCCESS] ${priority} priority: Retrieved ${response.data?.length || 0} market records`);
    return response.data;
  } catch (error: any) {
    console.error(`🔴 [FETCH_MARKETS_FAIL] ${priority} priority: Failed to fetch markets for ${ids.length} coins: ${error.message}`);
    throw error;
  }
}

export async function fetchSimplePrice(ids: string[], vs_currencies: string = 'usd,eur,cad', priority: RequestPriority = RequestPriority.NORMAL) {
  if (!ids || ids.length === 0) {
    console.warn('🟡 [FETCH_SIMPLE] No IDs provided, returning empty object');
    return {};
  }
  
  const params = {
    ids: ids.join(','),
    vs_currencies,
    include_24hr_change: true,
    precision: 'full',
  };
  
  console.debug(`🔵 [FETCH_SIMPLE] ${priority} priority requesting ${ids.length} coins: ${ids.slice(0,3).join(',').substring(0,50)}${ids.length > 3 ? '...' : ''}`);
  
  try {
    const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, { params, timeout: 10000 }, priority);
    const resultCount = Object.keys(response.data || {}).length;
    console.log(`🎉 [FETCH_SIMPLE_SUCCESS] ${priority} priority: Retrieved prices for ${resultCount} coins`);
    return response.data;
  } catch (error: any) {
    console.error(`🔴 [FETCH_SIMPLE_FAIL] ${priority} priority: Failed to fetch simple prices for ${ids.length} coins: ${error.message}`);
    throw error;
  }
}

export async function searchCoinGecko(query: string, priority: RequestPriority = RequestPriority.HIGH) {
  if (!query.trim()) {
    console.warn('🟡 [SEARCH] Empty query provided, returning empty results');
    return { coins: [] };
  }
  
  const params = { query };
  
  console.debug(`🔵 [SEARCH] ${priority} priority searching for: "${query}"`);
  
  try {
    const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/search`, { params, timeout: 5000 }, priority);
    const coinCount = response.data?.coins?.length || 0;
    console.log(`🎉 [SEARCH_SUCCESS] ${priority} priority: Found ${coinCount} coins for query: "${query}"`);
    return response.data;
  } catch (error: any) {
    console.error(`🔴 [SEARCH_FAIL] ${priority} priority: Failed to search for "${query}": ${error.message}`);
    throw error;
  }
}

export async function fetchCoinDetails(coinId: string, priority: RequestPriority = RequestPriority.NORMAL) {
  const url = `${API_CONFIG.COINGECKO.BASE_URL}/coins/${coinId}`;
  
  console.time(`API_fetchCoinDetails_${coinId}`);
  console.log(`🔵 [API] Fetching coin details for: ${coinId} (Priority: ${priority})`);
  
  try {
    const response = await fetchWithSmartRetry(url, {
      params: {
        localization: false,
        tickers: false,
        market_data: false,
        community_data: false,
        developer_data: false,
        sparkline: false
      }
    }, priority);
    
    console.timeEnd(`API_fetchCoinDetails_${coinId}`);
    console.log(`🎉 [API] Successfully fetched coin details for: ${coinId}`);
    
    return {
      id: response.data.id,
      symbol: response.data.symbol,
      name: response.data.name,
      categories: response.data.categories || [],
      image: response.data.image?.large || response.data.image?.small || response.data.image?.thumb,
      description: response.data.description?.en,
      links: response.data.links,
      market_cap_rank: response.data.market_cap_rank,
      coingecko_rank: response.data.coingecko_rank,
      asset_platform_id: response.data.asset_platform_id,
    };
  } catch (error: any) {
    console.timeEnd(`API_fetchCoinDetails_${coinId}`);
    console.error(`🔴 [API] Error fetching coin details for ${coinId}:`, error?.message || error);
    throw error;
  }
}

// NEW: Export performance metrics for monitoring
export function getApiPerformanceMetrics() {
  const successRate = serviceApiStatus.totalRequests > 0 
    ? (serviceApiStatus.successfulRequests / serviceApiStatus.totalRequests * 100).toFixed(1)
    : 'N/A';
    
  return {
    totalRequests: serviceApiStatus.totalRequests,
    successfulRequests: serviceApiStatus.successfulRequests,
    successRate: `${successRate}%`,
    averageResponseTime: `${Math.round(serviceApiStatus.averageResponseTime)}ms`,
    currentBatchSize: serviceApiStatus.currentBatchSize,
    consecutiveErrors: serviceApiStatus.consecutiveErrors,
    pendingRequests: pendingRequests.size,
    rateLimitActive: isCoinGeckoApiRateLimited(),
  };
}

// NEW: Export RequestPriority enum for use in other modules
export { RequestPriority };

// Add other specific API call functions as needed (e.g., for /coins/{id}/market_chart) 