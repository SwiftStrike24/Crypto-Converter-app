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
  extractValuation,
  extractLeadInvestor,
  findInvestors,
} from './fundraisingConfig';



const Sentiment = require('sentiment');
const stringSimilarity = require('string-similarity');
const sentiment = new Sentiment();

// --- News Feed Configuration ---

const NEWS_SOURCES = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/' },
  { name: 'U.Today', url: 'https://u.today/rss' },
  { name: 'Bitcoin.com', url: 'https://news.bitcoin.com/feed/' },
  { name: 'Daily Hodl', url: 'https://dailyhodl.com/feed/' },
  { name: 'BeInCrypto', url: 'https://beincrypto.com/feed/' },
  // New high-quality sources added Dec 2025
  { name: 'NewsBTC', url: 'https://www.newsbtc.com/feed/' },
  { name: 'CryptoBriefing', url: 'https://cryptobriefing.com/feed/' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
];

const NEWS_CATEGORIES = {
  'Regulation': ['sec', 'regulation', 'law', 'court', 'ban', 'tax', 'legal', 'compliance', 'gensler', 'senate', 'congress', 'approval', 'sue', 'lawsuit', 'settlement', 'gary', 'fud', 'executive order', 'treasury'],
  'Market': ['price', 'rally', 'crash', 'bull', 'bear', 'ath', 'market', 'trading', 'analysis', 'forecast', 'prediction', 'etf', 'volume', 'liquidity', 'launch', 'listing', 'pump', 'dump', 'whale'],
  'Tech': ['upgrade', 'fork', 'mainnet', 'developer', 'bug', 'vulnerability', 'protocol', 'consensus', 'node', 'hashrate', 'difficulty', 'release', 'github', 'commit', 'v2', 'beta', 'testnet', 'layer 2', 'l2'],
  'DeFi': ['dex', 'yield', 'swap', 'liquidity', 'tvl', 'farming', 'staking', 'lending', 'borrowing', 'curve', 'uniswap', 'aave', 'maker', 'compound'],
  'Security': ['hack', 'exploit', 'scam', 'phishing', 'stolen', 'attack', 'breach', 'security', 'audit', 'vulnerability', 'drain'],
  'NFT/Gaming': ['nft', 'metaverse', 'gaming', 'play-to-earn', 'gamefi', 'collection', 'mint', 'avatar', 'opensea', 'blur'],
};

// Noise filter keywords - articles containing these in title/summary are hidden
const NOISE_KEYWORDS = ['sponsored', 'press release', 'partner content', 'guest post', 'advertisement', 'paid promotion', 'promoted'];

// Filter out noise/spam articles
function isNoiseArticle(title: string, summary: string): boolean {
  const combinedText = (title + ' ' + summary).toLowerCase();

  // Check for noise keywords
  if (NOISE_KEYWORDS.some(keyword => combinedText.includes(keyword))) {
    console.log(`[NOISE_FILTER] Filtered out: "${title.substring(0, 60)}..." (contains noise keyword)`);
    return true;
  }

  // Filter out very short titles (likely junk)
  if (title.length < 20) {
    console.log(`[NOISE_FILTER] Filtered out: "${title}" (title too short)`);
    return true;
  }

  // Filter out generic/empty content
  if (!summary && title.split(' ').length < 5) {
    console.log(`[NOISE_FILTER] Filtered out: "${title}" (no summary and generic title)`);
    return true;
  }

  return false;
}

// --- News Helper Functions ---

function analyzeSentiment(text: string): { score: number; label: 'positive' | 'negative' | 'neutral' } {
  const result = sentiment.analyze(text);
  const score = result.score;
  let label: 'positive' | 'negative' | 'neutral' = 'neutral';

  if (score >= 2) label = 'positive';
  else if (score <= -2) label = 'negative';

  return { score, label };
}

function tagArticle(text: string): string[] {
  const lowerText = text.toLowerCase();
  const tags: string[] = [];

  for (const [category, keywords] of Object.entries(NEWS_CATEGORIES)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      tags.push(category);
    }
  }
  return tags;
}

interface EnrichedArticle {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  imageUrl?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  categories: string[];
  relatedSources: string[];
  isHighImpact: boolean; // True if sentiment score >= 3 or <= -3
}


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

