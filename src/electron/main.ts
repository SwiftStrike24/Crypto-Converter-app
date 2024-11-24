import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'path';

// Ensure DIST path is always defined
const DIST_PATH = path.join(__dirname, '../dist');
const PUBLIC_PATH = app.isPackaged ? DIST_PATH : path.join(DIST_PATH, '../public');

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    alwaysOnTop: true,
  });

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Load your app
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle quit-app event
  ipcMain.on('quit-app', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register the '~' key shortcut
  globalShortcut.register('`', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
}); 