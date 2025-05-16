import axios, { AxiosRequestConfig } from 'axios';
import {
  API_CONFIG,
  MIN_API_INTERVAL,
  // Add other necessary constants from cryptoConstants.ts
} from '../../constants/cryptoConstants';

// Re-define or import ApiStatus interface if it's specific to this service
interface ApiStatus {
  activeProviders: string[]; // Should primarily be COINGECKO
  providerIndex: number;
  lastRequestTime: number;
  consecutiveErrors: number;
  rateLimitCooldownUntil: number;
}

// Initialize apiStatus for the service. This should not be a React ref here.
let serviceApiStatus: ApiStatus = {
  activeProviders: ['coingecko'],
  providerIndex: 0,
  lastRequestTime: 0,
  consecutiveErrors: 0,
  rateLimitCooldownUntil: 0,
};

export function isCoinGeckoApiRateLimited(): boolean {
  if (serviceApiStatus.rateLimitCooldownUntil > Date.now()) {
    const cooldownSeconds = Math.ceil((serviceApiStatus.rateLimitCooldownUntil - Date.now()) / 1000);
    console.warn(`[CryptoAPIService] CoinGecko API rate limit active. Cooldown: ${cooldownSeconds}s.`);
    return true;
  }
  return false;
}

async function delayIfNeeded(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - serviceApiStatus.lastRequestTime;
  const minSpacingTime = API_CONFIG.COINGECKO.REQUEST_SPACING;
  if (timeSinceLastRequest < minSpacingTime) {
    await new Promise(resolve => setTimeout(resolve, minSpacingTime - timeSinceLastRequest));
  }
}

export async function fetchWithSmartRetry(url: string, config: AxiosRequestConfig): Promise<any> {
  let lastError;
  const maxRetries = API_CONFIG.COINGECKO.RETRY_ATTEMPTS;

  if (isCoinGeckoApiRateLimited()) {
    throw new Error('API rate limit active. Please wait.');
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (isCoinGeckoApiRateLimited()) {
      throw lastError || new Error('API rate limit active during retry.');
    }

    try {
      await delayIfNeeded();
      
      console.debug(`[CryptoAPIService] Attempt ${attempt + 1}: GET ${url}`, config.params);
      const response = await axios.get(url, config);
      serviceApiStatus.lastRequestTime = Date.now();
      serviceApiStatus.consecutiveErrors = 0;
      return response; // Success
    } catch (error: any) {
      lastError = error;
      serviceApiStatus.lastRequestTime = Date.now();
      serviceApiStatus.consecutiveErrors++;
      console.error(`[CryptoAPIService] Attempt ${attempt + 1} to ${url} failed:`, error.message);

      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const cooldownDuration = MIN_API_INTERVAL * 2; // Cooldown for 60 seconds on 429
        serviceApiStatus.rateLimitCooldownUntil = Date.now() + cooldownDuration;
        console.warn(`[CryptoAPIService] Received 429. Rate limit cooldown activated for ${cooldownDuration / 1000}s.`);
        throw new Error(`API rate limit hit (429). Cooldown active.`);
      }

      if (attempt < maxRetries - 1) {
        const backoffTime = Math.min(API_CONFIG.COINGECKO.REQUEST_SPACING * Math.pow(2, attempt), 15000);
        console.log(`[CryptoAPIService] Waiting ${backoffTime}ms before retry for ${url}...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        console.error(`[CryptoAPIService] Max retries (${maxRetries}) reached for ${url}. Failing request.`);
        break; 
      }
    }
  }
  console.error(`[CryptoAPIService] All attempts failed for ${url}.`);
  throw lastError || new Error('All API attempts failed after retries.');
}

// Example specific API call function
export async function fetchCoinMarkets(ids: string[], vs_currency: string = 'usd') {
  if (!ids || ids.length === 0) {
    return []; // Or throw error, depending on desired behavior
  }
  const params = {
    vs_currency,
    ids: ids.join(','),
    per_page: ids.length > API_CONFIG.COINGECKO.BATCH_SIZE ? API_CONFIG.COINGECKO.BATCH_SIZE : ids.length,
    page: 1,
    sparkline: false,
    price_change_percentage: '24h',
  };
  const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/coins/markets`, { params, timeout: 10000 });
  return response.data; // Assuming response.data is the array of market data
}

export async function fetchSimplePrice(ids: string[], vs_currencies: string = 'usd,eur,cad') {
  if (!ids || ids.length === 0) {
    return {};
  }
  const params = {
    ids: ids.join(','),
    vs_currencies,
    include_24hr_change: true,
    precision: 'full',
  };
  const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/simple/price`, { params, timeout: 10000 });
  return response.data;
}

export async function searchCoinGecko(query: string) {
  if (!query.trim()) {
    return { coins: [] };
  }
  const params = { query };
  // Note: The search endpoint might have different rate limits or might not need the same level of aggressive retry.
  // For now, it uses the same fetchWithSmartRetry, but this could be adjusted.
  const response = await fetchWithSmartRetry(`${API_CONFIG.COINGECKO.BASE_URL}/search`, { params, timeout: 5000 });
  return response.data; // Assuming response.data is { coins: [], exchanges: [], icos: [] ... }
}

// Add other specific API call functions as needed (e.g., for /coins/{id}/market_chart) 