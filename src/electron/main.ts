import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';

// Ensure DIST path is always defined
const DIST_PATH = path.join(__dirname, '../dist');

let mainWindow: BrowserWindow | null = null;
let dialogWindow: BrowserWindow | null = null;
let isQuitting = false;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function cleanupAndExit() {
  // Cleanup all windows
  if (dialogWindow) {
    dialogWindow.destroy();
    dialogWindow = null;
  }
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  
  // Remove all listeners
  ipcMain.removeAllListeners();
  globalShortcut.unregisterAll();
  
  // Force exit after cleanup
  setTimeout(() => {
    app.exit(0);
    process.exit(0);
  }, 100);
}

function createDialogWindow() {
  if (dialogWindow) return;
  
  const { workArea } = screen.getPrimaryDisplay();
  
  dialogWindow = new BrowserWindow({
    width: 450,
    height: 250,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    x: Math.round(workArea.x + (workArea.width - 450) / 2),
    y: Math.round(workArea.y + (workArea.height - 250) / 2),
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
  });

  const url = VITE_DEV_SERVER_URL 
    ? `${VITE_DEV_SERVER_URL}#/instance-dialog`
    : `file://${path.join(DIST_PATH, 'index.html#/instance-dialog')}`;
    
  dialogWindow.loadURL(url);

  dialogWindow.once('ready-to-show', () => {
    dialogWindow?.show();
  });

  // Simple restart handler
  ipcMain.once('instance-dialog-restart', () => {
    // Destroy dialog window immediately
    if (dialogWindow) {
      dialogWindow.destroy();
      dialogWindow = null;
    }
    app.relaunch();
    app.exit(0);  // Force exit all instances
  });
}

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();

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
    resizable: true,
    maximizable: false,
    minimizable: true,
    hasShadow: true,
    visualEffectState: 'active',
    roundedCorners: true,
  });

  // Prevent accidental closure
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      // Ensure cleanup on actual quit
      mainWindow?.destroy();
      mainWindow = null;
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

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
    cleanupAndExit();
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Improved show/hide handling
  ipcMain.on('show-window', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('window-focused');
    }
  });

  // Handle window resizing
  ipcMain.on('set-window-size', (_, { width, height, isFullScreen }) => {
    if (!mainWindow) return;

    const { workArea } = screen.getPrimaryDisplay();
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);

    mainWindow.setResizable(true);
    mainWindow.setSize(width, height);
    mainWindow.setPosition(x, y);
    
    if (isFullScreen) {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setSkipTaskbar(false);
    } else {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setSkipTaskbar(false);
    }
  });
}

if (!gotTheLock) {
  // For second instance, just show dialog
  app.whenReady().then(() => {
    createDialogWindow();
  });
} else {
  // Handle second instance launch
  app.on('second-instance', () => {
    if (app.isReady()) {
      createDialogWindow();
    } else {
      app.whenReady().then(createDialogWindow);
    }
  });

  app.whenReady().then(() => {
    createWindow();

    const toggleWindow = () => {
      if (!mainWindow) return;
      
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
        setTimeout(() => {
          mainWindow?.webContents.send('window-focused');
        }, 100);
      }
    };

    // Register both ` and ~ keys (they're the same physical key)
    globalShortcut.register('`', toggleWindow);
    globalShortcut.register('~', toggleWindow);

    if (!globalShortcut.isRegistered('`') || !globalShortcut.isRegistered('~')) {
      console.error('Shortcut registration failed');
    }
  });
}

// Ensure cleanup on all quit paths
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    cleanupAndExit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});