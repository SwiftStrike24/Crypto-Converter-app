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
    *   **Key Functions & Logic:**
        *   **`getEstimatedPrice(symbol)`:**
            *   If the provided `symbol` is not found in the `CONVERSION_RATES` constant, this function now returns a `CryptoPriceData` object where the `price` field for USD, EUR, and CAD is explicitly `null`.
            *   This prevents a default placeholder value (like $1) from being generated for unknown tokens, ensuring that the UI relies on the `isPending` state and the absence of a valid numerical price to display loading animations.
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
    *   **UI Components Interaction with CryptoContext:**
        *   **`Header.tsx` & `Converter.tsx`:**
            *   Use `useCrypto()` to get prices, loading states, the `isPending(symbol)` function, and the global rate limit state `isCoinGeckoRateLimitedGlobal`.
            *   Display the `WaveLoadingPlaceholder` component when `isPending(selectedCrypto)` is true or when `isCoinGeckoRateLimitedGlobal` is true. This ensures that even if an internal estimated price is set (e.g., due to API failure without cache), the UI correctly shows a loading animation because the `CryptoContext` keeps the symbol in a pending state.
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

## 5. UI and Styling

*   **Component Library:** Material-UI (MUI v6.3.1 - noted as pre-release in `progress.md`).
*   **Styling Engine:** `styled-components` (v6.1.13) for CSS-in-JS.
*   **Icons:** `react-icons`.
*   **Charting Library:** `recharts` (v2.13.3) and `TradingViewWidget` for advanced charting.
*   **Navigation:** `react-router-dom` (v7.0.1 - noted as pre-release in `progress.md`).
*   **Key UI Components:**
    *   `App.tsx`: Main application component, sets up routing and global providers.
    *   `Converter.tsx`: Core UI for cryptocurrency conversion.
    *   `AddCryptoModal.tsx`: Modal for searching and adding new cryptocurrencies.
    *   `ManageTokens.tsx`: Page for viewing and removing user-added custom tokens. It now also features a separate, read-only section to display the non-removable "Core Tokens" (like BTC, ETH) for user reference.
    *   `ChartPage.tsx`: A modern dashboard page for token analysis. It features a responsive two-column layout, with the main `TradingViewWidget` on the left and a detailed statistics sidebar on the right. It now uses a centralized list of exchanges, including Bybit, for a consistent user experience.
    *   `TechnicalAnalysisPage.tsx`: A dedicated technical analysis dashboard. It mirrors the modern, two-column layout of the `ChartPage`, featuring the `TechnicalAnalysisWidget` in the main content area and the `TokenStats` component in a sidebar. It now uses a centralized list of exchanges, including Bybit, providing a consistent and comprehensive analysis experience.
    *   `Header.tsx`, `Footer.tsx`: Standard layout components.
    *   `LivePrice.tsx`: Component for displaying real-time price updates.
    *   `LiveTimeAgo.tsx`: A small, efficient component that renders a self-updating timestamp (e.g., "5s ago"), ensuring the "last updated" indicator in the `Header` is always live without causing unnecessary re-renders of the entire header.
    *   `TokenStats.tsx`: A detailed statistics panel displayed within the `ChartPage` sidebar. It shows key metrics like Market Rank, Market Cap, Volume, All-Time High/Low, and a visual progress bar for Circulating Supply. It also calculates and displays the percentage drop from the token's All-Time High (ATH), the percentage increase from its All-Time Low (ATL), and its 7-day volatility, highlighting significant changes with color. It features robust, locale-aware currency formatting.
    *   `InstanceDialog.tsx`: Dialog shown when a second instance of the app is attempted.
    *   `UpdateDialog.tsx`: Modal for handling the in-app update flow.
    *   `LoadingScreen.tsx`: An initial launch screen that displays an animated logo and progress bar to improve perceived startup performance. Controlled by `App.tsx`.

