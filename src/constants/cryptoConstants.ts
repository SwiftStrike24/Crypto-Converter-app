export const DEFAULT_CRYPTO_IDS: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
  SUI: 'sui',
  BONK: 'bonk',
  FARTCOIN: 'fartcoin',
  TRUMP: 'official-trump',
};

export const DEFAULT_TOKEN_SYMBOLS = Object.keys(DEFAULT_CRYPTO_IDS);

export const CONVERSION_RATES: Record<string, Record<string, number>> = {
  BTC: { usd: 65000, eur: 59800, cad: 88400 },
  ETH: { usd: 3500, eur: 3220, cad: 4760 },
  SOL: { usd: 145, eur: 133, cad: 197 },
  USDC: { usd: 1, eur: 0.92, cad: 1.36 },
  XRP: { usd: 0.52, eur: 0.48, cad: 0.71 },
  BONK: { usd: 0.000024, eur: 0.000022, cad: 0.000033 },
  FARTCOIN: { usd: 1.32, eur: 1.21, cad: 1.80 },
  TRUMP: { usd: 0.01, eur: 0.009, cad: 0.014 },
};

export const STORAGE_KEY_CUSTOM_TOKENS = 'cryptovertx-tokens';

// Cache and rate limiting configuration - OPTIMIZED FOR MAXIMUM THROUGHPUT
export const PRICE_CACHE_DURATION = 8 * 60 * 1000; // 8 minutes (reduced from 10 for fresher data)
export const MIN_API_INTERVAL = 6 * 1000; // 6 seconds (more aggressive - CoinGecko free allows ~10 calls/minute)
export const MAX_API_RETRIES = 2; // Reduced retries to save API calls for new requests
export const API_RETRY_DELAY = 3000; // 3 seconds (faster recovery)
export const PRICE_UPDATE_BATCH_WINDOW = 200; // 200ms (faster batching)
export const PRICE_UPDATE_MAX_BATCH_SIZE = 50; // Increased from 25 to 50 (CoinGecko supports up to 250 IDs per call)
export const PRELOAD_POPULAR_TOKENS_ENABLED = true;
export const CACHE_STORAGE_KEY_PRICES = 'cryptovertx-price-cache';
export const CACHE_STORAGE_KEY_METADATA = 'cryptovertx-metadata-cache';
export const METADATA_CACHE_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days
export const ICON_CACHE_STORAGE_PREFIX = 'crypto_icon_';
export const MAX_METADATA_REQUESTS_PER_SESSION_LIMIT = 2000; // Increased from 1000
export const COINGECKO_RATE_LIMIT_COOLDOWN = 20 * 1000; // 20 seconds (reduced from 30)
export const RATE_LIMIT_UI_MESSAGE = "API rate limit reached. Updates paused.";

// NEW: Threshold for considering cached data as "recent" enough to skip initial fetch on add
export const RECENT_DATA_THRESHOLD = 60 * 1000; // 60 seconds

// NEW: Advanced API optimization constants
export const REQUEST_DEDUPLICATION_WINDOW = 2000; // 2 seconds to deduplicate identical requests
export const ADAPTIVE_BATCH_SIZE_MIN = 10; // Minimum batch size
export const ADAPTIVE_BATCH_SIZE_MAX = 100; // Maximum batch size (well under CoinGecko's 250 limit)
export const PRIORITY_REQUEST_DELAY = 1000; // 1 second delay for high-priority requests
export const BACKGROUND_REQUEST_DELAY = 8000; // 8 seconds for background/low-priority requests
export const REQUEST_COALESCING_WINDOW = 1500; // 1.5 seconds to combine similar requests

export const POPULAR_TOKEN_IDS_TO_PRELOAD = [
    /* auto-generated on 2025-05-20 */
    'bitcoin',
    'ethereum',
    'ripple',
    'binancecoin',
    'solana',
    'usd-coin',
    'sui',
    'bonk',
    'fartcoin',
    'official-trump',
  ];

