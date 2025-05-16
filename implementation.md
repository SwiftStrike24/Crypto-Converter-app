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
    *   Handles available tokens (default set + user-added custom tokens).
    *   Stores token metadata: name, symbol, image URL, rank.
    *   Tracks API status: loading states, errors, rate limit information.
    *   Implements caching logic for prices and metadata in `localStorage`.
    *   Manages batching for CoinGecko API requests to optimize performance.
    *   Persists custom tokens and cache to `localStorage`.
    *   Prioritizes CoinGecko's `/coins/markets` endpoint for reliable 24h range data.
    *   Includes memoization (`useCallback`) for context helper functions to prevent unnecessary re-renders and potential infinite update loops.
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
    *   `pnpm lint`: Runs ESLint for code quality checks.
*   **Interactive Build System (`scripts/build.ts`):**
    *   Provides a menu to choose build types (Portable, Installer, Both).
    *   Handles version management (reads from `package.json`, updates `versionManager.ts`, prompts for new version/overwrite).
    *   Creates versioned output directories.
    *   Provides a build summary with performance metrics when building "Both".

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
*   `axios`: For making HTTP requests to APIs.
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
    *   **Responsibility:** Centralize all constants currently in `CryptoContext.tsx` (e.g., API endpoints, cache keys, durations, rate limit parameters, default token lists).
    *   **Benefit:** Improves organization and makes configuration easier to manage.

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