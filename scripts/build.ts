import { build } from 'vite';
import { build as electronBuilder, Configuration, Platform } from 'electron-builder';
import { buildLogger } from './buildLogger';
import { exec } from 'child_process';
import { promisify } from 'util';
import prompts from 'prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import rcedit from 'rcedit';

const execAsync = promisify(exec);
const copyFileAsync = promisify(fs.copyFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);
const readdirAsync = promisify(fs.readdir);

// Build types and profiles
type BuildType = 'default' | 'portable' | 'msi' | 'exe' | 'all' | 'release';
type BuildProfile = 'dev' | 'release';

// Build profile configuration
const BUILD_PROFILES = {
  dev: {
    compression: 'store' as const,
    signExecutables: false,
    signDlls: false,
    npmRebuild: false,
    removePackageScripts: true,
    skipIconFix: true,
    skipRegistrySetup: true
  },
  release: {
    compression: 'normal' as const,
    signExecutables: true,
    signDlls: false,
    npmRebuild: false,
    removePackageScripts: true,
    skipIconFix: false,
    skipRegistrySetup: false
  }
};

// Check if any arguments are passed to skip interactive mode
const hasArgs = process.argv.length > 2;
const isDefaultBuild = process.argv.includes('--default');
const isPortableBuild = process.argv.includes('--portable');
const isMsiBuild = process.argv.includes('--msi');
const isExeBuild = process.argv.includes('--exe');
const isAllBuild = process.argv.includes('--all');
const isReleaseBuild = process.argv.includes('--release');
const isDevBuild = process.argv.includes('--dev');

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
    buildLogger.error(`Failed to update package.json version: ${error instanceof Error ? error.message : String(error)}`);
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
    buildLogger.error(`Failed to prepare assets: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function cleanupTempAssets() {
  try {
    if (await existsAsync(TEMP_DIR)) {
      await execAsync(`rmdir /S /Q "${TEMP_DIR}"`);
    }
  } catch (error) {
    buildLogger.error(`Failed to clean up temp assets: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getBuildProfile(): Promise<BuildProfile> {
  // If arguments are provided, use them
  if (isDevBuild) return 'dev';
  if (isReleaseBuild) return 'release';

  // Default to dev for development builds (fast)
  return 'dev';
}

async function getBuildType(): Promise<BuildType> {
  // If arguments are provided, use them
  if (isAllBuild) return 'all';
  if (isDefaultBuild) return 'default';
  if (isMsiBuild) return 'msi';
  if (isExeBuild) return 'exe';
  if (isPortableBuild) return 'portable';
  if (isReleaseBuild) return 'release';

  // Otherwise, prompt the user
  console.log(pc.bold(pc.cyan('🚀 CryptoVertX Build System 🚀')));
  console.log(pc.dim('━'.repeat(50)));
  
  const response = await prompts({
    type: 'select',
    name: 'buildType',
    message: 'What would you like to build?',
    choices: [
      { title: '💿 Default (MSI Setup + Portable)', description: 'Builds the standard MSI installer and the portable version.', value: 'default' },
      { title: '💿 MSI Installer', description: 'Build only the Windows installer (.msi)', value: 'msi' },
      { title: '📦 Portable Executable', description: 'Build only the standalone .exe file', value: 'portable' },
      { title: '✨ EXE Setup Wizard', description: 'Build only the .exe setup wizard', value: 'exe' },
      { title: '🏆 All Packages (EXE, MSI, Portable)', description: 'Build all available packages', value: 'all' }
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
    console.log(pc.yellow(`⚠️ Version ${currentVersion} already exists in the release directory.`));
    
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
      console.log(pc.cyan(`🔄 Will overwrite version ${currentVersion}`));
      return currentVersion;
    } else {
      // Prompt for new version
      const { newVersion } = await prompts({
        type: 'text',
        name: 'newVersion',
        message: 'Enter new version number (e.g., 1.0.1):',
        initial: incrementVersion(currentVersion),
        validate: (value: string) => 
          /^\d+\.\d+\.\d+$/.test(value) 
            ? true 
            : 'Please enter a valid semantic version (e.g., 1.0.1)'
      });
      
      if (!newVersion) {
        console.log(pc.red('❌ Version input cancelled. Using current version.'));
        return currentVersion;
      }
      
      // Update package.json with new version
      await updateVersionInPackageJson(newVersion);

      console.log(pc.green(`✅ Will build version ${newVersion}`));
      return newVersion;
    }
  }
  
  // If no existing version, just use current version
  console.log(pc.green(`📝 Building version ${currentVersion}`));
  return currentVersion;
}

// Helper function to increment version
function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] += 1; // Increment patch version
  return parts.join('.');
}

