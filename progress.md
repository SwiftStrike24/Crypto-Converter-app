progress
---
description: Summary of the Crypto Converter app's current progress, architecture, and established conventions.
globs: 
---

# Crypto Converter App - Progress & Conventions (v1.5.4)

This document summarizes the current state of the Crypto Converter application based on the existing codebase and development patterns.

## Core Architecture

*   **Framework:** Electron application (v27.1.2 - *Note: Consider updating to a more recent stable version for latest features/security*).
*   **Frontend:** React (v18), built using Vite (v5).
*   **Language:** TypeScript (v5, strict mode enabled).
*   **Process:** Standard Electron Main (`src/electron/main.ts`) and Renderer structure.
*   **Packaging:** Electron Builder (v24 - *Note: Consider updating to a more recent stable version for latest features/signing*).

## State Management

*   **Primary:** React Context API.
    *   `CryptoContext` (`src/context/CryptoContext.tsx`): Manages crypto prices (USD, EUR, CAD), 24h change, **24h low/high range**, available tokens (default + custom), token metadata (name, symbol, image, rank), API status (loading, errors, rate limiting), caching, and batching logic for CoinGecko API calls. Persists custom tokens and caches to `localStorage`. **Refactored to prioritize CoinGecko's `/coins/markets` endpoint for reliable 24h range data and simplified caching.** **Resolved potential infinite update loops by memoizing context helper functions (`useCallback`) and refining update trigger logic.**
    *   `CryptoCompareContext` (`src/context/CryptoCompareContext.tsx`): Appears less integrated, potentially for historical data or as a fallback (uses `VITE_CRYPTOCOMPARE_API_KEY` from `.env`).
    *   `ExchangeRatesContext` (`src/context/ExchangeRatesContext.tsx`): Manages live USD to CAD and EUR exchange rates for accurate fiat currency conversions throughout the app.

## API Integration (CoinGecko Centric)

*   **Primary Source:** CoinGecko API (Free and Pro tiers).
    *   API Key: Managed via `.env` (`VITE_COINGECKO_API_KEY`) and checked in `useTokenSearch.ts`.
    *   Endpoints Used: `/coins/markets` (primary for price/range data), `/simple/price` (fallback), `/coins/{id}/market_chart`, `/coins/{id}`, `/search`, `/ping` (for key validation).
*   **Secondary Sources:**
    *   **Open Exchange Rates API**: Provides accurate USD to CAD and EUR conversion rates.
        *   API Key: Managed via `.env` (`VITE_OPEN_EXCHANGE_RATES_APP_ID`).
        *   Endpoints Used: `/latest.json` for current exchange rates.
        *   1-hour caching strategy to stay within the free tier limit (1,000 requests/month).
        *   Used for accurate fiat conversions in 24-hour price ranges and other calculations.
    *   **CryptoCompare API**: Via `CryptoCompareContext` (key from `VITE_CRYPTOCOMPARE_API_KEY`).
*   **Features:**
    *   **Rate Limiting:** Custom logic implemented in `useTokenSearch.ts` and `src/utils/rateLimiter.ts`, aware of Free vs. Pro limits (`COINGECKO_RATE_LIMITS`). Tracks calls per minute and implements cooldowns.
    *   **Caching:** `localStorage` used for price data (`cryptovertx-price-cache` - **now includes 24h range**), token metadata (`cryptovertx-metadata-cache`), and exchange rates (`cryptovertx-exchange-rates`) with configurable durations. Icon URLs are also cached (`ICON_CACHE_PREFIX`).
    *   **Batching:** `CryptoContext` batches price update requests (`MAX_BATCH_SIZE`). Metadata fetching is also batched (`fetchMetadataInBatches`).
    *   **Retries & Fallbacks:** Smart retry mechanisms with exponential backoff across all APIs. `/simple/price` used as fallback for `/coins/markets`. Fallback values provided for offline operation.
