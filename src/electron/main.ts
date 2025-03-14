import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { initUpdateHandlers } from './updateHandler';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Disable GPU acceleration to prevent crashes
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Set app user model id for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.cryptovertx.app');
}

const IS_DEV = process.env.NODE_ENV === 'development';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Get app info dynamically
const APP_PATH = app.getPath('exe');
const DIST_PATH = IS_DEV 
  ? path.join(__dirname, '../dist')
  : path.join(process.resourcesPath, 'app.asar/dist');

// Load app configuration
const loadAppConfig = () => {
  try {
    // In production, check for config file
    if (!IS_DEV) {
      const configPath = path.join(process.resourcesPath, 'config', 'app-config.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
      }
    }
  } catch (error) {
    console.error('Failed to load app config:', error);
  }
  
  // Default config if not found
  return {
    appId: 'com.cryptovertx.app',
    iconPath: 'icon.ico',
    appName: 'CryptoVertX',
    appCompany: 'CryptoVertX',
    appDescription: 'Cryptocurrency Converter',
    version: '1.0.0'
  };
};

// Load app configuration
const appConfig = loadAppConfig();

// Set app user model id for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId(appConfig.appId || 'com.cryptovertx.app');
}

// Get icon path based on environment
const getIconPath = () => {
  if (IS_DEV) {
    return path.join(__dirname, '../src/assets/icon.ico');
  } else {
    // In production, check multiple possible locations
    const possiblePaths = [
      // First check config-specified path
      path.join(process.resourcesPath, 'config', appConfig.iconPath || 'icon.ico'),
      // Then check other common locations
      path.join(process.resourcesPath, 'assets/icon.ico'),
      path.join(process.resourcesPath, 'config/icon.ico'),
      path.join(app.getAppPath(), '../assets/icon.ico'),
      path.join(app.getPath('exe'), '../resources/assets/icon.ico'),
      path.join(app.getPath('exe'), '../icon.ico')
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        console.log(`Using icon from: ${iconPath}`);
        return iconPath;
      }
    }
    
    // Fallback to development path if no production icon found
    return path.join(__dirname, '../src/assets/icon.ico');
  }
};

let mainWindow: BrowserWindow | null = null;
let dialogWindow: BrowserWindow | null = null;
let isQuitting = false;

function cleanupAndExit(shouldRelaunch = false) {
  isQuitting = true;
  
  // Cleanup windows with explicit checks
  [mainWindow, dialogWindow].forEach(win => {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  });
  mainWindow = null;
  dialogWindow = null;

  // Remove listeners
  ipcMain.removeAllListeners();
  globalShortcut.unregisterAll();

  if (shouldRelaunch) {
    const execPath = process.platform === 'win32' 
      ? process.env.NODE_ENV === 'development'
        ? process.execPath
        : APP_PATH
      : process.execPath;

    const args = process.env.NODE_ENV === 'development'
      ? process.argv.slice(1)
      : ['--relaunch'];

    app.relaunch({ 
      execPath,
      args
    });
    app.exit(0);
  } else {
    app.exit(0);
  }
}

// Enforce single instance lock
const instanceLock = app.requestSingleInstanceLock();

if (!instanceLock) {
  console.log('Another instance is running, quitting...');
  app.quit();
}

// Handle second instance attempt
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  createDialogWindow();
});

// Handle IPC events for instance management
ipcMain.on('restart-request', () => {
  cleanupAndExit(true);
});

ipcMain.on('instance-dialog-restart', () => {
  cleanupAndExit(true);
});

// Handle quit request from renderer
ipcMain.on('quit-app', () => {
  isQuitting = true;
  cleanupAndExit(false);
});

// Handle app relaunch event
app.on('activate', () => {
  if (process.argv.includes('--relaunch')) {
    process.argv = process.argv.filter(arg => arg !== '--relaunch');
    
    // Windows-specific focus handling
    if (process.platform === 'win32') {
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }, 500);
    }
    // Existing logic...
  }
});

function createDialogWindow() {
  if (dialogWindow) {
    dialogWindow.focus();
    return;
  }
  
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
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    icon: getIconPath(),
  });

  const url = VITE_DEV_SERVER_URL 
    ? `${VITE_DEV_SERVER_URL}#/instance-dialog`
    : `file://${path.join(DIST_PATH, 'index.html#/instance-dialog')}`;
    
  dialogWindow.loadURL(url);

  if (!VITE_DEV_SERVER_URL) {
    dialogWindow.webContents.on('did-finish-load', () => {
      dialogWindow?.webContents.send('navigate-to', '/instance-dialog');
    });
  }

  dialogWindow.once('ready-to-show', () => {
    dialogWindow?.show();
  });

  dialogWindow.on('closed', () => {
    dialogWindow = null;
  });
}

