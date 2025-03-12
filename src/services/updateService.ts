// import axios from 'axios';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Define AWS error interface
interface AWSError extends Error {
  $metadata?: Record<string, unknown>;
  Code?: string;
  $fault?: string;
}

// Bucket name - should be configured in .env
export const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cryptoconverter-downloads';

// Current app version from package.json
export const CURRENT_VERSION = process.env.APP_VERSION || '1.2.1';

// Base URL for API endpoints
export const API_BASE_URL = process.env.API_BASE_URL || 'https://cryptovertx.com/api';

/**
 * Safely get environment variables with fallbacks
 */
export const getEnvVars = () => {
  try {
    // Check if window.electron exists and has env property
    if (typeof window !== 'undefined' && window.electron && window.electron.env) {
      return {
        CLOUDFLARE_ACCOUNT_ID: window.electron.env.CLOUDFLARE_ACCOUNT_ID || '',
        R2_ACCESS_KEY_ID: window.electron.env.R2_ACCESS_KEY_ID || '',
        R2_SECRET_ACCESS_KEY: window.electron.env.R2_SECRET_ACCESS_KEY || '',
        R2_ENDPOINT: window.electron.env.R2_ENDPOINT || '',
        R2_PUBLIC_URL: window.electron.env.R2_PUBLIC_URL || ''
      };
    }
    
    // No fallback to hardcoded values - return empty values
    return {
      CLOUDFLARE_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_ENDPOINT: '',
      R2_PUBLIC_URL: ''
    };
  } catch (error) {
    console.error('Error getting environment variables:', error);
    
    // Return empty values instead of hardcoded credentials
    return {
      CLOUDFLARE_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_ENDPOINT: '',
      R2_PUBLIC_URL: ''
    };
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
    console.error('❌ Missing required R2 credentials');
    return null;
  }

  // Get the endpoint from environment variables
  const endpoint = R2_ENDPOINT || `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  
  // Create the client with proper configuration
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Required for Cloudflare R2
  });
};

/**
 * Get file metadata from R2
 * @param prefix The prefix to filter objects by
 * @returns Array of file metadata objects
 */
export async function getFileMetadata(prefix: string) {
  try {
    // Create a fresh client for this request
    const client = createR2Client();
    if (!client) {
      throw new Error('Failed to create R2 client');
    }
    
    console.log(`Fetching files with prefix: ${prefix} from bucket: ${BUCKET_NAME}`);
    
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 10,
    });
    
    const response = await client.send(command);
    console.log(`R2 response received. Found ${response.Contents?.length || 0} objects.`);
    return response.Contents || [];
  } catch (error) {
    console.error('Error fetching file metadata from R2:', error);
    
    // Log additional details for AWS errors
    if (error && typeof error === 'object' && '$metadata' in error) {
      console.error('AWS error metadata:', JSON.stringify((error as AWSError).$metadata, null, 2));
    }
    
    throw error;
  }
}

/**
 * Generate a URL for downloading a file
 * @param key The object key in the R2 bucket
 * @returns URL for downloading the file
 */
export function getDownloadUrl(key: string) {
  try {
    // Use API_BASE_URL from environment
    return `${API_BASE_URL}/download?key=${encodeURIComponent(key)}`;
  } catch (error) {
    console.error('Error generating download URL:', error);
    // Fallback to a direct download URL for the latest version
    return `${API_BASE_URL}/download?key=latest%2FCryptoVertX-Setup-${CURRENT_VERSION}.exe`;
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
  
  // Default fallback
  return CURRENT_VERSION;
}

/**
 * Compare versions
 * @param v1 First version
 * @param v2 Second version
 * @returns -1 if v1 < v2, 0 if v1 = v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

/**
 * Check if an update is available
 * @returns Object with update info
 */
export async function checkForUpdates() {
  try {
    // Get the latest version from R2
    const files = await getFileMetadata('latest/');
    
    // Find the Windows installer
    const windowsInstaller = files.find(file => 
      file.Key?.includes('CryptoVertX-Setup') && file.Key?.endsWith('.exe')
    );
    
    if (!windowsInstaller || !windowsInstaller.Key) {
      console.log('No Windows installer found in R2 bucket');
      
      // Use current version + 0.0.1 as fallback latest version
      const currentVersionParts = CURRENT_VERSION.split('.').map(Number);
      currentVersionParts[2] += 1; // Increment patch version
      const fallbackLatestVersion = currentVersionParts.join('.');
      const fallbackKey = `latest/CryptoVertX-Setup-${fallbackLatestVersion}.exe`;
      
      // Compare with current version
      const comparison = compareVersions(fallbackLatestVersion, CURRENT_VERSION);
      
      if (comparison > 0) {
        return {
          hasUpdate: true,
          currentVersion: CURRENT_VERSION,
          latestVersion: fallbackLatestVersion,
          downloadUrl: getDownloadUrl(fallbackKey),
          fileName: `CryptoVertX-Setup-${fallbackLatestVersion}.exe`,
          fileSize: 0 // We don't know the file size
        };
      }
      
      return { 
        hasUpdate: false, 
        message: 'No Windows installer found' 
      };
    }
    
    // Extract version from filename
    const latestVersion = extractVersionFromFilename(windowsInstaller.Key);
    
    // Compare with current version
    const comparison = compareVersions(latestVersion, CURRENT_VERSION);
    
    if (comparison > 0) {
      // Use the direct download link for the latest version
      const downloadKey = windowsInstaller.Key;
      return {
        hasUpdate: true,
        currentVersion: CURRENT_VERSION,
        latestVersion,
        downloadUrl: getDownloadUrl(downloadKey),
        fileName: downloadKey.split('/').pop() || '',
        fileSize: windowsInstaller.Size || 0
      };
    }
    
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    
    // If we can't access the R2 bucket, provide a fallback
    if ((error as Error).message.includes('Access Denied') || 
        (error as Error).message.includes('Forbidden') ||
        (error as Error).message.includes('401') ||
        (error as Error).message.includes('403')) {
      
      console.log('R2 bucket access denied, using fallback update info');
      
      // Use current version + 0.0.1 as fallback latest version
      const currentVersionParts = CURRENT_VERSION.split('.').map(Number);
      currentVersionParts[2] += 1; // Increment patch version
      const fallbackLatestVersion = currentVersionParts.join('.');
      const fallbackKey = `latest/CryptoVertX-Setup-${fallbackLatestVersion}.exe`;
      
      // Compare with current version
      const comparison = compareVersions(fallbackLatestVersion, CURRENT_VERSION);
      
      if (comparison > 0) {
        return {
          hasUpdate: true,
          currentVersion: CURRENT_VERSION,
          latestVersion: fallbackLatestVersion,
          downloadUrl: getDownloadUrl(fallbackKey),
          fileName: `CryptoVertX-Setup-${fallbackLatestVersion}.exe`,
          fileSize: 0 // We don't know the file size
        };
      }
    }
    
    return {
      hasUpdate: false,
      error: (error as Error).message || 'Unknown error'
    };
  }
}

/**
 * Download the update
 * @param url The download URL
 * @param onProgress Progress callback
 * @returns Promise that resolves when download is complete
 */
export async function downloadUpdate(url: string, onProgress: (progress: number) => void) {
  try {
    // Check if we're in Electron
    if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {
      // Set up progress listener
      const progressListener = (_event: any, progress: number) => {
        onProgress(progress);
      };
      
      // Register the progress listener
      window.electron.ipcRenderer.on('download-progress', progressListener);
      
      // Tell main process we're subscribing to progress updates
      window.electron.ipcRenderer.send('download-progress-subscribe');
      
      try {
        // Start the download using Electron's download manager
        const filePath = await window.electron.ipcRenderer.invoke('download-update', url);
        
        // Clean up listener
        window.electron.ipcRenderer.removeAllListeners('download-progress');
        
        return filePath;
      } catch (electronError) {
        console.error('Electron download failed:', electronError);
        // If Electron download fails, use direct download instead of browser popup
        return await directDownload(url, onProgress);
      }
    } else {
      // We're in a browser environment, use direct download
      return await directDownload(url, onProgress);
    }
  } catch (error) {
    console.error('Error downloading update:', error);
    throw error;
  }
}

/**
 * Direct download without browser popup
 * @param url The download URL
 * @param onProgress Progress callback
 * @returns Promise that resolves to download path
 */
async function directDownload(url: string, onProgress: (progress: number) => void) {
  console.log('Starting direct download:', url);
  
  try {
    // Create a hidden anchor element
    const link = document.createElement('a');
    link.href = url;
    link.download = url.split('/').pop() || 'CryptoVertX-Setup.exe';
    link.style.display = 'none';
    
    // Simulate progress for better UX
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      if (progress <= 90) {
        onProgress(progress);
      } else {
        clearInterval(interval);
      }
    }, 100);
    
    // Add to DOM, click and remove
    document.body.appendChild(link);
    link.click();
    
    // Small delay before removing the element
    setTimeout(() => {
      document.body.removeChild(link);
      clearInterval(interval);
      onProgress(100);
    }, 1000);
    
    return 'direct-download';
  } catch (error) {
    console.error('Direct download failed, falling back to browser download:', error);
    return browserDownload(url, onProgress);
  }
}

/**
 * Fallback browser download method
 * @param url The download URL
 * @param onProgress Progress callback
 * @returns Promise that resolves to 'browser-download'
 */
async function browserDownload(url: string, onProgress: (progress: number) => void) {
  console.log('Falling back to browser download:', url);
  
  // Simulate progress for better UX
  let progress = 0;
  const interval = setInterval(() => {
    progress += 5;
    if (progress <= 90) {
      onProgress(progress);
    } else {
      clearInterval(interval);
    }
  }, 100);
  
  // Open the URL in a new tab
  window.open(url, '_blank');
  
  // Complete the progress after a short delay
  setTimeout(() => {
    clearInterval(interval);
    onProgress(100);
  }, 2000);
  
  // Return a placeholder path since we're not actually downloading the file
  return 'browser-download';
}

/**
 * Install the update
 * @param filePath Path to the downloaded update file
 * @returns Promise that resolves when installation starts
 */
export async function installUpdate(filePath: string) {
  try {
    // Handle direct download case
    if (filePath === 'direct-download' || filePath === 'browser-download') {
      console.log('Update was downloaded through the browser');
      return { success: true, browserDownload: true };
    }
    
    // Send install request to main process
    if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {
      return window.electron.ipcRenderer.invoke('install-update', filePath);
    } else {
      // If we're not in Electron, open the download page
      window.open('https://cryptovertx.com/download', '_blank');
      return { success: true, browserDownload: true };
    }
  } catch (error) {
    console.error('Error installing update:', error);
    // If there's an error, try to open the download page as a fallback
    try {
      window.open('https://cryptovertx.com/download', '_blank');
      return { success: true, browserDownload: true, fallback: true };
    } catch (fallbackError) {
      console.error('Fallback download also failed:', fallbackError);
      throw error;
    }
  }
} 