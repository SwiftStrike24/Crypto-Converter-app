import { STABLECOIN_CATEGORIES, STABLECOIN_SYMBOL_PATTERNS } from '../constants/cryptoConstants';

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
 * Comprehensive stablecoin check using metadata and fallback to symbol patterns
 */
export function isStablecoin(metadata: CoinDetailedMetadata | null, symbol?: string): boolean {
  // Primary check: use categories from detailed metadata
  if (metadata?.categories) {
    const categoriesResult = isStablecoinFromCategories(metadata.categories);
    console.log(`🪙 [STABLECOIN_CHECK] ${metadata.symbol}: Categories check result: ${categoriesResult}`, {
      categories: metadata.categories,
      matchingCategories: metadata.categories.filter(cat => 
        STABLECOIN_CATEGORIES.some(stableCategory => 
          cat.toLowerCase().includes(stableCategory.toLowerCase()) ||
          stableCategory.toLowerCase().includes(cat.toLowerCase())
        )
      )
    });
    return categoriesResult;
  }

  // Fallback: check symbol patterns
  const symbolToCheck = symbol || metadata?.symbol;
  if (symbolToCheck) {
    const symbolResult = isStablecoinFromSymbol(symbolToCheck);
    console.log(`🪙 [STABLECOIN_CHECK] ${symbolToCheck}: Symbol pattern check result: ${symbolResult}`);
    return symbolResult;
  }

  console.log(`🪙 [STABLECOIN_CHECK] No metadata or symbol available for stablecoin check`);
  return false;
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