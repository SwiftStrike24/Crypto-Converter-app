import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { basename, join } from 'path';
import { createWriteStream, existsSync, unlink, writeFileSync } from 'fs';
import { stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import axios from 'axios';

// Update API configuration
const UPDATE_API_BASE_URL =
  process.env.NODE_ENV === 'development' && process.env.API_BASE_URL
    ? process.env.API_BASE_URL
    : 'https://cryptovertx.com/api';

// Validation patterns for secure updates
const DOWNLOAD_KEY_PATTERNS = [
  /^latest\/CryptoVertX-MSI-Installer-v\d+\.\d+\.\d+\.msi$/,
  /^latest\/CryptoVertX-Setup-v\d+\.\d+\.\d+\.exe$/,
];
const INSTALLER_FILENAME_PATTERNS = [
  /^CryptoVertX-MSI-Installer-v\d+\.\d+\.\d+\.msi$/,
  /^CryptoVertX-Setup-v\d+\.\d+\.\d+\.exe$/,
];

function validateDownloadKey(downloadKey: string): { valid: boolean; error?: string } {
  if (!downloadKey || typeof downloadKey !== 'string') {
    return { valid: false, error: 'Download key is required' };
  }

  if (!downloadKey.startsWith('latest/')) {
    return { valid: false, error: 'Invalid download key prefix' };
  }

  if (downloadKey.includes('..') || downloadKey.includes('\\')) {
    return { valid: false, error: 'Invalid characters in download key' };
  }

  for (let i = 0; i < downloadKey.length; i++) {
    const code = downloadKey.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { valid: false, error: 'Control characters not allowed in download key' };
    }
  }

  if (!DOWNLOAD_KEY_PATTERNS.some((pattern) => pattern.test(downloadKey))) {
    return { valid: false, error: 'Download key does not match expected format' };
  }

  return { valid: true };
}

function validateInstallerPath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  const tempDir = app.getPath('temp');
  if (!filePath.startsWith(tempDir)) {
    return { valid: false, error: 'Installer must be in temp directory' };
  }

  if (filePath.includes('..')) {
    return { valid: false, error: 'Invalid path' };
  }

  const filename = basename(filePath);
  if (!INSTALLER_FILENAME_PATTERNS.some((pattern) => pattern.test(filename)) && !filename.startsWith('CryptoVertX-Update-')) {
    return { valid: false, error: 'Invalid installer filename' };
  }

  if (!filePath.endsWith('.msi') && !filePath.endsWith('.exe')) {
    return { valid: false, error: 'Invalid installer file type' };
  }

  return { valid: true };
}

function extractVersionFromFilename(filename: string): string {
  const vMatch = filename.match(/v(\d+\.\d+\.\d+)/i);
  if (vMatch) return vMatch[1];
  const setupMatch = filename.match(/(?:Setup|Mac)-(\d+\.\d+\.\d+)/i);
  if (setupMatch) return setupMatch[1];
  const genericMatch = filename.match(/(\d+\.\d+\.\d+)/);
  if (genericMatch) return genericMatch[1];
  return '';
}

function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  try {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const a = v1Parts[i] || 0;
      const b = v2Parts[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  } catch {
    return 0;
  }
}

type UpdateFile = {
  key: string;
  filename: string;
  sizeBytes: number;
  version: string;
};

function normalizeLatestFilesResponse(data: any): UpdateFile[] {
  const rawEntries: any[] =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.files)
        ? data.files
        : data && typeof data === 'object'
          ? [data]
          : [];

  return rawEntries
    .map((f) => {
      const key = typeof f?.key === 'string' ? f.key : typeof f?.Key === 'string' ? f.Key : '';
      const filename = typeof f?.filename === 'string' ? f.filename : key.split('/').pop() || '';
      const sizeBytes =
        typeof f?.sizeBytes === 'number'
          ? f.sizeBytes
          : typeof f?.size === 'number'
            ? f.size
            : typeof f?.Size === 'number'
              ? f.Size
              : 0;
      const version = typeof f?.version === 'string' && f.version ? f.version : extractVersionFromFilename(filename || key);

      return { key, filename, sizeBytes, version };
    })
    .filter((f) => !!f.key && validateDownloadKey(f.key).valid);
}