// Legacy IPC events (restart/quit) were removed; renderer uses preload API.

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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
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
      dialogWindow?.webContents.send('cryptovertx:nav:navigate', { path: '/instance-dialog' });
    });
  }

  // Robust fallback if initial load fails (main-frame only; ignore aborted subframe loads)
  dialogWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (common during rapid navigations / widget subframes)
    if (!isMainFrame || errorCode === -3) return;

    console.error(`[INSTANCE_DIALOG] Main-frame failed to load URL: ${validatedURL} code=${errorCode} desc=${errorDescription}`);

    // In dev, prefer keeping the dev server URL; don't fall back to potentially stale dist.
    if (VITE_DEV_SERVER_URL) return;

    const indexPath = path.join(DIST_PATH, 'index.html');
    void dialogWindow?.loadFile(indexPath).then(() => {
      dialogWindow?.webContents.send('cryptovertx:nav:navigate', { path: '/instance-dialog' });
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
      mainWindow.webContents.send('cryptovertx:window:blurred');
    } else {
      mainWindow.show();
      mainWindow.focus();
      // Send focus event immediately on show
      mainWindow.webContents.send('cryptovertx:window:focused');
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
  APP_VERSION: appVersion || app.getVersion() || process.env.npm_package_version || '',
  API_BASE_URL: process.env.API_BASE_URL || 'https://cryptovertx.com/api'
};

// Log environment variables for debugging (excluding secrets)
console.log('Main process environment variables loaded:', {
  NODE_ENV: ENV_VARS.NODE_ENV,
  APP_VERSION: ENV_VARS.APP_VERSION,
  API_BASE_URL: ENV_VARS.API_BASE_URL,
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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
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

    // In development, check update flag after page load
    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow) return;

      // Check for update flag
      try {
        const updateFlagPath = path.join(app.getPath('userData'), 'update.flag');
        if (fs.existsSync(updateFlagPath)) {
          mainWindow.webContents.send('cryptovertx:updates:successful');
          fs.unlinkSync(updateFlagPath);
          console.log('Update successful flag found and processed.');
        }
      } catch (error) {
        console.error('Error handling update flag:', error);
      }
    });
  } else {
    const indexPath = path.join(DIST_PATH, 'index.html');
    mainWindow.loadFile(indexPath);

    mainWindow.webContents.on('did-finish-load', () => {
      if (!mainWindow) return;

      // Ensure renderer is on the expected initial route
      mainWindow.webContents.send('cryptovertx:nav:navigate', { path: '/' });

      // Check for update flag
      try {
        const updateFlagPath = path.join(app.getPath('userData'), 'update.flag');
        if (fs.existsSync(updateFlagPath)) {
          mainWindow.webContents.send('cryptovertx:updates:successful');
          fs.unlinkSync(updateFlagPath);
          console.log('Update successful flag found and processed.');
        }
      } catch (error) {
        console.error('Error handling update flag:', error);
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
    mainWindow?.webContents.send('cryptovertx:window:focused');
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('cryptovertx:window:blurred');
  });

  // Important: did-fail-load fires for subframes too. Only recover for main-frame failures.
  // Also ignore ERR_ABORTED (-3), which is expected during rapid navigations / widget loads.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;

    console.error('[MAIN_WINDOW] Main-frame failed to load:', {
      errorCode,
      errorDescription,
      validatedURL,
      isDev: Boolean(VITE_DEV_SERVER_URL),
    });

    // In dev, do not fall back to dist (can be stale / mismatched) - let user restart dev server.
    if (VITE_DEV_SERVER_URL) return;

    const indexPath = path.join(DIST_PATH, 'index.html');
    void mainWindow?.loadFile(indexPath).catch((e) => {
      console.error('[MAIN_WINDOW] Fallback loadFile failed:', e);
    });
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
          sandbox: true,
          webSecurity: true,
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
  // ============================================================================
  // NEW NAMESPACED IPC HANDLERS (cryptovertx:*)
  // ============================================================================

  // --- App lifecycle ---
  ipcMain.on('cryptovertx:app:quit', () => {
    isQuitting = true;
    cleanupAndExit(false);
  });

  ipcMain.handle('cryptovertx:app:getVersion', () => {
    const packageVersion = app.getVersion();
    const envVersion = process.env.APP_VERSION;
    return envVersion || packageVersion || appVersion || 'unknown';
  });

  // --- Window management ---
  ipcMain.on('cryptovertx:window:setSize', (_, payload) => {
    if (!mainWindow) return;
    const { width, height, isFullScreen } = payload;

    const { workArea } = screen.getPrimaryDisplay();
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + (workArea.height - height) / 2);

    mainWindow.setMinimumSize(400, 300);
    mainWindow.setBounds({ x, y, width, height }, true);
    mainWindow.setResizable(false);
    mainWindow.setMaximizable(false);
    mainWindow.setAlwaysOnTop(!isFullScreen);
    mainWindow.setSkipTaskbar(!isFullScreen);
  });

  // --- Link handling ---
  ipcMain.on('cryptovertx:links:openInApp', (_event, payload) => {
    const { url } = payload;
    if (!url || typeof url !== 'string') return;
    
    // Check if this is a CoinGecko URL (use singleton pattern)
    const isCoinGeckoUrl = url.includes('coingecko.com');

    if (isCoinGeckoUrl) {
      if (coingeckoWindow && !coingeckoWindow.isDestroyed()) {
        const normalizeUrl = (inputUrl: string): string => {
          try {
            const parsed = new URL(inputUrl);
            return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
          } catch (e) {
            return inputUrl;
          }
        };

        const currentURL = coingeckoWindow.webContents.getURL();
        const normalizedCurrentURL = normalizeUrl(currentURL);
        const normalizedRequestedURL = normalizeUrl(url);

        if (normalizedCurrentURL !== normalizedRequestedURL) {
          coingeckoWindow.loadURL(url);
        }

        if (coingeckoWindow.isMinimized()) {
          coingeckoWindow.restore();
        }
        coingeckoWindow.focus();
      } else {
        const newWindow = createInternalBrowserWindow(url);
        if (newWindow) {
          coingeckoWindow = newWindow;
        }
      }
    } else {
      createInternalBrowserWindow(url);
    }
  });

  ipcMain.handle('cryptovertx:links:openExternal', async (_event, payload) => {
    const { url } = payload;
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL' };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // --- News fetching ---
  ipcMain.handle('cryptovertx:news:fetchMarket', async (_event, _payload) => {
    try {
      console.log('[MAIN_PROCESS] Fetching market news via new IPC channel');

      const sourcesToFetch = NEWS_SOURCES;

      const fetchPromises = sourcesToFetch.map(async (source) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const response = await fetch(source.url, {
            method: 'GET',
            headers: {
              'Accept': 'application/rss+xml, application/xml, text/xml',
              'User-Agent': 'CryptoVertX/1.0 (RSS Reader)'
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const xmlText = await response.text();
          const articles = await parseRSSWithFeedparser(xmlText, source.name);

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

      const allArticles: EnrichedArticle[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && Array.isArray(result.value.data)) {
          const enrichedBatch = result.value.data
            .filter((item: any) => !isNoiseArticle(item.title || '', item.summary || ''))
            .map((item: any) => {
              const sentimentResult = analyzeSentiment(item.title + ' ' + item.summary);
              const categories = tagArticle(item.title + ' ' + item.summary);
              const isHighImpact = sentimentResult.score >= 3 || sentimentResult.score <= -3;

              return {
                title: item.title,
                source: item.source,
                publishedAt: item.publishedAt,
                summary: item.summary,
                url: item.url,
                imageUrl: item.imageUrl,
                sentiment: sentimentResult.label,
                sentimentScore: sentimentResult.score,
                categories: categories,
                relatedSources: [],
                isHighImpact: isHighImpact
              } as EnrichedArticle;
            });

          allArticles.push(...enrichedBatch);
        }
      }

      // Deduplicate
      const uniqueArticles: EnrichedArticle[] = [];
      allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      for (const article of allArticles) {
        let isDuplicate = false;
        for (const uniqueArticle of uniqueArticles) {
          if (article.url === uniqueArticle.url) {
            isDuplicate = true;
            break;
          }
          const titleSimilarity = stringSimilarity.compareTwoStrings(article.title, uniqueArticle.title);
          if (titleSimilarity > 0.45) {
            isDuplicate = true;
            if (!uniqueArticle.relatedSources.includes(article.source) && article.source !== uniqueArticle.source) {
              uniqueArticle.relatedSources.push(article.source);
            }
            break;
          }
        }
        if (!isDuplicate) {
          uniqueArticles.push(article);
        }
      }

      return {
        success: true,
        data: uniqueArticles,
        results: [{
          success: true,
          source: 'Aggregated News Engine',
          data: uniqueArticles
        }]
      };
    } catch (error) {
      console.error('[MAIN_PROCESS] Critical error during news fetch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('cryptovertx:news:fetchFundraising', async (_event, payload) => {
    const selectedChains: string[] = Array.isArray(payload?.filters?.chains) ? payload.filters.chains : [];
    console.log('[FUNDRAISING] Start fetch via new IPC. Selected chains:', selectedChains);

    try {
      const fetches = FUNDRAISING_SOURCES.map(async (source) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const response = await fetch(source.url, {
            method: 'GET',
            headers: {
              'Accept': 'application/rss+xml, application/xml, text/xml',
              'User-Agent': 'CryptoVertX/1.0 (Fundraising Aggregator)'
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const xmlText = await response.text();
          const items = await parseRSSWithFeedparser(xmlText, source.name);
          return { ok: true as const, source: source.name, items };
        } catch (err) {
          return { ok: false as const, source: source.name, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      });

      const settled = await Promise.allSettled(fetches);
      const results = settled.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, source: 'unknown', error: 'rejected' }));

      const allArticles = results
        .filter((r: any) => r.ok && Array.isArray(r.items))
        .flatMap((r: any) => r.items.map((item: any) => ({ ...item, _source: r.source })));

      const filtered = allArticles
        .map((article: any) => enhanceFundraisingArticle(article))
        .filter((a) => a !== null) as any[];

      const filteredByChain = selectedChains.length
        ? filtered.filter((a) => (a.chains || []).some((c: string) => selectedChains.includes(c)))
        : filtered;

      filteredByChain.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      const limited = filteredByChain.slice(0, 60);

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
    const valuation = extractValuation(combined);
    const leadInvestor = extractLeadInvestor(combined);
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
      valuation,
      leadInvestor,
      investors,
      // simple relevance score
      _score: (
        (chainInfo.chains.length ? 2 : 0) +
        (chainInfo.tokenless ? 2 : 0) +
        (fundingStage ? 1 : 0) +
        (fundingAmount ? 2 : 0) +
        (leadInvestor ? 2 : 0) +
        (investors.length ? Math.min(2, investors.length) : 0)
      )
    };

    console.log(`[FUNDRAISING] Tagged: "${result.title.substring(0, 80)}"`, {
      chains: result.chains,
      tokenless: result.tokenless,
      stage: result.fundingStage,
      amount: result.fundingAmount,
      lead: result.leadInvestor,
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

        feedparser.on('readable', function (this: any) {
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
  function normalizeHtmlField(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
      // Buffers and other objects should not crash the parser; fall back to string.
      const v: any = value;
      if (typeof v?.toString === 'function') return String(v.toString());
    } catch {
      // ignore
    }
    return '';
  }

  function extractFullLede(item: any): string {
    // Priority order for extracting the lede/summary:
    // 1. description (usually the article summary/lede)
    // 2. summary (Atom feeds)
    // 3. content:encoded (full content, extract lede from first paragraph)
    // 4. content (Atom feeds)

    if (item.description) {
      const description = normalizeHtmlField(item.description);
      if (description) {
        console.log(`[LEDE_EXTRACTION] Using description field (${description.length} chars)`);
        return extractLedeFromContent(description);
      }
    }

    if (item.summary) {
      const summary = normalizeHtmlField(item.summary);
      if (summary) {
        console.log(`[LEDE_EXTRACTION] Using summary field (${summary.length} chars)`);
        return extractLedeFromContent(summary);
      }
    }

    if (item['content:encoded']) {
      const encoded = normalizeHtmlField(item['content:encoded']);
      if (encoded) {
        console.log('[LEDE_EXTRACTION] Extracting lede from content:encoded');
        return extractLedeFromContent(encoded);
      }
    }

    if (item.content) {
      const content = normalizeHtmlField(item.content);
      if (content) {
        console.log(`[LEDE_EXTRACTION] Using content field (${content.length} chars)`);
        return extractLedeFromContent(content);
      }
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

    // 2. Check for media:content or media:thumbnail (handle arrays and objects)
    if (item['media:content']) {
      const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
      if (media && media.url && isValidImageUrl(media.url)) {
        return media.url;
      }
    }

    if (item['media:thumbnail']) {
      const media = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'][0] : item['media:thumbnail'];
      if (media && media.url && isValidImageUrl(media.url)) {
        return media.url;
      }
    }

    // 3. Extract from description or content using regex
    const contentFields = [item.description, item['content:encoded'], item.content, item.summary]
      .map(normalizeHtmlField)
      .filter((v) => Boolean(v));

    for (const content of contentFields) {
      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
      if (imgMatch && isValidImageUrl(imgMatch[1])) {
        return imgMatch[1];
      }
    }

    // 4. For CoinDesk specifically, check content:encoded for images
    if (sourceName.includes('CoinDesk') && item['content:encoded']) {
      const encoded = normalizeHtmlField(item['content:encoded']);
      const contentMatch = encoded.match(/<img[^>]+src="([^"]+)"/i);
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

  // (legacy open-link-in-app handler removed)
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
      sandbox: true,
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
