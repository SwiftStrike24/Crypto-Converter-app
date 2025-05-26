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
*   **Packaging:** Electron Builder (v24.9.1) for creating distributable versions (portable, installer).
*   **Package Manager:** `pnpm`

## 3. State Management

The application primarily uses React Context API for managing global state:

*   **`CryptoContext` (`src/context/CryptoContext.tsx`):**
    *   Manages core cryptocurrency data: prices in USD, EUR, CAD, 24-hour percentage change, 24-hour low/high range.
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
*   **Rate Limiting:**
    *   Custom logic implemented in `useTokenSearch.ts` and `src/utils/rateLimiter.ts`.
    *   Aware of Free vs. Pro tier limits (defined in `COINGECKO_RATE_LIMITS`).
    *   Tracks API calls per minute and implements cooldown periods to prevent exceeding limits.
*   **Caching:**
    *   Price data (including 24h range): `localStorage` key `cryptovertx-price-cache`.
    *   Token metadata: `localStorage` key `cryptovertx-metadata-cache`.
    *   Token icon URLs: `localStorage` with `ICON_CACHE_PREFIX`.
    *   Configurable cache durations.
*   **Initial Token Preloading:** To provide immediate data for popular tokens on application startup, a predefined list of token IDs (`POPULAR_TOKEN_IDS_TO_PRELOAD` in `src/constants/cryptoConstants.ts`) is used to fetch initial market data. This list is dynamically updated by the `scripts/fetchTop100CoinGeckoIds.ts` script, which fetches the current top 100 tokens by market cap from CoinGecko. The `PRELOAD_POPULAR_TOKENS_ENABLED` constant controls this feature.
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
*   **Charting Library:** `recharts` (v2.13.3).
*   **Navigation:** `react-router-dom` (v7.0.1 - noted as pre-release in `progress.md`).
*   **Key UI Components:**
    *   `App.tsx`: Main application component, sets up routing and global providers.
    *   `Converter.tsx`: Core UI for cryptocurrency conversion.
    *   `AddCryptoModal.tsx`: Modal for searching and adding new cryptocurrencies.
    *   `ManageTokens.tsx`: Page for viewing and removing user-added custom tokens.
    *   `Header.tsx`, `Footer.tsx`: Standard layout components.
    *   `LivePrice.tsx`: Component for displaying real-time price updates.
    *   `ChartModal.tsx`, `CryptoChart.tsx`: Components for displaying cryptocurrency price charts.
    *   `TokenStats.tsx`: Displays detailed market statistics for a selected token.
    *   `InstanceDialog.tsx`: Dialog shown when a second instance of the app is attempted.

