import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { initUpdateHandlers } from './updateHandler';
import dotenv from 'dotenv';

// Security imports
import { session, protocol } from 'electron';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Secure window defaults
const SECURE_WINDOW_DEFAULTS: Electron.BrowserWindowConstructorOptions = {
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    // Preload script will be added per window if needed
  }
};

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

// Keep track of internal browser windows
let coingeckoWindow: BrowserWindow | null = null;

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
  
  // Get preload script path
  const preloadPath = IS_DEV
    ? path.join(__dirname, 'preload.ts')
    : path.join(process.resourcesPath, 'app.asar/dist-electron/preload.js');
  
  dialogWindow = new BrowserWindow({
    width: 450,
    height: 250,
    frame: false,
    transparent: false,
    webPreferences: {
      ...SECURE_WINDOW_DEFAULTS.webPreferences,
      preload: preloadPath,
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
  // Set up security features
  setupSecurity();
  
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

  // Get preload script path
  const preloadPath = IS_DEV
    ? path.join(__dirname, 'preload.ts')
    : path.join(process.resourcesPath, 'app.asar/dist-electron/preload.js');

  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    show: false,
    webPreferences: {
      ...SECURE_WINDOW_DEFAULTS.webPreferences,
      preload: preloadPath,
      backgroundThrottling: false,
    },
    x: Math.round(workArea.x + (workArea.width - 400) / 2),
    y: Math.round(workArea.y + (workArea.height - 300) / 2),
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    backgroundColor: '#121212',
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

        // Check for update flag
        try {
          const updateFlagPath = path.join(app.getPath('userData'), 'update.flag');
          if (fs.existsSync(updateFlagPath)) {
            mainWindow.webContents.send('update-successful');
            fs.unlinkSync(updateFlagPath);
            console.log('Update successful flag found and processed.');
          }
        } catch (error) {
          console.error('Error handling update flag:', error);
        }
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

        // Check for update flag
        try {
          const updateFlagPath = path.join(app.getPath('userData'), 'update.flag');
          if (fs.existsSync(updateFlagPath)) {
            mainWindow.webContents.send('update-successful');
            fs.unlinkSync(updateFlagPath);
            console.log('Update successful flag found and processed.');
          }
        } catch (error) {
          console.error('Error handling update flag:', error);
        }
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

  // Intercept new window requests to customize them
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Security: Deny requests for URLs we don't trust.
    if (!url.startsWith('https:')) {
      return { action: 'deny' };
    }

    // Return window configuration
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        frame: true,
        backgroundColor: '#121212',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        icon: getIconPath(),
      },
    };
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
  // Helper function to validate sender
  const isValidSender = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    
    // Only accept IPC from our own windows
    return win === mainWindow || win === dialogWindow || 
           (coingeckoWindow && win === coingeckoWindow);
  };

  // Handle get-app-version request
  ipcMain.handle('get-app-version', (event) => {
    if (!isValidSender(event)) {
      throw new Error('Invalid sender');
    }
    
    // Try multiple sources for the most accurate version
    const packageVersion = app.getVersion();
    const envVersion = process.env.APP_VERSION;
    // Prefer env version if set, otherwise use package.json version
    return envVersion || packageVersion || 'unknown';
  });
  
  // Handle get-env-vars request with filtered data
  ipcMain.handle('get-env-vars', (event) => {
    if (!isValidSender(event)) {
      throw new Error('Invalid sender');
    }
    
    // Get the most up-to-date version info
    const currentAppVersion = appVersion || app.getVersion() || process.env.npm_package_version || '';
    
    // Only expose non-sensitive data
    const safeEnv = {
      APP_VERSION: currentAppVersion,
      NODE_ENV: process.env.NODE_ENV || 'production',
      // API endpoints (no credentials)
      COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
      OPENEXCHANGERATES_API_URL: 'https://openexchangerates.org/api',
      CRYPTOCOMPARE_API_URL: 'https://min-api.cryptocompare.com'
    };
    
    console.log('Providing safe environment variables via IPC');
    return safeEnv;
  });
  
  // Handle quit-app request
  ipcMain.on('quit-app', (event) => {
    if (!isValidSender(event)) {
      console.error('Invalid sender for quit-app');
      return;
    }
    app.quit();
  });

  // Handle opening external links securely
  ipcMain.handle('open-external-link', async (event, url) => {
    if (!isValidSender(event)) {
      throw new Error('Invalid sender');
    }
    
    // Validate URL
    try {
      const parsedUrl = new URL(url);
      // Only allow https URLs
      if (parsedUrl.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
      }
    } catch (error) {
      console.error('Invalid URL:', url, error);
      return { success: false, error: 'Invalid URL' };
    }
    
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external link:', url, error);
      const message = error instanceof Error ? error.message : 'Unknown error opening link';
      return { success: false, error: message };
    }
  });

  // Handle opening links INTERNALLY with sender validation
  ipcMain.on('open-link-in-app', (event, url) => {
    if (!isValidSender(event)) {
      console.error('Invalid sender for open-link-in-app');
      return;
    }
    
    // Check if CoinGecko window exists and is usable
    if (coingeckoWindow && !coingeckoWindow.isDestroyed()) {
      const normalizeUrl = (inputUrl: string): string => {
        try {
          const parsed = new URL(inputUrl);
          // Rebuild without hash and search, remove trailing slash from pathname
          return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
        } catch (e) {
          console.warn('Failed to normalize URL:', inputUrl, e);
          return inputUrl; // Return original if parsing fails
        }
      };
      
      const currentURL = coingeckoWindow.webContents.getURL();
      const normalizedCurrentURL = normalizeUrl(currentURL);
      const normalizedRequestedURL = normalizeUrl(url);

      console.log(`CoinGecko window open. Normalized Current: ${normalizedCurrentURL}, Normalized Req: ${normalizedRequestedURL}`);

      // ONLY load URL if normalized URLs are different
      if (normalizedCurrentURL !== normalizedRequestedURL) {
        console.log('Loading new URL into existing CoinGecko window.');
        coingeckoWindow.loadURL(url);
      } else {
        console.log('Requested URL is the same as current. Focusing window only.');
        // DO NOTHING here except focus/restore below
      }

      // Always focus and restore if minimized
      if (coingeckoWindow.isMinimized()) {
        coingeckoWindow.restore();
      }
      coingeckoWindow.focus();

    } else {
      console.log('Creating new CoinGecko window.');
      // Create a new window and store the reference ONLY if creation succeeds
      const newWindow = createInternalBrowserWindow(url);
      if (newWindow) { // Check if window creation succeeded
          coingeckoWindow = newWindow;
      }
    }
  });
  
  // Handle window resizing with validation
  ipcMain.on('set-window-size', (event, { width, height, isFullScreen }) => {
    if (!isValidSender(event)) {
      console.error('Invalid sender for set-window-size');
      return;
    }
    
    if (!mainWindow) return;
    
    // Validate dimensions
    const minWidth = 400;
    const minHeight = 300;
    const maxWidth = 1920;
    const maxHeight = 1080;
    
    width = Math.max(minWidth, Math.min(width, maxWidth));
    height = Math.max(minHeight, Math.min(height, maxHeight));
    
    const { workArea } = screen.getPrimaryDisplay();
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);
    
    mainWindow.setMinimumSize(minWidth, minHeight);
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

function createInternalBrowserWindow(url: string) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    console.error('Attempted to open invalid internal URL:', url);
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.max(800, Math.round(workArea.width * 0.7));
  const height = Math.max(600, Math.round(workArea.height * 0.7));

  const newWindow = new BrowserWindow({
    width: width,
    height: height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    title: 'Loading...', // Will be updated by the page
    icon: getIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, // Disable Node.js integration for external content
      contextIsolation: true, // Enable context isolation (recommended)
      sandbox: false, // Sandboxing can add complexity, disable for now unless needed
      webSecurity: true,
      plugins: false, // Disable plugins
      devTools: IS_DEV // Only enable DevTools in development
    }
  });

  newWindow.loadURL(url);

  newWindow.webContents.on('did-finish-load', () => {
    newWindow.setTitle(newWindow.webContents.getTitle());
  });

  // Clean up when the window is closed
  newWindow.on('closed', () => {
    // Only clear the specific coingeckoWindow variable
    if (newWindow === coingeckoWindow) {
      coingeckoWindow = null;
    }
  });

  return newWindow;
}

function setupSecurity() {
  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for some frameworks
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://api.coingecko.com https://openexchangerates.org https://min-api.cryptocompare.com https://*.r2.cloudflarestorage.com https://*.r2.dev wss:",
          "media-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'"
        ].join('; ')
      }
    });
  });

  // Permission request handler - deny all by default
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Deny all permissions - crypto converter doesn't need any special permissions
    callback(false);
  });

  // Permission check handler
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    // Return false for all permission checks
    return false;
  });

  // Prevent new window creation from web content
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      
      // Only allow navigation to expected origins
      const allowedOrigins = [
        'file://',
        'http://localhost:5173', // Vite dev server
        'https://api.coingecko.com',
        'https://openexchangerates.org',
        'https://min-api.cryptocompare.com'
      ];
      
      const isAllowed = allowedOrigins.some(origin => navigationUrl.startsWith(origin));
      
      if (!isAllowed && IS_DEV) {
        console.warn('Navigation blocked to:', navigationUrl);
      }
      
      if (!isAllowed) {
        event.preventDefault();
      }
    });

    // Prevent webview tag
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // Block new window creation
    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  });
}
