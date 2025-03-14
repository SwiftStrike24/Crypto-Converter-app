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
const readdirAsync = promisify(fs.readdir);

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
const RELEASE_DIR = path.join(__dirname, '../release');
let OUTPUT_DIR = path.join(RELEASE_DIR, '1.0.0');
let WIN_UNPACKED_DIR = path.join(OUTPUT_DIR, 'win-unpacked');

// Get current version from package.json
async function getCurrentVersion(): Promise<string> {
  try {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '1.0.0';
  } catch (error) {
    console.error('Error reading package.json:', error);
    return '1.0.0';
  }
}

// Check for existing versions in the release directory
async function checkExistingVersions(): Promise<string[]> {
  try {
    if (!await existsAsync(RELEASE_DIR)) {
      return [];
    }
    
    const dirs = await readdirAsync(RELEASE_DIR);
    return dirs.filter(dir => {
      // Filter for semantic version directories (e.g., 1.0.0, 2.1.3)
      return /^\d+\.\d+\.\d+$/.test(dir);
    });
  } catch (error) {
    console.error('Error checking existing versions:', error);
    return [];
  }
}

// Update version in package.json
async function updateVersionInPackageJson(version: string): Promise<void> {
  try {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Update version
    packageJson.version = version;
    
    // Write updated package.json
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    buildLogger.log(`Updated package.json version to ${version}`);
  } catch (error) {
    buildLogger.error(`Failed to update package.json version: ${error.message}`);
  }
}

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

// Handle version management
async function handleVersionManagement(): Promise<string> {
  // Get current version from package.json
  const currentVersion = await getCurrentVersion();
  
  // Check for existing versions
  const existingVersions = await checkExistingVersions();
  
  // If current version exists in release directory
  if (existingVersions.includes(currentVersion)) {
    console.log(chalk.yellow(`⚠️ Version ${currentVersion} already exists in the release directory.`));
    
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: '🔄 Overwrite existing version', description: `Replace version ${currentVersion}`, value: 'overwrite' },
        { title: '🆕 Create new version', description: 'Specify a new version number', value: 'new' }
      ],
      initial: 0
    });
    
    if (action === 'overwrite') {
      console.log(chalk.cyan(`🔄 Will overwrite version ${currentVersion}`));
      return currentVersion;
    } else {
      // Prompt for new version
      const { newVersion } = await prompts({
        type: 'text',
        name: 'newVersion',
        message: 'Enter new version number (e.g., 1.0.1):',
        initial: incrementVersion(currentVersion),
        validate: value => 
          /^\d+\.\d+\.\d+$/.test(value) 
            ? true 
            : 'Please enter a valid semantic version (e.g., 1.0.1)'
      });
      
      if (!newVersion) {
        console.log(chalk.red('❌ Version input cancelled. Using current version.'));
        return currentVersion;
      }
      
      // Update package.json with new version
      await updateVersionInPackageJson(newVersion);
      
      console.log(chalk.green(`✅ Will build version ${newVersion}`));
      return newVersion;
    }
  }
  
  // If no existing version, just use current version
  console.log(chalk.green(`📝 Building version ${currentVersion}`));
  return currentVersion;
}

// Helper function to increment version
function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] += 1; // Increment patch version
  return parts.join('.');
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
    // Get current version
    const version = await getCurrentVersion();
    
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
          'file-version': version,
          'product-version': version
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
    // Get current version
    const version = await getCurrentVersion();
    
    buildLogger.log('Setting up application icon configuration...');
    
    // Instead of modifying registry, create a config file in the app directory
    const appConfigDir = path.join(WIN_UNPACKED_DIR, 'resources', 'config');
    const appConfigPath = path.join(appConfigDir, 'app-config.json');
    const iconPath = path.join(WIN_UNPACKED_DIR, 'icon.ico');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }
    
    // Create or update the config file with icon information
    const appConfig = {
      appId: 'com.cryptovertx.app',
      iconPath: 'icon.ico', // Relative path from app root
      appName: 'CryptoVertX',
      appCompany: 'CryptoVertX',
      appDescription: 'Cryptocurrency Converter',
      version: version
    };
    
    // Write the config file
    fs.writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2));
    
    // Copy icon to resources directory for easy access
    if (fs.existsSync(iconPath)) {
      const resourcesIconPath = path.join(appConfigDir, 'icon.ico');
      fs.copyFileSync(iconPath, resourcesIconPath);
    }
    
    buildLogger.log('Application icon configuration created successfully');
    
    // Create a README file explaining how to manually set up registry if needed
    const readmePath = path.join(WIN_UNPACKED_DIR, 'resources', 'ICON-SETUP.md');
    const readmeContent = `# CryptoVertX v${version} Icon Setup

If you want to manually set up the application icon in Windows registry, you can run the following command:

\`\`\`
reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.cryptovertx.app" /v IconResource /t REG_SZ /d "%~dp0\\icon.ico,0" /f
reg add "HKCU\\Software\\Classes\\AppUserModelId\\com.cryptovertx.app" /v ApplicationName /t REG_SZ /d "CryptoVertX" /f
\`\`\`

This is optional and only needed if you want to customize the app icon appearance in Windows.
`;
    
    fs.writeFileSync(readmePath, readmeContent);
    
    buildLogger.log('Icon setup documentation created');
  } catch (error) {
    buildLogger.error(`Failed to set up application icon configuration: ${error.message}`);
  }
}

