/**
 * Preload script for CryptoVertX
 * 
 * This script runs in an isolated context and exposes a minimal, typed API
 * to the renderer process via contextBridge. The renderer cannot access
 * Node.js or Electron APIs directly.
 * 
 * Security: No raw ipcRenderer passthrough - only explicit, validated functions.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ============================================================================
// Type definitions for the exposed API
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

// ============================================================================
// Input validation helpers
// ============================================================================

function isValidUrl(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidWindowSize(payload: unknown): payload is WindowSizePayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as WindowSizePayload;
  return (
    typeof p.width === 'number' &&
    typeof p.height === 'number' &&
    typeof p.isFullScreen === 'boolean' &&
    p.width > 0 &&
    p.height > 0 &&
    p.width <= 4096 &&
    p.height <= 4096
  );
}

function isValidDownloadKey(key: string): boolean {
  if (typeof key !== 'string' || !key) return false;
  // Must start with 'latest/'
  if (!key.startsWith('latest/')) return false;
  // Must not contain path traversal
  if (key.includes('..') || key.includes('\\')) return false;
  // Must not contain control characters
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  // Must match expected filename patterns
  const validPatterns = [
    /^latest\/CryptoVertX-MSI-Installer-v\d+\.\d+\.\d+\.msi$/,
    /^latest\/CryptoVertX-Setup-v\d+\.\d+\.\d+\.exe$/,
  ];
  return validPatterns.some(pattern => pattern.test(key));
}

function isValidFilePath(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath) return false;
  // Must be a Windows temp path
  if (!filePath.includes('\\Temp\\') && !filePath.includes('/temp/') && !filePath.includes('/tmp/')) {
    return false;
  }
  // Must be .msi or .exe
  if (!filePath.endsWith('.msi') && !filePath.endsWith('.exe')) {
    return false;
  }
  // Must not contain path traversal
  if (filePath.includes('..')) return false;
  return true;
}

// ============================================================================
// Event listener management for cleanup
// ============================================================================

type EventCallback<T> = (payload: T) => void;

function createEventSubscription<T>(
  channel: string,
  callback: EventCallback<T>
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => {
    callback(payload);
  };
  ipcRenderer.on(channel, handler);
  // Return cleanup function
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// ============================================================================
// Exposed API
// ============================================================================

const cryptovertxAPI = {
  // --- App lifecycle ---
  app: {
    quit: (): void => {
      ipcRenderer.send('cryptovertx:app:quit');
    },
    getVersion: async (): Promise<{ version: string }> => {
      const version = await ipcRenderer.invoke('cryptovertx:app:getVersion');
      return { version: String(version || 'unknown') };
    },
  },

  // --- Window management ---
  window: {
    setWindowSize: (payload: WindowSizePayload): void => {
      if (!isValidWindowSize(payload)) {
        console.error('[Preload] Invalid window size payload');
        return;
      }
      ipcRenderer.send('cryptovertx:window:setSize', payload);
    },
  },

  // --- Link handling ---
  links: {
    openInApp: async (url: string): Promise<LinkResult> => {
      if (!isValidUrl(url)) {
        return { success: false, error: 'Invalid URL' };
      }
      try {
        ipcRenderer.send('cryptovertx:links:openInApp', { url });
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    openExternal: async (url: string): Promise<LinkResult> => {
      if (!isValidUrl(url)) {
        return { success: false, error: 'Invalid URL' };
      }
      try {
        const result = await ipcRenderer.invoke('cryptovertx:links:openExternal', { url });
        return result;
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },

  // --- News fetching ---
  news: {
    fetchMarket: async (force: boolean = false): Promise<NewsResult> => {
      try {
        const result = await ipcRenderer.invoke('cryptovertx:news:fetchMarket', { force: Boolean(force) });
        return result;
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    fetchFundraising: async (filters: FundraisingFilters = {}, force: boolean = false): Promise<NewsResult> => {
      try {
        const safeFilters = {
          chains: Array.isArray(filters.chains) ? filters.chains.filter(c => typeof c === 'string') : [],
        };
        const result = await ipcRenderer.invoke('cryptovertx:news:fetchFundraising', { 
          force: Boolean(force), 
          filters: safeFilters 
        });
        return result;
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },

  // --- Update system ---
  updates: {
    check: async (): Promise<UpdateCheckResult> => {
      try {
        const result = await ipcRenderer.invoke('cryptovertx:updates:check');
        return result;
      } catch (err) {
        return {
          hasUpdate: false,
          currentVersion: '',
          latestVersion: '',
          error: String(err),
        };
      }
    },
    download: async (downloadKey: string): Promise<UpdateDownloadResult> => {
      if (!isValidDownloadKey(downloadKey)) {
        throw new Error('Invalid download key');
      }
      const result = await ipcRenderer.invoke('cryptovertx:updates:download', { downloadKey });
      return result;
    },
    install: async (filePath: string): Promise<UpdateInstallResult> => {
      if (!isValidFilePath(filePath)) {
        return { success: false, error: 'Invalid file path' };
      }
      try {
        const result = await ipcRenderer.invoke('cryptovertx:updates:install', { filePath });
        return result;
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  },

  // --- Event subscriptions (main -> renderer) ---
  events: {
    onNavigate: (callback: (payload: { path: string }) => void): (() => void) => {
      return createEventSubscription('cryptovertx:nav:navigate', callback);
    },
    onWindowFocused: (callback: () => void): (() => void) => {
      return createEventSubscription('cryptovertx:window:focused', callback);
    },
    onWindowBlurred: (callback: () => void): (() => void) => {
      return createEventSubscription('cryptovertx:window:blurred', callback);
    },
    onUpdateSuccessful: (callback: () => void): (() => void) => {
      return createEventSubscription('cryptovertx:updates:successful', callback);
    },
    onUpdateDownloadProgress: (callback: (payload: DownloadProgressPayload) => void): (() => void) => {
      return createEventSubscription('cryptovertx:updates:downloadProgress', callback);
    },
  },
};

// Expose the API to the renderer via contextBridge
contextBridge.exposeInMainWorld('cryptovertx', cryptovertxAPI);

// Export type for TypeScript
export type CryptoVertXAPI = typeof cryptovertxAPI;
