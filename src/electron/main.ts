import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import { initUpdateHandlers } from './updateHandler';
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const FeedParser = require('feedparser');
const htmlToTextModule = require('html-to-text');
const htmlToText = htmlToTextModule.htmlToText || htmlToTextModule.convert;
import {
  FUNDRAISING_SOURCES,
  FUNDRAISING_KEYWORDS,
  NEGATIVE_KEYWORDS,
  normalizeText,
  containsAny,
  tagChains,
  detectFundingStage,
  extractFundingAmount,
  findInvestors,
} from './fundraisingConfig';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Add diagnostics to verify html-to-text and entities at runtime
try {
  const h2tPkg = require('html-to-text/package.json');
  console.log(`[HTML_TO_TEXT] Using html-to-text v${h2tPkg.version}. Exported keys:`, Object.keys(htmlToTextModule));
} catch (e) {
  console.warn('[HTML_TO_TEXT] Failed to resolve html-to-text package.json', e);
}
try {
  const entitiesPkg = require('entities/package.json');
  console.log(`[ENTITIES] Using entities v${entitiesPkg.version}`);
} catch (e) {
  console.warn('[ENTITIES] Failed to resolve entities package.json', e);
}

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
  
  dialogWindow = new BrowserWindow({
    width: 450,
    height: 250,
    frame: false,
    transparent: false,
    backgroundColor: '#121212',
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
    : `file://${path.join(DIST_PATH, 'index.html')}`;
    
  dialogWindow.loadURL(url);

  if (!VITE_DEV_SERVER_URL) {
    dialogWindow.webContents.on('did-finish-load', () => {
      dialogWindow?.webContents.send('navigate-to', '/instance-dialog');
    });
  }

  // Robust fallback if initial load fails (e.g., incorrect URL hashing)
  dialogWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[INSTANCE_DIALOG] Failed to load URL: ${validatedURL} code=${errorCode} desc=${errorDescription}`);
    const indexPath = path.join(DIST_PATH, 'index.html');
    dialogWindow?.loadFile(indexPath).then(() => {
      dialogWindow?.webContents.send('navigate-to', '/instance-dialog');
    }).catch((e) => {
      console.error('[INSTANCE_DIALOG] Fallback loadFile failed:', e);
    });
  });

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
      // Send blur event when hidden by hotkey
      mainWindow.webContents.send('window-blurred');
    } else {
      mainWindow.show();
      mainWindow.focus();
      // Send focus event immediately on show
      mainWindow.webContents.send('window-focused');
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
    transparent: false,
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

    // Force dark mode for TradingView links by rewriting the URL and opening controlled window
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (host.endsWith('tradingview.com')) {
        const rewritten = enforceDarkParamsForKnownSites(url);
        createInternalBrowserWindow(rewritten);
        return { action: 'deny' };
      }
    } catch (e) {
      // fall through to default allow
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
    const packageVersion = app.getVersion();
    const envVersion = process.env.APP_VERSION;
    // Prefer env version if set, otherwise use package.json version
    return envVersion || packageVersion || 'unknown';
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

  // Handle opening external links securely
  ipcMain.handle('open-external-link', async (_event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external link:', url, error);
      const message = error instanceof Error ? error.message : 'Unknown error opening link';
      return { success: false, error: message };
    }
  });

  // Handle fetching news data from main process to avoid CSP issues
  ipcMain.handle('fetch-news-data', async (_event, sources) => {
    try {
      console.log('[MAIN_PROCESS] Fetching news data from RSS sources using feedparser');

      const fetchPromises = sources.map(async (source: { name: string; url: string }) => {
        try {
          console.log(`[MAIN_PROCESS] Fetching from ${source.name}: ${source.url}`);

          // Fetch RSS XML directly
          const response = await fetch(source.url, {
            method: 'GET',
            headers: {
              'Accept': 'application/rss+xml, application/xml, text/xml',
              'User-Agent': 'CryptoVertX/1.0 (RSS Reader)'
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const xmlText = await response.text();
          console.log(`[MAIN_PROCESS] Downloaded RSS XML from ${source.name} (${xmlText.length} chars)`);

          // Parse RSS XML using feedparser
          const articles = await parseRSSWithFeedparser(xmlText, source.name);

          console.log(`[MAIN_PROCESS] Successfully parsed ${articles.length} articles from ${source.name}`);

          return {
            success: true,
            source: source.name,
            data: articles
          };
        } catch (error) {
          console.warn(`[MAIN_PROCESS] Failed to fetch from ${source.name}:`, error);
          return {
            success: false,
            source: source.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      const processedResults = results.map(result =>
        result.status === 'fulfilled' ? result.value : { success: false, error: 'Promise rejected' }
      );

      return { success: true, results: processedResults };
    } catch (error) {
      console.error('[MAIN_PROCESS] Critical error during news fetch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch fundraising-focused news with chain tagging and tokenless detection
  ipcMain.handle('fetch-fundraising-news', async (_event, payload: { chains?: string[] }) => {
    const selectedChains: string[] = Array.isArray(payload?.chains) ? payload!.chains : [];
    console.log('[FUNDRAISING] Start fetch. Selected chains:', selectedChains);

    try {
      const fetches = FUNDRAISING_SOURCES.map(async (source) => {
        try {
          console.log(`[FUNDRAISING] Fetching ${source.type || 'rss'} from ${source.name}: ${source.url}`);
          const response = await fetch(source.url, {
            method: 'GET',
            headers: {
              'Accept': 'application/rss+xml, application/xml, text/xml',
              'User-Agent': 'CryptoVertX/1.0 (Fundraising Aggregator)'
            },
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const xmlText = await response.text();
          const items = await parseRSSWithFeedparser(xmlText, source.name);
          console.log(`[FUNDRAISING] Parsed ${items.length} items from ${source.name}`);
          return { ok: true as const, source: source.name, items };
        } catch (err) {
          console.warn(`[FUNDRAISING] Source failed ${source.name}:`, err);
          return { ok: false as const, source: source.name, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      });

      const settled = await Promise.allSettled(fetches);
      const results = settled.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, source: 'unknown', error: 'rejected' }));

      // Flatten items, apply fundraising filter, chain tagging, and selection filter
      const allArticles = results
        .filter((r: any) => r.ok && Array.isArray(r.items))
        .flatMap((r: any) => r.items.map((item: any) => ({ ...item, _source: r.source })));

      console.log(`[FUNDRAISING] Total raw items: ${allArticles.length}`);

      const filtered = allArticles
        .map((article: any) => enhanceFundraisingArticle(article))
        .filter((a) => a !== null) as any[];

      console.log(`[FUNDRAISING] After fundraising keyword filter: ${filtered.length}`);

      const filteredByChain = selectedChains.length
        ? filtered.filter((a) => (a.chains || []).some((c: string) => selectedChains.includes(c)))
        : filtered;

      console.log(`[FUNDRAISING] After chain selection filter: ${filteredByChain.length}`);

      // Sort newest first
      filteredByChain.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      // Cap to 60 to keep UI snappy
      const limited = filteredByChain.slice(0, 60);
      console.log(`[FUNDRAISING] Returning ${limited.length} articles`);

      return { success: true, data: limited };
    } catch (error) {
      console.error('[FUNDRAISING] Critical error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  function isLikelyFundraisingText(text: string): boolean {
    const t = text.toLowerCase();
    if (!containsAny(t, FUNDRAISING_KEYWORDS)) return false;
    if (containsAny(t, NEGATIVE_KEYWORDS)) return false;
    return true;
  }

  function enhanceFundraisingArticle(item: any): any | null {
    const title: string = normalizeText(item.title);
    const summary: string = normalizeText(item.summary || item.description || '');
    const combined = `${title} — ${summary}`;

    if (!isLikelyFundraisingText(combined)) {
      return null;
    }

    const chainInfo = tagChains(combined);
    const fundingStage = detectFundingStage(combined);
    const fundingAmount = extractFundingAmount(combined);
    const investors = findInvestors(combined);

    const result = {
      title: title || 'Untitled',
      source: item.source || item._source || 'Unknown',
      publishedAt: item.publishedAt || item.pubdate || item.date || new Date().toISOString(),
      summary,
      url: item.url || item.link || item.guid || '',
      imageUrl: item.imageUrl,
      chains: chainInfo.chains,
      tokenless: chainInfo.tokenless,
      fundingStage,
      fundingAmount,
      investors,
      // simple relevance score
      _score: (
        (chainInfo.chains.length ? 2 : 0) +
        (chainInfo.tokenless ? 2 : 0) +
        (fundingStage ? 1 : 0) +
        (fundingAmount ? 2 : 0) +
        (investors.length ? Math.min(2, investors.length) : 0)
      )
    };

    console.log(`[FUNDRAISING] Tagged: "${result.title.substring(0, 80)}"`, {
      chains: result.chains,
      tokenless: result.tokenless,
      stage: result.fundingStage,
      amount: result.fundingAmount,
      investors: result.investors,
    });

    return result;
  }

    // New robust RSS parser using feedparser and html-to-text
  async function parseRSSWithFeedparser(xmlText: string, sourceName: string): Promise<any[]> {
    const articles: any[] = [];

    try {
      // Create a readable stream from the XML text
      const stream = require('stream');
      const readableStream = new stream.Readable();
      readableStream.push(xmlText);
      readableStream.push(null);

      const feedparser = new FeedParser({});

      return new Promise<any[]>((resolve, reject) => {
        const parsedArticles: any[] = [];

        feedparser.on('error', (error: Error) => {
          console.error(`[FEEDPARSER] Error parsing feed from ${sourceName}:`, error);
          reject(error);
        });

        feedparser.on('readable', function(this: any) {
          let item;
          while ((item = this.read())) {
            try {
              // Extract the full lede/summary using intelligent parsing
              const summary = extractFullLede(item);

              // Extract image URL
              const imageUrl = extractImageFromItem(item, sourceName);

              const article = {
                title: item.title || 'Untitled',
                source: sourceName,
                publishedAt: item.pubdate || item.date || new Date().toISOString(),
                summary: summary,
                url: item.link || item.guid || '',
                imageUrl: imageUrl
              };

              if (article.title && article.url) {
                parsedArticles.push(article);
                console.log(`[FEEDPARSER] Successfully processed article: "${article.title?.substring(0, 50)}..."`);
              }
            } catch (itemError) {
              console.error(`[FEEDPARSER] Error processing item from ${sourceName}:`, itemError);
            }
          }
        });

        feedparser.on('end', () => {
          console.log(`[FEEDPARSER] Completed parsing ${parsedArticles.length} articles from ${sourceName}`);
          resolve(parsedArticles.slice(0, 20)); // Limit to 20 items
        });

        // Pipe the XML stream to feedparser
        readableStream.pipe(feedparser);
      });

    } catch (error) {
      console.error(`[MAIN_PROCESS] Error parsing RSS XML for ${sourceName}:`, error);
      return articles;
    }
  }

  // Intelligent lede extraction function
  function extractFullLede(item: any): string {
    // Priority order for extracting the lede/summary:
    // 1. description (usually the article summary/lede)
    // 2. summary (Atom feeds)
    // 3. content:encoded (full content, extract lede from first paragraph)
    // 4. content (Atom feeds)

    if (item.description) {
      console.log(`[LEDE_EXTRACTION] Using description field (${item.description.length} chars)`);
      return extractLedeFromContent(item.description);
    }
    
    if (item.summary) {
      console.log(`[LEDE_EXTRACTION] Using summary field (${item.summary.length} chars)`);
      return extractLedeFromContent(item.summary);
    }

    if (item['content:encoded']) {
      console.log(`[LEDE_EXTRACTION] Extracting lede from content:encoded`);
      return extractLedeFromContent(item['content:encoded']);
    }
    
    if (item.content) {
      console.log(`[LEDE_EXTRACTION] Using content field (${item.content.length} chars)`);
      return extractLedeFromContent(item.content);
    }

    console.log(`[LEDE_EXTRACTION] No summary content found for item`);
    return '';
  }

  // Extract lede paragraph from full article content
  function extractLedeFromContent(content: string): string {
    // Convert HTML to clean text using html-to-text
    const plainText = htmlToText(content, {
      wordwrap: false,
      preserveNewlines: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        // Let default BR handling create newlines
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'div', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } }
      ]
    }).trim();

    // If the content is already short (under 400 chars), it's probably already a lede
    if (plainText.length <= 400) {
      return plainText;
    }

    // Try to find the first substantial paragraph
    const paragraphs = plainText.split(/\n\s*\n/).filter((p: string) => p.trim().length > 20);

    if (paragraphs.length > 0) {
      const firstParagraph = paragraphs[0].trim();

      // If first paragraph is reasonably short, use it
      if (firstParagraph.length <= 400) {
        return firstParagraph;
      }

      // Otherwise, take first 2-3 sentences from the long first paragraph
      const sentences = firstParagraph.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      if (sentences.length > 0) {
        const ledeSentences = sentences.slice(0, Math.min(2, sentences.length));
        return ledeSentences.join('. ').trim() + '.';
      }
    }

    // Fallback: take first 300 characters of the whole text and cut at sentence boundary
    const first300 = plainText.substring(0, 300);
    const lastSentenceEnd = Math.max(
      first300.lastIndexOf('.'),
      first300.lastIndexOf('!'),
      first300.lastIndexOf('?')
    );

    if (lastSentenceEnd > 100) {
      return plainText.substring(0, lastSentenceEnd + 1).trim();
    }

    // Final fallback: hard truncate with ellipsis
    const lastSpace = first300.lastIndexOf(' ');
    if (lastSpace > 0) {
        return first300.substring(0, lastSpace).trim() + '...';
    }
    
    return first300 + '...';
  }

  // Enhanced image extraction function
  function extractImageFromItem(item: any, sourceName: string): string | undefined {
    // Try multiple sources for image extraction

    // 1. Check for enclosure (common in podcasts and media RSS)
    if (item.enclosures && item.enclosures.length > 0) {
      for (const enclosure of item.enclosures) {
        if (enclosure.url && enclosure.type && enclosure.type.startsWith('image/')) {
          if (isValidImageUrl(enclosure.url)) {
            return enclosure.url;
          }
        }
      }
    }

    // 2. Check for media:content or media:thumbnail
    if (item['media:content'] && item['media:content'].url) {
      if (isValidImageUrl(item['media:content'].url)) {
        return item['media:content'].url;
      }
    }

    if (item['media:thumbnail'] && item['media:thumbnail'].url) {
      if (isValidImageUrl(item['media:thumbnail'].url)) {
        return item['media:thumbnail'].url;
      }
    }

    // 3. Extract from description or content using regex
    const contentFields = [item.description, item['content:encoded'], item.content, item.summary].filter(Boolean);

    for (const content of contentFields) {
      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
      if (imgMatch && isValidImageUrl(imgMatch[1])) {
        return imgMatch[1];
      }
    }

    // 4. For CoinDesk specifically, check content:encoded for images
    if (sourceName.includes('CoinDesk') && item['content:encoded']) {
      const contentMatch = item['content:encoded'].match(/<img[^>]+src="([^"]+)"/i);
      if (contentMatch && isValidImageUrl(contentMatch[1])) {
        return contentMatch[1];
      }
    }

    // 5. Fallback: look for any image URLs in the content
    for (const content of contentFields) {
      const urlMatches = content.match(/https?:\/\/[^\s"<>]+\.(jpg|jpeg|png|gif|webp|svg)/gi);
      if (urlMatches && urlMatches.length > 0 && isValidImageUrl(urlMatches[0])) {
        return urlMatches[0];
      }
    }

    return undefined;
  }

  // Helper function to validate image URLs
  function isValidImageUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    
    // Check if it's a valid URL
    try {
      const urlObj = new URL(url);
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) return false;
      
      // Strict hostname validation - must be at least 4 characters and contain a dot
      if (!urlObj.hostname || urlObj.hostname.length < 4 || !urlObj.hostname.includes('.')) {
        return false;
      }
      
      // Check for obviously malformed hostnames
      if (urlObj.hostname.includes('..') || urlObj.hostname.startsWith('.') || urlObj.hostname.endsWith('.')) {
        return false;
      }
      
      // Check for common image extensions
      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i;
      if (imageExtensions.test(url)) {
        return true;
      }
      
      // Check for known image hosting domains and CDNs - be more specific
      const imageHostingDomains = /\.(imgur|cloudinary|unsplash|pexels|pixabay|flickr|amazonaws|googleusercontent|wp|wordpress|gravatar|twimg|fbcdn|cdninstagram|ytimg)\.com$/i;
      if (imageHostingDomains.test(urlObj.hostname)) {
        return true;
      }
      
      // Be more strict with jwpsrv - only allow if it has proper path structure
      if (urlObj.hostname.includes('jwpsrv.com') && urlObj.pathname.includes('/') && urlObj.pathname.length > 10) {
        return true;
      }
      
      // Check for other common CDN patterns but be more strict
      const cdnPatterns = /(cdn\.|images\.|static\.|media\.|assets\.|thumb)/i;
      if (cdnPatterns.test(urlObj.hostname) && urlObj.pathname.length > 5) {
        return true;
      }
      
      // If URL contains common image-related keywords and has a reasonable path, it's likely an image
      const imageKeywords = /(image|img|photo|pic|thumb|avatar|logo|banner)/i;
      if (imageKeywords.test(url) && urlObj.pathname.length > 5) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  // Handle opening links INTERNALLY
  ipcMain.on('open-link-in-app', (_event, url) => {
    // Check if this is a CoinGecko URL (use singleton pattern)
    const isCoinGeckoUrl = url.includes('coingecko.com');
    
    if (isCoinGeckoUrl) {
      // Use singleton pattern for CoinGecko URLs
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
    } else {
      // For non-CoinGecko URLs (like news articles), always create a new window
      console.log('Creating new browser window for:', url);
      createInternalBrowserWindow(url);
    }
  });
}

// Ensure external links use dark theme where supported (e.g., TradingView)
function enforceDarkParamsForKnownSites(inputUrl: string): string {
  try {
    const u = new URL(inputUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host.endsWith('tradingview.com')) {
      u.searchParams.set('theme', 'dark');
      u.searchParams.set('colorTheme', 'dark');
      return u.toString();
    }
    return inputUrl;
  } catch {
    return inputUrl;
  }
}

function createInternalBrowserWindow(url: string) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    console.error('Attempted to open invalid internal URL:', url);
    return;
  }

  console.log(`Creating new internal browser window for URL: ${url}`);

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

  console.log(`Loading URL in internal browser window: ${url}`);
  const finalUrl = enforceDarkParamsForKnownSites(url);
  newWindow.loadURL(finalUrl);

  newWindow.webContents.on('did-finish-load', () => {
    const newTitle = newWindow.webContents.getTitle();
    console.log(`Internal browser window finished loading. Title: ${newTitle}`);
    newWindow.setTitle(newTitle);
  });

  newWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Internal browser window failed to load URL: ${validatedURL}`);
    console.error(`Error code: ${errorCode}, Description: ${errorDescription}`);
  });

  newWindow.webContents.on('did-navigate', (_event, navigationUrl) => {
    console.log(`Internal browser window navigated to: ${navigationUrl}`);
  });

  // Clean up when the window is closed
  newWindow.on('closed', () => {
    console.log('Internal browser window closed');
    // Only clear the specific coingeckoWindow variable
    if (newWindow === coingeckoWindow) {
      coingeckoWindow = null;
    }
  });

  return newWindow;
}

// Initialize handlers and global event listeners
setupIpcHandlers();

// Global logging for window creation to diagnose unexpected window creation
app.on('web-contents-created', (_event, contents) => {
  console.log(`New web-contents created: ${contents.getType()}`);
  if (contents.getType() === 'window') {
    console.log(`New window web-contents created`);
  }
});

app.on('browser-window-created', (_event, window) => {
  const title = window.getTitle();
  const url = window.webContents.getURL();
  console.log(`New BrowserWindow created with title: "${title}"`);
  console.log(`Window webContents URL: "${url}"`);
  
  // Add stack trace to identify what's creating unexpected windows
  if (!title && !url) {
    console.error('UNEXPECTED EMPTY WINDOW CREATED! Stack trace:');
    console.trace();
  }
  
  // Monitor this window's URL changes to catch 404s
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`BrowserWindow failed to load URL: ${validatedURL}`);
    console.error(`Error code: ${errorCode}, Description: ${errorDescription}`);
    if (errorCode === -6) { // FILE_NOT_FOUND
      console.error('This appears to be the 404 window! Closing it...');
      if (!window.isDestroyed()) {
        window.close();
      }
    }
  });
});
