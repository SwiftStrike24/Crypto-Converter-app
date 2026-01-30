🚀 Migration Plan: CoinGecko to CoinCap (Commercial-Safe)

Date: December 25, 2025
Target: CryptoVertX v2.7.0
Objective: Replace CoinGecko Free API with CoinCap API as the default data source to enable legal commercial monetization.

1. API Analysis & Strategy

The "Golden Clause"

CoinCap's Terms of Service explicitly allow for commercial use in applications where the data is not resold standalone. This makes it the perfect legal backbone for the "Free/Base" version of CryptoVertX.

Feature

CoinGecko (Current)

CoinCap (New)

Strategy

Price Data

/coins/markets

/assets

**Changed:** CoinCap's `/assets` does NOT support `ids` filtering.
**Strategy:** Fetch top 200 assets (covers 99% of use cases). For obscure tokens not in top 200, perform individual `GET /assets/{id}` calls (parallelized).

Rate Limits

~30 req/min

~200-600 req/min

**Upgrade:** Rate limits are significantly higher, allowing for parallel individual fetches for low-cap gems.

Search

/search

/assets?limit=2000

**Changed:** CoinCap has no search endpoint.
**Strategy:** Fetch all assets (`limit=2000`) once on startup/search-focus to build a client-side Fuse.js index. Faster UX.

Images

Included in response

NOT Included

Hybrid Fix. Use CoinCap's asset ID to fetch icons from their CDN: `https://assets.coincap.io/assets/icons/{symbol}@2x.png`

Charts

/market_chart

/assets/{id}/history

Direct Swap. CoinCap provides historical candles.

Fiat Rates

Native in response

USD Base Only

Keep Existing. Continue using ExchangeRatesContext (Open Exchange Rates) for USD -> CAD/EUR conversion.

2. Implementation Steps

Phase 1: Service Layer Implementation

Create a new service file src/services/coinCapService.ts to handle all interactions with the CoinCap API.

Key Requirements:

Base URL: https://api.coincap.io/v2

Endpoints to Implement:

getAssets(limit = 200): Fetches list of top coins.

getAsset(id: string): Fetches single token details (for tokens not in top list).

getAllAssets(): Fetches `limit=2000` for building the search index.

getAssetHistory(id, interval): Fetches chart data.

Data Normalization: You must transform CoinCap's response to match the existing CryptoPriceData interface to minimize UI breakage.

Data Mapping Table:
| CryptoVertX Field | CoinCap Field | Notes |
| :--- | :--- | :--- |
| id | id | e.g., "bitcoin" |
| symbol | symbol | e.g., "BTC" |
| name | name | e.g., "Bitcoin" |
| current_price | priceUsd | Must parse string to float |
| market_cap | marketCapUsd | Parse string to float |
| market_cap_rank | rank | Parse string to number |
| price_change_percentage_24h | changePercent24Hr | Parse string to float |
| high_24h | Calculated | CoinCap doesn't give 24h High/Low directly. Action: Use current price. For charts, we have history. For list, accept simplified data. |
| image | Missing | Action: Construct URL: https://assets.coincap.io/assets/icons/{symbol}@2x.png (lowercase symbol) |

Phase 2: Solving the "Missing Image" Problem

CoinCap does not return image URLs in their API. We must generate them.

Solution: CoinCap hosts icons at a predictable URL pattern.

Logic:

const getIconUrl = (symbol: string) => {
  return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
};


Fallback: If the image fails to load, use the existing generic crypto placeholder icon in the UI.

Phase 3: Refactoring CryptoContext.tsx

This is the core of the migration.

State Logic:

Remove isCoinGeckoRateLimitedGlobal (CoinCap limits are much higher, making this less critical, but keep a generic isApiRateLimited for safety).

Add apiSource state: 'coincap' (default) | 'coingecko' (pro).

fetchPrices Replacement:

Replace cryptoApiService.fetchCoinMarkets calls with `coinCapService.getMarketData(ids)`.

