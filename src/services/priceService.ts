import { cache } from '../utils/cache';
import { Time } from 'lightweight-charts';

interface PriceDataPoint {
  time: Time;
  value: number;
}

type ApiType = 'COINGECKO' | 'CRYPTOCOMPARE';

// Rate limiting configuration
const RATE_LIMIT: Record<ApiType, { MAX_REQUESTS: number; TIME_WINDOW: number }> = {
  COINGECKO: {
    MAX_REQUESTS: 50,
    TIME_WINDOW: 60 * 1000, // 1 minute
  },
  CRYPTOCOMPARE: {
    MAX_REQUESTS: 30,
    TIME_WINDOW: 60 * 1000,
  },
};

// Track API requests
const apiRequestTracker = {
  coingecko: [] as number[],
  cryptocompare: [] as number[],
};

function isRateLimited(api: 'coingecko' | 'cryptocompare'): boolean {
  const now = Date.now();
  const config = RATE_LIMIT[api.toUpperCase() as ApiType];
  
  // Clean old requests
  apiRequestTracker[api] = apiRequestTracker[api].filter(
    time => now - time < config.TIME_WINDOW
  );
  
  return apiRequestTracker[api].length >= config.MAX_REQUESTS;
}

function trackRequest(api: 'coingecko' | 'cryptocompare'): void {
  apiRequestTracker[api].push(Date.now());
}

function validatePriceData(data: PriceDataPoint[]): PriceDataPoint[] {
  // First, filter out any invalid points
  const validPoints = data.filter(point => {
    const isValidTime = typeof point.time === 'number' && !isNaN(point.time);
    const isValidValue = typeof point.value === 'number' && !isNaN(point.value) && 
                        point.value >= -90071992547409 && point.value <= 90071992547409;
    return isValidTime && isValidValue;
  });

  // If we have no valid points, return empty array
  if (validPoints.length === 0) {
    return [];
  }

  // Sort points by time to ensure chronological order
  validPoints.sort((a, b) => Number(a.time) - Number(b.time));

  // Fill in gaps with interpolated values
  const result: PriceDataPoint[] = [validPoints[0]];
  for (let i = 1; i < validPoints.length; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    const timeDiff = Number(curr.time) - Number(prev.time);
    
    // If there's a gap larger than expected, interpolate
    if (timeDiff > 86400) { // More than 1 day gap
      const steps = Math.min(Math.floor(timeDiff / 86400), 7); // Max 7 interpolation points
      for (let j = 1; j < steps; j++) {
        const fraction = j / steps;
        const interpolatedTime = Math.floor(Number(prev.time) + timeDiff * fraction) as Time;
        const interpolatedValue = prev.value + (curr.value - prev.value) * fraction;
        result.push({
          time: interpolatedTime,
          value: interpolatedValue
        });
      }
    }
    result.push(curr);
  }

  return result;
}

function generatePlaceholderData(timeframe: '1D' | '1W' | '1M' | '1Y'): PriceDataPoint[] {
  const now = Math.floor(Date.now() / 1000);
  const points = {
    '1D': 24,
    '1W': 168,
    '1M': 720,
    '1Y': 365
  }[timeframe];

  const interval = {
    '1D': 3600,        // 1 hour
    '1W': 3600,        // 1 hour
    '1M': 3600,        // 1 hour
    '1Y': 86400        // 1 day
  }[timeframe];

  return Array.from({ length: points }, (_, i) => ({
    time: (now - (points - i) * interval) as Time,
    value: 0
  }));
}

