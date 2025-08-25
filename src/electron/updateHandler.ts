import { ipcMain, app, shell, BrowserWindow, Notification } from 'electron';
import { join } from 'path';
import { createWriteStream, unlink, writeFileSync } from 'fs';
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
      
      // Create a write stream for the file
      const writer = createWriteStream(downloadPath);
      
      // Download the file
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
      });
      
      // Get total file size from Content-Length header
      const contentLength = response.headers['content-length'];
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      let downloadedSize = 0;
      
      console.log(`Content-Length header: ${contentLength || 'not provided'}`);
      console.log(`Expected file size: ${totalSize} bytes`);
      
      // Enhanced progress tracking variables
      let lastProgressUpdate = Date.now();
      let progressUpdateInterval: NodeJS.Timeout | null = null;
      let downloadSpeed = 0; // bytes per second
      let lastDownloadedSize = 0;
      let speedSamples: number[] = [];
      const maxSpeedSamples = 10; // Keep last 10 speed samples for smoothing
      
      // Estimated file size based on historical data (your logs show ~101MB consistently)
      const estimatedFileSize = 101 * 1024 * 1024; // 101 MB in bytes
      const fallbackSize = totalSize > 0 ? totalSize : estimatedFileSize;
      
      // Function to send progress updates with additional metrics
      const sendProgress = (progress: number, speed: number = 0, eta: number = 0) => {
        const cappedProgress = Math.min(progress, 99); // Cap at 99% until completion
        mainWindow.webContents.send('download-progress', {
          progress: cappedProgress,
          downloadedBytes: downloadedSize,
          totalBytes: fallbackSize,
          speed: speed,
          eta: eta
        });
      };
      
      // Enhanced speed calculation
      const calculateSpeed = () => {
        const now = Date.now();
        const timeDelta = (now - lastProgressUpdate) / 1000; // seconds
        const bytesDelta = downloadedSize - lastDownloadedSize;
        
        if (timeDelta > 0) {
          const currentSpeed = bytesDelta / timeDelta;
          speedSamples.push(currentSpeed);
          
          // Keep only recent samples for smoothing
          if (speedSamples.length > maxSpeedSamples) {
            speedSamples.shift();
          }
          
          // Calculate average speed for smoother display
          downloadSpeed = speedSamples.reduce((sum, speed) => sum + speed, 0) / speedSamples.length;
          
          lastProgressUpdate = now;
          lastDownloadedSize = downloadedSize;
        }
        
        return downloadSpeed;
      };
      
      // Function to calculate ETA
      const calculateETA = () => {
        if (downloadSpeed > 0 && fallbackSize > downloadedSize) {
          return Math.round((fallbackSize - downloadedSize) / downloadSpeed);
        }
        return 0;
      };
      
      // Set up real-time progress tracking with data chunks
      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        
        // Calculate real-time progress
        const progress = (downloadedSize / fallbackSize) * 100;
        const speed = calculateSpeed();
        const eta = calculateETA();
        
        // Send immediate progress update for responsiveness
        sendProgress(progress, speed, eta);
      });
      
      // Start periodic progress updates for smooth animation
      progressUpdateInterval = setInterval(() => {
        if (downloadedSize > 0) {
          const progress = (downloadedSize / fallbackSize) * 100;
          const speed = calculateSpeed();
          const eta = calculateETA();
          sendProgress(progress, speed, eta);
        }
      }, 100); // Update every 100ms for ultra-smooth progress
      
      // Handle download errors and stalls
      response.data.on('error', (error: Error) => {
        console.error('Download stream error:', error);
        if (progressUpdateInterval) {
          clearInterval(progressUpdateInterval);
        }
      });
      
      // Pipe the response to the file
      await pipeline(response.data, writer);
      
      // Clean up interval
      if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
      }
      
      console.log('Download completed successfully');
      console.log(`Final downloaded size: ${downloadedSize} bytes`);
      
      // Send 100% progress on completion with final stats
      mainWindow.webContents.send('download-progress', {
        progress: 100,
        downloadedBytes: downloadedSize,
        totalBytes: downloadedSize, // Use actual size as total for 100%
        speed: downloadSpeed,
        eta: 0
      });
      
      // Verify the downloaded file integrity
      try {
        const fileStats = await stat(downloadPath);
        console.log(`Downloaded file size: ${fileStats.size} bytes`);
        
        // If Content-Length was provided and valid, do strict verification
        if (totalSize > 0) {
          if (fileStats.size !== totalSize) {
            throw new Error(`Downloaded file size (${fileStats.size}) does not match expected size (${totalSize})`);
          }
          console.log('Strict file verification successful.');
        } else {
          // If Content-Length was not provided, do basic verification
          if (fileStats.size === 0) {
            throw new Error('Downloaded file is empty');
          }
          if (fileStats.size < 1024) { // Less than 1KB is suspicious for an installer
            throw new Error(`Downloaded file is too small (${fileStats.size} bytes) to be a valid installer`);
          }
          console.log('Basic file verification successful (Content-Length not provided by server).');
        }
      } catch (error) {
        console.error('File verification failed:', error);
        // Clean up the corrupted file
        unlink(downloadPath, (err) => {
          if (err) console.error('Error deleting corrupted update file:', err);
        });
        throw new Error('Downloaded file is incomplete or corrupted.');
      }
      
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
          if (err && err.code !== 'ENOENT') { // Ignore "file not found" errors
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