**Smart Fetch Logic (`getMarketData`):**
1. Call `coinCapService.getAssets({ limit: 200 })`.
2. Map results to requested `ids`.
3. Identify missing `ids` (tokens rank > 200).
4. Fire parallel `coinCapService.getAsset(id)` for missing tokens.
5. Merge results.

Search: Update searchCryptos to use a new local search index built from `coinCapService.getAllAssets()`.

Phase 4: The "BYOK" (Bring Your Own Key) Engine

To support "Pro" users who want the full CoinGecko database (memecoins, etc.), we implement a toggle.

Settings Page Update:

Add a section: "Data Source Provider".

Input field: "CoinGecko API Key (Optional)".

Logic:

If COINGECKO_API_KEY is present in Settings (or LocalStorage):

Switch apiSource to 'coingecko'.

Use cryptoApiService (Existing logic).

Else (Default):

Use apiSource = 'coincap'.

Use coinCapService.

Phase 5: WebSocket Integration (Performance Upgrade)

CoinCap offers a free WebSocket API which is superior to CoinGecko's polling for live prices.

Endpoint: wss://ws.coincap.io/prices?assets=bitcoin,ethereum,solana

Implementation:

In CryptoContext, instead of setInterval polling every 45s:

Open a WebSocket connection for the active availableCryptos.

On message, update prices state instantly.

Result: Real-time flashing prices (Pro-level feel).

3. Step-by-Step Code Changes

Step 1: Create src/services/coinCapService.ts

import axios from 'axios';

const BASE_URL = 'https://api.coincap.io/v2';
const ICON_BASE_URL = 'https://assets.coincap.io/assets/icons';

export interface CoinCapAsset {
  id: string;
  rank: string;
  symbol: string;
  name: string;
  supply: string;
  maxSupply: string | null;
  marketCapUsd: string;
  volumeUsd24Hr: string;
  priceUsd: string;
  changePercent24Hr: string;
  vwap24Hr: string;
}

export const coinCapService = {
  // Get list of top assets (default 200)
  async getTopAssets(limit = 200) {
    try {
      const response = await axios.get<{ data: CoinCapAsset[] }>(`${BASE_URL}/assets`, { params: { limit } });
      return this.normalizeAssets(response.data.data);
    } catch (error) {
      console.error('CoinCap Top Assets Error:', error);
      throw error;
    }
  },

  // Get single asset details (for low-cap tokens)
  async getAsset(id: string) {
    try {
      const response = await axios.get<{ data: CoinCapAsset }>(`${BASE_URL}/assets/${id}`);
      return this.normalizeAssets([response.data.data])[0];
    } catch (error) {
      console.error(`CoinCap Asset Error (${id}):`, error);
      return null;
    }
  },

  // Helper to fetch multiple specific IDs (Smart Fetch)
  async getAssetsByIds(ids: string[]) {
    // 1. Fetch Top 200 first (most efficient)
    const topAssets = await this.getTopAssets(200);
    const result = topAssets.filter(a => ids.includes(a.id));
    
    // 2. Find missing IDs
    const foundIds = new Set(result.map(r => r.id));
    const missingIds = ids.filter(id => !foundIds.has(id));

    // 3. Fetch missing individually (parallel)
    if (missingIds.length > 0) {
      const promises = missingIds.map(id => this.getAsset(id));
      const missingResults = await Promise.all(promises);
      missingResults.forEach(r => {
        if (r) result.push(r);
      });
    }
    
    return result;
  },

  normalizeAssets(assets: CoinCapAsset[]) {
    return assets.map(asset => ({
      id: asset.id,
      symbol: asset.symbol.toLowerCase(),
      name: asset.name,
      image: `${ICON_BASE_URL}/${asset.symbol.toLowerCase()}@2x.png`,
      current_price: parseFloat(asset.priceUsd),
      market_cap: parseFloat(asset.marketCapUsd),
      market_cap_rank: parseInt(asset.rank),
      price_change_percentage_24h: parseFloat(asset.changePercent24Hr),
      high_24h: parseFloat(asset.priceUsd), // Approximation
      low_24h: parseFloat(asset.priceUsd),  // Approximation
    }));
  }
};
