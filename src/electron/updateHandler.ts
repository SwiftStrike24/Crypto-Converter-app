import { ipcMain, app, shell, BrowserWindow, Notification } from 'electron';
import { join } from 'path';
import { createWriteStream, unlink, writeFileSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { stat } from 'fs/promises';

/**
 * Initialize update handlers for the main process
 * @param mainWindow The main BrowserWindow instance
 */
export function initUpdateHandlers(mainWindow: BrowserWindow) {
  // Handle download update request
  ipcMain.handle('download-update', async (_event, url: string, fileName?: string) => {
    try {
      console.log(`Starting download from: ${url}`);
      try {
        const u = new URL(url);
        console.log(`[UPDATER] Download host: ${u.host}`);
      } catch {}
      
      // Determine the file extension from the filename or default to .exe
      let extension = '.exe'; // Default fallback
      if (fileName) {
        if (fileName.endsWith('.msi')) {
          extension = '.msi';
        } else if (fileName.endsWith('.exe')) {
          extension = '.exe';
        }
      }

      // Create a temporary file path in the app's user data directory
      const downloadPath = join(app.getPath('temp'), `CryptoVertX-Update-${Date.now()}${extension}`);
      console.log(`Downloading to: ${downloadPath}`);
      
      // Configurable timeouts/retries
      const CONNECT_TIMEOUT_MS = 30_000;           // initial connect timeout
      const RESPONSE_HEADER_TIMEOUT_MS = 60_000;   // header wait timeout
      const OVERALL_REQUEST_TIMEOUT_MS = 10 * 60_000; // 10 minutes per request
      const MAX_RETRIES = 3;
      const RETRY_BACKOFF_MS = 2_000;
      let expectedTotalBytes: number | null = null;

      // Internal helper to do a ranged request from an offset
      const downloadWithRange = async (startOffset: number, totalSizeHint: number | null) => {
        console.log(`Downloading with Range from offset=${startOffset}`);
        const headers: Record<string, string> = {};
        if (startOffset > 0) {
          headers['Range'] = `bytes=${startOffset}-`;
        }
        // MSI content-type helps some proxies
        headers['Accept'] = 'application/octet-stream';

        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          headers,
          // axios doesn't have separate header timeout; keep overall generous
          timeout: OVERALL_REQUEST_TIMEOUT_MS,
          transitional: { clarifyTimeoutError: true }
        });

        // Detect content-length of this segment
        const isPartial = response.status === 206;
        const contentLengthHeader = response.headers['content-length'];
        const contentRange = response.headers['content-range'];
        const acceptRanges = response.headers['accept-ranges'];
        const etagHeader = response.headers['etag'];
        console.log(`[UPDATER] GET headers → Content-Length: ${contentLengthHeader || 'n/a'}, Accept-Ranges: ${acceptRanges || 'n/a'}, ETag: ${etagHeader || 'n/a'}, Status: ${response.status}`);
        let segmentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        let totalSize = totalSizeHint || 0;
        if (contentRange) {
          // format: bytes start-end/total
          const match = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(contentRange);
          if (match) {
            const end = parseInt(match[2], 10);
            const total = parseInt(match[3], 10);
            totalSize = total;
            if (segmentLength === 0) segmentLength = end - startOffset + 1;
          }
        }
        // If not partial and server provided Content-Length for full body, use it as expected total
        if (!isPartial && !contentRange && contentLengthHeader) {
          totalSize = parseInt(contentLengthHeader, 10);
        }
        if (totalSize > 0) {
          expectedTotalBytes = totalSize;
        }

        // Progress bookkeeping
        const writer = createWriteStream(downloadPath, { flags: startOffset > 0 ? 'a' : 'w' });
        let downloadedSize = startOffset;
        let lastProgressEmit = Date.now();
        let bytesSinceLast = 0;
        let speed = 0;

        const sendProgress = () => {
          const total = expectedTotalBytes || 0;
          const pct = expectedTotalBytes ? Math.min(99, Math.floor((downloadedSize / expectedTotalBytes) * 100)) : 0;
          const eta = speed > 0 && total > downloadedSize ? Math.round((total - downloadedSize) / speed) : 0;
          mainWindow.webContents.send('download-progress', {
            progress: pct,
            downloadedBytes: downloadedSize,
            totalBytes: total,
            speed,
            eta
          });
        };

        response.data.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;
          bytesSinceLast += chunk.length;
          const now = Date.now();
          const dt = (now - lastProgressEmit) / 1000;
          if (dt >= 0.5) {
            speed = bytesSinceLast / dt;
            bytesSinceLast = 0;
            lastProgressEmit = now;
            sendProgress();
          }
        });

        await pipeline(response.data, writer);

        // Final emit for this segment
        sendProgress();

        return { finalSize: downloadedSize, totalSize: expectedTotalBytes };
      };

      // First HEAD to discover size and support, but tolerate failures
      let totalSizeKnown: number | null = null;
      try {
        const head = await axios({ url, method: 'HEAD', timeout: CONNECT_TIMEOUT_MS });
        const cl = head.headers['content-length'];
        const ar = head.headers['accept-ranges'];
        const et = head.headers['etag'];
        console.log(`[UPDATER] HEAD headers → Content-Length: ${cl || 'n/a'}, Accept-Ranges: ${ar || 'n/a'}, ETag: ${et || 'n/a'}`);
        if (cl) totalSizeKnown = parseInt(cl, 10);
        if (totalSizeKnown && totalSizeKnown > 0) expectedTotalBytes = totalSizeKnown;
      } catch {
        // ignore HEAD failures; proceed to GET
      }

      // Retry loop with resume
      let attempt = 0;
      let downloadedBytes = 0;
      while (attempt < MAX_RETRIES) {
        try {
          attempt++;
          const resumeOffset = existsSync(downloadPath) ? (await stat(downloadPath)).size : 0;
          const startAt = Math.max(resumeOffset, downloadedBytes);
          const { finalSize, totalSize } = await downloadWithRange(startAt, totalSizeKnown);
          downloadedBytes = finalSize;
          totalSizeKnown = totalSize || totalSizeKnown;

          // If we reached or exceeded total size, break
          if (!totalSizeKnown || downloadedBytes >= totalSizeKnown) {
            break;
          }
        } catch (err) {
          console.warn(`Download attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
          if (attempt >= MAX_RETRIES) throw err;
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
        }
      }

      // Final verification of the file
      try {
        const fileStats = await stat(downloadPath);
        if (expectedTotalBytes && fileStats.size !== expectedTotalBytes) {
          throw new Error(`Downloaded file size (${fileStats.size}) does not match expected size (${expectedTotalBytes})`);
        }
        if (fileStats.size < 1024) {
          throw new Error('Downloaded file is too small to be a valid installer');
        }
        console.log(`Downloaded file size: ${fileStats.size} bytes`);
      } catch (error) {
        console.error('File verification failed:', error);
        unlink(downloadPath, (err) => {
          if (err) console.error('Error deleting corrupted update file:', err);
        });
        throw new Error('Downloaded file is incomplete or corrupted.');
      }
      
      // Complete 100%
      mainWindow.webContents.send('download-progress', {
        progress: 100,
        downloadedBytes: downloadedBytes,
        totalBytes: expectedTotalBytes || downloadedBytes,
        speed: 0,
        eta: 0
      });
      
      return downloadPath;
    } catch (error) {
      console.error('Error downloading update:', error);
      throw new Error(`Download failed: ${(error as Error).message}`);
    }
  });
  
  // Set up listener for download progress
  ipcMain.on('download-progress-subscribe', (event) => {
    const sender = event.sender;
    
    // We'll use IPC for progress updates instead of direct webContents events
    console.log('Setting up progress handler');
    
    // Clean up when the sender is destroyed
    sender.on('destroyed', () => {
      console.log('Cleaning up progress handler');
    });
  });
  
  // Handle install update request
  ipcMain.handle('install-update', async (_event, filePath: string) => {
    try {
      console.log(`Launching installer from: ${filePath}`);
      
      // Verify the file still exists before attempting to launch
      try {
        const fileStats = await stat(filePath);
        if (fileStats.size === 0) {
          throw new Error('Installer file is empty or corrupted');
        }
        console.log(`Installer file verified: ${fileStats.size} bytes`);
      } catch (fileError) {
        console.error('Installer file verification failed:', fileError);
        throw new Error('Installer file not found or corrupted. Please download the update again.');
      }
      
      // Set the flag for post-update notification
      const flagPath = join(app.getPath('userData'), 'update.flag');
      try {
        writeFileSync(flagPath, 'true');
        console.log('Update flag set for post-install notification.');
      } catch (flagError) {
        console.error('Failed to write update.flag file:', flagError);
      }

      // Launch the installer with its UI. This is like double-clicking the .exe
      console.log('Attempting to launch installer...');
      const errorMessage = await shell.openPath(filePath);

      if (errorMessage) {
        console.error(`Failed to launch installer: ${errorMessage}`);
        
        // Clean up the flag immediately on failure
        try {
          unlink(flagPath, (err) => {
            if (err) console.error('Failed to clean up update.flag on error:', err);
          });
        } catch (cleanupError) {
          console.error('Error during flag cleanup:', cleanupError);
        }
        
        // Handle the specific "Failed to open path" case - this is user cancellation
        if (errorMessage === 'Failed to open path') {
          console.log('User cancelled installation (UAC denial or similar)');
          throw new Error('Installation was cancelled. Click "Install & Restart" to try again, or run the installer manually.');
        }
        
        // Provide more specific error messages based on the failure type for other errors
        let userFriendlyMessage = '';
        if (errorMessage.toLowerCase().includes('access') || 
            errorMessage.toLowerCase().includes('denied') ||
            errorMessage.toLowerCase().includes('permission')) {
          userFriendlyMessage = 'Installation was cancelled or access was denied. You can try again or run the installer manually.';
        } else if (errorMessage.toLowerCase().includes('not found')) {
          userFriendlyMessage = 'Installer file not found. Please download the update again.';
        } else {
          userFriendlyMessage = `Failed to launch installer: ${errorMessage}. You can try again or run the installer manually.`;
        }
        
        throw new Error(userFriendlyMessage);
      }
      
      // If launch is successful, quit the app to allow installation to proceed.
      // A short delay gives the installer window time to appear before the main app disappears.
      console.log('Installer launched successfully. Quitting app in 500ms...');
      setTimeout(() => {
        console.log('Quitting application for installer...');
        app.quit();
      }, 500);
      
      return { success: true };

    } catch (error) {
      console.error('Error during installation process:', error);
      
      // Ensure flag cleanup on any error
      const flagPath = join(app.getPath('userData'), 'update.flag');
      try {
        unlink(flagPath, (err) => {
          if (err && (err as any).code !== 'ENOENT') { // Ignore "file not found" errors
            console.error('Failed to clean up update.flag on catch:', err);
          }
        });
      } catch (cleanupError) {
        console.error('Error during flag cleanup in catch block:', cleanupError);
      }
      
      // Re-throw the error preserving the specific user-friendly message
      const errorMessage = (error as Error).message;
      
      // Check if this is already a user-friendly cancellation message
      if (errorMessage.includes('Installation was cancelled')) {
        console.log('Re-throwing cancellation error as-is');
        throw error; // Re-throw cancellation errors without modification
      }
      
      // For other user-friendly messages, preserve them
      if (errorMessage.includes('try again') || 
          errorMessage.includes('manually') ||
          errorMessage.includes('download')) {
        throw error; // Re-throw user-friendly errors as-is
      }
      
      // Only wrap technical/internal errors
      throw new Error(`Installation failed: ${errorMessage}`);
    }
  });
  
  // Handle show notification request
  ipcMain.on('show-notification', (_event, options: { title: string, body: string }) => {
    try {
      const notification = new Notification({
        title: options.title,
        body: options.body
      });
      notification.show();
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  });

  // Handle open external URL request (for fallback downloads)
  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      console.log(`Opening external URL: ${url}`);
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw new Error(`Failed to open URL: ${(error as Error).message}`);
    }
  });
} 