async function findEarliestData(cryptoId: string, currency: string): Promise<PriceDataPoint[]> {
  try {
    // Try to get all-time data from CoinGecko
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId.toLowerCase()}/market_chart?vs_currency=${currency.toLowerCase()}&days=max`,
      {
        headers: {
          'x-cg-demo-api-key': import.meta.env.VITE_COINGECKO_API_KEY || ''
        }
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API Error: ${response.status}`);
    }

    const data = await response.json();
    const priceData = data.prices.map(([timestamp, price]: [number, number]) => ({
      time: Math.floor(timestamp / 1000) as Time,
      value: price
    }));

    return validatePriceData(priceData);
  } catch (error) {
    // Try CryptoCompare as fallback
    try {
      const response = await fetch(
        `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${cryptoId.toUpperCase()}&tsym=${currency.toUpperCase()}&allData=true`
      );

      if (!response.ok) {
        throw new Error(`CryptoCompare API Error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.Data?.Data || !Array.isArray(data.Data.Data)) {
        throw new Error('Invalid data structure from CryptoCompare');
      }

      return validatePriceData(data.Data.Data.map((item: any) => ({
        time: item.time as Time,
        value: item.close
      })));
    } catch (fallbackError) {
      console.error('Failed to fetch earliest data:', fallbackError);
      return [];
    }
  }
}

export async function getHistoricalPriceData(
  cryptoId: string,
  currency: string,
  timeframe: '1D' | '1W' | '1M' | '1Y'
): Promise<PriceDataPoint[]> {
  const cacheKey = `price-${cryptoId}-${currency}-${timeframe}`;
  const ttl = 5 * 60 * 1000; // 5 minutes cache

  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  try {
    // First, try to get the earliest data to determine token's age
    const allTimeData = await findEarliestData(cryptoId, currency);
    
    if (allTimeData.length > 0) {
      // Calculate token's age in seconds
      const firstDataPoint = allTimeData[0].time as number;
      const now = Math.floor(Date.now() / 1000);
      const ageInSeconds = now - firstDataPoint;

      // If token is younger than requested timeframe, return all available data
      const timeframeSeconds = {
        '1D': 24 * 3600,
        '1W': 7 * 24 * 3600,
        '1M': 30 * 24 * 3600,
        '1Y': 365 * 24 * 3600
      }[timeframe];

      if (ageInSeconds < timeframeSeconds) {
        console.log(`Token ${cryptoId} is younger than requested timeframe, returning all available data`);
        cache.set(cacheKey, allTimeData, ttl);
        return allTimeData;
      }
    }

    // If token is older or age couldn't be determined, proceed with normal timeframe data
    let days: string;
    switch (timeframe) {
      case '1D':
        days = '1';
        break;
      case '1W':
        days = '7';
        break;
      case '1M':
        days = '30';
        break;
      case '1Y':
        days = '365';
        break;
      default:
        days = '1';
    }

    // Try CoinGecko first
    if (!isRateLimited('coingecko')) {
      try {
        const data = await fetchFromCoinGecko(cryptoId, currency, days);
        const validData = validatePriceData(data);
        if (validData.length > 0) {
          trackRequest('coingecko');
          cache.set(cacheKey, validData, ttl);
          return validData;
        }
      } catch (error) {
        console.warn('CoinGecko API failed, falling back to CryptoCompare:', error);
      }
    }

    // Fallback to CryptoCompare
    if (!isRateLimited('cryptocompare')) {
      try {
        const data = await fetchFromCryptoCompare(cryptoId, currency, timeframe);
        const validData = validatePriceData(data);
        if (validData.length > 0) {
          trackRequest('cryptocompare');
          cache.set(cacheKey, validData, ttl);
          return validData;
        }
      } catch (error) {
        console.warn('CryptoCompare API failed:', error);
      }
    }

    // If both APIs fail or return no valid data, return placeholder data
    console.warn(`No valid data available for ${cryptoId}, using placeholder data`);
    const placeholderData = generatePlaceholderData(timeframe);
    cache.set(cacheKey, placeholderData, ttl);
    return placeholderData;

  } catch (error) {
    console.error('Failed to fetch price data:', error);
    const placeholderData = generatePlaceholderData(timeframe);
    return placeholderData;
  }
}

async function fetchFromCoinGecko(
  cryptoId: string,
  currency: string,
  days: string
): Promise<PriceDataPoint[]> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId.toLowerCase()}/market_chart?vs_currency=${currency.toLowerCase()}&days=${days}`,
      {
        headers: {
          'x-cg-demo-api-key': import.meta.env.VITE_COINGECKO_API_KEY || '',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'omit'
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.prices || !Array.isArray(data.prices)) {
      throw new Error('Invalid data structure from CoinGecko');
    }

    // Filter out invalid data points and ensure proper type conversion
    const validData = data.prices
      .filter(([timestamp, price]: [number, number]) => 
        typeof timestamp === 'number' && 
        typeof price === 'number' && 
        !isNaN(price) &&
        price !== 0 // Filter out zero values which might indicate no data
      )
      .map(([timestamp, price]: [number, number]) => ({
        time: Math.floor(timestamp / 1000) as Time,
        value: Number(price)
      }));

    if (validData.length === 0) {
      throw new Error('No valid price data found');
    }

    return validData;
  } catch (error) {
    console.error('Error in fetchFromCoinGecko:', error);
    throw error;
  }
}

async function fetchFromCryptoCompare(
  cryptoId: string,
  currency: string,
  timeframe: '1D' | '1W' | '1M' | '1Y'
): Promise<PriceDataPoint[]> {
  try {
    // Use daily data for 1Y timeframe, hourly for others
    if (timeframe === '1Y') {
      return fetchDailyData(cryptoId, currency, 365);
    }

    const limits = {
      '1D': 24,
      '1W': 168,
      '1M': 720
    };

    const limit = limits[timeframe];
    const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${cryptoId.toUpperCase()}&tsym=${currency.toUpperCase()}&limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CryptoCompare API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.Data?.Data || !Array.isArray(data.Data.Data)) {
      throw new Error('Invalid data structure from CryptoCompare');
    }

    // Filter out invalid data points and ensure proper type conversion
    const validData = data.Data.Data
      .filter((item: any) => 
        item && 
        typeof item.time === 'number' && 
        typeof item.close === 'number' && 
        !isNaN(item.close) &&
        item.close !== 0 // Filter out zero values which might indicate no data
      )
      .map((item: any) => ({
        time: item.time as Time,
        value: Number(item.close)
      }));

    if (validData.length === 0) {
      throw new Error('No valid price data found');
    }

    return validData;
  } catch (error) {
    console.error('Error in fetchFromCryptoCompare:', error);
    throw error;
  }
}

async function fetchDailyData(
  cryptoId: string,
  currency: string,
  days: number
): Promise<PriceDataPoint[]> {
  try {
    // First try to get all data to ensure we have complete coverage
    const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${cryptoId.toUpperCase()}&tsym=${currency.toUpperCase()}&limit=${days}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CryptoCompare API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.Data?.Data || !Array.isArray(data.Data.Data)) {
      throw new Error('Invalid data structure from CryptoCompare');
    }

    // Filter out invalid data points and ensure proper type conversion
    const validData = data.Data.Data
      .filter((item: any) => 
        item && 
        typeof item.time === 'number' && 
        typeof item.close === 'number' && 
        !isNaN(item.close) &&
        item.close !== 0 // Filter out zero values which might indicate no data
      )
      .map((item: any) => ({
        time: item.time as Time,
        value: Number(item.close)
      }));

    if (validData.length === 0) {
      throw new Error('No valid price data found');
    }

    return validData;
  } catch (error) {
    console.error('Error in fetchDailyData:', error);
    throw error;
  }
} 