// Initialize app
app.whenReady().then(() => {
  // Check for relaunch flag early in the process
  const isRelaunch = process.argv.includes('--relaunch');
  if (isRelaunch) {
    process.argv = process.argv.filter(arg => arg !== '--relaunch');
  }

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

  globalShortcut.register('`', toggleWindow);
  globalShortcut.register('~', toggleWindow);

  if (!globalShortcut.isRegistered('`') || !globalShortcut.isRegistered('~')) {
    console.error('Shortcut registration failed');
  }

  // Ensure proper window visibility after relaunch
  if (isRelaunch && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }

  // Set up IPC handlers
  setupIpcHandlers();
});

// Get the app version from package.json
let appVersion = '';
try {
  const packageJsonPath = IS_DEV 
    ? path.join(__dirname, '../../package.json') 
    : path.join(process.resourcesPath, 'app.asar/package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    appVersion = packageJson.version || '';
    console.log(`Loaded app version from package.json: ${appVersion}`);
  }
} catch (error) {
  console.error('Error loading version from package.json:', error);
}

// Ensure environment variables are available
const ENV_VARS = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || 'a29e1fcdd07785579dd54acb5378348a',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '7f4477e05cdf9d71385da15bad012fb9',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '4f43905f8d806110e6f3a548f294b71ae86b2cadb7218532d3113c960ddce1b7',
  R2_ENDPOINT: process.env.R2_ENDPOINT || 'https://a29e1fcdd07785579dd54acb5378348a.r2.cloudflarestorage.com',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || 'https://pub-a29e1fcdd07785579dd54acb5378348a.r2.dev',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'cryptoconverter-downloads',
  APP_VERSION: appVersion || app.getVersion() || process.env.npm_package_version || '',
  API_BASE_URL: process.env.API_BASE_URL || 'https://cryptovertx.com/api'
};