## 6. Key Features Implemented

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
*   **Detailed Token Statistics:** Display of market cap, trading volume, circulating/total supply.
*   **Price Chart Visualization:** Historical price charts using `recharts`.
*   **Robust API Handling:** Includes rate limiting, caching, batching, and retry mechanisms.
*   **Single Instance Management:** Ensures only one instance of the app runs, with a custom dialog and smart relaunch capabilities.
*   **Minimize to Tray:** Allows the application to be minimized to the system tray.
*   **Global Hotkey:** Toggle window visibility using a global hotkey (configurable, defaults to `` ` `` or `~`).
*   **Page Navigation:** Utilizes `react-router-dom` for navigating between different views/pages.
*   **Automatic Update System:** Checks for updates from Cloudflare R2 and facilitates the update process.
*   **Window Position Memory:** Remembers and restores window position on startup.
*   **Focus/Blur Handling:** Implemented for window management.
*   **Build Optimization:** Optimized chunk splitting (vendor, UI, charts), fast production builds, efficient caching, minimal output size.
*   **Version Management:** Centralized version handling (`versionManager.ts`), automated version injection during build, and version comparison for updates.
*   **Loading Placeholders:** Implemented a smooth shimmer/wave animation (`WaveLoadingPlaceholder.tsx`) to replace numerical placeholders (e.g., previous `$1` estimates or "N/A") in the `Converter` result display and `Header` price display during price fetching or when data is pending. This enhances UX by providing visual feedback without showing potentially misleading or jarring placeholder numbers.

## 7. Build and Development Process

*   **Package Manager:** `pnpm` (preferred for its speed and efficiency).
*   **Build Tool (Frontend):** Vite for development server and building React assets.
*   **Packaging (Desktop App):** Electron Builder.
    *   Configured in `package.json` under the `build` section.
    *   Outputs to `release/${version}` directory.
    *   Targets Windows (portable `.exe` and NSIS installer).
    *   Uses `asar` packaging for efficiency.
*   **Build Scripts (`package.json`):**
    *   `pnpm dev`: Starts the Vite development server for the React frontend.
    *   `pnpm build`: Transpiles TypeScript and builds the React frontend assets using Vite.
    *   `pnpm electron:dev`: Runs the Electron app in development mode, usually with Vite serving the frontend.
    *   `pnpm build-app [--installer | --portable | --both]`: Interactive build script (driven by `tsx scripts/build.ts`) for creating distributable Electron application packages. Handles versioning and allows choosing build types.
    *   `pnpm update-top-tokens`: Executes `tsx scripts/fetchTop100CoinGeckoIds.ts` to refresh the `POPULAR_TOKEN_IDS_TO_PRELOAD` list in `src/constants/cryptoConstants.ts` with the current top 100 tokens from CoinGecko. This script uses `axios` for the API call.
    *   `pnpm lint`: Runs ESLint for code quality checks.
*   **Interactive Build System (`scripts/build.ts`):**
    *   Provides a menu to choose build types (Portable, Installer, Both).
    *   Handles version management (reads from `package.json`, updates `versionManager.ts`, prompts for new version/overwrite).
    *   Creates versioned output directories.
    *   Provides a build summary with performance metrics when building "Both".

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

### 8.3. Auto-Updates (`src/electron/main.ts` and update-related modules)

*   Integrates with Cloudflare R2 for update distribution.
*   Checks for new versions by comparing the current app version with the latest version available on R2.
*   Uses semantic versioning for comparison.
*   Handles download and installation of updates, potentially using `electron-updater` concepts or a custom implementation.
*   Supports both direct updates and browser-based downloads if direct update fails.

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
*   `coingecko-api`: A client library for interacting with the CoinGecko API, used by the `scripts/fetchTop100CoinGeckoIds.ts` script to fetch top token data.
*   `date-fns`: Utility for date formatting/manipulation.
*   `dotenv`: For loading environment variables.
*   `focus-trap-react`: For managing focus within modals/dialogs.
*   `framer-motion`: For animations.
*   `lightweight-charts`: (Presence noted in `package.json`, `progress.md` suggests `recharts` is primary - needs verification if both are used).
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

*   **API Keys:** Loaded from environment variables and not hardcoded. Passed securely to the renderer process where needed (e.g., via preload scripts or specific IPC channels if direct exposure is avoided).
*   **IPC Communication:** Ensure context isolation is enabled and `nodeIntegration` is false. Use `contextBridge` in preload scripts to expose specific functionalities to the renderer process securely. Validate and sanitize data passed via IPC.
*   **Content Security Policy (CSP):** Implement a strict CSP to mitigate XSS attacks.
*   **External Content:** Be cautious when loading external content or navigating to external URLs.
*   **Dependencies:** Regularly audit dependencies for known vulnerabilities.
*   **Build Environment:** Ensure API keys and sensitive credentials are properly set and secured in the build environment for production builds.

## 13. CORS Handling (Development)

*   Vite development server (`vite.config.ts`) is configured with a proxy for API requests (e.g., `/api-proxy`) to bypass CORS issues during local development. This is not relevant for production builds where the Electron app makes direct requests.

## 14. Refactoring Plan: `CryptoContext.tsx` (v1.5.4 -> Future)

This section outlines the plan to refactor the `CryptoContext.tsx` file to improve modularity, maintainability, and scalability.

### 14.1. Problem Statement

The `CryptoContext.tsx` file has grown significantly (approx. 1550 lines) and manages a wide range of responsibilities including:
*   Fetching and caching cryptocurrency prices.
*   Managing available tokens and their IDs.
*   Fetching and caching token metadata (name, symbol, image, rank).
*   Managing token icons (fetching, caching, placeholders).
*   Handling API interactions with CoinGecko, including rate limiting, batching, and retries.
*   Interacting with `localStorage` for various caches and custom token persistence.

This large size and broad scope make the file difficult to navigate, maintain, and test effectively.

### 14.2. Proposed New Architecture

The `CryptoContext.tsx` will be decomposed into a set of specialized custom hooks and services. The `CryptoProvider` will then orchestrate these hooks, and the context value will be composed of the states and functions exposed by them.

**New Directory Structure:**

*   `src/hooks/crypto/`: Will house new custom React hooks.
    *   `useCryptoPricing.ts`
    *   `useTokenManagement.ts`
    *   `useTokenMetadata.ts`
    *   `useTokenIcons.ts`
*   `src/services/crypto/`: For services not directly tied to React's hook lifecycle.
    *   `cryptoApiService.ts`
    *   `cryptoCacheService.ts`
*   `src/constants/cryptoConstants.ts`: For all crypto-related constants.

### 14.3. Responsibilities of New Modules

1.  **`src/constants/cryptoConstants.ts`:**
    *   **Responsibility:** Centralize all constants related to cryptocurrency data handling. This includes API endpoints, cache keys and durations, rate limiting parameters, default token lists (like `DEFAULT_CRYPTO_IDS`), and the list of popular tokens for preloading (`POPULAR_TOKEN_IDS_TO_PRELOAD`). The `POPULAR_TOKEN_IDS_TO_PRELOAD` list is populated and kept up-to-date by the `scripts/fetchTop100CoinGeckoIds.ts` script, which sources data from CoinGecko's top 100 market cap ranking.
    *   **Benefit:** Improves organization, makes configuration easier to manage, and provides a clear, dynamically updated source for the preload token set.

2.  **`src/services/crypto/cryptoApiService.ts`:**
    *   **Responsibility:** Encapsulate all direct CoinGecko API communication logic. This includes constructing API requests, handling responses, managing API-specific error handling (like 429s), and implementing smart retry mechanisms (`fetchWithSmartRetry`). It will also manage CoinGecko-specific rate limiting state (e.g., `rateLimitCooldownUntil`).
    *   **Benefit:** Isolates external dependencies, making it easier to update API versions, add new providers, or mock for testing.

3.  **`src/services/crypto/cryptoCacheService.ts`:**
    *   **Responsibility:** Provide generic utility functions for interacting with `localStorage` for caching purposes. This includes getting/setting cached data with timestamp management and TTL (Time To Live) checks.
    *   **Benefit:** Standardizes caching logic across different types of data (prices, metadata, icons).

4.  **`src/hooks/crypto/useTokenManagement.ts`:**
    *   **Responsibility:** Manage the state of `availableCryptos` and `cryptoIds`. Handle functions like `addCrypto`, `addCryptos`, `deleteCrypto`, and `getCryptoId`. Manage persistence of custom tokens to `localStorage`.
    *   **Benefit:** Consolidates all logic related to the user's token list.

5.  **`src/hooks/crypto/useTokenMetadata.ts`:**
    *   **Responsibility:** Manage the fetching, caching, and state of `tokenMetadata` (name, symbol, image, rank). Includes logic for batch fetching metadata.
    *   **Dependencies:** `cryptoApiService.ts`, `cryptoCacheService.ts`, `cryptoConstants.ts`.
    *   **Benefit:** Dedicated hook for all token metadata concerns.

6.  **`src/hooks/crypto/useTokenIcons.ts`:**
    *   **Responsibility:** Manage token icons: fetching missing icons, caching them (in-memory and `localStorage`), placeholder generation, and preloading default token icons.
    *   **Dependencies:** `useTokenMetadata.ts` (to get image URLs), `cryptoApiService.ts` (if searching for icons), `cryptoCacheService.ts`, `cryptoConstants.ts`.
    *   **Benefit:** Centralizes visual asset management for tokens.

7.  **`src/hooks/crypto/useCryptoPricing.ts`:**
    *   **Responsibility:** Manage the fetching, caching, and state of `prices` (including 24h change, low/high), `loading` state for prices, `error` state for prices, and `lastUpdated` timestamp. Handle batching of price requests (`processBatchRequests`), queuing updates (`queuePriceUpdate`), providing estimated prices, and `isPending` logic for price updates.
    *   **Dependencies:** `cryptoApiService.ts`, `cryptoCacheService.ts`, `cryptoConstants.ts`, `ExchangeRatesContext`.
    *   **Benefit:** Focuses solely on price data management and its lifecycle.

8.  **`CryptoContext.tsx` (Refactored):**
    *   **Responsibility:** The `CryptoProvider` component will become a coordinator, initializing the above hooks and composing their exposed states and functions into the context value. It will be significantly slimmer.
    *   **Benefit:** Acts as a clean composition root for the crypto-related state.

This refactoring aims to enhance code organization, improve testability of individual units, and make the overall cryptocurrency data management system more robust and easier to extend, while carefully respecting API limitations.

*(This document should be regularly updated as the application evolves.)*

## Phase 4: Enhanced Rate Limiting & Cache-First Strategy (v1.5.5+)

Following user feedback about rate-limiting delays (especially the observed ~82s delay for new tokens), the application has been significantly enhanced with a resilient, cache-first data fetching strategy:

### 4.1. Advanced Rate Limiting System (`cryptoApiService.ts`)

*   **Intelligent Rate Limit Detection:**
    *   Enhanced `serviceApiStatus` tracking with `rateLimitCooldownUntil` timestamp and `lastRateLimitHeaders` parsing.
    *   Pre-emptive cooldown checks prevent API calls when rate limits are active.
    *   Automatic parsing of CoinGecko response headers (`x-ratelimit-remaining`, `retry-after`) for smarter rate limit handling.
*   **Global CoinGecko Request Throttling:**
    *   `fetchWithSmartRetry` now implements a global throttle for all CoinGecko requests.
    *   It ensures that a minimum time (defined by `API_CONFIG.COINGECKO.REQUEST_SPACING`) has passed since the last CoinGecko request *completed* before initiating a new one.
    *   This helps sequence distinct operations (e.g., multiple token additions, searches, background updates) to prevent them from firing API calls too closely together, even if individually marked as high priority.
    *   `serviceApiStatus` now includes `lastCoinGeckoRequestCompletionTime` to manage this.
*   **API Key Verification:**
    *   The service now explicitly checks for the `VITE_COINGECKO_API_KEY` from environment variables and attempts to include it in API requests to CoinGecko.
    *   Logs are generated to indicate if the API key is present and being used, aiding in diagnostics for rate limit issues.
*   **Jittered Exponential Backoff:**
    *   Non-429 errors use jittered exponential backoff (1s → 2s → 5s → 10s max) to prevent thundering herd problems.
    *   429 rate limit errors respect `Retry-After` headers or use `COINGECKO_RATE_LIMIT_COOLDOWN`.
*   **Comprehensive Logging:**
    *   Standardized emoji-prefixed log levels: 🔵 (info), 🟡 (warning), 🟢 (rate limit), 🟠 (fallback), 🔴 (error), 🎉 (success), ☠️ (critical failure).
    *   All API calls, fallbacks, cache operations, and errors are logged with clear context.

### 4.2. Cache-First Data Pipeline (`CryptoContext.tsx`)

*   **Immediate Cache Serving:**
    *   When rate limits are encountered, cached prices are served immediately to the UI.
    *   Background retries are scheduled after cooldown periods without blocking the user interface.
    *   New `serveCacheForSymbols()` helper function provides instant cache lookups and UI updates.
*   **Resilient Batch Processing:**
    *   Unique batch IDs (`Date.now()`) prevent `console.time` conflicts and enable better debugging.
    *   Failed API calls immediately check cache before attempting fallbacks.
    *   Symbols are processed through a priority hierarchy: `/coins/markets` → cache → `/simple/price` → estimated price.
*   **Enhanced Pending State Management:**
    *   Symbols are removed from `pendingPriceUpdates` immediately when valid cache data is served.
    *   Only tokens without any valid data (cache or estimate) remain in pending state for UI loading indicators.
    *   Background retries continue for fresh data while cached data provides immediate UI responsiveness.

### 4.3. Enhanced User Experience

*   **Rate Limit Feedback with Countdown:**
    *   `Header.tsx` and `Converter.tsx` display rate limit indicators with real-time countdown: "API rate limit reached. Retry in 15s."
    *   `getCoinGeckoRetryAfterSeconds()` function provides accurate countdown information to UI components.
*   **Optimistic UI Updates:**
    *   `WaveLoadingPlaceholder` duration significantly reduced by serving cache immediately.
    *   Users see last known prices instantly while fresh data loads in the background.
*   **Improved Error Recovery:**
    *   Failed API calls don't result in extended loading states if cache is available.
    *   Clear visual distinction between stale cached data and actively loading data.

### 4.4. Technical Implementation Details

*   **Timer Management:**
    *   Fixed `Timer already exists` console warnings by using unique batch identifiers in `console.time` calls.
    *   Pattern: `API_fetchCoinMarkets_BATCH#${batchId}_[token1,token2,...]` for clear debugging.
*   **Memory Management:**
    *   Cache operations optimized to prevent unnecessary state updates.
    *   Background retries scheduled efficiently without blocking the main thread.
*   **Logging Strategy:**
    *   Performance timing logs include both milliseconds and seconds for easy analysis.
    *   Cache hit/miss ratios logged for debugging cache effectiveness.
    *   Recovery success/failure clearly distinguished in logs.

### 4.5. Performance Improvements

*   **Elimination of 82s Delays:**
    *   Previous: Rate-limited tokens waited for cooldown before showing any data.
    *   Current: Cache served immediately, background refresh after cooldown.
*   **Reduced API Load:**
    *   Smart fallback ordering reduces unnecessary `/simple/price` calls when cache is available.
    *   Batch processing respects rate limits proactively rather than reactively.
*   **Faster UI Response Times:**
    *   Cache-first strategy provides sub-100ms response times for repeat token views.
    *   Loading animations limited to genuinely new data, not cached data refreshes.

This enhanced system ensures users never experience the previously observed long delays while maintaining data accuracy and respecting API rate limits.

## Phase 5: Intelligent Stablecoin Detection & Auto-Switching (v1.6.0+)

### 5.1. Smart Stablecoin Detection System

*   **Multi-Layer Detection Strategy:**
    *   Primary: Uses CoinGecko's detailed coin metadata (`/coins/{id}` endpoint) to check `categories` array for stablecoin classifications.
    *   Fallback: Pattern-based symbol matching for offline detection when API is unavailable or rate-limited.
    *   Comprehensive category matching includes: "stablecoins", "usd stablecoin", "eur stablecoin", "algorithmic stablecoins", etc.
*   **Robust Caching Architecture:**
    *   Dedicated `CACHE_STORAGE_KEY_COIN_DETAILS` cache with 24-hour duration for detailed coin metadata.
    *   In-memory cache (`coinDetailsCache`) for instant access during user sessions.
    *   Automatic cache population and management through `getCoinDetails()` function.
*   **Intelligent Target Currency Selection:**
    *   EUR-pegged stablecoins (EURS, EURT) → Auto-switch to EUR
    *   CAD-pegged stablecoins (CADC) → Auto-switch to CAD  
    *   USD-pegged stablecoins (USDC, USDT, DAI, etc.) → Auto-switch to CAD (per requirement)
    *   Unknown/generic stablecoins → Default to CAD

### 5.2. Enhanced API Service (`cryptoApiService.ts`)

*   **New `fetchCoinDetails()` Function:**
    *   Fetches comprehensive coin metadata including categories, descriptions, and platform information.
    *   Optimized parameters to exclude unnecessary data (tickers, market_data, community_data) for faster responses.
    *   High-priority request classification for immediate stablecoin detection.
    *   Proper error handling and logging with performance timing.

### 5.3. User Experience Enhancements

*   **Seamless Auto-Switching:**
    *   Automatic fiat currency switching when stablecoins are selected (USDC → CAD, EURS → EUR, etc.).
    *   Respects user manual fiat selection - auto-switching disabled after user manually changes fiat.
    *   Reset manual flag when crypto selection changes to re-enable auto-switching for new tokens.
*   **Intelligent UX Flow:**
    *   No visual flicker or jarring transitions during auto-switching.
    *   Maintains conversion amounts and input focus during currency switches.
    *   Console logging for debugging and transparency of stablecoin detection decisions.
*   **Fallback Resilience:**
    *   Symbol-based detection when API metadata is unavailable.
    *   Graceful degradation during rate limits or network issues.
    *   No impact on core conversion functionality if stablecoin detection fails.

### 5.4. Technical Implementation

*   **Modular Utility Functions (`src/utils/stablecoinDetection.ts`):**
    *   `isStablecoin()`: Comprehensive stablecoin detection using metadata and symbol patterns.
    *   `isStablecoinFromCategories()`: Category-based detection from CoinGecko metadata.
    *   `isStablecoinFromSymbol()`: Pattern-based fallback detection.
    *   `getStablecoinTargetFiat()`: Intelligent target currency selection based on stablecoin type.
*   **Enhanced Context Integration:**
    *   New `getCoinDetails()` method in `CryptoContext` for detailed metadata fetching.
    *   `coinDetailsCache` state for efficient metadata management.
    *   Proper TypeScript interfaces (`CoinDetailedMetadata`) for type safety.
*   **Smart State Management:**
    *   `userManuallySetFiat` flag to track user intent and prevent unwanted auto-switching.
    *   Automatic flag reset on crypto selection changes to enable auto-switching for new tokens.
    *   Integration with existing rate limiting and caching systems.

### 5.5. Performance Optimizations

*   **Efficient Caching Strategy:**
    *   24-hour cache duration for coin details reduces API calls for repeated stablecoin checks.
    *   In-memory cache for instant access during active sessions.
    *   Automatic cache warming for popular tokens during app initialization.
*   **Minimal API Impact:**
    *   High-priority requests for immediate user-facing stablecoin detection.
    *   Fallback to symbol patterns when API is rate-limited.
    *   No blocking of core conversion functionality during metadata fetching.
*   **Smart Request Management:**
    *   Integration with existing rate limiting and request prioritization systems.
    *   Proper error handling prevents stablecoin detection failures from affecting app stability.
    *   Comprehensive logging for debugging and performance monitoring.

This intelligent stablecoin detection system provides a seamless user experience while maintaining robust performance and respecting API limitations. 