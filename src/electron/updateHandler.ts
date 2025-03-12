import { ipcMain, app, dialog, shell, BrowserWindow, Notification } from 'electron';
import { join } from 'path';
import { createWriteStream, unlink } from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

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
      
      // Verify the downloaded file
      try {
        const fileStats = await stat(downloadPath);
        if (fileStats.size === 0) {
          throw new Error('Downloaded file is empty');
        }
        
        // Try to read the first few bytes to ensure it's a valid file
        const readStream = createReadStream(downloadPath, { start: 0, end: 100 });
        await new Promise((resolve, reject) => {
          readStream.on('data', () => {
            resolve(true);
          });
          readStream.on('error', (err) => {
            reject(err);
          });
          readStream.on('end', () => {
            resolve(true);
          });
        });
      } catch (error) {
        console.error('File verification failed:', error);
        throw new Error('Downloaded file verification failed');
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
  ipcMain.handle('install-update', async (event, filePath: string) => {
    try {
      console.log(`Installing update from: ${filePath}`);
      
      // Show confirmation dialog
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Install Update',
        message: 'The application will close and the update will be installed.',
        buttons: ['Install', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (response === 0) {
        // User confirmed, execute the installer
        console.log('Starting installer...');
        
        // On Windows, we can directly execute the installer
        if (process.platform === 'win32') {
          // Execute the installer and quit the app
          shell.openPath(filePath).then(() => {
            // Give the installer a moment to start
            setTimeout(() => {
              app.quit();
            }, 1000);
          });
        } else {
          // For other platforms, just open the file
          shell.openPath(filePath);
          
          // Quit the app after a short delay
          setTimeout(() => {
            app.quit();
          }, 1000);
        }
        
        return { success: true };
      } else {
        console.log('Update installation cancelled by user');
        
        // Clean up the downloaded file
        unlink(filePath, (err) => {
          if (err) console.error('Error deleting update file:', err);
        });
        
        return { success: false, cancelled: true };
      }
    } catch (error) {
      console.error('Error installing update:', error);
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