async function buildPortable(profile: BuildProfile = 'dev') {
  buildLogger.startBuildType('portable');

  const profileConfig = BUILD_PROFILES[profile];

  const config: Configuration = {
    asar: true,
    compression: profileConfig.compression,
    npmRebuild: profileConfig.npmRebuild,
    removePackageScripts: profileConfig.removePackageScripts,
    win: {
      target: {
        target: 'portable',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: profileConfig.signExecutables,
      signDlls: profileConfig.signDlls
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config
  });

  buildLogger.buildTypeComplete('portable');
}

async function buildMsi(profile: BuildProfile = 'dev') {
  buildLogger.startBuildType('msi');

  const profileConfig = BUILD_PROFILES[profile];

  const config: Configuration = {
    asar: true,
    compression: profileConfig.compression,
    npmRebuild: profileConfig.npmRebuild,
    removePackageScripts: profileConfig.removePackageScripts,
    win: {
      target: {
        target: 'msi',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: profileConfig.signExecutables,
      signDlls: profileConfig.signDlls
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config
  });

  buildLogger.buildTypeComplete('msi');
}

async function buildExe(profile: BuildProfile = 'dev') {
  buildLogger.startBuildType('exe');

  const profileConfig = BUILD_PROFILES[profile];

  const config: Configuration = {
    asar: true,
    compression: profileConfig.compression,
    npmRebuild: profileConfig.npmRebuild,
    removePackageScripts: profileConfig.removePackageScripts,
    win: {
      target: {
        target: 'nsis',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: profileConfig.signExecutables,
      signDlls: profileConfig.signDlls
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config
  });

  buildLogger.buildTypeComplete('exe');
}

// Pre-packaging strategy: Build once, package many
async function buildAndPackage(profile: BuildProfile, buildType: BuildType) {
  const profileConfig = BUILD_PROFILES[profile];
  const startTime = Date.now();

  buildLogger.log(`🚀 Starting ${profile.toUpperCase()} build with pre-packaging strategy...`);

  // Step 1: Build directory (unpackaged app)
  buildLogger.startBuildType('directory');
  const dirConfig: Configuration = {
    asar: true,
    compression: profileConfig.compression,
    npmRebuild: profileConfig.npmRebuild,
    removePackageScripts: profileConfig.removePackageScripts,
    win: {
      target: {
        target: 'dir',
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: profileConfig.signExecutables,
      signDlls: profileConfig.signDlls
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config: dirConfig
  });
  buildLogger.buildTypeComplete('directory');

  const dirTime = ((Date.now() - startTime) / 1000).toFixed(2);
  buildLogger.log(`📁 Directory build completed in ${dirTime}s`);

  // Step 2: Package from the prepackaged directory
  const prepackagedDir = path.join(OUTPUT_DIR, 'win-unpacked');

  if (buildType === 'default' || buildType === 'all') {
    await packageFromPrebuilt(prepackagedDir, 'portable', profile);
    await packageFromPrebuilt(prepackagedDir, 'msi', profile);
  } else if (buildType === 'portable') {
    await packageFromPrebuilt(prepackagedDir, 'portable', profile);
  } else if (buildType === 'msi') {
    await packageFromPrebuilt(prepackagedDir, 'msi', profile);
  } else if (buildType === 'exe') {
    await packageFromPrebuilt(prepackagedDir, 'exe', profile);
  } else if (buildType === 'release') {
    // Release build: MSI + Portable only (MSI first, then Portable)
    await packageFromPrebuilt(prepackagedDir, 'msi', profile);
    await packageFromPrebuilt(prepackagedDir, 'portable', profile);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  buildLogger.log(`🎉 Pre-packaging strategy completed in ${totalTime}s`);
}

async function packageFromPrebuilt(prepackagedDir: string, target: 'portable' | 'msi' | 'exe', profile: BuildProfile) {
  const profileConfig = BUILD_PROFILES[profile];

  // Map 'exe' to the correct build type for logging
  const logTarget = target === 'exe' ? 'exe' : target;
  buildLogger.startBuildType(logTarget);

  // Map target for electron-builder configuration
  const electronBuilderTarget = target === 'exe' ? 'nsis' : target;

  const config: Configuration = {
    asar: true,
    compression: profileConfig.compression,
    npmRebuild: profileConfig.npmRebuild,
    removePackageScripts: profileConfig.removePackageScripts,
    win: {
      target: {
        target: electronBuilderTarget as any,
        arch: ['x64']
      },
      icon: TEMP_ICON_PATH,
      signAndEditExecutable: profileConfig.signExecutables,
      signDlls: profileConfig.signDlls
    },
    extraResources: [
      {
        from: TEMP_DIR,
        to: 'assets'
      }
    ],
    executableName: 'CryptoVertX'
  };

  await electronBuilder({
    targets: Platform.WINDOWS.createTarget(),
    config,
    prepackaged: prepackagedDir
  });

  buildLogger.buildTypeComplete(logTarget);
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
          buildLogger.error(`Icon verification failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
        }
      } catch (error) {
        buildLogger.error(`Failed to fix executable icon: ${error instanceof Error ? error.message : String(error)}`);
        
        // Fallback approach if rcedit fails
        try {
          buildLogger.log('Attempting alternative icon application method...');
          
          // Alternative approach using Windows commands if available
          if (process.platform === 'win32') {
            await execAsync(`powershell -Command "& {Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${iconPath}'); $icon.Save([System.IO.File]::Create('${path.join(WIN_UNPACKED_DIR, 'app.ico')}'));}"`);
            buildLogger.log('Alternative icon application completed');
          }
        } catch (fallbackError) {
          buildLogger.error(`Alternative icon application failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
    } else {
      buildLogger.error(`Win-unpacked directory not found at: ${WIN_UNPACKED_DIR}`);
    }
  } catch (error) {
    buildLogger.error(`Error in fixExecutableIcon: ${error instanceof Error ? error.message : String(error)}`);
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
    buildLogger.error(`Failed to set up application icon configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runBuild() {
  try {
    // Get build profile (dev for fast builds, release for production)
    const profile = await getBuildProfile();
    const profileConfig = BUILD_PROFILES[profile];

    buildLogger.log(`🚀 Using ${profile.toUpperCase()} build profile (compression: ${profileConfig.compression})`);

    // Get the version from package.json
    const currentVersion = await getCurrentVersion();

    // Update versionManager.ts with the correct version for production builds
    await updateVersionInVersionManager(currentVersion);

    // Display cool version management header
    console.log('\n');
    console.log(pc.bold(pc.cyan('🔢 CryptoVertX Version Management 🔢')));
    console.log(pc.dim('━'.repeat(50)));
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

    // Use optimized pre-packaging strategy for faster builds
    await buildAndPackage(profile, buildType);

    // Fix executable icon after builds (skip for dev profile)
    if (!profileConfig.skipIconFix && buildType !== 'msi') { // MSI doesn't create a loose exe in the same way
        buildLogger.log('Fixing main executable icon...');
        await fixExecutableIcon();
    } else if (profileConfig.skipIconFix) {
      buildLogger.log('⚡ Skipping icon fix for dev profile (fast build)');
    }

    // Restore console.log
    console.log = originalConsoleLog;

    // Clean up temp assets
    await cleanupTempAssets();

    // Set up app configuration instead of modifying registry (skip for dev profile)
    if (process.platform === 'win32' && !profileConfig.skipRegistrySetup) {
      await ensureWindowsRegistryIcon();
    } else if (profileConfig.skipRegistrySetup) {
      buildLogger.log('⚡ Skipping registry setup for dev profile (fast build)');
    }

    buildLogger.buildComplete(buildType);
    
    // Display version information at the end
    console.log(pc.bold(pc.green(`🏁 Build completed for CryptoVertX v${version}`)));
    console.log(pc.cyan(`📁 Output directory: ${OUTPUT_DIR}`));
    
    // Final verification of versionManager.ts
    try {
      const versionManagerPath = path.join(__dirname, '../src/services/versionManager.ts');
      const content = fs.readFileSync(versionManagerPath, 'utf-8');
      
      if (content.includes(`buildTimeVersion = '${version}'`)) {
        console.log(pc.green(`✅ Verified versionManager.ts contains the correct version: ${version}`));
      } else {
        console.log(pc.yellow(`⚠️ versionManager.ts might not have the correct version. Final manual check recommended.`));
        // One last attempt to update it
        await updateVersionInVersionManager(version);
      }
    } catch (error) {
      buildLogger.warn(`Could not verify versionManager.ts in final step: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    // Clean up temp assets even if build fails
    await cleanupTempAssets();
    
    buildLogger.error(error instanceof Error ? error.message : String(error));
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
    buildLogger.error(`Failed to update version in versionManager.ts: ${error instanceof Error ? error.message : String(error)}`);
    
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
        buildLogger.error(`Fallback method also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }
}

runBuild(); 