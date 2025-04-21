import axios from 'axios';

// Define interface for Open Exchange Rates API response
interface OpenExchangeRatesResponse {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: {
    CAD: number;
    EUR: number;
    [key: string]: number;
  };
}

// Interface for our cached rates
interface CachedRates {
  rates: {
    CAD: number;
    EUR: number;
  };
  timestamp: number;
  lastFetched: number;
}

// Cache duration in milliseconds (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;
const STORAGE_KEY = 'cryptovertx-exchange-rates';

/**
 * Fetches exchange rates from Open Exchange Rates API
 * with intelligent caching to avoid hitting rate limits
 */
export async function getExchangeRates(): Promise<CachedRates> {
  // Check for cached data first
  const cachedData = localStorage.getItem(STORAGE_KEY);
  if (cachedData) {
    const parsed: CachedRates = JSON.parse(cachedData);
    const now = Date.now();
    
    // If cache is still valid, return it
    if (now - parsed.lastFetched < CACHE_DURATION) {
      return parsed;
    }
  }

  try {
    // Get API key from environment variables or use the provided one
    const appId = import.meta.env.VITE_OPEN_EXCHANGE_RATES_APP_ID || 
                  '25c17f7922c34d4a8b7814af456962ed'; // Fallback to provided key
    
    // Fetch fresh data
    const response = await axios.get<OpenExchangeRatesResponse>(
      `https://openexchangerates.org/api/latest.json?app_id=${appId}`
    );
    
    // Extract only CAD and EUR rates
    const newRates: CachedRates = {
      rates: {
        CAD: response.data.rates.CAD,
        EUR: response.data.rates.EUR
      },
      timestamp: response.data.timestamp,
      lastFetched: Date.now()
    };
    
    // Cache the result
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRates));
    
    return newRates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    
    // If we have cached data, return it as fallback even if expired
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // Absolute fallback to hardcoded values if everything else fails
    return {
      rates: {
        CAD: 1.38,
        EUR: 0.87
      },
      timestamp: Math.floor(Date.now() / 1000),
      lastFetched: Date.now()
    };
  }
}

/**
 * Formats a timestamp into a human-readable "time ago" string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff} secs ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

/**
 * Formats a currency value with proper decimal places
 */
export function formatCurrency(value: number): string {
  return value.toFixed(2);
} 