export function initUpdateHandlers(mainWindow: BrowserWindow) {
  // ==========================================================================
  // SECURE NAMESPACED UPDATE HANDLERS (preload API)
  // ==========================================================================

  ipcMain.handle('cryptovertx:updates:check', async () => {
    const currentVersion = app.getVersion() || '';
    try {
      const response = await axios.get(`${UPDATE_API_BASE_URL}/files`, {
        timeout: 15000,
        params: { prefix: 'latest/' },
        headers: { Accept: 'application/json' },
      });

      const files = normalizeLatestFilesResponse((response as any).data);
      if (files.length === 0) {
        return { hasUpdate: false, currentVersion, latestVersion: currentVersion };
      }

      // Pick highest version among allowed installers
      let best = files[0];
      let bestVersion = best.version || extractVersionFromFilename(best.filename || best.key);
      for (const file of files.slice(1)) {
        const v = file.version || extractVersionFromFilename(file.filename || file.key);
        if (compareVersions(v, bestVersion) > 0) {
          best = file;
          bestVersion = v;
        }
      }

      const latestVersion = bestVersion || currentVersion;
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        downloadKey: hasUpdate ? best.key : undefined,
        fileName: hasUpdate ? best.filename : undefined,
        fileSize: hasUpdate ? best.sizeBytes : undefined,
      };
    } catch (error) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: '',
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      };
    }
  });

  ipcMain.handle('cryptovertx:updates:download', async (_event, payload: { downloadKey: string }) => {
    const downloadKey = payload?.downloadKey;

    const validation = validateDownloadKey(downloadKey);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid download key');
    }

    const downloadUrl = `${UPDATE_API_BASE_URL}/download?key=${encodeURIComponent(downloadKey)}`;
    const extension = downloadKey.endsWith('.msi') ? '.msi' : '.exe';
    const downloadPath = join(app.getPath('temp'), `CryptoVertX-Update-${Date.now()}${extension}`);

    const CONNECT_TIMEOUT_MS = 30_000;
    const OVERALL_REQUEST_TIMEOUT_MS = 10 * 60_000;
    const MAX_RETRIES = 3;
    const RETRY_BACKOFF_MS = 2_000;
    let expectedTotalBytes: number | null = null;

    // Best-effort HEAD to get size
    try {
      const head = await axios({ url: downloadUrl, method: 'HEAD', timeout: CONNECT_TIMEOUT_MS });
      const cl = (head.headers as any)?.['content-length'];
      if (cl) expectedTotalBytes = parseInt(cl, 10);
    } catch {
      // ignore
    }

    let attempt = 0;
    let downloadedBytes = 0;

    while (attempt < MAX_RETRIES) {
      try {
        attempt++;

        const resumeOffset = existsSync(downloadPath) ? (await stat(downloadPath)).size : 0;
        const startAt = Math.max(resumeOffset, downloadedBytes);
        const headers: Record<string, string> = {};
        if (startAt > 0) headers['Range'] = `bytes=${startAt}-`;

        const response = await axios({
          url: downloadUrl,
          method: 'GET',
          responseType: 'stream',
          headers,
          timeout: OVERALL_REQUEST_TIMEOUT_MS,
        });

        const contentLengthHeader = (response.headers as any)?.['content-length'];
        const contentRange = (response.headers as any)?.['content-range'];
        if (contentRange) {
          const match = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(contentRange);
          if (match) expectedTotalBytes = parseInt(match[3], 10);
        } else if (contentLengthHeader && !expectedTotalBytes) {
          expectedTotalBytes = parseInt(contentLengthHeader, 10);
        }

        const writer = createWriteStream(downloadPath, { flags: startAt > 0 ? 'a' : 'w' });
        downloadedBytes = startAt;
        let lastProgressEmit = Date.now();
        let bytesSinceLast = 0;
        let speed = 0;

        const sendProgress = () => {
          const total = expectedTotalBytes || 0;
          const pct = expectedTotalBytes ? Math.min(99, Math.floor((downloadedBytes / expectedTotalBytes) * 100)) : 0;
          const eta = speed > 0 && total > downloadedBytes ? Math.round((total - downloadedBytes) / speed) : 0;
          mainWindow.webContents.send('cryptovertx:updates:downloadProgress', {
            progress: pct,
            downloadedBytes,
            totalBytes: total,
            speed,
            eta,
          });
        };

        (response.data as any).on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          bytesSinceLast += chunk.length;
          const now = Date.now();
          const dt = (now - lastProgressEmit) / 1000;
          if (dt >= 0.5) {
            speed = bytesSinceLast / dt;
            bytesSinceLast = 0;
            lastProgressEmit = now;
            sendProgress();
          }
        });

        await pipeline(response.data as any, writer);
        sendProgress();

        if (!expectedTotalBytes || downloadedBytes >= expectedTotalBytes) {
          break;
        }
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }

    const fileStats = await stat(downloadPath);
    if (expectedTotalBytes && fileStats.size !== expectedTotalBytes) {
      unlink(downloadPath, () => {});
      throw new Error('Downloaded file size mismatch');
    }
    if (fileStats.size < 1024) {
      unlink(downloadPath, () => {});
      throw new Error('Downloaded file is too small to be valid');
    }

    mainWindow.webContents.send('cryptovertx:updates:downloadProgress', {
      progress: 100,
      downloadedBytes,
      totalBytes: expectedTotalBytes || downloadedBytes,
      speed: 0,
      eta: 0,
    });

    return { filePath: downloadPath };
  });

  ipcMain.handle('cryptovertx:updates:install', async (_event, payload: { filePath: string }) => {
    const filePath = payload?.filePath;
    const validation = validateInstallerPath(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const fileStats = await stat(filePath);
      if (fileStats.size < 1024) {
        return { success: false, error: 'Installer file is too small or corrupted' };
      }

      const flagPath = join(app.getPath('userData'), 'update.flag');
      try {
        writeFileSync(flagPath, 'true');
      } catch {
        // ignore
      }

      const errorMessage = await shell.openPath(filePath);
      if (errorMessage) {
        unlink(flagPath, () => {});
        if (errorMessage === 'Failed to open path') {
          return { success: false, error: 'Installation was cancelled' };
        }
        return { success: false, error: `Failed to launch installer: ${errorMessage}` };
      }

      setTimeout(() => app.quit(), 500);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Installation failed' };
    }
  });
}
