// import axios from 'axios';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Bucket name - should be configured in .env
export const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cryptoconverter-downloads';

import { currentVersion as CURRENT_VERSION, getAppVersion, updateCurrentVersion } from './versionManager';

// Re-export for backward compatibility
export { currentVersion as CURRENT_VERSION, updateCurrentVersion } from './versionManager';

// Global flag to track if we're running in production Electron environment
export const IS_ELECTRON_PRODUCTION = typeof window !== 'undefined' && 
  window.electron && 
  !process.env.NODE_ENV?.includes('development');

// Determine if logging should be enabled
// By default enable in development, disable in production
// Can be enabled with ?debug=true or ?logging=true in URL
const determineLoggingState = (): boolean => {
  // Always enable in development unless explicitly disabled
  if (process.env.NODE_ENV === 'development') {
    // Check if URL has debug=false or logging=false to disable
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      const debugParam = urlParams.get('debug');
      const loggingParam = urlParams.get('logging');
      
      if (debugParam === 'false' || loggingParam === 'false') {
        return false;
      }
    }
    return true;
  }
  
  // In production, disabled by default
  if (typeof window !== 'undefined' && window.location) {
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    const loggingParam = urlParams.get('logging');
    
    // Only enable if explicitly enabled
    if (debugParam === 'true' || loggingParam === 'true') {
      return true;
    }
  }
  
  return false;
};

// Flag to enable selective console logging
const ENABLE_LOGS = determineLoggingState();

// Helper function for controlled logging
const log = {
  info: (message: string, ...args: any[]) => {
    if (ENABLE_LOGS) console.log(`[CryptoVertX] 📢 ${message}`, ...args);
  },
  success: (message: string, ...args: any[]) => {
    if (ENABLE_LOGS) console.log(`[CryptoVertX] ✅ ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (ENABLE_LOGS) console.log(`[CryptoVertX] ⚠️ ${message}`, ...args);
  },
  error: (_message: string, ..._args: any[]) => {
    // We don't log errors to console - they're handled silently
  }
};

// Log initial state
if (ENABLE_LOGS) {
  console.log(`[CryptoVertX] 🔧 Logging is ${ENABLE_LOGS ? 'ENABLED' : 'DISABLED'}`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[CryptoVertX] 🛠️ Running in DEVELOPMENT mode`);
  } else {
    console.log(`[CryptoVertX] 🚀 Running in PRODUCTION mode`);
  }
}

// Base URL for API endpoints - ensure this is hardcoded for production
export const API_BASE_URL = 'https://cryptovertx.com/api';

/**
 * Use a development proxy for API requests to avoid CORS issues in development mode
 * @param url The original API URL to proxy
 * @returns The proxied URL for development or the original URL for production
 */
export function getProxiedUrl(url: string): string {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !window.electron) {
    // In browser development mode, use a CORS proxy
    // We replace the API domain with the local dev server + proxy path
    const currentOrigin = window.location.origin; // e.g. http://localhost:5173
    
    // Extract the path from the original URL
    const apiPath = url.replace(API_BASE_URL, '');
    
    // Compose the proxied URL with the local dev server
    return `${currentOrigin}/api-proxy${apiPath}`;
  }
  
  // In production or Electron development, use the original URL
  return url;
}

// Hardcoded credentials for production build
// These credentials are restricted to read-only access on the public bucket
const FALLBACK_CREDENTIALS = {
  CLOUDFLARE_ACCOUNT_ID: 'a29e1fcdd07785579dd54acb5378348a',
  R2_ACCESS_KEY_ID: '7f4477e05cdf9d71385da15bad012fb9',
  R2_SECRET_ACCESS_KEY: '4f43905f8d806110e6f3a548f294b71ae86b2cadb7218532d3113c960ddce1b7',
  R2_ENDPOINT: 'https://a29e1fcdd07785579dd54acb5378348a.r2.cloudflarestorage.com',
  R2_PUBLIC_URL: 'https://pub-a29e1fcdd07785579dd54acb5378348a.r2.dev'
};

// Cache for environment variables to avoid repeated lookups
let cachedEnvVars: Record<string, string> | null = null;

/**
 * Safely get environment variables with fallbacks
 */
export const getEnvVars = () => {
  // If we already have cached variables, return them
  if (cachedEnvVars) {
    return cachedEnvVars;
  }

  // Default to fallback values for production
  const defaultValues = {
    ...FALLBACK_CREDENTIALS,
    APP_VERSION: ''
  };
  
  try {
    // Check if window.electron exists and has env property
    if (typeof window !== 'undefined' && window.electron && window.electron.env) {
      // Use type assertion to handle any environment variables
      const electronEnv = window.electron.env as any;
      
      // Store environment in cache
      cachedEnvVars = {
        CLOUDFLARE_ACCOUNT_ID: electronEnv.CLOUDFLARE_ACCOUNT_ID || defaultValues.CLOUDFLARE_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: electronEnv.R2_ACCESS_KEY_ID || defaultValues.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: electronEnv.R2_SECRET_ACCESS_KEY || defaultValues.R2_SECRET_ACCESS_KEY,
        R2_ENDPOINT: electronEnv.R2_ENDPOINT || defaultValues.R2_ENDPOINT,
        R2_PUBLIC_URL: electronEnv.R2_PUBLIC_URL || defaultValues.R2_PUBLIC_URL,
        APP_VERSION: electronEnv.APP_VERSION || window.__APP_VERSION__ || window.__PACKAGE_JSON_VERSION__ || defaultValues.APP_VERSION
      };
      
      return cachedEnvVars;
    }

    // For web environments or if electron isn't available
    if (typeof window !== 'undefined' && (window.__APP_VERSION__ || window.__PACKAGE_JSON_VERSION__)) {
      // For web environments, we might still have some variables set as globals
      cachedEnvVars = {
        ...defaultValues,
        APP_VERSION: window.__APP_VERSION__ || window.__PACKAGE_JSON_VERSION__ || defaultValues.APP_VERSION
      };
      return cachedEnvVars;
    }
    
    // If no electron environment, use hardcoded fallbacks for production
    cachedEnvVars = defaultValues;
    return defaultValues;
  } catch (error) {
    // Return hardcoded values on error
    cachedEnvVars = defaultValues;
    return defaultValues;
  }
};

/**
 * Creates a new S3 client for Cloudflare R2
 */
export const createR2Client = () => {
  // Get environment variables with fallbacks
  const {
    CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT
  } = getEnvVars();

  // Ensure we have all required environment variables
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CLOUDFLARE_ACCOUNT_ID) {
    return null;
  }

  // Get the endpoint from environment variables
  const endpoint = R2_ENDPOINT || `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  
  // Create the client with proper configuration
  try {
    return new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // Required for Cloudflare R2
    });
  } catch (error) {
    return null;
  }
};

/**
 * Get file metadata from R2
 * @param prefix The prefix to filter objects by
 * @returns Array of file metadata objects
 */
export async function getFileMetadata(prefix: string) {
  try {
    log.info(`Checking for updates with prefix: ${prefix}`);
    
    // First try to use the CryptoVertX API directly
    try {
      const apiResults = await getFileMetadataFromApi(prefix);
      
      // If we got results from the API, use them
      if (apiResults && apiResults.length > 0) {
        log.success(`Found ${apiResults.length} files via API`);
        return apiResults;
      }
    } catch (apiError) {
      // Silent fail - we'll try the direct method next
      log.warn(`API method failed, trying R2 directly`);
    }
    
    // As a fallback, try to use the R2 client directly
    const client = createR2Client();
    if (!client) {
      // Return empty array as last resort
      return [];
    }
    
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 10,
    });
    
    try {
      const response = await client.send(command);
      const contents = response.Contents || [];
      log.success(`Found ${contents.length} files via R2 client`);
      return contents;
    } catch (r2Error) {
      return [];
    }
  } catch (error) {
    // Return empty array as last resort
    return [];
  }
}

/**
 * Fallback method to get file metadata using the CryptoVertX API
 * This is useful for production builds where R2 credentials might not be available
 */
async function getFileMetadataFromApi(prefix: string) {
  // Define interface for API response
  interface ApiFileMetadata {
    key: string;
    size: number;
    lastModified: string;
  }
  
  try {
    // Always use the landing page API endpoint
    const apiUrl = `${API_BASE_URL}/files?prefix=${encodeURIComponent(prefix)}`;
    
    // Get the proxied URL for development environments
    const requestUrl = getProxiedUrl(apiUrl);
    
    // In development, use no-cors mode to prevent CORS errors in console
    const mode = process.env.NODE_ENV === 'development' ? 'no-cors' : 'cors';
    
    // Add CORS mode and credentials handling
    const response = await fetch(requestUrl, {
      method: 'GET',
      mode, // Use no-cors in development to suppress errors
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });
    
    // If using no-cors mode, we can't actually read the response
    // This is a limitation of CORS and fetch API
    if (mode === 'no-cors') {
      // Just throw an error to trigger the fallback to R2 
      throw new Error('Using no-cors mode, cannot read response');
    }
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform the API response to match the S3 format
    return (data.files as ApiFileMetadata[] || []).map(file => ({
      Key: file.key,
      Size: file.size,
      LastModified: new Date(file.lastModified)
    }));
  } catch (error) {
    // Return empty array as last resort
    return [];
  }
}

/**
 * Generate a URL for downloading a file
 * @param key The object key in the R2 bucket
 * @returns URL for downloading the file
 */
export function getDownloadUrl(key: string) {
  try {
    // Always use the landing page API for downloads
    const apiUrl = `${API_BASE_URL}/download?key=${encodeURIComponent(key)}`;
    
    // Get the proxied URL for development environments
    return getProxiedUrl(apiUrl);
  } catch (error) {
    // Fallback to a direct download URL for the latest version
    return getProxiedUrl(`${API_BASE_URL}/download?key=latest%2FCryptoVertX-Setup-${CURRENT_VERSION}.exe`);
  }
}

/**
 * Extract version from filename
 * @param filename The filename to extract version from
 * @returns The extracted version
 */
export function extractVersionFromFilename(filename: string): string {
  // Try different patterns to extract version
  // Pattern 1: Setup-X.Y.Z or Mac-X.Y.Z
  const setupMatch = filename.match(/(?:Setup|Mac)-(\d+\.\d+\.\d+)/i);
  if (setupMatch) return setupMatch[1];
  
  // Pattern 2: vX.Y.Z
  const vMatch = filename.match(/v(\d+\.\d+\.\d+)/i);
  if (vMatch) return vMatch[1];
  
  // Pattern 3: Any X.Y.Z pattern in the filename
  const genericMatch = filename.match(/(\d+\.\d+\.\d+)/);
  if (genericMatch) return genericMatch[1];
  
  // Default to empty string - will be handled by caller
  return '';
}

/**
 * Compare versions
 * @param v1 First version
 * @param v2 Second version
 * @returns -1 if v1 < v2, 0 if v1 = v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0; // If either version is undefined, consider them equal
  
  try {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  } catch (error) {
    return 0; // In case of error, consider versions equal
  }
}

/**
 * Check if an update is available
 * @returns Object with update info
 */
export async function checkForUpdates() {
  try {
    // Make sure we have the latest version information
    await initCurrentVersion();
    
    // Get the current version from the app
    let appVersion = CURRENT_VERSION;
    log.info(`Current app version: ${appVersion}`);
    
    // If we couldn't get a valid version, try to get it from process.env
    if (!appVersion || appVersion === '0.0.0' || appVersion === '') {
      // Try to get from process.env as fallback
      appVersion = process.env.npm_package_version || '';
      if (appVersion) {
        // Update the version using the proper function
        updateCurrentVersion(appVersion);
        log.info(`Using npm_package_version: ${appVersion}`);
      } else {
        log.warn('Could not determine current app version');
        return { 
          hasUpdate: false, 
          message: 'Could not determine current app version',
          currentVersion: '',
          latestVersion: ''
        };
      }
    }
    
    // Get the latest version from R2
    const files = await getFileMetadata('latest/');
    
    // Find the Windows installer
    const windowsInstaller = files.find(file => 
      file.Key?.includes('CryptoVertX-Setup') && file.Key?.endsWith('.exe')
    );
    
    if (!windowsInstaller || !windowsInstaller.Key) {
      log.warn('No Windows installer found');
      return { 
        hasUpdate: false, 
        message: 'No Windows installer found',
        currentVersion: appVersion,
        latestVersion: appVersion
      };
    }
    
    // Extract version from filename
    const latestVersion = extractVersionFromFilename(windowsInstaller.Key);
    log.info(`Latest version available: ${latestVersion}`);
    
    // Compare with current version
    const comparison = compareVersions(latestVersion, appVersion);
    
    if (comparison > 0) {
      // Use the direct download link for the latest version
      const downloadKey = windowsInstaller.Key;
      log.success(`Update available! ${appVersion} → ${latestVersion}`);
      return {
        hasUpdate: true,
        currentVersion: appVersion,
        latestVersion,
        downloadUrl: getDownloadUrl(downloadKey),
        fileName: downloadKey.split('/').pop() || '',
        fileSize: windowsInstaller.Size || 0
      };
    }
    
    log.info(`You're running the latest version (${appVersion})`);
    return {
      hasUpdate: false,
      currentVersion: appVersion,
      latestVersion
    };
  } catch (error) {
    return {
      hasUpdate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      currentVersion: CURRENT_VERSION || '',
      latestVersion: ''
    };
  }
}

/**
 * Download the update
 * @param url The download URL
 * @param onProgress Progress callback
 * @returns Promise that resolves when download is complete
 */
export async function downloadUpdate(url: string, onProgress: (progress: number | any) => void) {
  log.info(`Starting update download from URL: ${url}`);

  // This function should ONLY be called in an Electron environment.
  // The UI should prevent calling this if not in Electron.
  if (typeof window.require !== 'function') {
    log.error('Update service error: Not running in a valid Electron renderer context.');
    throw new Error('Updates can only be downloaded within the CryptoVertX application.');
  }
  const { ipcRenderer } = window.require('electron');
  if (!ipcRenderer) {
    throw new Error('IPC renderer is not available.');
  }

  log.info('Using Electron download manager for silent background download.');
  
  // Set up progress listener - handle both old format (number) and new format (object)
  const progressListener = (_event: any, progressData: number | any) => {
    if (typeof progressData === 'number') {
      // Legacy format - just a number
      onProgress(progressData);
    } else {
      // Enhanced format - object with progress and additional data
      onProgress(progressData);
    }
  };
  
  // Register the progress listener. We use `once` and `on` to be safe, then clean up.
  ipcRenderer.on('download-progress', progressListener);
  
  try {
    // Tell main process we're subscribing to progress updates.
    // This isn't strictly necessary with the new setup but is good practice.
    ipcRenderer.send('download-progress-subscribe');
    
    // Start the download using Electron's download manager in the main process
    const filePath = await ipcRenderer.invoke('download-update', url);
    
    log.success(`Download complete. File saved at: ${filePath}`);
    return filePath;
  } catch (electronError) {
    log.error('Electron download process failed.', electronError);
    // Re-throw a more user-friendly error
    throw new Error(`Download failed: ${(electronError as Error).message}`);
  } finally {
    // Clean up the progress listener to prevent memory leaks
    ipcRenderer.removeAllListeners('download-progress');
  }
}

/**
 * Install the update
 * @param filePath Path to the downloaded update file
 * @returns Promise that resolves when installation starts
 */
export async function installUpdate(filePath: string) {
  try {
    // The browser download path is no longer supported for a seamless flow.
    // If we get here, it must be with a valid file path.
    if (!filePath || filePath.includes('-download')) {
      throw new Error('Invalid file path for installation.');
    }
    
    log.info(`Requesting silent installation for: ${filePath}`);
    
    // Send install request to main process
    if (typeof window.require === 'function') {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('install-update', filePath);
      log.success('Installation process initiated successfully by main process.');
      return result;
    } else {
      // This case should ideally not be reached if the download worked.
      throw new Error('Not in a valid Electron environment to install updates.');
    }
  } catch (error) {
    log.error('Installation trigger failed.', error);
    // If there's an error, try to open the download page as a last resort using the default browser
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        await window.electron.ipcRenderer.invoke('open-external', 'https://cryptovertx.com/download');
        return { success: true, browserDownload: true, fallback: true };
      } else {
        // If IPC is not available, don't try window.open as it creates unwanted Electron windows
        console.warn('IPC not available, skipping browser fallback');
        throw error; // Re-throw the original error instead of opening a broken window
      }
    } catch (fallbackError) {
      // Throw original error if fallback fails
      throw error;
    }
  }
}

/**
 * Initialize the current version
 * This is a wrapper around the versionManager.getAppVersion function
 */
export async function initCurrentVersion() {
  try {
    // We now use the centralized versionManager to get the app version
    // We don't need to modify CURRENT_VERSION as it's just imported
    await getAppVersion();
    return;
  } catch (error) {
    // Silent error - version will be handled by fallbacks
  }
}

// Types are now defined in the versionManager module