*   **Update Service:** Cloudflare R2 via `@aws-sdk/client-s3` (requires `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `.env`).

## UI and Styling

*   **Component Library:** Material-UI (MUI v6 - *Note: This appears to be a pre-release version; stable is v5*).
*   **Styling:** `styled-components` (v6) for CSS-in-JS.
*   **Icons:** `react-icons`.
*   **Charting:** `recharts` (v2).
*   **Navigation:** `react-router-dom` (v7 - *Note: This appears to be a pre-release version; stable is v6*).
*   **Key Components:**
    *   `Converter.tsx`: Core conversion UI.
    *   `AddCryptoModal.tsx`: Modal for searching and adding new tokens.
    *   `ManageTokens.tsx`: Page to view and remove custom tokens.
    *   `Header.tsx`, `Footer.tsx`: Layout components.
    *   `LivePrice.tsx`: Displays real-time price updates.
    *   `ChartModal.tsx`, `CryptoChart.tsx`: Components for displaying price charts.
    *   `TokenStats.tsx`: Displays detailed market statistics for a token.

## Build & Development

*   **Package Manager:** `pnpm`.
*   **Build Tool:** Vite for React frontend assets.
*   **Packaging:** Electron Builder (`electron-builder` v24 - *Note: Consider updating*). Configured for `asar` packaging, output to `release/${version}`, Windows targets (portable, nsis).
*   **Scripts (`package.json`):**
    *   `pnpm dev`: Start Vite dev server for React frontend.
    *   `pnpm build`: Build React frontend assets.
    *   `pnpm electron:dev`: Start Electron app in development mode.
    *   `pnpm build-app [--installer | --portable | --both]`: Interactive or direct build script (using `tsx scripts/build.ts`) for distributable Electron application (handles versioning).
    *   `pnpm test`: Run tests (details TBD).
    *   `pnpm lint`: Run ESLint.

## Key Features Implemented

*   Real-time crypto-to-fiat conversion.
*   Live USD to CAD/EUR exchange rates for accurate fiat conversions (Open Exchange Rates API).
*   Accurate **and persistent** 24-hour price ranges with proper fiat conversion **(improved reliability)**.
*   Dynamic addition and removal of cryptocurrencies (custom tokens stored locally).
*   Search functionality for finding new tokens via CoinGecko API.
*   Display of live prices, 24-hour percentage change.
*   Display of token icons with local caching and placeholder generation.
*   Fetching and display of token metadata (name, symbol, rank).
*   Fetching and display of detailed token statistics (market cap, volume, supply).
*   Price chart visualization (`recharts`).
*   Robust handling of API rate limits and caching.
*   Single Instance Management (with smart relaunch).
*   Minimize to Tray functionality.
*   Global Hotkey (`~` or `` ` ``) to toggle window.
*   Navigation between pages (`react-router-dom`).
*   Automatic Update System (via Cloudflare R2).

## Key Dependencies

*   `react`: 18.2.0
*   `electron`: 27.1.2
*   `typescript`: 5.3.2
*   `vite`: 5.0.2
*   `@mui/material`: 6.3.1 (*Note: Pre-release version*)
*   `styled-components`: 6.1.13
*   `react-router-dom`: 7.0.1 (*Note: Pre-release version*)
*   `axios`: 1.6.2
*   `recharts`: 2.13.3
*   `electron-builder`: 24.9.1
*   `@aws-sdk/client-s3`: 3.525.0

## Established Conventions & Practices

*   **File Structure:** Organized by process (`electron`, `renderer`) and feature type (`components`, `context`, `hooks`, `pages`, `services`, `utils`, `types`).
*   **TypeScript:** Strict mode, heavy use of Interfaces and Types. `env.d.ts` for environment variable typing.
*   **Naming:** PascalCase for components/interfaces/types, camelCase for functions/variables. `Props` suffix used for component props. Directory names use dashes.
*   **Constants:** Defined in relevant files for API details, caching, rate limits. Consider centralizing.
*   **Error Handling:** `try/catch` blocks, state variables (`error`, `loading`), specific handling for API errors (e.g., 429 rate limit). **Resolved "Maximum update depth exceeded" errors in `CryptoContext`.**
*   **React:** Functional components and Hooks. Context for global state.
*   **Environment Variables:** `.env` file used for API keys (`VITE_COINGECKO_API_KEY`, `VITE_CRYPTOCOMPARE_API_KEY`, `VITE_OPEN_EXCHANGE_RATES_APP_ID`) and Cloudflare R2 credentials. Secure handling practices mentioned in README.
*   **Clean Code:** Adherence to principles like DRY, Single Responsibility. Meaningful names. Comments for complex logic.

## Areas for Potential Refinement

*   **Dependency Versions:** Consider updating Electron and Electron Builder to latest stable versions. Verify stability of pre-release MUI and React Router versions.
*   **Consistency:** Interface naming (`I` prefix usage). Centralization of shared constants.
*   **Error Handling:** Implement more specific custom error types. Enhance user feedback on errors.
*   **Testing:** Establish and implement a clear testing strategy (unit, integration, E2E).
*   **Electron Security:** Continue review and implementation of Electron security best practices (IPC security, context isolation, CSP).
*   **Dependencies:** Review `package.json` for unused dependencies (e.g., verify `lightweight-charts` usage if `recharts` is primary).
*   **Performance:** Profile React component rendering and Electron main process operations; optimize as needed. 