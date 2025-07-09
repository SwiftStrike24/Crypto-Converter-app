import { 
  STABLECOIN_CATEGORIES, 
  STABLECOIN_SYMBOL_PATTERNS,
  STABLECOIN_LOWER_BOUND_USD,
  STABLECOIN_UPPER_BOUND_USD,
} from '../constants/cryptoConstants';

export interface CoinDetailedMetadata {
  id: string;
  symbol: string;
  name: string;
  categories: string[];
  image?: string;
  description?: string;
  links?: any;
  market_cap_rank?: number;
  coingecko_rank?: number;
  asset_platform_id?: string | null;
  market_data?: {
    ath: { [key: string]: number };
    atl: { [key: string]: number };
    ath_date: { [key: string]: string };
    atl_date: { [key: string]: string };
  };
}

/**
 * Checks if a token is a stablecoin based on its categories from CoinGecko
 */
export function isStablecoinFromCategories(categories: string[]): boolean {
  if (!categories || categories.length === 0) {
    return false;
  }

  const normalizedCategories = categories.map(cat => cat.toLowerCase().trim());
  
  return STABLECOIN_CATEGORIES.some(stableCategory => 
    normalizedCategories.some(category => 
      category.includes(stableCategory.toLowerCase()) ||
      stableCategory.toLowerCase().includes(category)
    )
  );
}

/**
 * Checks if a token symbol matches known stablecoin patterns (fallback method)
 */
export function isStablecoinFromSymbol(symbol: string): boolean {
  if (!symbol) {
    return false;
  }

  const normalizedSymbol = symbol.trim();
  return STABLECOIN_SYMBOL_PATTERNS.some(pattern => pattern.test(normalizedSymbol));
}

/**
 * Comprehensive stablecoin check using a multi-factor approach:
 * 1. Signal Check: Checks if metadata (categories) or symbol suggests it's a stablecoin.
 * 2. Price Verification: If a signal is found, verifies the price is within a stable range.
 */
export function isStablecoin(
  metadata: CoinDetailedMetadata | null,
  symbol?: string,
  priceInUsd?: number | null,
): boolean {
  const symbolToCheck = symbol || metadata?.symbol;
  if (!symbolToCheck) {
    return false;
  }

  // 1. Signal Check: Does it identify as a stablecoin by category or symbol?
  const hasCategorySignal = metadata?.categories ? isStablecoinFromCategories(metadata.categories) : false;
  const hasSymbolSignal = isStablecoinFromSymbol(symbolToCheck);
  const hasStablecoinSignal = hasCategorySignal || hasSymbolSignal;

  if (!hasStablecoinSignal) {
    return false; // Not a stablecoin if it doesn't even claim to be one.
  }

  // 2. Price Verification: If it claims to be a stablecoin, is it actually stable?
  if (priceInUsd === null || typeof priceInUsd === 'undefined') {
    // Price is not available, fall back to the signal.
    // This maintains functionality for offline or initial-load scenarios.
    console.log(`🪙 [STABLECOIN_CHECK] ${symbolToCheck} has signal but no price data. Assuming stable: ${hasStablecoinSignal}`);
    return hasStablecoinSignal;
  }

  const isPriceStable = priceInUsd >= STABLECOIN_LOWER_BOUND_USD && priceInUsd <= STABLECOIN_UPPER_BOUND_USD;

  if (!isPriceStable) {
    console.log(`🪙 [STABLECOIN_CHECK] ${symbolToCheck} has a stablecoin signal but its price ($${priceInUsd}) is outside the stable range. Result: false`);
  } else {
    console.log(`🪙 [STABLECOIN_CHECK] ${symbolToCheck} confirmed as stablecoin. Signal: ${hasStablecoinSignal}, Price: $${priceInUsd}. Result: true`);
  }

  return isPriceStable;
}

/**
 * Gets the appropriate target fiat currency for a stablecoin
 * Returns the fiat currency that the stablecoin is pegged to, or CAD as default
 */
export function getStablecoinTargetFiat(metadata: CoinDetailedMetadata | null, symbol?: string): string {
  const symbolToCheck = (symbol || metadata?.symbol || '').toLowerCase();
  const name = (metadata?.name || '').toLowerCase();
  const categories = (metadata?.categories || []).map(cat => cat.toLowerCase());

  // Check for specific fiat pegs
  if (symbolToCheck.includes('eur') || name.includes('euro') || 
      categories.some(cat => cat.includes('eur'))) {
    return 'EUR';
  }

  if (symbolToCheck.includes('cad') || name.includes('canadian') ||
      categories.some(cat => cat.includes('cad'))) {
    return 'CAD';
  }

  // For USD stablecoins or unknown, default to CAD (as per requirement)
  // This includes USDC, USDT, DAI, etc.
  return 'CAD';
} 