export const API_CONFIG = {
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3',
    CACHE_DURATION: PRICE_CACHE_DURATION,
    BATCH_SIZE: PRICE_UPDATE_MAX_BATCH_SIZE, // Now 50 instead of 25
    REQUEST_SPACING: 600, // 600ms between individual requests (more aggressive)
    RETRY_ATTEMPTS: MAX_API_RETRIES, // Now 2 instead of 3
    // NEW: Adaptive batching configuration
    ADAPTIVE_BATCHING: true,
    MIN_BATCH_SIZE: ADAPTIVE_BATCH_SIZE_MIN,
    MAX_BATCH_SIZE: ADAPTIVE_BATCH_SIZE_MAX,
    // NEW: Request prioritization
    PRIORITY_DELAY: PRIORITY_REQUEST_DELAY,
    BACKGROUND_DELAY: BACKGROUND_REQUEST_DELAY,
    // NEW: Request optimization
    DEDUPLICATION_WINDOW: REQUEST_DEDUPLICATION_WINDOW,
    COALESCING_WINDOW: REQUEST_COALESCING_WINDOW,
  },
  CRYPTOCOMPARE: {
    BASE_URL: 'https://data-api.cryptocompare.com/spot/v1/historical/hours',
    CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
  },
};

// Kept API_BASE for direct use if still needed, though API_CONFIG.COINGECKO.BASE_URL is preferred
export const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';

// Note: defaultCryptoIds was renamed to DEFAULT_CRYPTO_IDS for convention.
// Note: STORAGE_KEY was renamed to STORAGE_KEY_CUSTOM_TOKENS for clarity.
// Other constants were renamed for clarity and consistency (e.g., CACHE_DURATION to PRICE_CACHE_DURATION).
// API_BASE is now COINGECKO_API_BASE_URL, but API_CONFIG.COINGECKO.BASE_URL is the primary reference.

// NEW: Unified TradingView market types
export type TradingViewMarket = 'CRYPTO' | 'PYTH' | 'BINANCE' | 'MEXC' | 'BYBIT';

// NEW: Single source of truth for supported markets
export const SUPPORTED_TRADING_VIEW_MARKETS: TradingViewMarket[] = ['CRYPTO', 'PYTH', 'BINANCE', 'MEXC', 'BYBIT'];

// Stablecoin detection configuration
export const STABLECOIN_CATEGORIES = [
  'stablecoins',
  'usd stablecoin',
  'eur stablecoin',
  'stablecoin',
  'algorithmic stablecoins',
  'asset-backed stablecoins',
  'centralized stablecoins',
  'decentralized stablecoins',
];

// Fallback stablecoin symbol patterns for offline detection
export const STABLECOIN_SYMBOL_PATTERNS = [
  /^usd[ct]$/i,     // USDC, USDT
  /^dai$/i,         // DAI
  /^busd$/i,        // BUSD
  /^frax$/i,        // FRAX
  /^tusd$/i,        // TUSD
  /^pax$/i,         // PAX
  /^usdp$/i,        // USDP
  /^ust$/i,         // UST
  /^mim$/i,         // MIM
  /^fei$/i,         // FEI
  /^lusd$/i,        // LUSD
  /^gusd$/i,        // GUSD
  /^usdn$/i,        // USDN
  /^usdd$/i,        // USDD
  /^susd$/i,        // sUSD
  /^dusd$/i,        // DUSD
  /^vusd$/i,        // VUSD
  /^husd$/i,        // HUSD
  /^cusd$/i,        // cUSD
  /^ousd$/i,        // OUSD
  /^usdx$/i,        // USDX
  /^usdk$/i,        // USDK
  /^usdr$/i,        // USDR
  /^eurs$/i,        // EURS
  /^eurt$/i,        // EURT
  /^cadc$/i,        // CADC
  /^xsgd$/i,        // XSGD
  /^bidr$/i,        // BIDR
  /^jpyc$/i,        // JPYC
  /^gyen$/i,        // GYEN
  /^zusd$/i,        // ZUSD
];

// Price range for stablecoin verification
export const STABLECOIN_PRICE_THRESHOLD_USD = 1.0;
export const STABLECOIN_PRICE_DEVIATION = 0.02; // Allows for a +/- 2% deviation
export const STABLECOIN_LOWER_BOUND_USD = STABLECOIN_PRICE_THRESHOLD_USD - STABLECOIN_PRICE_DEVIATION; // $0.98
export const STABLECOIN_UPPER_BOUND_USD = STABLECOIN_PRICE_THRESHOLD_USD + STABLECOIN_PRICE_DEVIATION; // $1.02


// Cache key for detailed coin metadata
export const CACHE_STORAGE_KEY_COIN_DETAILS = 'cryptovertx-coin-details-cache';
export const COIN_DETAILS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours