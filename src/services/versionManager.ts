/**
 * Version Manager - Dedicated module for app version handling
 * 
 * This module provides a clean, reliable way to get the current app version
 * from multiple possible sources, avoiding TypeScript typing issues.
 */

// Export a variable to hold the current version and a setter function
export let currentVersion = '';

/**
 * Update the current version
 * @param version The new version to set
 */
export function updateCurrentVersion(version: string): void {
  if (!version) return;
  currentVersion = version;
  console.log(`[Version Manager] Updated version to: ${currentVersion}`);
}

/**
 * Get the current app version from the most reliable source available
 * @returns The current app version as a string
 */
export async function getAppVersion(): Promise<string> {
  // Return cached version if we already have it
  if (currentVersion) {
    return currentVersion;
  }

  try {
    // Priority 1: Use global __APP_VERSION__ (injected by main process)
    if (typeof window !== 'undefined' && (window as any).__APP_VERSION__) {
      currentVersion = (window as any).__APP_VERSION__;
      console.log(`[Version Manager] Using global __APP_VERSION__: ${currentVersion}`);
      return currentVersion;
    }

    // Priority 2: Try Electron environment
    if (typeof window !== 'undefined' && (window as any).electron) {
      const electron = (window as any).electron;

      // Log environment type
      const isDev = typeof process !== 'undefined' && 
                   process.env && 
                   process.env.NODE_ENV?.includes('development');
      console.log(`[Version Manager] Electron environment detected: ${isDev ? 'development' : 'production'}`);

      // Try getting from electron.env.APP_VERSION
      if (electron.env && electron.env.APP_VERSION) {
        currentVersion = electron.env.APP_VERSION;
        console.log(`[Version Manager] Using APP_VERSION from electron.env: ${currentVersion}`);
        return currentVersion;
      }

      // Try using IPC to get version from main process
      if (electron.ipcRenderer) {
        try {
          console.log('[Version Manager] Requesting app version via IPC...');
          const version = await electron.ipcRenderer.invoke('get-app-version');
          
          if (version && version !== '0.0.0' && version !== '') {
            currentVersion = version;
            console.log(`[Version Manager] Successfully retrieved via IPC: ${currentVersion}`);
            return currentVersion;
          } else {
            console.warn('[Version Manager] Received invalid version via IPC:', version);
          }
        } catch (error) {
          console.error('[Version Manager] IPC request failed:', error);
          // Continue to fallbacks
        }
      }
    }

    // Priority 3: Try package.json directly (in production builds)
    if (typeof window !== 'undefined' && (window as any).__PACKAGE_JSON_VERSION__) {
      currentVersion = (window as any).__PACKAGE_JSON_VERSION__;
      console.log(`[Version Manager] Using __PACKAGE_JSON_VERSION__: ${currentVersion}`);
      return currentVersion;
    }

    // Priority 4: Try to dynamically load package.json version if available
    // This is better than a hardcoded value as it will always use the actual version
    try {
      if (typeof window !== 'undefined' && (window as any).electron && (window as any).electron.fs) {
        const fs = (window as any).electron.fs;
        const path = (window as any).electron.path;
        
        // Try to read package.json from app directory
        const appDir = (window as any).electron.app?.getAppPath() || process.cwd();
        const packageJsonPath = path.join(appDir, 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (packageJson.version) {
            currentVersion = packageJson.version;
            console.log(`[Version Manager] Read version directly from package.json: ${currentVersion}`);
            return currentVersion;
          }
        }
      }
    } catch (packageJsonError) {
      console.warn('[Version Manager] Error reading package.json directly:', packageJsonError);
    }

    // Priority 5: Hardcoded version from package.json at build time
    // Only use this as a fallback if all else fails
    // This value should be updated by the build script
    const buildTimeVersion = '1.5.4'; // Injected by build script
    if (buildTimeVersion && buildTimeVersion.length > 0 && !buildTimeVersion.includes('0.0.0')) {
      currentVersion = buildTimeVersion;
      console.log(`[Version Manager] Using hardcoded build-time version: ${currentVersion}`);
      return currentVersion;
    }

    // Priority 6: npm_package_version (works in development)
    if (typeof process !== 'undefined' && process.env && process.env.npm_package_version) {
      currentVersion = process.env.npm_package_version;
      console.log(`[Version Manager] Using npm_package_version: ${currentVersion}`);
      return currentVersion;
    }

    // Extract from document title as absolute last resort
    try {
      const titleMatch = document.title.match(/CryptoVertX\s+v?([\d\.]+)/i);
      if (titleMatch && titleMatch[1]) {
        currentVersion = titleMatch[1];
        console.log(`[Version Manager] Extracted from document title: ${currentVersion}`);
        return currentVersion;
      }
    } catch (e) {
      console.error('[Version Manager] Error extracting from document title:', e);
    }

    console.warn(`[Version Manager] Failed to detect version from all sources`);
    return '';
  } catch (error) {
    console.error('[Version Manager] Error getting app version:', error);
    return '';
  }
}

// Initialize the version when the module is imported
getAppVersion().catch(error => {
  console.error('[Version Manager] Init error:', error);
});
