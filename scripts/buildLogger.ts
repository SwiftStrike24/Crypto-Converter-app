import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { cpus, totalmem, freemem, platform, release, arch } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

type BuildType = 'default' | 'portable' | 'msi' | 'exe' | 'all';

class BuildLogger {
  private startTime: number = 0;
  private spinner: Ora = ora();
  private buildStartTimes: Record<string, number> = {};
  private buildDurations: Record<string, number> = {};
  private buildFileSizes: Record<string, string> = {};
  private buildProgress: number = 0;
  private totalBuildSteps: number = 0;
  private appVersion: string = '1.0.0';
  
  private emojis = {
    start: '🚀',
    vite: '⚡',
    electron: '🔌',
    modules: '📦',
    assets: '📄',
    success: '✅',
    config: '⚙️',
    package: '📥',
    done: '🎉',
    time: '⏱️',
    cpu: '💻',
    memory: '🧠',
    os: '🖥️',
    gpu: '🎮',
    cleanup: '🧹',
    complete: '🎉',
    sparkles: '✨',
    error: '❌',
    info: 'ℹ️',
    build: '🛠️',
    portable: '📦',
    installer: '💿',
    msi: '💿',
    exe: '🚀',
    both: '🔥',
    summary: '📊',
    trophy: '🏆',
    rocket: '🚀',
    clock: '⏰',
    progress: '📈',
    version: '🔢',
    folder: '📁'
  };

  constructor() {
    this.startTime = Date.now();
    
    // Configure a more modern spinner
    this.spinner = ora({
      spinner: {
        interval: 80,
        frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      },
      color: 'cyan'
    });
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private async getSystemSpecs(): Promise<string> {
    const execAsync = promisify(exec);
    
    let gpuInfo = 'Unknown';
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('wmic path win32_VideoController get name');
        const lines = stdout.split('\n').filter(line => line.trim() && !line.toLowerCase().includes('name'));
        if (lines.length > 0) {
          gpuInfo = lines[0].trim();
        }
      }
    } catch (error) {
      gpuInfo = 'Detection failed';
    }
    
    const cpuModel = cpus()[0]?.model || 'Unknown CPU';
    const memoryTotal = this.formatBytes(totalmem());
    const memoryFree = this.formatBytes(freemem());
    const osInfo = `${platform()} ${release()} (${arch()})`;
    
    const formatLine = (label: string, value: string) => {
      return `       │  ${label} ${value.padEnd(60 - label.length, ' ')}│`;
    };
    
