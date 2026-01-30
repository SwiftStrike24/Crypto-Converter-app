/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINGECKO_API_KEY: string
  readonly VITE_OPEN_EXCHANGE_RATES_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Note: CryptoVertX API types are defined in src/types/global.d.ts
// The renderer accesses the main process via window.cryptovertx (preload API)
// NOT via direct electron imports or window.require
