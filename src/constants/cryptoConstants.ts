export const DEFAULT_CRYPTO_IDS: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
};

export const CONVERSION_RATES: Record<string, Record<string, number>> = {
  BTC: { usd: 65000, eur: 59800, cad: 88400 },
  ETH: { usd: 3500, eur: 3220, cad: 4760 },
  SOL: { usd: 145, eur: 133, cad: 197 },
  USDC: { usd: 1, eur: 0.92, cad: 1.36 },
  XRP: { usd: 0.52, eur: 0.48, cad: 0.71 },
};

export const STORAGE_KEY_CUSTOM_TOKENS = 'cryptovertx-tokens';

// Cache and rate limiting configuration
export const PRICE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
export const MIN_API_INTERVAL = 30 * 1000; // 30 seconds (CoinGecko free tier is ~10-30 calls/minute, so 3-6s per call on average if spread out)
export const MAX_API_RETRIES = 3;
export const API_RETRY_DELAY = 5000; // 5 seconds
export const PRICE_UPDATE_BATCH_WINDOW = 500; // 500ms
export const PRICE_UPDATE_MAX_BATCH_SIZE = 25;
export const PRELOAD_POPULAR_TOKENS_ENABLED = true;
export const CACHE_STORAGE_KEY_PRICES = 'cryptovertx-price-cache';
export const CACHE_STORAGE_KEY_METADATA = 'cryptovertx-metadata-cache';
export const METADATA_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days
export const ICON_CACHE_STORAGE_PREFIX = 'crypto_icon_';
export const MAX_METADATA_REQUESTS_PER_SESSION_LIMIT = 1000;

export const POPULAR_TOKEN_IDS_TO_PRELOAD = [
  'bitcoin', 'ethereum', 'solana', 'ripple', 'cardano',
  'polkadot', 'dogecoin', 'shiba-inu', 'avalanche-2', 'chainlink',
  'uniswap', 'polygon', 'litecoin', 'binancecoin', 'tron',
];

export const API_CONFIG = {
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3',
    // FALLBACK_URLS are removed for now as per previous simplifications
    // If re-added, they should be here.
    CACHE_DURATION: PRICE_CACHE_DURATION, // Re-using the general price cache duration
    BATCH_SIZE: PRICE_UPDATE_MAX_BATCH_SIZE, // Re-using general batch size
    REQUEST_SPACING: 1000, // milliseconds between individual requests in a sequence (e.g. metadata batches)
    RETRY_ATTEMPTS: MAX_API_RETRIES, // Re-using general retries
  },
  CRYPTOCOMPARE: { // This config might be used by CryptoCompareContext or future integrations
    BASE_URL: 'https://data-api.cryptocompare.com/spot/v1/historical/hours', // Example, adjust if used
    CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
  },
};

// Kept API_BASE for direct use if still needed, though API_CONFIG.COINGECKO.BASE_URL is preferred
export const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';

// Note: defaultCryptoIds was renamed to DEFAULT_CRYPTO_IDS for convention.
// Note: STORAGE_KEY was renamed to STORAGE_KEY_CUSTOM_TOKENS for clarity.
// Other constants were renamed for clarity and consistency (e.g., CACHE_DURATION to PRICE_CACHE_DURATION).
// API_BASE is now COINGECKO_API_BASE_URL, but API_CONFIG.COINGECKO.BASE_URL is the primary reference.