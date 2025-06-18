import { ipcMain, app, dialog, shell, BrowserWindow, Notification } from 'electron';
import { join } from 'path';
import { createWriteStream, unlink, writeFileSync } from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { spawn } from 'child_process';

/**
 * Initialize update handlers for the main process
 * @param mainWindow The main BrowserWindow instance
 */
export function initUpdateHandlers(mainWindow: BrowserWindow) {
  // Handle download update request
  ipcMain.handle('download-update', async (event, url: string) => {
    try {
      console.log(`Starting download from: ${url}`);
      
      // Create a temporary file path in the app's user data directory
      const downloadPath = join(app.getPath('temp'), `CryptoVertX-Update-${Date.now()}.exe`);
      console.log(`Downloading to: ${downloadPath}`);
      
      // Create a write stream for the file
      const writer = createWriteStream(downloadPath);
      
      // Download the file
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
      });
      
      // Get total file size
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      
      // Set up progress tracking
      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0;
        mainWindow.webContents.send('download-progress', progress);
      });
      
      // Pipe the response to the file
      await pipeline(response.data, writer);
      
      console.log('Download completed successfully');
      
      // Verify the downloaded file size to ensure integrity
      try {
        const fileStats = await stat(downloadPath);
        if (fileStats.size !== totalSize || totalSize === 0) {
          throw new Error(`Downloaded file size (${fileStats.size}) does not match expected size (${totalSize})`);
        }
        console.log('File verification successful.');
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
    
    // Create a function to handle progress updates
    const progressHandler = (_event: any, progress: number) => {
      if (!sender.isDestroyed()) {
        sender.send('download-progress', progress);
      }
    };
    
    // Add the listener using a custom event
    mainWindow.webContents.on('did-finish-load', () => {
      // We'll use IPC for progress updates instead of direct webContents events
      console.log('Setting up progress handler');
    });
    
    // Clean up when the sender is destroyed
    sender.on('destroyed', () => {
      console.log('Cleaning up progress handler');
    });
  });
  
  // Handle install update request
  ipcMain.handle('install-update', async (_event, filePath: string) => {
    try {
      console.log(`Launching installer from: ${filePath}`);
      
      // Set the flag for post-update notification
      try {
        writeFileSync(join(app.getPath('userData'), 'update.flag'), 'true');
        console.log('Update flag set for post-install notification.');
      } catch (flagError) {
        console.error('Failed to write update.flag file:', flagError);
      }

      // Launch the installer with its UI. This is like double-clicking the .exe
      const errorMessage = await shell.openPath(filePath);

      if (errorMessage) {
        console.error(`Failed to launch installer: ${errorMessage}`);
        // If it fails, clean up the flag and throw an error back to the renderer.
        unlink(join(app.getPath('userData'), 'update.flag'), (err) => {
          if (err) console.error('Failed to clean up update.flag on error:', err);
        });
        throw new Error(`Failed to open installer: ${errorMessage}`);
      }
      
      // If launch is successful, quit the app to allow installation to proceed.
      // A short delay gives the installer window time to appear before the main app disappears.
      console.log('Installer launched successfully. Quitting app.');
      setTimeout(() => app.quit(), 500);
      
      return { success: true };

    } catch (error) {
      console.error('Error during installation process:', error);
      throw new Error(`Installation failed: ${(error as Error).message}`);
    }
  });
  
  // Handle show notification request
  ipcMain.on('show-notification', (event, options: { title: string, body: string }) => {
    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        icon: join(app.getAppPath(), 'assets', 'icon.png')
      });
      
      notification.show();
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  });
} 