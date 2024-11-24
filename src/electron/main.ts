import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';

// Ensure DIST path is always defined
const DIST_PATH = path.join(__dirname, '../dist');
const PUBLIC_PATH = app.isPackaged ? DIST_PATH : path.join(DIST_PATH, '../public');

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  // Get the primary display's work area (screen size minus taskbar/dock)
  const { workArea } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    // Center the window
    x: Math.round(workArea.x + (workArea.width - 400) / 2),
    y: Math.round(workArea.y + (workArea.height - 300) / 2),
    alwaysOnTop: true,
    skipTaskbar: false, // Show in taskbar for better UX
    resizable: false,
    maximizable: false,
    minimizable: true,
    // Set window behavior
    hasShadow: true,
    visualEffectState: 'active',
    roundedCorners: true,
  });

  // Prevent the window from being closed accidentally
  mainWindow.on('close', (event) => {
    if (mainWindow?.isVisible()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle quit-app event
  ipcMain.on('quit-app', () => {
    app.quit();
  });

  // Keep the window on top even when fullscreen apps are running
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Optional: Add animation when showing/hiding
  ipcMain.on('show-window', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.setOpacity(0);
      let opacity = 0;
      const fadeIn = setInterval(() => {
        if (!mainWindow) {
          clearInterval(fadeIn);
          return;
        }
        opacity += 0.1;
        if (opacity >= 1) {
          clearInterval(fadeIn);
        }
        mainWindow.setOpacity(opacity);
      }, 10);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register the '~' key shortcut with animation
  globalShortcut.register('`', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        let opacity = 1;
        const fadeOut = setInterval(() => {
          if (!mainWindow) {
            clearInterval(fadeOut);
            return;
          }
          opacity -= 0.1;
          if (opacity <= 0) {
            clearInterval(fadeOut);
            mainWindow.hide();
          }
          mainWindow.setOpacity(opacity);
        }, 10);
      } else {
        mainWindow.show();
        ipcMain.emit('show-window');
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