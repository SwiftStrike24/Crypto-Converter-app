// Global type declarations for CryptoVertX

// ============================================================================
// CryptoVertX Preload API Types
// ============================================================================

interface WindowSizePayload {
  width: number;
  height: number;
  isFullScreen: boolean;
}

interface LinkResult {
  success: boolean;
  error?: string;
}

interface NewsResult {
  success: boolean;
  data?: unknown[];
  error?: string;
  results?: Array<{
    success: boolean;
    source: string;
    data?: unknown[];
    error?: string;
  }>;
}

interface FundraisingFilters {
  chains?: string[];
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadKey?: string;
  fileName?: string;
  fileSize?: number;
  sha256?: string;
  error?: string;
}

interface UpdateDownloadResult {
  filePath: string;
}

interface UpdateInstallResult {
  success: boolean;
  error?: string;
}

interface DownloadProgressPayload {
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

interface CryptoVertXAPI {
  app: {
    quit: () => void;
    getVersion: () => Promise<{ version: string }>;
  };
  window: {
    setWindowSize: (payload: WindowSizePayload) => void;
  };
  links: {
    openInApp: (url: string) => Promise<LinkResult>;
    openExternal: (url: string) => Promise<LinkResult>;
  };
  news: {
    fetchMarket: (force?: boolean) => Promise<NewsResult>;
    fetchFundraising: (filters?: FundraisingFilters, force?: boolean) => Promise<NewsResult>;
  };
  updates: {
    check: () => Promise<UpdateCheckResult>;
    download: (downloadKey: string) => Promise<UpdateDownloadResult>;
    install: (filePath: string) => Promise<UpdateInstallResult>;
  };
  events: {
    onNavigate: (callback: (payload: { path: string }) => void) => () => void;
    onWindowFocused: (callback: () => void) => () => void;
    onWindowBlurred: (callback: () => void) => () => void;
    onUpdateSuccessful: (callback: () => void) => () => void;
    onUpdateDownloadProgress: (callback: (payload: DownloadProgressPayload) => void) => () => void;
  };
}

// ============================================================================
// Window interface extensions
// ============================================================================

interface Window {
  // New secure preload API
  cryptovertx: CryptoVertXAPI;
}
