import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';

// Ensure DIST path is always defined
const DIST_PATH = path.join(__dirname, '../dist');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    x: Math.round(workArea.x + (workArea.width - 400) / 2),
    y: Math.round(workArea.y + (workArea.height - 300) / 2),
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    hasShadow: true,
    visualEffectState: 'active',
    roundedCorners: true,
  });

  // Prevent accidental closure
  mainWindow.on('close', (event) => {
    if (!isQuitting && mainWindow?.isVisible()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

  // Once ready to show, display window
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window focus
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focused');
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-blurred');
  });

  // Handle quit-app event
  ipcMain.on('quit-app', () => {
    isQuitting = true;
    app.quit();
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Improved show/hide handling
  ipcMain.on('show-window', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
      // Send focus event after showing
      mainWindow.webContents.send('window-focused');
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Improved shortcut handling
  const toggleWindow = () => {
    if (!mainWindow) return;
    
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
      // Ensure window gets focus event
      setTimeout(() => {
        mainWindow?.webContents.send('window-focused');
      }, 100);
    }
  };

  // Register both ` and ~ keys (they're the same physical key)
  globalShortcut.register('`', toggleWindow);
  globalShortcut.register('~', toggleWindow);

  // Handle failed registration
  if (!globalShortcut.isRegistered('`') || !globalShortcut.isRegistered('~')) {
    console.error('Shortcut registration failed');
  }
});

app.on('will-quit', () => {
  // Unregister shortcuts
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
}); 