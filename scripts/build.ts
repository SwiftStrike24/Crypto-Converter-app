import { build } from 'vite';
import { build as electronBuilder, Configuration, Platform } from 'electron-builder';
import { buildLogger } from './buildLogger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function cleanupProcesses() {
  if (process.platform === 'win32') {
    try {
      // Kill any running instances of the app
      await execAsync('taskkill /F /IM "Crypto Converter.exe" /T 2>nul || exit /b 0');
      // Small delay to ensure processes are cleaned up
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      // Ignore errors as the process might not exist
    }
  }
}

async function runBuild() {
  try {
    await buildLogger.start();

    // Cleanup before build
    buildLogger.cleanupStep();
    await cleanupProcesses();

    // Build Vite app
    buildLogger.startViteBuild();
    const startTime = Date.now();
    
    await build();
    
    const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);
    buildLogger.viteBuildComplete(buildTime);

    // Build Electron app
    buildLogger.startElectronBuild();
    
    buildLogger.electronConfigStep();
    
    const config: Configuration = {
      asar: true,
      win: {
        target: {
          target: 'portable',
          arch: ['x64']
        },
        signAndEditExecutable: false,
        signDlls: false
      },
      compression: 'store'
    };

    buildLogger.electronPackagingStep();
    
    // Capture electron-builder output
    const originalConsoleLog = console.log;
    console.log = (message: string) => {
      if (typeof message === 'string' && message.includes('•')) {
        buildLogger.electronMessage(message);
      } else {
        originalConsoleLog(message);
      }
    };

    await electronBuilder({
      targets: Platform.WINDOWS.createTarget(),
      config
    });

    // Restore console.log
    console.log = originalConsoleLog;

    buildLogger.buildComplete();
  } catch (error) {
    buildLogger.error(error.message);
    process.exit(1);
  }
}

runBuild(); 