// Log environment variables for debugging (excluding secrets)
console.log('Main process environment variables loaded:', {
  CLOUDFLARE_ACCOUNT_ID: ENV_VARS.CLOUDFLARE_ACCOUNT_ID ? 'Set' : 'Not Set',
  R2_ACCESS_KEY_ID: ENV_VARS.R2_ACCESS_KEY_ID ? 'Set' : 'Not Set', 
  R2_SECRET_ACCESS_KEY: ENV_VARS.R2_SECRET_ACCESS_KEY ? 'Set' : 'Not Set',
  R2_ENDPOINT: ENV_VARS.R2_ENDPOINT,
  R2_PUBLIC_URL: ENV_VARS.R2_PUBLIC_URL,
  R2_BUCKET_NAME: ENV_VARS.R2_BUCKET_NAME,
  API_BASE_URL: ENV_VARS.API_BASE_URL
});

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
      webSecurity: true,
      backgroundThrottling: false,
    },
    x: Math.round(workArea.x + (workArea.width - 400) / 2),
    y: Math.round(workArea.y + (workArea.height - 300) / 2),
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    backgroundColor: '#111111',
    icon: getIconPath(),
  });

  // Initialize update handlers
  initUpdateHandlers(mainWindow);

  // Enable DevTools in development
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    
    // In development, set environment variables after page load
    mainWindow.webContents.on('did-finish-load', () => {
      if (mainWindow) {
        // Inject both the environment variables and a global app version
        mainWindow.webContents.executeJavaScript(`
          window.electron = window.electron || {};
          window.electron.env = ${JSON.stringify(ENV_VARS)};
          
          // Add app version as a global variable too
          window.__APP_VERSION__ = "${ENV_VARS.APP_VERSION}";
          
          // Add package.json version as another source
          window.__PACKAGE_JSON_VERSION__ = "${appVersion || ENV_VARS.APP_VERSION}";
          
          // Set document title to include version
          document.title = "CryptoVertX v${ENV_VARS.APP_VERSION}";
          
          console.log('Development mode: App version set to:', window.__APP_VERSION__);
          console.log('Package.json version:', window.__PACKAGE_JSON_VERSION__);
          console.log('R2 environment variables loaded (dev mode):', {
            hasCloudflareId: !!window.electron.env.CLOUDFLARE_ACCOUNT_ID,
            hasAccessKeyId: !!window.electron.env.R2_ACCESS_KEY_ID,
            hasSecretKey: !!window.electron.env.R2_SECRET_ACCESS_KEY,
            endpoint: window.electron.env.R2_ENDPOINT || "(using default)",
            publicUrl: window.electron.env.R2_PUBLIC_URL || "(using default)",
            bucketName: window.electron.env.R2_BUCKET_NAME || "(using default)",
            apiBaseUrl: window.electron.env.API_BASE_URL || "(using default)"
          });
        `).then(() => {
          console.log('Environment variables set in development mode');
        }).catch(err => {
          console.error('Error setting environment variables in development:', err);
        });
      }
    });
  } else {
    const indexPath = path.join(DIST_PATH, 'index.html');
    mainWindow.loadFile(indexPath);
    
    mainWindow.webContents.on('did-finish-load', () => {
      // Pass environment variables to renderer process
      if (mainWindow) {
        // In production, use multiple approaches to set the version
        mainWindow.webContents.executeJavaScript(`
          // Set up electron environment
          window.electron = window.electron || {};
          window.electron.env = ${JSON.stringify(ENV_VARS)};
          
          // Add app version directly to window as a backup method
          window.__APP_VERSION__ = "${ENV_VARS.APP_VERSION}";
          
          // Add package.json version as another source
          window.__PACKAGE_JSON_VERSION__ = "${appVersion || ENV_VARS.APP_VERSION}";
          
          // Set document title to include version
          document.title = "CryptoVertX v${ENV_VARS.APP_VERSION}";
          
          // Log what we're using
          console.log('Production mode: App version set to:', window.__APP_VERSION__);
          console.log('Package.json version:', window.__PACKAGE_JSON_VERSION__);
          console.log('R2 environment variables loaded (production):', {
            hasCloudflareId: !!window.electron.env.CLOUDFLARE_ACCOUNT_ID,
            hasAccessKeyId: !!window.electron.env.R2_ACCESS_KEY_ID,
            hasSecretKey: !!window.electron.env.R2_SECRET_ACCESS_KEY,
            endpoint: window.electron.env.R2_ENDPOINT || "(using default)",
            publicUrl: window.electron.env.R2_PUBLIC_URL || "(using default)",
            bucketName: window.electron.env.R2_BUCKET_NAME || "(using default)",
            apiBaseUrl: window.electron.env.API_BASE_URL || "(using default)"
          });
        `).then(() => {
          // Navigate to home page after setting environment variables
          mainWindow?.webContents.send('navigate-to', '/');
          console.log('Environment variables set and navigation triggered');
        }).catch(err => {
          console.error('Error setting environment variables:', err);
          // Still try to navigate even if setting env vars fails
          mainWindow?.webContents.send('navigate-to', '/');
        });
      }
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focused');
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window-blurred');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    const indexPath = path.join(DIST_PATH, 'index.html');
    mainWindow?.loadFile(indexPath);
  });

  // Add IPC handler for window resizing
  ipcMain.on('set-window-size', (_, { width, height, isFullScreen }) => {
    if (!mainWindow) return;
    
    const { workArea } = screen.getPrimaryDisplay();
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);
    
    mainWindow.setMinimumSize(400, 300);
    mainWindow.setBounds({ 
      x, 
      y, 
      width, 
      height 
    }, true);

    // Update window properties based on isFullScreen while keeping the window non-resizable
    mainWindow.setResizable(false);
    mainWindow.setMaximizable(false);
    mainWindow.setAlwaysOnTop(!isFullScreen);
    mainWindow.setSkipTaskbar(!isFullScreen);
  });
}

// App lifecycle events
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cleanupAndExit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    cleanupAndExit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Set up IPC handlers
function setupIpcHandlers() {
  // Handle get-app-version request
  ipcMain.handle('get-app-version', () => {
    // Try multiple sources for the most accurate version
    return appVersion || app.getVersion() || process.env.npm_package_version || '';
  });
  
  // Handle get-env-vars request
  ipcMain.handle('get-env-vars', () => {
    // Get the most up-to-date version info
    const currentAppVersion = appVersion || app.getVersion() || process.env.npm_package_version || '';
    
    // Create a safe object with only the environment variables we want to expose
    const safeEnv = {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
      R2_ENDPOINT: process.env.R2_ENDPOINT || '',
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'cryptoconverter-downloads',
      APP_VERSION: currentAppVersion,
      NODE_ENV: process.env.NODE_ENV || 'production'
    };
    
    console.log('Providing environment variables via IPC');
    return safeEnv;
  });
  
  // Handle quit-app request
  ipcMain.on('quit-app', () => {
    app.quit();
  });
}
