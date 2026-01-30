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
    // Priority 1: Secure preload API (Electron)
    if (typeof window !== 'undefined' && typeof window.cryptovertx?.app?.getVersion === 'function') {
      try {
        console.log('[Version Manager] Requesting app version via preload API...');
        const result = await window.cryptovertx.app.getVersion();
        const version = result?.version;

        if (version && version !== '0.0.0' && version !== '') {
          currentVersion = version;
          console.log(`[Version Manager] Successfully retrieved via preload API: ${currentVersion}`);
          return currentVersion;
        } else {
          console.warn('[Version Manager] Received invalid version via preload API:', version);
        }
      } catch (error) {
        console.error('[Version Manager] Preload API request failed:', error);
      }
    }

    // Priority 2: Hardcoded version from package.json at build time
    // Only use this as a fallback if all else fails
    // This value should be updated by the build script
    const buildTimeVersion = '2.7.0'; // Injected by build script
    if (buildTimeVersion && buildTimeVersion.length > 0 && !buildTimeVersion.includes('0.0.0')) {
      currentVersion = buildTimeVersion;
      console.log(`[Version Manager] Using hardcoded build-time version: ${currentVersion}`);
      return currentVersion;
    }

    // Priority 3: npm_package_version (works in development)
    if (typeof process !== 'undefined' && process.env && process.env.npm_package_version) {
      currentVersion = process.env.npm_package_version;
      console.log(`[Version Manager] Using npm_package_version: ${currentVersion}`);
      return currentVersion;
    }

    // Extract from document title as absolute last resort
    try {
      const titleMatch = document.title.match(/CryptoVertX\s+v?([\d.]+)/i);
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