## 6. Key Features Implemented

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
*   **Single Instance Management:** Ensures only one instance of the app runs, with a custom dialog and smart relaunch capabilities.
*   **Minimize to Tray:** Allows the application to be minimized to the system tray.
*   **Global Hotkey:** Toggle window visibility using a global hotkey (configurable, defaults to `` ` `` or `~`).
*   **Page Navigation:** Utilizes `react-router-dom` for navigating between different views/pages.
*   **Automatic Update System:**
    *   **Source:** Checks for updates from a Cloudflare R2 bucket.
    *   **Process:** Implements a user-friendly, graphical update flow.
        *   **Check:** The user initiates a check from the app header. `updateService.ts` compares the local app version against the latest version available in the R2 bucket.
        *   **Download:** If an update is found, the new installer (`.msi` or `.exe` for portable fallback) is downloaded silently to a temporary directory. The `download-update` IPC handler in `updateHandler.ts` manages this, sending progress updates to the UI and verifying file integrity upon completion.
        *   **Install:** Once downloaded, the user is prompted to "Install & Restart". Upon confirmation, the `install-update` IPC handler in `updateHandler.ts` is triggered. It launches the graphical installer, which presents a standard setup wizard. The application then quits to allow the installer to proceed without file conflicts.
        *   **Relaunch & Verify:** The user completes the installation via the setup wizard, which includes a "Launch application" option at the end. When the new version of the app starts, the `main.ts` process detects an `update.flag` file. It sends an `update-successful` IPC message to the renderer to trigger a success notification and then deletes the flag file.
    *   **UI:** An `UpdateDialog.tsx` component manages the UI for the entire flow, showing the available update, download progress, and initiating the installation.
*   **Window Position Memory:** Remembers and restores window position on startup.
*   **Focus/Blur Handling:** Implemented for window management.
*   **Build Optimization:** Optimized chunk splitting (vendor, UI, charts), fast production builds, efficient caching, minimal output size.
*   **Version Management:** Centralized version handling (`versionManager.ts`), automated version injection during build, and version comparison for updates.
*   **Loading Placeholders:** Implemented a smooth shimmer/wave animation (`WaveLoadingPlaceholder.tsx`) to replace numerical placeholders (e.g., previous `$1` estimates or "N/A") in the `Converter` result display and `Header` price display during price fetching or when data is pending. This enhances UX by providing visual feedback without showing potentially misleading or jarring placeholder numbers.
*   **Build Compression:** Uses `normal` compression level for a balance between installer size and installation speed, improving the initial setup experience.
*   **Robust Stablecoin Detection:** Implemented a multi-factor stablecoin detection system. It first checks if a token's metadata (CoinGecko categories) or symbol suggests it's a stablecoin. If this initial check is positive, it then verifies the token's live price against a defined range (e.g., $0.98-$1.02) to confirm it's actually trading at its peg. This prevents false positives from de-pegged or low-value tokens and ensures the automatic fiat currency switching is accurate.

### Phase 4: Chart Page UI/UX Overhaul (v1.7.3)
Completely redesigned the `ChartPage` to improve information hierarchy and visual appeal. This involved moving from a simple stacked layout to a modern two-column dashboard, redesigning the header for unified controls, and transforming `TokenStats` into a detailed sidebar panel with improved data visualization, including a horizontal progress bar for circulating supply. This phase also included significant bug fixes related to data fetching and currency formatting to ensure a stable and intuitive user experience.

### Phase 5: Technical Analysis Page UI/UX Overhaul (v1.7.6)
Transformed the `TechnicalAnalysisPage` from a simple modal overlay into a full-featured dashboard. The new design mirrors the `ChartPage`'s modern, two-column layout, integrating the `TechnicalAnalysisWidget` with the `TokenStats` sidebar. This creates a unified, aesthetically consistent, and more functional analysis environment for the user, moving away from a jarring popup to a seamless, integrated page experience.

### Phase 6: Robust Stablecoin Verification (v1.8.1)
Refactored the stablecoin detection logic to be more robust and prevent false positives. The system now uses a two-factor approach: it first checks for metadata signals (categories, symbol) that indicate a token is *supposed* to be a stablecoin, and then it performs a price verification check to ensure the token is *actually* trading near its peg (e.g., within a $0.98-$1.02 USD range). This prevents low-value non-stablecoins or de-pegged stablecoins from triggering the auto-switch logic.

## 7. Build and Development Process

*   **Package Manager:** `pnpm` (preferred for its speed and efficiency).
*   **Build Tool (Frontend):** Vite for development server and building React assets.
*   **Packaging (Desktop App):** Electron Builder.
    *   Configured in `package.json` under the `build` section.
    *   Outputs to `release/${version}` directory.
    *   Targets Windows with three package types:
        1.  **Portable:** A standalone `.exe` file that requires no installation.
        2.  **MSI Installer:** A standard Windows Installer package (`.msi`) with a setup wizard.
        3.  **NSIS Installer:** An alternative setup wizard (`.exe`), offering a different installation experience.
    *   Uses `asar` packaging for efficiency.
*   **Build Scripts (`package.json`):**
    *   `pnpm dev`: Starts the Vite development server for the React frontend.
    *   `pnpm build`: Transpiles TypeScript and builds the React frontend assets using Vite.
    *   `pnpm electron:dev`: Runs the Electron app in development mode, usually with Vite serving the frontend.
    *   `pnpm build-app [--default | --portable | --msi | --exe | --all]`: Interactive build script (driven by `tsx scripts/build.ts`) for creating distributable Electron application packages. Handles versioning and allows choosing build types.
    *   `pnpm update-top-tokens`: Executes `tsx scripts/fetchTop100CoinGeckoIds.ts` to refresh the `POPULAR_TOKEN_IDS_TO_PRELOAD` list in `src/constants/cryptoConstants.ts` with the current top 100 tokens from CoinGecko. This script uses `axios` for the API call.
    *   `pnpm lint`: Runs ESLint for code quality checks.
*   **Interactive Build System (`scripts/build.ts`):**
    *   Provides a menu to choose build types. The default option builds the EXE Setup Wizard and the Portable version. Other options include MSI only, Portable only, EXE only, and All packages.
    *   Handles version management (reads from `package.json`, updates `versionManager.ts`, prompts for new version/overwrite).
    *   Creates versioned output directories.
    *   Provides a build summary with performance metrics when building multiple artifacts.

### 7.1. Utility Scripts

*   **`scripts/fetchTop100CoinGeckoIds.ts`**
    *   **Purpose:** Automatically fetches the top 100 cryptocurrencies by market capitalization from the CoinGecko API (using `axios`) and updates the `POPULAR_TOKEN_IDS_TO_PRELOAD` array in `src/constants/cryptoConstants.ts`.
    *   **Execution:** Can be run manually using `pnpm update-top-tokens`.
    *   **Dependencies:** Uses `axios` (already a project dependency).
    *   **Output:** Modifies `src/constants/cryptoConstants.ts` in place with the new list of token IDs and includes an auto-generation date comment.
    *   **Note:** The script makes a direct HTTP GET request to the CoinGecko `/coins/markets` endpoint.

## 8. Electron-Specific Implementation Details

### 8.1. Instance Management (`src/electron/main.ts`)

*   Uses `app.requestSingleInstanceLock()` to ensure only one instance runs.
*   If a second instance is attempted, it focuses the primary instance and can show a custom dialog (`InstanceDialog.tsx`).
*   Handles smart relaunch, especially useful during updates.
*   Ensures graceful cleanup on exit.

### 8.2. Window Management (`src/electron/main.ts`)

*   **Global Hotkey:** Registered using `globalShortcut` to toggle the main window's visibility.
*   **Minimize to Tray:**
    *   Creates a `Tray` icon.
    *   Handles window minimize events to hide the window and show it from the tray.
    *   Provides a context menu for the tray icon (e.g., Show/Hide, Quit).
*   **Window Position Memory:** Likely uses `electron-store` or a similar mechanism (or custom `localStorage` access from main) to save and restore window bounds.
*   **Focus/Blur Handling:** Manages window appearance based on focus state.

### 8.3. Auto-Updates (`src/electron/updateHandler.ts`, `src/services/updateService.ts`)

*   Integrates with Cloudflare R2 for update distribution.
*   Checks for new versions by comparing the current app version with the latest version available on R2.
*   Uses semantic versioning for comparison.
*   Handles the download of the update package and launches the graphical installer.
*   Supports both direct in-app updates and fallback browser-based downloads.

## 9. Configuration

*   **Environment Variables:** Managed via a `.env` file in the root directory.
    *   `.env.example` provides a template for required variables.
    *   Key variables:
        *   `VITE_COINGECKO_API_KEY`
        *   `VITE_CRYPTOCOMPARE_API_KEY`
        *   `VITE_OPEN_EXCHANGE_RATES_APP_ID`
        *   `CLOUDFLARE_ACCOUNT_ID`
        *   `R2_ACCESS_KEY_ID`
        *   `R2_SECRET_ACCESS_KEY`
*   **Build Configuration:** `electron-builder` settings in `package.json`.
*   **Vite Configuration:** `vite.config.ts`.
*   **TypeScript Configuration:** `tsconfig.json`, `tsconfig.node.json`.

## 10. Key Dependencies

Referenced from `package.json` and `progress.md`.

### 10.1. Core Dependencies

*   `@aws-sdk/client-s3`: For Cloudflare R2 interaction.
*   `@emotion/react`, `@emotion/styled`: Likely pulled in by MUI.
*   `@mui/material`, `@mui/styles`: UI component library.
*   `axios`: For making HTTP requests to APIs. Used by various parts of the application, including the `scripts/fetchTop100CoinGeckoIds.ts` script.
*   `date-fns`: Utility for date formatting/manipulation.
*   `dotenv`: For loading environment variables.
*   `focus-trap-react`: For managing focus within modals/dialogs.
*   `framer-motion`: For animations.
*   `lightweight-charts`: (Presence noted in `package.json`, `progress.md` suggests `recharts` is primary - verification needed).
*   `lodash`: Utility library.
*   `react`, `react-dom`: Core React library.
*   `react-error-boundary`: For graceful error handling in React components.
*   `react-icons`: Icon library.
*   `react-router-dom`: For client-side routing.
*   `recharts`: Charting library.
*   `styled-components`: CSS-in-JS library.
*   `systeminformation`: To get system related information.

### 10.2. Development Dependencies

*   `electron`: Core Electron framework.
*   `electron-builder`: For packaging the Electron app.
*   `vite`: Build tool and dev server for the React frontend.
*   `typescript`: TypeScript language support.
*   `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`: Linting tools.
*   Various `@types/*` packages for type definitions.
*   `tsx`: For running TypeScript files directly (used in build scripts).
*   `cross-env`: For setting environment variables across platforms.
*   `chalk`, `ora`, `prompts`: For enhancing CLI output in build scripts.

## 11. Coding Conventions and Practices

*   **File Structure:**
    *   Organized by process: `src/electron` (main), `src` (renderer/shared).
    *   Feature-based directories: `components`, `context`, `hooks`, `pages`, `services`, `utils`, `types`.
*   **TypeScript Usage:**
    *   Strict mode enabled (`tsconfig.json`).
    *   Extensive use of Interfaces (often prefixed with `I`) and Types (often suffixed with `Type`).
    *   `env.d.ts` for typing environment variables.
*   **Naming Conventions:**
    *   Components, Interfaces, Types: `PascalCase`.
    *   Functions, Variables: `camelCase`.
    *   Component Prop Interfaces: Often `Props` suffix (e.g., `MyComponentProps`).
    *   Directories: `lowercase-with-dashes`.
*   **Constants:** Defined in relevant files for API details, caching parameters, rate limits, etc. (Consider centralizing common constants).
*   **Error Handling:**
    *   `try/catch` blocks for asynchronous operations and API calls.
    *   State variables (e.g., `error`, `loading`) in components and contexts to reflect API status.
    *   Specific handling for API errors (e.g., HTTP 429 for rate limits).
    *   `react-error-boundary` for catching rendering errors in components.
*   **React Practices:**
    *   Functional components and Hooks are standard.
    *   React Context API for global state management.
*   **Environment Variables:** Securely loaded from `.env` and not committed to version control.
*   **Clean Code Principles:**
    *   Adherence to DRY (Don't Repeat Yourself).
    *   Single Responsibility Principle for functions and components.
    *   Use of meaningful names for variables, functions, and components.
    *   Comments primarily for explaining *why* something is done, not *what* it does.

## 12. Security Considerations

*   **API Keys:** Loaded from environment variables and not hardcoded. Passed securely to the renderer process where needed.
*   **IPC Communication:** Context isolation is enabled and `nodeIntegration` is false. `contextBridge` is used to expose functionalities securely.
*   **Content Security Policy (CSP):** A strict CSP should be implemented.
*   **External Content:** Open external links in the default browser using `shell.openExternal`.
*   **Dependencies:** Regularly audit dependencies for vulnerabilities.
*   **Build Environment:** Securely manage sensitive credentials in the build environment.

## 13. CORS Handling (Development)

*   Vite development server (`vite.config.ts`) is configured with a proxy for API requests to bypass CORS issues during local development. This is not relevant for production builds.

## 14. Refactoring History

This section documents major refactoring efforts to serve as a historical reference.

### Phase 1: `CryptoContext.tsx` Refactor (v1.5.4)
Decomposed the monolithic `CryptoContext` into specialized custom hooks (`useCryptoPricing`, `useTokenManagement`, etc.) and services (`cryptoApiService`, `cryptoCacheService`) to improve modularity and maintainability.

### Phase 2: Enhanced Rate Limiting & Cache-First Strategy (v1.5.5)
Implemented an advanced, cache-first data fetching strategy to eliminate UI delays caused by API rate limiting. This involved intelligent rate limit detection, global request throttling, and serving cached data immediately while fetching fresh data in the background.

### Phase 3: Intelligent Stablecoin Detection & Auto-Switching (v1.6.0)
Introduced a multi-layer stablecoin detection system that automatically switches the target fiat currency based on the type of stablecoin selected by the user, enhancing the user experience for stablecoin conversions. 

### Phase 4: Chart Page UI/UX Overhaul (v1.7.3)
Completely redesigned the `ChartPage` to improve information hierarchy and visual appeal. This involved moving from a simple stacked layout to a modern two-column dashboard, redesigning the header for unified controls, and transforming `TokenStats` into a detailed sidebar panel with improved data visualization, including a horizontal progress bar for circulating supply. This phase also included significant bug fixes related to data fetching and currency formatting to ensure a stable and intuitive user experience. 

### Phase 5: Technical Analysis Page UI/UX Overhaul (v1.7.6)
Transformed the `TechnicalAnalysisPage` from a simple modal overlay into a full-featured dashboard. The new design mirrors the `ChartPage`'s modern, two-column layout, integrating the `TechnicalAnalysisWidget` with the `TokenStats` sidebar. This creates a unified, aesthetically consistent, and more functional analysis environment for the user, moving away from a jarring popup to a seamless, integrated page experience. 

### Phase 6: Robust Stablecoin Verification (v1.8.1)
Refactored the stablecoin detection logic to be more robust and prevent false positives. The system now uses a two-factor approach: it first checks for metadata signals (categories, symbol) that indicate a token is *supposed* to be a stablecoin, and then it performs a price verification check to ensure the token is *actually* trading near its peg (e.g., within a $0.98-$1.02 USD range). This prevents low-value non-stablecoins or de-pegged stablecoins from triggering the auto-switch logic. 