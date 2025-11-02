# CryptoVertX Implementation Details

This document outlines the technical implementation of the CryptoVertX application. It serves as a comprehensive reference for the architecture, features, data flow, and conventions used in the project.

## 1. Overview

CryptoVertX is a desktop application built with Electron and React (using TypeScript) designed for real-time cryptocurrency conversion and tracking. It provides users with live price data, token information, and charting capabilities.

## 2. Core Architecture

*   **Framework:** Electron (currently v27.1.2)
*   **Frontend:** React (v18) with Vite (v5)
*   **Language:** TypeScript (v5, strict mode enabled)
*   **Process Model:** Standard Electron Main process and Renderer process structure.
    *   **Main Process:** `src/electron/main.ts` - Handles window creation, lifecycle events, system integration (tray, global hotkeys), instance management, and auto-updates.
    *   **Renderer Process:** Manages the user interface, interacts with React components, and communicates with the Main process via IPC.
*   **Packaging:** Electron Builder (v24.9.1) for creating distributable versions (portable, MSI installer).
*   **Package Manager:** `pnpm`

## 3. State Management

The application primarily uses React Context API for managing global state:

*   **`CryptoContext` (`src/context/CryptoContext.tsx`):**
    *   Manages core cryptocurrency data: prices in USD, EUR, CAD, 24-hour percentage change, 24-hour low/high range.
    *   **Core Default Tokens:** The application now includes 9 core tokens in the `DEFAULT_CRYPTO_IDS` constant:
        *   **BTC** (Bitcoin): `bitcoin`
        *   **ETH** (Ethereum): `ethereum`
        *   **SOL** (Solana): `solana`
        *   **USDC** (USD Coin): `usd-coin`
        *   **XRP** (Ripple): `ripple`
        *   **SUI** (Sui): `sui`
        *   **BONK** (Bonk): `bonk` - Popular Solana-based meme coin
        *   **FARTCOIN** (Fartcoin): `fartcoin` - Trending meme coin
        *   **TRUMP** (Trump): `trump` - Political meme coin
    *   The `CryptoPriceData` interface now defines `price` as `number | null` to accommodate states where a definitive price isn't available (e.g., for newly added tokens before an API fetch, or when an estimated price for an unknown token is generated).
    *   Handles available tokens (default set + user-added custom tokens).
    *   Stores token metadata: name, symbol, image URL, rank.
    *   Tracks API status: loading states, errors, rate limit information.
    *   Implements caching logic for prices and metadata in `localStorage`.
    *   Manages batching for CoinGecko API requests to optimize performance.
    *   Persists custom tokens and cache to `localStorage`.
    *   Prioritizes CoinGecko's `/coins/markets` endpoint for reliable 24h range data.
    *   Includes memoization (`useCallback`) for context helper functions to prevent unnecessary re-renders and potential infinite update loops.
    *   **State Management:**
        *   `prices`: Stores `Record<string, Record<string, CryptoPriceData>>` for all tokens.
        *   `loading`: Global loading state for price updates.
        *   `error`: Global error message for price updates.
        *   `lastUpdated`: Timestamp of the last successful price update.
        *   `availableCryptos`: Array of available crypto symbols (defaults + custom).
        *   `cryptoIds`: Mapping of crypto symbols to their CoinGecko IDs.
        *   `tokenMetadata`: Stores metadata (name, image, rank) for tokens, keyed by CoinGecko ID.
        *   `pendingPriceUpdates`: A `Set<string>` tracking symbols whose prices are currently being fetched or are pending an update due to a previous failure. This is crucial for UI loading states.
            *   A symbol is **added** to this set when:
                *   It's newly added via `addCrypto` or `addCryptos`.
                *   It's part of a batch in `processBatchRequests` before API calls are made.
                *   An API call fails for it in `processBatchRequests` and no valid cache is available (i.e., an estimated price is used).
            *   A symbol is **removed** from this set when:
                *   Its price is successfully fetched and confirmed from an API (e.g., in `addCrypto`'s immediate fetch, or in `processBatchRequests`).
                *   Complete pre-loaded data (price and metadata) is utilized upon adding the token via `addCryptos`.
                *   A valid cached price is used in `processBatchRequests` after an API failure.
        *   **Targeted Refresh API (NEW):**
            *   `refreshPricesForSymbols(symbols: string[], highPriority = true)`: Public wrapper around the internal queue to request non-blocking, targeted price refreshes. Schedules a background update without toggling global `loading` or blocking input, ideal for rapid token switching.
    *   **Key Functions & Logic:**
        *   **`getEstimatedPrice(symbol)`:**
            *   If the provided `symbol` is not found in the `CONVERSION_RATES` constant, this function now returns a `CryptoPriceData` object where the `price` field for USD, EUR, and CAD is explicitly `null`.
            *   This prevents a default placeholder value (like $1) from being generated for unknown tokens, ensuring that the UI relies on the `isPending` state and the absence of a valid numerical price to display loading animations.
        *   **Stale-While-Revalidate (SWR) Behavior (NEW):**
            *   When a user switches tokens or fiat, the app will immediately use the last known cached price (if present) for conversions, even if the token is pending a refresh.
            *   A background refresh is scheduled via `refreshPricesForSymbols([symbol])` to revalidate. When fresh data arrives, the value updates in place without blocking input.
            *   The loading wave is shown only when there is no cached price available for the selected `symbol/fiat` pair.
        *   **`addCrypto(symbol, id)` & `addCryptos(tokens)`:**
            *   Immediately updates `cryptoIds` and `availableCryptos`.
            *   Adds the token(s) to `pendingPriceUpdates`.
            *   `addCryptos` is now the primary function for adding new tokens.
            *   It first checks for complete and recent (within `RECENT_DATA_THRESHOLD`) cached data (price + metadata). If found, this data is used, and the token is not marked for initial fetch and is removed from pending state.
            *   For tokens without recent complete data, it sets an estimated price and adds them to a list for a unified initial data fetch.
            *   It performs a single, high-priority `fetchCoinMarkets` call for all unique IDs requiring initial data. This call aims to get both metadata and price data in one go.
            *   If the unified fetch provides price data for a token, it's removed from `pendingPriceUpdates`.
            *   If, after the unified fetch, some tokens still lack price data (or were skipped due to having recent metadata but possibly stale price), they are queued for a high-priority price update via `queuePriceUpdate`.
            *   `addCrypto(symbol, id)` is now a lightweight wrapper that calls `addCryptos([{ symbol, id }])`.
        *   **`addTemporaryToken(token)`:**
            *   **Purpose:** Adds tokens for session-only viewing (e.g., from trending tokens page) without persisting them to the user's permanent collection.
            *   **Behavior:** Updates in-memory `cryptoIds` and `tokenMetadata` states to enable chart functionality, but does NOT modify `availableCryptos` or persist to `localStorage`.
            *   **Use Case:** When users click on trending tokens to view charts without explicitly adding them to their collection.
            *   **Session-Only:** Tokens added via this function are lost when the application restarts, ensuring they don't clutter the user's permanent token list.
        *   **`fetchTokenMetadata(specificTokens?)`:**
            *   Fetches market data from `/coins/markets`.
            *   Updates `tokenMetadata` state.
            *   Caches metadata and icons.
            *   If price data is successfully obtained (e.g., `current_price` from the response) and the main `prices` state is updated, the corresponding symbols are removed from `pendingPriceUpdates.current`.
            *   If pre-loading is active and price data is received, it updates the main `prices` state and cache directly to make pre-loaded prices immediately available, also clearing the pending state for these tokens.
        *   **`processBatchRequests()`:**
            *   Core function for fetching price updates. Adds symbols from the current batch to `pendingPriceUpdates` at the start of processing.
            *   Attempts to fetch from `/coins/markets`, then `/simple/price` on failure.
            *   **Error Handling & Pending State:**
                *   If an API call for a symbol is successful (`priceSuccessfullySetForSymbol` is true), its price is updated, and it's removed from `pendingPriceUpdates.current`.
                *   If API calls fail for a symbol (e.g., rate limit for the entire batch, or no data for a specific symbol in a partially successful batch):
                    *   It first checks for a valid cached price for that symbol.
                    *   If a valid cached price exists, that price is used for the UI, and the symbol is **removed** from `pendingPriceUpdates.current` (as we have valid, albeit cached, data).
                    *   If no valid cached price exists, an estimated price is set internally. The symbol **remains** in `pendingPriceUpdates.current`, ensuring `isPending(symbol)` is `true` and UI loading states are shown.
                *   After `MAX_API_RETRIES` for a batch operation, the global error state is set. Symbols for which only estimated prices could be set (due to persistent API failure and no cache) will remain in `pendingPriceUpdates`.
            *   Updates `prices` state and cache upon successful data retrieval for specific symbols or usage of cached data.
        *   **`queuePriceUpdate(symbols, highPriority?)`:**
            *   Adds symbols to an internal processing queue (`requestQueue.current.pendingSymbols`). Does not directly modify `pendingPriceUpdates`.
            *   Schedules `processBatchRequests`.
        *   **`updatePrices(force?)`:**
            *   If not forced, tries to serve from cache.
            *   Otherwise, queues all known `cryptoIds` for a price update (which then get added to `pendingPriceUpdates` by `processBatchRequests`).
        *   **`isPending(symbol)`:**
            *   Returns `true` if the symbol is in `pendingPriceUpdates.current`.
        *   **Caching:**
            *   Prices are cached via `cryptoCacheService` with `PRICE_CACHE_DURATION`.
            *   Metadata is cached via `cryptoCacheService` with `METADATA_CACHE_DURATION`.
            *   Icons are cached in `localStorage`.
        *   **Rate Limiting & Fallbacks:**
            *   The context respects API rate limits by using `MIN_API_INTERVAL` between batches.
            *   The `cryptoApiService` handles its own rate limit detection (e.g., for CoinGecko 429 errors) and activates a cooldown period.
            *   The context now maintains a global `isCoinGeckoRateLimitedGlobal` state that is set to `true` when a 429 status is encountered, and automatically resets after the `COINGECKO_RATE_LIMIT_COOLDOWN` period (default: 60 seconds).
            *   If `/coins/markets` fails during `processBatchRequests`, it falls back to `/simple/price`.
            *   If all API attempts fail for a symbol in a batch:
                *   The system first attempts to use a valid cached price for that symbol. If available AND the price is non-null, the UI will display this cached price, and the symbol will not be in a "pending" state for UI loading purposes.
                *   If no valid cached price is available, or if the cached price is `null`, an estimated price is set internally, but the symbol **remains** in the "pending" state (`pendingPriceUpdates`). This ensures UI components like `Header` and `Converter` will display the `WaveLoadingPlaceholder` (loading animation) instead of a potentially inaccurate estimated value (like $1.00 for a new token) or "N/A" until data is successfully fetched or max retries are hit.
                *   The logic specifically preserves the "pending" status for newly added tokens that encounter API rate limits during their initial data fetch, rather than incorrectly treating a `null` estimated price as a valid cached value.
                *   When an API is rate-limited, the context will:
                    1. Set `isCoinGeckoRateLimitedGlobal` to `true`
                    2. Schedule a timeout to set it back to `false` after `COINGECKO_RATE_LIMIT_COOLDOWN` 
                    3. Continue to use cached prices for tokens that have them
                    4. Maintain the "pending" state for tokens that lack valid cached prices
                    5. Schedule a retry for the batch after the rate limit cooldown period
            *   UI components can access the global rate limit state via the `isCoinGeckoRateLimitedGlobal` property exposed by the context, allowing them to display appropriate visual feedback to users when API rate limits are encountered.
        *   **Pre-loading Strategy (`PRELOAD_POPULAR_TOKENS_ENABLED`):**
            *   Fetches data for `POPULAR_TOKEN_IDS_TO_PRELOAD`.
            *   Pre-loaded price/metadata updates the main states and clears the pending status for these tokens via `fetchTokenMetadata`.
            *   If a user adds a pre-loaded token, `addCryptos` uses this data and ensures the token is not left unnecessarily pending.
    *   **Event-Driven Live Updates (NEW, Nov 2025):**
        *   Tracks `isAppActive` based on Electron `window-focused`/`window-blurred` IPC events and browser `online`/`offline` events.
        *   Implements intelligent polling every 45 seconds that runs only when the app is focused and online, reducing wasted API calls.
        *   Triggers an immediate refresh when the app regains focus to eliminate stale data after returning to the app.
        *   Exposes `lastRefreshedTimestamp` which is updated only when fresh data is fetched from APIs (not when serving cache). Used by UI to provide subtle refresh feedback.
    *   **UI Components Interaction with CryptoContext:**
        *   **`Header.tsx` & `Converter.tsx`:**
            *   Use `useCrypto()` to get prices, loading states, the `isPending(symbol)` function, and the global rate limit state `isCoinGeckoRateLimitedGlobal`.
            *   Display the `WaveLoadingPlaceholder` component when `isPending(selectedCrypto)` is true or when `isCoinGeckoRateLimitedGlobal` is true. This ensures that even if an internal estimated price is set (e.g., due to API failure without cache), the UI correctly shows a loading animation because the `CryptoContext` keeps the symbol in a pending state.
            *   Display a visual rate limit indicator that appears when `isCoinGeckoRateLimitedGlobal` is true, with a subtle animation to alert users that the API is currently rate-limited.
                *   In `Header.tsx`, this appears as an animated bar at the bottom of the header with a tooltip displaying the `RATE_LIMIT_UI_MESSAGE` constant.
                *   In `Converter.tsx`, this appears as a notice with the `RATE_LIMIT_UI_MESSAGE` and a clickable refresh icon that attempts to use cached data when available.
            *   **SWR UX (NEW):** `Converter.tsx` now prefers cached prices even while pending. Background refreshes are triggered via `refreshPricesForSymbols([selectedCrypto])` on crypto/fiat changes. The result box shows the loading wave only when no cached price exists for the selected pair.
            *   Display a visual rate limit indicator that appears when `isCoinGeckoRateLimitedGlobal` is true, with a subtle animation to alert users that the API is currently rate-limited.
                *   In `Header.tsx`, this appears as an animated bar at the bottom of the header with a tooltip displaying the `RATE_LIMIT_UI_MESSAGE` constant.
                *   In `Converter.tsx`, this appears as a notice with the `RATE_LIMIT_UI_MESSAGE` and a clickable refresh icon that attempts to use cached data when available.
            *   The behavior ensures that the UI prioritizes showing loading animations over potentially misleading temporary estimated values when data isn't confirmed from an API or a valid cache, while also providing clear visual feedback about API rate limits.
*   **`CryptoCompareContext` (`src/context/CryptoCompareContext.tsx`):**
    *   Appears to be less central, potentially for historical data or as a fallback API.
    *   Utilizes `VITE_CRYPTOCOMPARE_API_KEY` from the `.env` file.
*   **`ExchangeRatesContext` (`src/context/ExchangeRatesContext.tsx`):**
    *   Manages live USD to CAD and EUR exchange rates.
    *   Ensures accurate fiat currency conversions throughout the application.
    *   Fetches data from the Open Exchange Rates API.
    *   Implements a 1-hour caching strategy for exchange rates in `localStorage`.

## 4. API Integration

### 4.1. Primary Data Source: CoinGecko API

*   **Usage:** Free and Pro tiers (API key usage determines tier).
*   **API Key:** Managed via `.env` (`VITE_COINGECKO_API_KEY`). Validated using the `/ping` endpoint.
*   **Key Endpoints Used:**
    *   `/coins/markets`: Primary source for price data, 24-hour change, 24h high/low, market cap, volume, etc.
    *   `/simple/price`: Used as a fallback for basic price information.
    *   `/coins/{id}/market_chart`: For fetching data for price charts.
    *   `/coins/{id}`: For detailed information about a specific coin.
    *   `/search`: For searching tokens when adding new ones.
    *   `/ping`: To validate the API key and connectivity.
*   **Rate Limiting & Failover Strategy:**
    *   The application implements a multi-layered approach to API resilience.
    *   **Primary Key with Failover:** All requests first attempt to use the provided CoinGecko API key (`VITE_COINGECKO_API_KEY`). If a request fails with an `HTTP 429 (Too Many Requests)` status, the system automatically triggers a failover mechanism.
        *   **Failover Process:** Upon a 429 error on the primary key, `cryptoApiService` sets a temporary cooldown *specifically for the API key* (`primaryApiKeyCooldownUntil`). It then immediately retries the same request anonymously (without the API key).
        *   **Anonymous Mode:** While the primary key is in cooldown, all subsequent requests are made anonymously. This state is tracked by the `isUsingAnonymousFallback` flag within the service.
        *   **Hard Rate Limit:** If an anonymous request also receives a 429 error, the system enters a global cooldown (`rateLimitCooldownUntil`), preventing all requests for a short period to respect CoinGecko's limits.
    *   **Recovery:** Once the primary key's cooldown period expires, the service will automatically attempt the next request using the API key again. If successful, it reverts to normal operation; if it fails again with a 429, the failover cooldown is reset.
    *   **UI Awareness:** The `CryptoContext` periodically syncs with the API service's status, making the `isUsingApiFallback` state available to UI components. This allows for displaying non-intrusive notifications to the user about the application running in a limited data mode.
*   **Caching:**
    *   Price data (including 24h range): `localStorage` key `cryptovertx-price-cache`.
    *   Token metadata: `localStorage` key `cryptovertx-metadata-cache`.
    *   Token icon URLs: `localStorage` with `ICON_CACHE_PREFIX`.
    *   Configurable cache durations.
*   **Initial Token Preloading:** To provide immediate data for popular tokens on application startup, a predefined list of token IDs (`POPULAR_TOKEN_IDS_TO_PRELOAD` in `src/constants/cryptoConstants.ts`) is used to fetch initial market data. This list now includes the new core meme coins (bonk, fartcoin, trump) in addition to the existing popular tokens. This list is dynamically updated by the `scripts/fetchTop100CoinGeckoIds.ts` script, which fetches the current top 100 tokens by market cap from CoinGecko. The `PRELOAD_POPULAR_TOKENS_ENABLED` constant controls this feature.
*   **Batching:**
    *   `CryptoContext` batches multiple price update requests (`MAX_BATCH_SIZE`).
    *   Metadata fetching is also batched (`fetchMetadataInBatches`).
*   **Retries & Fallbacks:**
    *   Smart retry mechanisms with exponential backoff are implemented for API calls.
    *   `/simple/price` endpoint is used as a fallback if `/coins/markets` fails.
    *   Fallback values are provided for critical data to ensure basic offline functionality.

### 4.2. Secondary Data Source: Open Exchange Rates API

*   **Purpose:** Provides accurate USD to CAD and EUR conversion rates for fiat currency calculations.
*   **API Key:** Managed via `.env` (`VITE_OPEN_EXCHANGE_RATES_APP_ID`).
*   **Endpoint Used:** `/latest.json` for fetching current exchange rates.
*   **Caching:**
    *   1-hour caching strategy implemented in `localStorage` (key `cryptovertx-exchange-rates`).
    *   Designed to stay within the free tier limit (1,000 requests/month).

### 4.3. Tertiary Data Source: CryptoCompare API

*   **Usage:** Via `CryptoCompareContext`.
*   **API Key:** Managed via `.env` (`VITE_CRYPTOCOMPARE_API_KEY`).
*   **Purpose:** Potentially for historical data or as an alternative data source, though less integrated than CoinGecko.

### 4.4. Update Service: Cloudflare R2

*   **Purpose:** Hosts application updates for the automatic update system.
*   **SDK:** `@aws-sdk/client-s3` is used to interact with R2 (S3-compatible API).
*   **Credentials:** Requires `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `.env`.

#### 4.4.1 Automated Release Uploads to R2 (Multipart, Sep 2025)

- Script: `scripts/upload-release.ts`
  - Uses `@aws-sdk/lib-storage` Upload helper for robust multipart uploads (5 MiB–5 GiB parts; we default to 64 MiB parts, queueSize 4)
  - Detects MSI artifact for the built version in `release/<version>/`
  - Uploads to `s3://${R2_BUCKET || R2_BUCKET_NAME}/latest/<filename>`
  - Real-time progress with `ora`; safe cleanup on failure (leavePartsOnError=false)
- Env vars (add to `.env`):
  - `R2_ACCESS_KEY_ID=<your_r2_access_key_id>`
  - `R2_SECRET_ACCESS_KEY=<your_r2_secret_access_key>`
  - `CLOUDFLARE_ACCOUNT_ID=<your_account_id>`
  - `R2_BUCKET=cryptoconverter-downloads` (or `R2_BUCKET_NAME`)
  - `R2_PREFIX=latest/`
  - Optional: `R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com`
- Usage:
  - Upload standalone: `pnpm upload:release -- --version X.Y.Z` (auto-detects MSI path)
  - After build (non-interactive): `pnpm build:release:upload`
  - After build (interactive flow): `pnpm build-app` (select Release) → prompted to upload
- Build integration:
  - `scripts/build.ts` accepts `--upload` to trigger the uploader after packaging
  - Prefers MSI artifact named `CryptoVertX-MSI-Installer-v<version>.msi`; falls back to first `.msi` in the version folder
- CI notes:
  - Works in GitHub Actions or other CI: export env vars as secrets, run `pnpm build:release:upload`
  - No interactive prompts when `--upload` flag is provided
- Updater compatibility:
  - Files are placed under `latest/` so `src/services/updateService.ts` continues to discover the newest Windows installer seamlessly
- Post-upload prune:
  - After a successful upload, the uploader prunes older objects in the same `R2_PREFIX` and keeps only the newly uploaded installer
  - Toggle via env: `R2_KEEP_ONLY_LATEST=false` to disable pruning (default is true)

### 4.5. News Service Enhancement

*   **Enhanced `newsService.fetchNews(force?: boolean)`**: The news service now supports forced refresh functionality via an optional `force` parameter.
    *   **Default Behavior (`force: false`)**: Serves cached data if available and fresh, maintains existing automatic refresh behavior.
    *   **Forced Refresh (`force: true`)**: Bypasses all cache checks and fetches fresh data directly from RSS sources via IPC, ensuring users get the latest news when manually requested.
    *   **Intelligent Caching Strategy**: Maintains the existing 10-minute fresh cache with 1-hour stale cache fallback while allowing immediate updates when needed.
    *   **UI Integration**: Connected to the refresh button in `NewsPage.tsx` for seamless user-triggered updates.

### 4.6. RSS Parser Diagnostic Logging (Phase 1)

*   **Diagnostic Logging Added**: Comprehensive logging has been implemented in the `parseRSSXML` function within `src/electron/main.ts` to diagnose issues with summary extraction and truncation.
    *   **Raw XML Capture**: Logs the raw XML content of each `<item>` element (first 500 characters) to identify malformed or incomplete feed data.
    *   **Description Extraction**: Captures the raw content extracted from the `<description>` tag before any processing, revealing if the issue is with initial extraction.
    *   **Processing Steps**: Logs the summary after HTML cleaning and after truncation (if applied), allowing precise identification of where content is being lost.
    *   **Truncation Details**: Records when summaries are truncated from their original length to 200 characters, including the exact character counts.
    *   **Article-Level Tracking**: Each article's processing is tracked with clear separators, making it easy to correlate logs with specific articles.

### 4.7. Market News Engine v2 - Backend Upgrade (Phase 2)

*   **Technology Stack Upgrade**: Replaced the brittle regex-based parser with industry-standard libraries.
    *   **feedparser**: Robust RSS/Atom feed parsing library that handles malformed XML, various feed formats, and namespace complexities.
    *   **html-to-text**: Professional HTML-to-text conversion with intelligent formatting preservation and link handling.
*   **New Parser Implementation** (`parseRSSWithFeedparser`):
    *   **Stream-Based Processing**: Uses Node.js streams for efficient memory usage when parsing large feeds.
    *   **Intelligent Lede Extraction**: Smart hierarchy prioritizes true article summaries over full content:
        *   **Primary**: `description` and `summary` fields (typically contain article ledes)
        *   **Secondary**: `content:encoded` with intelligent lede extraction from first paragraph/sentences
        *   **Smart Detection**: Automatically distinguishes between summary text and full articles
    *   **Complete Summary Preservation**: No backend truncation - all summaries are sent to the frontend in full.
    *   **Enhanced Image Extraction**: Improved image URL detection from enclosures, media content, and embedded HTML.
    *   **Complete Refresh Functionality**: The refresh button now performs a comprehensive cache clear and fresh data fetch:
        *   **Cache Clearing**: Removes all localStorage entries related to news (`market-news`, `cryptovertx-cache-market-news`, etc.)
        *   **State Reset**: Clears all component state (articles, timestamps, error states)
        *   **Visual Feedback**: Button changes to green during complete refresh to indicate thorough processing
        *   **Fresh Parsing**: Ensures the new lede extraction logic runs from scratch
*   **Removed Backend Truncation**: The 200-character limit and "..." ellipsis logic have been completely removed from the main process.
*   **Error Handling**: Robust error handling with graceful fallbacks when individual feed items fail to parse.

- Dependency Pinning (Sep 2025): To prevent a runtime crash after MSI updates (Electron main process error `ERR_PACKAGE_PATH_NOT_EXPORTED` for `entities` subpath `./decode`), the `html-to-text` dependency is pinned to version `8.2.1`. Newer versions pull `entities` with strict ESM export maps that break CJS resolution inside packaged Electron apps. The main process now includes diagnostics to log the resolved versions of `html-to-text` and `entities` at startup for faster troubleshooting.

### 4.8. Frontend UI Flexibility (Phase 3)

*   **NewsCard Component Updates**:
    *   **Removed CSS Clamping**: Eliminated `-webkit-line-clamp: 3` and `overflow: hidden` from `ArticleSummary` styled component.
    *   **Dynamic Height Support**: Cards now expand naturally to accommodate full summary text without truncation.
*   **NewsService Simplification**:
    *   **Removed Redundant Processing**: Deleted the `extractSummary` method since the backend now provides complete, clean summaries.
    *   **Streamlined Data Processing**: Frontend now trusts the backend to deliver properly formatted summaries.

### 4.9. Fundraising Intelligence Engine (v3)

- New dedicated backend pipeline and UI tab focused on venture funding, grants, and ecosystem investments.
- Main process IPC: `fetch-fundraising-news` aggregates articles from curated fundraising-oriented sources (RSS + X via Nitter), filters for funding-related content, tags chains accurately, and flags tokenless L2s.
- Sources (free-only):
  - CoinDesk, Decrypt, CryptoSlate, Bitcoin.com, The Defiant (RSS)
  - Airdrops.io (RSS) to correlate incentives appearing post-funding
  - VC/Investor accounts via Nitter RSS bridge (availability may vary): a16z crypto, Paradigm, Binance Labs, Electric Capital, CoinFund, Multicoin
- Tagging & Detection:
  - Multi-stage filter: positive fundraising keywords and negative keyword suppression to reduce false positives
  - Chain attribution using a hybrid approach:
    - Direct chain keywords atlas for `SOL`, `ETH`, `SUI`, `ETH_L2s`
    - Project-to-chain map for improved attribution (e.g., Jupiter → SOL, Uniswap → ETH, Linea → ETH_L2s)
  - Tokenless inference: names like `base`, `linea`, `scroll`, `taiko` flag `tokenless = true`
  - Funding stage extraction: detects Pre-Seed/Seed/Series A/B/C/Grant/Private/Public
- Config module: `src/electron/fundraisingConfig.ts` contains source list, keyword sets, chain keywords, project map, tokenless set, and helpers.
- Parser: Reuses `parseRSSWithFeedparser` + `html-to-text` pipeline for robust feed parsing and summary extraction.
- Caching: 10-minute cache key `fundraising-news` via `cryptoCacheService` with manual full refresh support from the UI.
- Logging: Prefixed `[FUNDRAISING]` logs for fetch, parsing counts, tagging results, and chain-filter impact.

## 5. UI and Styling

*   **Component Library:** Material-UI (MUI v6.3.1 - noted as pre-release in `progress.md`).
*   **Styling Engine:** `styled-components` (v6.1.13) for CSS-in-JS.
*   **Icons:** `react-icons`.
*   **Charting Library:** `recharts` (v2.13.3) and `TradingViewWidget` for advanced charting.
*   **Navigation:** `react-router-dom` (v7.0.1 - noted as pre-release in `progress.md`).
*   **Key UI Components:**
    *   `App.tsx`: Main application component, sets up routing and global providers.
    *   `Converter.tsx`: Core UI for cryptocurrency conversion.
        *   Features "View Price Chart", "Technical Analysis", and "Trending Tokens" buttons styled with the modern "Liquid Glass" theme, incorporating gradients, blurs, and interactive glows for a sleek, tactile feel.
        *   The circular navigation buttons are positioned using `ButtonContainer` styling with `position: fixed` and `bottom: 15px` for consistent placement.
        *   The "View [Token] on CoinGecko" link positioning can be controlled via the `CoinGeckoLink` styled component's `margin-top` property (currently set to 45px for optimal spacing).
    *   `AddCryptoModal.tsx`: Modal for searching and adding new cryptocurrencies. This has been fully redesigned as the `AddTokens` page, featuring the "Liquid Glass" theme for a consistent and modern UI.
        *   Search results will now visually indicate when a token has already been added to the user's collection, disabling the item and showing an "Added" badge to prevent duplicates.
    *   `ManageTokens.tsx`: Page for viewing and removing user-added custom tokens.
        *   Fully redesigned with the "Liquid Glass" theme, featuring a new background, glass-paneled header and list container, and updated button styles for a cohesive, modern look.
        *   It now also features a separate, read-only section to display the non-removable "Core Tokens" (like BTC, ETH) for user reference.
    *   `ChartPage.tsx`: A modern dashboard page for token analysis.
        *   The entire page has been redesigned with the "Liquid Glass" theme, featuring a radial gradient background, floating glass panels, and updated button styles for a cohesive, modern aesthetic.
        *   It features a responsive two-column layout, with the main `TradingViewWidget` on the left and a detailed statistics sidebar on the right. It now uses a centralized list of exchanges, including Bybit, for a consistent user experience.
    *   `TechnicalAnalysisPage.tsx`: A dedicated technical analysis dashboard.
        *   The entire page has been redesigned with the "Liquid Glass" theme, ensuring a consistent and modern UI across the application's chart and analysis views.
        *   It mirrors the modern, two-column layout of the `ChartPage`, featuring the `TechnicalAnalysisWidget` in the main content area and the `TokenStats` component in a sidebar. It now uses a centralized list of exchanges, including Bybit, providing a consistent and comprehensive analysis experience.
    *   `Header.tsx`, `Footer.tsx`: Standard layout components. Footer is now positioned absolutely at the bottom of the application window for consistent placement across all pages.
    *   `LivePrice.tsx`: Component for displaying real-time price updates.
    *   `LiveTimeAgo.tsx`: A small, efficient component that renders a self-updating timestamp (e.g., "5s ago"), ensuring the "last updated" indicator in the `Header` is always live without causing unnecessary re-renders of the entire header.
        *   Enhancement (Nov 2025): Accepts `lastRefreshedTimestamp` from `CryptoContext` and briefly flashes the timestamp color when fresh data arrives to convey liveness.
    *   `TokenStats.tsx`: A detailed statistics panel displayed within the `ChartPage` sidebar. It shows key metrics like Market Rank, Market Cap, Volume, All-Time High/Low, and a visual progress bar for Circulating Supply. It also calculates and displays the percentage drop from the token's All-Time High (ATH), the percentage increase from its All-Time Low (ATL), and its 7-day volatility, highlighting significant changes with color. It features robust, locale-aware currency formatting.
    *   `InstanceDialog.tsx`: Dialog shown when a second instance of the app is attempted. Redesigned with the "Liquid Glass" theme to ensure UI consistency.
    *   `UpdateDialog.tsx`: Modal for handling the in-app update flow.
    *   `LoadingScreen.tsx`: An initial launch screen that displays an animated logo and progress bar to improve perceived startup performance. Controlled by `App.tsx`.
    *   `BorderBeam.tsx`: A purely decorative component that creates a soft, animated gradient beam around the main application window, enhancing the "Liquid Glass" theme. It is implemented using performant, hardware-accelerated CSS animations.
    *   `TrendingTokensPage.tsx`: Full-page component that displays a grid of the top trending tokens based on 24-hour percentage change. Features a centered "🔥 Trending Tokens" title, custom scrollbar styling matching the ManageTokens page design, and smart navigation flow that preserves user context when navigating to/from chart pages.
    *   `TrendingTokenCard.tsx`: A reusable UI card for displaying a single token in the trending list, styled with the "Liquid Glass" theme. Includes navigation state management to enable proper back navigation flow.
    *   `NewsPage.tsx`: Full-page component that displays the latest cryptocurrency, stock market, and economic calendar data aggregated from multiple RSS feeds (Cointelegraph, Decrypt, U.Today) and TradingView widgets. Features automatic refresh every 10 minutes, cached fallback data, and visual indicators for cache status. Matches the "Liquid Glass" design theme with custom scrollbar styling. Includes tabbed interface with:
        *   **Market Tab**: Traditional RSS-aggregated cryptocurrency news
        *   **Fundraising Tab**: Venture funding and ecosystem investment news
        *   **Crypto Stories Tab**: TradingView's crypto market news briefs (renamed from "Top Stories" for clarity)
        *   **Stock Market Tab**: TradingView's stock market news briefs
        *   **Economic Calendar Tab**: Interactive economic calendar with USA and Canada filters, showing key economic events, announcements, and news. Features smooth transitions when toggling between countries and side-by-side viewing capability.
        *   **Heatmap Tab**: Interactive market heatmaps powered by TradingView widgets, featuring three sub-tabs for comprehensive market visualization:
            *   **Stocks**: Global stock market heatmap with sector-based grouping and market cap segmentation
            *   **Crypto**: Cryptocurrency market heatmap showing coins by market cap and 24-hour performance
            *   **ETFs**: Exchange-traded funds heatmap with asset class grouping and volume-based sizing
        *   **Manual Refresh Button**: Features a modern, circular refresh button in the header with "Liquid Glass" styling that allows users to force immediate news updates. Includes smooth spin animations during loading, disabled states, and hover effects with gradient overlays and subtle transforms.
    *   `TradingViewHeatmapWidget.tsx`: A reusable React component that encapsulates TradingView heatmap widgets with robust error handling, loading states, and cleanup. Supports three heatmap types (stock, crypto, ETF) with configurable options for transparency, height, and attribution. Implements proper script injection and cleanup to prevent memory leaks and ensure smooth transitions between different heatmap views.
    *   `NewsCard.tsx`: A reusable UI card for displaying individual news articles with title, summary, source, timestamp, and an optional article image. Includes "Read More" button that opens articles in the user's default browser via IPC communication.

## 6. Key Features Implemented

*   **Animated Gradient Border**: A subtle, non-distracting "liquid glass" beam of light that slowly rotates around the border of the main application window. This is a purely cosmetic feature designed to enhance the modern aesthetic of the application without impacting performance.
*   **Trending Tokens Page**: A dedicated page accessible from the converter that shows the top cryptocurrency gainers over the last 24 hours. The page automatically refreshes and uses cached data as a fallback. Features include:
    *   Centered "🔥 Trending Tokens" title for clear page identification
    *   Custom scrollbar styling matching the application's "Liquid Glass" theme
    *   Smart navigation flow that preserves user context when clicking between trending tokens and chart/analysis pages
    *   **Session-Only Token Viewing**: When users click on trending tokens to view charts, tokens are added temporarily using `addTemporaryToken()` rather than permanently to the user's collection. This prevents unwanted tokens from cluttering the manage tokens page while still enabling full chart functionality.
    *   **Robust Caching System**: 5-minute fresh cache with 30-minute stale cache fallback. When API calls fail, the system automatically serves stale cached data with clear visual indicators. Includes "Try Again" functionality and detailed cache status reporting.
*   **Market News Page**: A comprehensive news aggregation system that fetches the latest cryptocurrency, stock market, and economic calendar data from multiple RSS sources and TradingView widgets. Features include:
    *   **Multi-Source RSS Aggregation**: Fetches from CoinDesk, Bitcoin.com, CryptoSlate, and Decrypt using direct RSS parsing in Electron's main process to avoid CSP issues
    *   **TradingView News Integration**: Includes dedicated tabs for both crypto and stock market news briefs from TradingView's timeline widget
    *   **TradingView Heatmap Integration**: Features interactive market heatmaps with three specialized views:
        *   **Stock Heatmap**: Global stock market overview with sector-based grouping and market cap segmentation
        *   **Crypto Heatmap**: Cryptocurrency market visualization showing coins by market cap and 24-hour performance changes
        *   **ETF Heatmap**: Exchange-traded funds overview with asset class grouping and volume-based sizing
    *   **Economic Calendar Widget**: Interactive TradingView economic calendar with country-specific filtering for USA and Canada, showing key economic events and announcements
    *   **Tabbed Interface**: Six distinct news tabs:
        *   **Market**: Traditional RSS-aggregated cryptocurrency news
        *   **Fundraising**: Venture funding and ecosystem investment news
        *   **Crypto Stories**: TradingView's crypto market news briefs (20-second reads)
        *   **Stock Market**: TradingView's stock market news briefs (20-second reads)
        *   **Economic Calendar**: Interactive calendar showing economic events for USA and Canada with smooth toggle animations
        *   **Heatmap**: Market visualization with three sub-tabs (Stocks, Crypto, ETFs) for comprehensive market analysis
    *   **Dual Country View**: Economic Calendar tab allows users to view USA and Canada calendars side-by-side with smooth transitions
    *   **Country Selection Buttons**: Interactive buttons with flag icons and smooth hover animations for toggling between USA and Canada calendars
    *   **10-Minute Refresh Cycle**: Automatically refreshes news articles every 10 minutes with manual refresh capability
    *   **Manual Refresh Button**: A modern, animated refresh button in the header that forces immediate news updates, bypassing cache. Features liquid glass styling with smooth loading animations and disabled states during fetch operations.
    *   **Intelligent Caching**: 10-minute fresh cache with 1-hour stale cache fallback for offline functionality
    *   **In-App Browser Integration**: News articles open in internal browser windows for seamless reading experience (similar to CoinGecko integration)
    *   **Rich Article Cards**: Displays article title, summary, source, timestamp, and optional images with "Liquid Glass" styling
    *   **Content Normalization**: Extracts clean summaries from HTML content and handles various RSS feed formats consistently
    *   **Smart Browser Management**: CoinGecko URLs use singleton pattern (one reusable window) while news articles create separate windows for better multi-article reading
    *   **Enhanced Status Display**: Shows "Last updated" timestamp with live updates and visual indicators for cached vs. fresh data
*   **Interactive Market Heatmaps**: Advanced market visualization system powered by TradingView widgets, providing comprehensive market overviews across multiple asset classes. Features three specialized heatmap views with real-time data updates and interactive segmentation options:
    *   **Stock Market Heatmap**: Macro-level view of global stocks with sector-based grouping, market cap segmentation, and performance-based color coding
    *   **Cryptocurrency Heatmap**: Birds-eye view of crypto markets showing coins by market cap and 24-hour performance changes with interactive filtering
    *   **ETF Heatmap**: Comprehensive overview of exchange-traded funds with asset class grouping, volume-based sizing, and performance segmentation
    *   **Seamless Integration**: Built with robust error handling, loading states, and memory-efficient script management to ensure smooth transitions between heatmap views
    *   **Responsive Design**: Fully responsive widgets that adapt to different screen sizes while maintaining optimal viewing experience
    *   **Real-time Updates**: Live data feeds with automatic refresh cycles and fallback error recovery mechanisms
*   **Modern Charting Dashboard**: The `ChartPage` provides a comprehensive and visually appealing dashboard for analyzing cryptocurrencies. It integrates a powerful `TradingViewWidget` with a dedicated `TokenStats` sidebar, all within a responsive two-column grid layout.
*   **Unified Exchange Views**: The list of supported exchanges for charting (e.g., Binance, MEXC, Bybit) is now centralized in `src/constants/cryptoConstants.ts` and used consistently across both the `ChartPage` and `TechnicalAnalysisPage` to prevent discrepancies and improve maintainability.
*   **Animated Launch Screen**: An initial loading screen built with `framer-motion` that provides a polished startup experience before the main application UI is displayed.
*   **Real-time Crypto-to-Fiat Conversion:** Core functionality of the application.
*   **Live Fiat Exchange Rates:** USD to CAD/EUR rates via Open Exchange Rates API for accurate conversions.
*   **24-Hour Price Data:** Accurate and persistent 24-hour price ranges (low/high) with correct fiat conversions.
*   **Custom Token Management:** Users can dynamically add and remove cryptocurrencies, with custom tokens stored in `localStorage`.
*   **Token Search:** Search functionality using CoinGecko API to find and add new tokens.
    *   The `AddCryptoModal.tsx` component now uses an increased debounce delay (`SEARCH_DEBOUNCE_DELAY` of 300ms) for search input to reduce the frequency of API calls.
    *   It checks the global rate limit status (`isCoinGeckoRateLimitedGlobal` from `CryptoContext`) before initiating a search.
    *   If rate-limited, it informs the user and does not attempt to search.
    *   The modal's internal retry logic for search has been simplified, relying more on the robust retry and cooldown mechanisms within `cryptoApiService.ts`.
*   **Live Price Display:** Real-time display of prices and 24-hour percentage change.
*   **Token Icon Display:** Fetches and displays token icons, with local caching in `localStorage` and placeholder generation.
*   **Token Metadata:** Fetches and displays token metadata such as name, symbol, and rank.
*   **Detailed Token Statistics:** Display of market cap, trading volume, circulating/total supply, and All-Time High/Low data. Features a horizontal progress bar for visualizing circulating supply. Includes "From ATH" and "From ATL" metrics to show percentage changes from peak and bottom prices, as well as 7-day volatility for risk analysis.
*   **Price Chart Visualization:** Historical price charts using `recharts` and `TradingViewWidget`.
*   **Robust API Handling:** Includes rate limiting, caching, batching, and retry mechanisms.
*   **Single Instance Management:** Ensures only one instance of the app runs, with a custom dialog and smart relaunch capabilities. The second instance dialog window skips the loading animation for improved user experience. In production, the instance dialog loads `index.html` (without appending a hash to the file URL) and navigates via IPC to `#/instance-dialog` to avoid FILE_NOT_FOUND errors and white-flash during creation. A robust `did-fail-load` fallback ensures the dialog always displays correctly.
*   **Minimize to Tray:** Allows the application to be minimized to the system tray.
*   **Global Hotkey:** Toggle window visibility using a global hotkey (configurable, defaults to `` ` `` or `~`).
*   **Page Navigation:** Utilizes `react-router-dom` for navigating between different views/pages.
*   **Automatic Update System:**
    *   **Source:** Checks for updates from a Cloudflare R2 bucket.
    *   **Process:** Implements a user-friendly, graphical update flow.
        *   **Check:** The user initiates a check from the app header. `updateService.ts` compares the local app version against the latest version available in the R2 bucket.
            *   **UI Feedback:** The "Check for Updates" button provides enhanced visual feedback based on 2025 "Liquid Glass" design trends. It features a "breathing" glow and an interactive icon animation that combines rotation with dynamic scaling and a glowing `drop-shadow` effect. This makes the icon itself feel animated and responsive, moving beyond simple spinning. It also provides a tactile, glassy "press-in" effect on click.
        *   **Download:** If an update is found, the new installer (`.msi` or `.exe` for portable fallback) is downloaded silently to a temporary directory. The `download-update` IPC handler in `updateHandler.ts` manages this, sending progress updates to the UI and verifying file integrity upon completion.
        *   **Install:** Once downloaded, the user is prompted to "Install & Restart". Upon confirmation, the `install-update` IPC handler in `updateHandler.ts` is triggered. It launches the graphical installer, which presents a standard setup wizard. The application then quits to allow the installer to proceed without file conflicts.
            *   **Enhanced Error Handling:** The system now provides intelligent error detection and user-friendly messaging for common installation issues:
                *   **User Cancellation Detection:** When a user cancels the UAC prompt or denies administrator access, the system detects this specific scenario (typically "Failed to open path" from `shell.openPath`) and provides a clear, actionable message: "Installation was cancelled. Click 'Install & Restart' to try again, or run the installer manually."
                *   **File Verification:** Before attempting installation, the system verifies the downloaded installer file exists and has a valid size, preventing attempts to launch corrupted or missing files.
                *   **Smart UI State Management:** Installation cancellation errors return the UI to the 'downloaded' state (allowing immediate retry) rather than the 'error' state (which would show "Retry Download"). This provides a more intuitive user experience.
                *   **Comprehensive Cleanup:** All error paths ensure proper cleanup of the `update.flag` file to prevent inconsistent states.
                *   **Categorized Error Messages:** Different error types (access denied, file not found, corruption, etc.) receive specific, helpful error messages rather than generic technical errors.
                *   **404 Popup Fix:** Fixed an issue where installation failures would trigger a fallback mechanism that incorrectly used `window.open()`, creating unwanted Electron windows showing 404 errors. The fallback now properly uses IPC to open the download page in the user's default browser.
                *   **Robust Error Preservation:** Error messages are properly preserved through the IPC layer without being wrapped in generic "Installation failed" messages for user-friendly errors.
            *   **Diagnostic Logging:** Enhanced logging throughout the update process helps identify edge cases and provides better debugging information for installation failures and unexpected window creation events.
        *   **Relaunch & Verify:** The user completes the installation via the setup wizard, which includes a "Launch application" option at the end. When the new version of the app starts, the `main.ts` process detects an `update.flag` file. It sends an `update-successful` IPC message to the renderer to trigger a success notification and then deletes the flag file.
    *   **UI:** An `UpdateDialog.tsx` component manages the UI for the entire flow, showing the available update, download progress, and initiating the installation. The dialog now provides contextual error messages and appropriate retry options based on the type of failure encountered.
*   **Window Position Memory:** Remembers and restores window position on startup.
*   **Focus/Blur Handling:** Implemented for window management.
*   **Build Optimization:** Optimized chunk splitting (vendor, UI, charts), fast production builds, efficient caching, minimal output size.
*   **Version Management:** Centralized version handling (`versionManager.ts`), automated version injection during build, and version comparison for updates.
*   **Loading Placeholders:** Implemented a smooth shimmer/wave animation (`WaveLoadingPlaceholder.tsx`) to replace numerical placeholders (e.g., previous `$1` estimates or "N/A") in the `Converter` result display and `Header` price display during price fetching or when data is pending. This enhances UX by providing visual feedback without showing potentially misleading or jarring placeholder numbers.
*   **Build Compression:** Uses `normal` compression level for a balance between installer size and installation speed, improving the initial setup experience.
*   **Robust Stablecoin Detection:** Implemented a multi-factor stablecoin detection system. It first checks if a token's metadata (CoinGecko categories) or symbol suggests it's a stablecoin. If this initial check is positive, it then verifies the token's live price against a defined range (e.g., $0.98-$1.02) to confirm it's actually trading at its peg. This prevents false positives from de-pegged or low-value tokens and ensures the automatic fiat currency switching is accurate.
*   **Smart Navigation Flow:** Implemented context-aware navigation that preserves user journey flow. When navigating from the TrendingTokensPage to ChartPage or TechnicalAnalysisPage, the back button intelligently returns users to the TrendingTokensPage instead of the default converter, maintaining navigation context and improving user experience.
*   **Enhanced UI Positioning:** Optimized component positioning throughout the application:
    *   Footer repositioned to absolute bottom of the window for consistent placement across all pages
    *   CoinGecko link spacing adjusted for better visual hierarchy in the converter
    *   Circular navigation button positioning made configurable via `ButtonContainer` styling for easy adjustment

### Phase 4: Chart Page UI/UX Overhaul (v1.7.3)
Completely redesigned the `ChartPage` to improve information hierarchy and visual appeal. This involved moving from a simple stacked layout to a modern two-column dashboard, redesigning the header for unified controls, and transforming `TokenStats` into a detailed sidebar panel with improved data visualization, including a horizontal progress bar for circulating supply. This phase also included significant bug fixes related to data fetching and currency formatting to ensure a stable and intuitive user experience.

### Phase 5: Technical Analysis Page UI/UX Overhaul (v1.7.6)
Transformed the `TechnicalAnalysisPage` from a simple modal overlay into a full-featured dashboard. The new design mirrors the `ChartPage`'s modern, two-column layout, integrating the `TechnicalAnalysisWidget` with the `TokenStats` sidebar. This creates a unified, aesthetically consistent, and more functional analysis environment for the user, moving away from a jarring popup to a seamless, integrated page experience.

### Phase 6: Robust Stablecoin Verification (v1.8.1)
Refactored the stablecoin detection logic to be more robust and prevent false positives. The system now uses a two-factor approach: it first checks for metadata signals (categories, symbol) that indicate a token is *supposed* to be a stablecoin, and then it performs a price verification check to ensure the token is *actually* trading near its peg (e.g., within a $0.98-$1.02 USD range). This prevents low-value non-stablecoins or de-pegged stablecoins from triggering the auto-switch logic.

### Phase 7: MSI Installer Support for Auto-Updates (v2.2.0)
Enhanced the update system to support both MSI and EXE installers for seamless auto-updates. The system now:

**Update Discovery:**
- Modified `updateService.ts` to search for both MSI and EXE installers in the R2 bucket
- Supports `