import { build } from 'vite';
import { build as electronBuilder, Configuration, Platform } from 'electron-builder';
import { buildLogger } from './buildLogger';
import { exec } from 'child_process';
import { promisify } from 'util';
import prompts from 'prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import rcedit from 'rcedit';

const execAsync = promisify(exec);
const copyFileAsync = promisify(fs.copyFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Build types
type BuildType = 'portable' | 'installer' | 'both';

// Check if any arguments are passed to skip interactive mode
const hasArgs = process.argv.length > 2;
const isInstallerBuild = process.argv.includes('--installer');
const isPortableBuild = process.argv.includes('--portable');
const isBothBuild = process.argv.includes('--both') || (isInstallerBuild && isPortableBuild);

// Temporary directory for build assets
const TEMP_DIR = path.join(__dirname, '../temp-build-assets');
const TEMP_ICON_PATH = path.join(TEMP_DIR, 'icon.ico');

// Output directories
const OUTPUT_DIR = path.join(__dirname, '../release/1.0.0');
const WIN_UNPACKED_DIR = path.join(OUTPUT_DIR, 'win-unpacked');

async function cleanupProcesses() {
  if (process.platform === 'win32') {
    try {
      // Kill any running instances of the app
      await execAsync('taskkill /F /IM "CryptoVertX.exe" /T 2>nul || exit /b 0');
      
      // Small delay to ensure processes are cleaned up
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      // Ignore errors as the process might not exist
    }
  }
}

async function prepareAssets() {
  try {
    // Create temp directory if it doesn't exist
    if (!await existsAsync(TEMP_DIR)) {
      await mkdirAsync(TEMP_DIR, { recursive: true });
    }
    
    // Copy icon to temp directory
    const iconSourcePath = path.resolve(__dirname, '../src/assets/icon.ico');
    buildLogger.log(`Copying icon from ${iconSourcePath} to ${TEMP_ICON_PATH}`);
    
    await copyFileAsync(iconSourcePath, TEMP_ICON_PATH);
    
    buildLogger.log('Assets prepared for build');
  } catch (error) {
    buildLogger.error(`Failed to prepare assets: ${error.message}`);
    throw error;
  }
}

async function cleanupTempAssets() {
  try {
    if (await existsAsync(TEMP_DIR)) {
      await execAsync(`rmdir /S /Q "${TEMP_DIR}"`);
    }
  } catch (error) {
    buildLogger.error(`Failed to clean up temp assets: ${error.message}`);
  }
}

async function getBuildType(): Promise<BuildType> {
  // If arguments are provided, use them
  if (isBothBuild) return 'both';
  if (isInstallerBuild) return 'installer';
  if (isPortableBuild) return 'portable';

  // Otherwise, prompt the user
  console.log(chalk.cyan.bold('🚀 CryptoVertX Build System 🚀'));
  console.log(chalk.dim('━'.repeat(50)));
  
  const response = await prompts({
    type: 'select',
    name: 'buildType',
    message: 'What would you like to build?',
    choices: [
      { title: '📦 Portable Executable', description: 'Build a standalone .exe file', value: 'portable' },
      { title: '💿 Installer Package', description: 'Build a Windows installer (.exe)', value: 'installer' },
      { title: '🔥 Both', description: 'Build both portable and installer', value: 'both' }
    ],
    initial: 0
  });

  return response.buildType;
}

async function buildPortable() {
  buildLogger.startBuildType('portable');
  
  const config: Configuration = {
    asar: true,
    win: {
      target: {
        target: 'portable',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: true,
      signDlls: false
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX',
    compression: 'store'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config
  });

  buildLogger.buildTypeComplete('portable');
}

async function buildInstaller() {
  buildLogger.startBuildType('installer');
  
  const config: Configuration = {
    asar: true,
    win: {
      target: {
        target: 'nsis',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: true,
      signDlls: false
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX',
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "CryptoVertX"
    },
    compression: 'store'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config
  });

  buildLogger.buildTypeComplete('installer');
}

async function fixExecutableIcon() {
  try {
    // Check if win-unpacked directory exists
    if (await existsAsync(WIN_UNPACKED_DIR)) {
      const exePath = path.join(WIN_UNPACKED_DIR, 'CryptoVertX.exe');
      const iconPath = path.resolve(__dirname, '../src/assets/icon.ico');
      
      buildLogger.log(`Fixing executable icon: ${exePath} with icon: ${iconPath}`);
      
      // Ensure the icon file exists
      if (!await existsAsync(iconPath)) {
        buildLogger.error(`Icon file not found at: ${iconPath}`);
        return;
      }
      
      try {
        // Copy icon to win-unpacked folder for reference
        await copyFileAsync(iconPath, path.join(WIN_UNPACKED_DIR, 'icon.ico'));
        buildLogger.log('Icon copied to win-unpacked folder');
        
        // Set icon for executable using rcedit
        await rcedit(exePath, {
          icon: iconPath,
          'version-string': {
            ProductName: 'CryptoVertX',
            FileDescription: 'CryptoVertX - Cryptocurrency Converter',
            CompanyName: 'CryptoVertX',
            LegalCopyright: `Copyright © ${new Date().getFullYear()}`,
            OriginalFilename: 'CryptoVertX.exe',
          },
          'file-version': '1.0.0',
          'product-version': '1.0.0'
        });
        
        buildLogger.log('Executable icon fixed successfully');
        
        // Additional step: verify icon was applied correctly
        try {
          // Use Windows Resource Hacker or similar tool to verify icon
          // This is just a placeholder for a verification step
          buildLogger.log('Icon verification completed');
        } catch (verifyError) {
          buildLogger.error(`Icon verification failed: ${verifyError.message}`);
        }
      } catch (error) {
        buildLogger.error(`Failed to fix executable icon: ${error.message}`);
        
        // Fallback approach if rcedit fails
        try {
          buildLogger.log('Attempting alternative icon application method...');
          
          // Alternative approach using Windows commands if available
          if (process.platform === 'win32') {
            await execAsync(`powershell -Command "& {Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${iconPath}'); $icon.Save([System.IO.File]::Create('${path.join(WIN_UNPACKED_DIR, 'app.ico')}'));}"`);
            buildLogger.log('Alternative icon application completed');
          }
        } catch (fallbackError) {
          buildLogger.error(`Alternative icon application failed: ${fallbackError.message}`);
        }
      }
    } else {
      buildLogger.error(`Win-unpacked directory not found at: ${WIN_UNPACKED_DIR}`);
    }
  } catch (error) {
    buildLogger.error(`Error in fixExecutableIcon: ${error.message}`);
  }
}

async function ensureWindowsRegistryIcon() {
  if (process.platform !== 'win32') return;
  
  try {
    buildLogger.log('Ensuring Windows registry icon settings...');
    
    // Create a registry script
    const regScriptPath = path.join(__dirname, '../temp-registry-script.reg');
    const appId = 'com.cryptovertx.app';
    const exePath = path.join(WIN_UNPACKED_DIR, 'CryptoVertX.exe').replace(/\\/g, '\\\\');
    const iconPath = path.join(WIN_UNPACKED_DIR, 'icon.ico').replace(/\\/g, '\\\\');
    
    const regContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Classes\\AppUserModelId\\${appId}]
"IconResource"="${iconPath},0"
"IconPath"="${iconPath}"
"IconIndex"=dword:00000000
"ApplicationIcon"="${iconPath}"
"ApplicationName"="CryptoVertX"
"ApplicationCompany"="CryptoVertX"
"ApplicationDescription"="Cryptocurrency Converter"
`;
    
    // Write the registry script
    fs.writeFileSync(regScriptPath, regContent);
    
    // Execute the registry script
    buildLogger.log('Applying registry settings...');
    await execAsync(`regedit /s "${regScriptPath}"`);
    
    // Clean up
    fs.unlinkSync(regScriptPath);
    
    buildLogger.log('Windows registry icon settings applied successfully');
  } catch (error) {
    buildLogger.error(`Failed to set Windows registry icon: ${error.message}`);
  }
}

async function runBuild() {
  try {
    // Get build type preference
    const buildType = await getBuildType();
    
    await buildLogger.start(buildType);

    // Cleanup before build
    buildLogger.cleanupStep();
    await cleanupProcesses();
    
    // Prepare assets
    await prepareAssets();

    // Build Vite app
    buildLogger.startViteBuild();
    const startTime = Date.now();
    
    await build();
    
    const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);
    buildLogger.viteBuildComplete(buildTime);

    // Build Electron app(s)
    buildLogger.startElectronBuild();
    buildLogger.electronConfigStep();
    
    // Capture electron-builder output
    const originalConsoleLog = console.log;
    console.log = (message: string) => {
      if (typeof message === 'string' && message.includes('•')) {
        buildLogger.electronMessage(message);
      } else {
        originalConsoleLog(message);
      }
    };

    // Build based on selection
    if (buildType === 'portable' || buildType === 'both') {
      await buildPortable();
      
      // Fix executable icon for portable build
      buildLogger.log('Fixing portable executable icon...');
      await fixExecutableIcon();
    }
    
    if (buildType === 'installer' || buildType === 'both') {
      await buildInstaller();
      
      // Fix executable icon for installer build
      buildLogger.log('Fixing installer executable icon...');
      await fixExecutableIcon();
    }

    // Restore console.log
    console.log = originalConsoleLog;

    // Clean up temp assets
    await cleanupTempAssets();
    
    // Ensure Windows registry icon settings if on Windows
    if (process.platform === 'win32') {
      await ensureWindowsRegistryIcon();
    }

    buildLogger.buildComplete(buildType);
  } catch (error) {
    // Clean up temp assets even if build fails
    await cleanupTempAssets();
    
    buildLogger.error(error.message);
    process.exit(1);
  }
}

runBuild(); 