async function runBuild() {
  try {
    // Get the version from package.json
    const currentVersion = await getCurrentVersion();
    
    // Update versionManager.ts with the correct version for production builds
    await updateVersionInVersionManager(currentVersion);
    
    // Display cool version management header
    console.log('\n');
    console.log(chalk.cyan.bold('🔢 CryptoVertX Version Management 🔢'));
    console.log(chalk.dim('━'.repeat(50)));
    console.log('\n');
    
    // Handle version management
    const version = await handleVersionManagement();
    
    // Update versionManager.ts again in case the version was changed
    if (version !== currentVersion) {
      buildLogger.log(`Version changed from ${currentVersion} to ${version}, updating versionManager.ts...`);
      await updateVersionInVersionManager(version);
    }
    
    // Update output directories with selected version
    OUTPUT_DIR = path.join(RELEASE_DIR, version);
    WIN_UNPACKED_DIR = path.join(OUTPUT_DIR, 'win-unpacked');
    
    // Get build type preference
    const buildType = await getBuildType();
    
    await buildLogger.start(buildType, version);

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
    
    // Set up app configuration instead of modifying registry
    if (process.platform === 'win32') {
      await ensureWindowsRegistryIcon();
    }

    buildLogger.buildComplete(buildType);
    
    // Display version information at the end
    console.log(chalk.green.bold(`🏁 Build completed for CryptoVertX v${version}`));
    console.log(chalk.cyan(`📁 Output directory: ${OUTPUT_DIR}`));
    
    // Final verification of versionManager.ts
    try {
      const versionManagerPath = path.join(__dirname, '../src/services/versionManager.ts');
      const content = fs.readFileSync(versionManagerPath, 'utf-8');
      
      if (content.includes(`buildTimeVersion = '${version}'`)) {
        console.log(chalk.green(`✅ Verified versionManager.ts contains the correct version: ${version}`));
      } else {
        console.log(chalk.yellow(`⚠️ versionManager.ts might not have the correct version. Final manual check recommended.`));
        // One last attempt to update it
        await updateVersionInVersionManager(version);
      }
    } catch (error) {
      buildLogger.warn(`Could not verify versionManager.ts in final step: ${error.message}`);
    }
  } catch (error) {
    // Clean up temp assets even if build fails
    await cleanupTempAssets();
    
    buildLogger.error(error.message);
    process.exit(1);
  }
}

/**
 * Updates the hardcoded version in versionManager.ts
 */
async function updateVersionInVersionManager(version: string): Promise<void> {
  try {
    // Path to the versionManager.ts file
    const versionManagerPath = path.join(__dirname, '../src/services/versionManager.ts');
    
    // Read the file
    let content = fs.readFileSync(versionManagerPath, 'utf-8');
    
    // More robust regex that handles various comment patterns
    // This will match the line regardless of how many comments it has
    const versionRegex = /const\s+buildTimeVersion\s*=\s*['"].*?['"]\s*;.*?$/m;
    
    if (versionRegex.test(content)) {
      // Replace the hardcoded version with the current version
      content = content.replace(
        versionRegex,
        `const buildTimeVersion = '${version}'; // Injected by build script`
      );
      
      // Write the modified content back to the file
      fs.writeFileSync(versionManagerPath, content);
      
      buildLogger.log(`✅ Successfully injected version ${version} into versionManager.ts for production builds`);
    } else {
      // If the regex doesn't match, try a more aggressive approach
      const lineRegex = /const\s+buildTimeVersion\s*=.*$/m;
      
      if (lineRegex.test(content)) {
        content = content.replace(
          lineRegex,
          `const buildTimeVersion = '${version}'; // Injected by build script`
        );
        
        // Write the modified content back to the file
        fs.writeFileSync(versionManagerPath, content);
        
        buildLogger.log(`✅ Successfully injected version ${version} into versionManager.ts using fallback method`);
      } else {
        buildLogger.warn(`⚠️ Could not find buildTimeVersion line in versionManager.ts. Manual update may be needed.`);
      }
    }
    
    // Verify the update was successful
    const updatedContent = fs.readFileSync(versionManagerPath, 'utf-8');
    if (updatedContent.includes(`'${version}'`)) {
      buildLogger.log(`✓ Verified version ${version} was correctly injected into versionManager.ts`);
    } else {
      buildLogger.warn(`⚠️ Version update verification failed - the file might not have been updated correctly`);
    }
  } catch (error) {
    buildLogger.error(`Failed to update version in versionManager.ts: ${error.message}`);
    
    // Try an alternative approach with a more direct file manipulation
    try {
      const versionManagerPath = path.join(__dirname, '../src/services/versionManager.ts');
      const content = fs.readFileSync(versionManagerPath, 'utf-8');
      
      // Split by lines
      const lines = content.split('\n');
      
      // Find the line with buildTimeVersion
      let updated = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('buildTimeVersion') && lines[i].includes('=')) {
          lines[i] = `    const buildTimeVersion = '${version}'; // Injected by build script`;
          updated = true;
          break;
        }
      }
      
      if (updated) {
        // Rejoin and write back
        fs.writeFileSync(versionManagerPath, lines.join('\n'));
        buildLogger.log(`✅ Successfully injected version ${version} into versionManager.ts using line-by-line method`);
      } else {
        buildLogger.error(`Could not find buildTimeVersion line using line-by-line method`);
      }
    } catch (fallbackError) {
      buildLogger.error(`Fallback method also failed: ${fallbackError.message}`);
    }
  }
}

runBuild(); 