    return `       ╭─────────────────────────── System Information ──────────────────────────╮
       │                                                                         │
${formatLine(this.emojis.cpu + ' CPU:     ', cpuModel)}
${formatLine(this.emojis.gpu + ' GPU:     ', gpuInfo)}
${formatLine(this.emojis.memory + ' Memory:  ', `${memoryFree} free of ${memoryTotal}`)}
${formatLine(this.emojis.os + ' System:  ', osInfo)}
       │                                                                         │
       ╰─────────────────────────────────────────────────────────────────────────╯`;
  }

  private getElapsedTime(): string {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return `${elapsed.toFixed(2)}s`;
  }

  private formatElectronMessage(message: string): string {
    // Clean up electron-builder output
    message = message.replace(/•/g, '•');
    
    // Add color to important parts
    if (message.includes('version=')) {
      message = message.replace(/version=([^ ]+)/, `version=${chalk.green('$1')}`);
    }
    
    if (message.includes('platform=')) {
      message = message.replace(/platform=([^ ]+)/, `platform=${chalk.cyan('$1')}`);
    }
    
    if (message.includes('arch=')) {
      message = message.replace(/arch=([^ ]+)/, `arch=${chalk.yellow('$1')}`);
    }
    
    if (message.includes('file=')) {
      message = message.replace(/file=([^ ]+)/, `file=${chalk.green('$1')}`);
    }
    
    return message;
  }

  async start(buildType?: BuildType, version?: string) {
    console.clear();
    console.log('\n');
    
    if (version) {
      this.appVersion = version;
    }
    
    let buildTypeText = '';
    if (buildType === 'default') {
      buildTypeText = 'Default (MSI + Portable)';
      this.totalBuildSteps = 7;
    } else if (buildType === 'portable') {
      buildTypeText = 'Portable';
      this.totalBuildSteps = 6;
    } else if (buildType === 'msi') {
      buildTypeText = 'MSI Installer';
      this.totalBuildSteps = 6;
    } else if (buildType === 'exe') {
      buildTypeText = 'EXE Setup Wizard';
      this.totalBuildSteps = 6;
    } else if (buildType === 'all') {
      buildTypeText = 'Complete (All Packages)';
      this.totalBuildSteps = 8;
    }
    
    this.buildProgress = 0;
    this.startTime = Date.now();
    
    console.log(chalk.cyan.bold(`${this.emojis.start} Starting CryptoVertX v${this.appVersion} ${buildTypeText} Build Process ${this.emojis.start}`));
    console.log(chalk.dim('━'.repeat(65)));
    console.log(await this.getSystemSpecs());
    console.log(chalk.dim('━'.repeat(65)));
    console.log('');
  }

  startViteBuild() {
    this.spinner.start(chalk.blue(`${this.emojis.vite} Building Vite application...`));
  }

  moduleTransformed(count: number) {
    this.spinner.text = chalk.blue(`${this.emojis.modules} Transformed ${count} modules...`);
  }

  assetEmitted(name: string, size: string) {
    this.spinner.succeed();
    console.log(chalk.green(`${this.emojis.assets} Generated ${chalk.bold(name)} (${size})`));
    this.spinner.start();
  }

  viteBuildComplete(time: string) {
    this.spinner.succeed(chalk.green(`${this.emojis.success} Vite build completed in ${time}s`));
    console.log('');
    this.updateProgress();
  }

  startElectronBuild() {
    console.log(chalk.dim('━'.repeat(65)));
    this.spinner.start(chalk.blue(`${this.emojis.electron} Building Electron application...`));
  }

  electronConfigStep() {
    this.spinner.text = chalk.blue(`${this.emojis.config} Configuring Electron builder...`);
    console.log(chalk.dim('\n       Electron Builder Configuration:'));
    this.updateProgress();
  }

  electronPackagingStep() {
    console.log(''); // spacing
    this.spinner.text = chalk.blue(`${this.emojis.package} Packaging application for Windows...`);
  }

  startBuildType(type: 'portable' | 'msi' | 'exe') {
    const emoji = this.emojis[type] || this.emojis.build;
    const typeNameMap = {
      portable: 'Portable Executable',
      msi: 'MSI Installer',
      exe: 'EXE Setup Wizard'
    };
    const typeName = typeNameMap[type];
    
    this.buildStartTimes[type] = Date.now();
    
    console.log(chalk.dim('━'.repeat(50)));
    this.spinner.start(chalk.blue(`${emoji} Building ${typeName}...`));
  }

  buildTypeComplete(type: 'portable' | 'msi' | 'exe') {
    const emoji = this.emojis[type] || this.emojis.build;
    const typeNameMap = {
      portable: 'Portable Executable',
      msi: 'MSI Installer',
      exe: 'EXE Setup Wizard'
    };
    const typeName = typeNameMap[type];
    
    // Calculate and store duration
    if (this.buildStartTimes[type]) {
      this.buildDurations[type] = (Date.now() - this.buildStartTimes[type]) / 1000;
    }
    
    // Try to get the file size
    try {
      const outputDir = path.join(__dirname, `../release/${this.appVersion}`);
      const filePattern = {
        portable: `CryptoVertX-Portable-${this.appVersion}.exe`,
        msi: `CryptoVertX-MSI-Installer-v${this.appVersion}.msi`,
        exe: `CryptoVertX-Setup-v${this.appVersion}.exe`
      }[type];
      const filePath = path.join(outputDir, filePattern);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        this.buildFileSizes[type] = this.formatBytes(stats.size);
      } else {
        // Look for any matching file
        const files = fs.readdirSync(outputDir);
        const matchingFile = files.find(file => {
          switch (type) {
            case 'portable': return file.includes('Portable');
            case 'msi': return file.endsWith('.msi');
            case 'exe': return file.includes('Setup') && file.endsWith('.exe');
            default: return false;
          }
        });
        
        if (matchingFile) {
          const stats = fs.statSync(path.join(outputDir, matchingFile));
          this.buildFileSizes[type] = this.formatBytes(stats.size);
        } else {
          this.buildFileSizes[type] = 'Unknown';
        }
      }
    } catch (error) {
      this.buildFileSizes[type] = 'Unknown';
    }
    
    this.spinner.succeed(chalk.green(`${emoji} ${typeName} built successfully!`));
    this.updateProgress();
  }

  electronMessage(message: string) {
    // Stop spinner to show message cleanly
    this.spinner.stop();
    const formattedMessage = this.formatElectronMessage(message);
    console.log(formattedMessage);
    // Restart spinner on a new line
    this.spinner.start(chalk.blue(`${this.emojis.package} Packaging application for Windows...`));
  }

  displayBuildSummary() {
    if (Object.keys(this.buildDurations).length === 0) return;
    
    console.log(chalk.dim('━'.repeat(65)));
    console.log(chalk.cyan.bold(`${this.emojis.summary} Build Performance Summary ${this.emojis.summary}`));
    console.log('');
    
    // Create a table-like structure for the build times
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(2);
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };
    
    // Modern table header with gradient
    console.log(chalk.dim('┌─────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.dim('│') + chalk.cyan.bold(' Build Type'.padEnd(30)) + chalk.dim('│') + chalk.cyan.bold(' Duration'.padEnd(15)) + chalk.dim('│') + chalk.cyan.bold(' Size'.padEnd(18)) + chalk.dim('│'));
    console.log(chalk.dim('├─────────────────────────────────────────────────────────────────┤'));
    
    // Display each build type duration with improved styling
    Object.entries(this.buildDurations).forEach(([type, duration]) => {
      const buildType = type as 'portable' | 'msi' | 'exe';
      const emoji = this.emojis[buildType] || this.emojis.build;
      const typeNameMap = {
        portable: 'Portable Executable',
        msi: 'MSI Installer',
        exe: 'EXE Setup Wizard'
      };
      const typeName = typeNameMap[buildType];
      
      // Get file size from our stored values
      const fileSize = this.buildFileSizes[type] || 'Unknown';
      
      console.log(
        chalk.dim('│') + 
        chalk.yellow(` ${emoji} ${typeName}`.padEnd(29)) + 
        chalk.dim('│') + 
        chalk.green(` ${formatTime(duration)}`.padEnd(14)) + 
        chalk.dim('│') + 
        chalk.blue(` ${fileSize}`.padEnd(17)) + 
        chalk.dim('│')
      );
    });
    
    console.log(chalk.dim('└─────────────────────────────────────────────────────────────────┘'));
    
    // If both installer types were built, compare them
    const builtInstallers = Object.keys(this.buildDurations).filter(k => k === 'msi' || k === 'exe');

    if (builtInstallers.length === 2) {
      console.log('');
      const fasterType = this.buildDurations['msi'] < this.buildDurations['exe'] ? 'msi' : 'exe';
      const slowerType = fasterType === 'msi' ? 'exe' : 'msi';
      const timeDiff = Math.abs(this.buildDurations['msi'] - this.buildDurations['exe']);
      const percentFaster = ((Math.max(this.buildDurations['msi'], this.buildDurations['exe']) - 
                             Math.min(this.buildDurations['msi'], this.buildDurations['exe'])) / 
                             Math.max(this.buildDurations['msi'], this.buildDurations['exe']) * 100).toFixed(1);
      
      const typeNameMap = { msi: 'MSI Installer', exe: 'EXE Setup Wizard' };

      console.log(chalk.green(`${this.emojis.trophy} ${typeNameMap[fasterType]} was faster by ${formatTime(timeDiff)} (${percentFaster}%)! ${this.emojis.rocket}`));
      
      // Visual comparison with improved styling
      console.log('');
      console.log(chalk.cyan.bold('⚡ Build Time Comparison (Installers):'));
      
      // Calculate bar lengths for visual comparison
      const maxBarLength = 40;
      const maxDuration = Math.max(this.buildDurations['msi'], this.buildDurations['exe']);
      const msiBarLength = Math.floor((this.buildDurations['msi'] / maxDuration) * maxBarLength);
      const exeBarLength = Math.floor((this.buildDurations['exe'] / maxDuration) * maxBarLength);
      
      const msiBar = '█'.repeat(msiBarLength);
      const exeBar = '█'.repeat(exeBarLength);
      
      // Add visual indicators for faster/slower
      console.log(`${this.emojis.msi} ${'MSI Installer'.padEnd(20)} ${chalk.green(msiBar)} ${formatTime(this.buildDurations['msi'])} ${fasterType === 'msi' ? chalk.green('(faster)') : ''}`);
      console.log(`${this.emojis.exe} ${'EXE Setup Wizard'.padEnd(20)} ${chalk.yellow(exeBar)} ${formatTime(this.buildDurations['exe'])} ${fasterType === 'exe' ? chalk.green('(faster)') : ''}`);
      
      // Add size comparison
      if (this.buildFileSizes['msi'] && this.buildFileSizes['exe']) {
        console.log('');
        console.log(chalk.cyan.bold('💾 Size Comparison (Installers):'));
        console.log(`${this.emojis.msi} MSI: ${chalk.blue(this.buildFileSizes['msi'])}`);
        console.log(`${this.emojis.exe} EXE: ${chalk.blue(this.buildFileSizes['exe'])}`);
      }
    }
    
    console.log('');
  }

  buildComplete(buildType?: BuildType) {
    this.spinner.stop();
    
    const totalElapsedTime = this.getElapsedTime();
    
    // Ensure the progress is set to the final step to show completion in the pipeline
    this.buildProgress = this.totalBuildSteps;
    this.updateProgress();
    
    console.log(chalk.dim('━'.repeat(65)));
    console.log(chalk.green.bold(`${this.emojis.complete} Build Complete! ${this.emojis.complete}`));
    console.log(chalk.yellow(`${this.emojis.time} Total build time: ${totalElapsedTime}`));
    console.log(chalk.cyan(`${this.emojis.version} App Version: v${this.appVersion}`));
    console.log('');
    
    if (buildType === 'all' || buildType === 'default') {
      this.displayBuildSummary();
    }
    
    const releaseFolder = `release/${this.appVersion}`;
    if (buildType === 'all') {
      console.log(chalk.cyan(`${this.emojis.sparkles} All packages are ready in the ${releaseFolder} folder! ${this.emojis.sparkles}`));
    } else if (buildType === 'default') {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your default packages (MSI Setup + Portable) are ready in the ${releaseFolder} folder! ${this.emojis.sparkles}`));
    } else if (buildType === 'msi') {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your MSI installer is ready in the ${releaseFolder} folder! ${this.emojis.sparkles}`));
    } else if (buildType === 'exe') {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your EXE setup wizard is ready in the ${releaseFolder} folder! ${this.emojis.sparkles}`));
    } else {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your portable executable is ready in the ${releaseFolder} folder! ${this.emojis.sparkles}`));
    }
    
    console.log('');
  }

  error(message: string) {
    this.spinner.fail(chalk.red(`${this.emojis.error} Error: ${message}`));
    console.log('');
  }

  warn(message: string) {
    this.spinner.stop();
    console.warn(chalk.yellow(`${this.emojis.info} Warning: ${message}`));
    this.spinner.start();
  }

  cleanupStep() {
    this.spinner.start(chalk.blue(`${this.emojis.cleanup} Cleaning up before build...`));
    this.spinner.succeed();
    this.updateProgress();
  }
  
  log(message: string) {
    this.spinner.info(chalk.blue(`${this.emojis.info} ${message}`));
  }

  updateProgress() {
    this.buildProgress++;
    
    if (this.totalBuildSteps > 0) {
      const percentage = Math.min(100, Math.floor((this.buildProgress / this.totalBuildSteps) * 100));
      
      // Always show the build pipeline visualization
      console.log(chalk.dim('━'.repeat(65)));
      
      // Create a modern build pipeline visualization
      const stages = [
        { name: 'Cleanup', emoji: '🧹', step: 1 },
        { name: 'Vite Build', emoji: '⚡', step: 2 },
        { name: 'Config', emoji: '⚙️', step: 3 },
        { name: 'Packaging', emoji: '📦', step: 4 },
        { name: 'Icon Fix', emoji: '🎨', step: 5 },
        { name: 'App Config', emoji: '📝', step: 6 },
        { name: 'Complete', emoji: '🎉', step: 7 }
      ];
      
      // Display build pipeline
      console.log(chalk.cyan.bold(`🔄 Build Pipeline (${percentage}% Complete)`));
      console.log('');
      
      // Create a visual pipeline
      const pipeline = stages.map(stage => {
        const isCompleted = this.buildProgress >= stage.step;
        const isActive = this.buildProgress === stage.step;
        
        let stageSymbol;
        let stageName;
        
        if (isCompleted) {
          stageSymbol = chalk.green('✓');
          stageName = chalk.green(stage.name);
        } else if (isActive) {
          stageSymbol = chalk.yellow('⟳');
          stageName = chalk.yellow.bold(stage.name);
        } else {
          stageSymbol = chalk.gray('○');
          stageName = chalk.gray(stage.name);
        }
        
        return `  ${stageSymbol} ${stage.emoji} ${stageName}`;
      }).join('\n');
      
      console.log(pipeline);
      console.log('');
      
      // Add a visual time indicator
      const elapsedTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
      console.log(chalk.dim(`  ⏱️ Elapsed: ${elapsedTime}s`));
      
      console.log(chalk.dim('━'.repeat(65)));
      console.log('');
    }
  }
}

export const buildLogger = new BuildLogger(); 