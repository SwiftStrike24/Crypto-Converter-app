import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { cpus, totalmem, freemem, platform, release, arch } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

class BuildLogger {
  private startTime: number = 0;
  private spinner: Ora = ora();
  
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
    both: '🔥'
  };

  constructor() {
    this.startTime = Date.now();
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

  async start(buildType?: 'portable' | 'installer' | 'both') {
    console.clear();
    console.log('\n');
    
    let buildTypeText = '';
    if (buildType === 'portable') {
      buildTypeText = 'Portable';
    } else if (buildType === 'installer') {
      buildTypeText = 'Installer';
    } else if (buildType === 'both') {
      buildTypeText = 'Complete (Portable + Installer)';
    }
    
    console.log(chalk.cyan.bold(`${this.emojis.start} Starting CryptoVertX ${buildTypeText} Build Process ${this.emojis.start}`));
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
  }

  startElectronBuild() {
    console.log(chalk.dim('━'.repeat(65)));
    this.spinner.start(chalk.blue(`${this.emojis.electron} Building Electron application...`));
  }

  electronConfigStep() {
    this.spinner.text = chalk.blue(`${this.emojis.config} Configuring Electron builder...`);
    console.log(chalk.dim('\n       Electron Builder Configuration:'));
  }

  electronPackagingStep() {
    console.log(''); // spacing
    this.spinner.text = chalk.blue(`${this.emojis.package} Packaging application for Windows...`);
  }

  startBuildType(type: 'portable' | 'installer') {
    const emoji = type === 'portable' ? this.emojis.portable : this.emojis.installer;
    const typeName = type === 'portable' ? 'Portable Executable' : 'Installer Package';
    
    console.log(chalk.dim('━'.repeat(50)));
    this.spinner.start(chalk.blue(`${emoji} Building ${typeName}...`));
  }

  buildTypeComplete(type: 'portable' | 'installer') {
    const emoji = type === 'portable' ? this.emojis.portable : this.emojis.installer;
    const typeName = type === 'portable' ? 'Portable Executable' : 'Installer Package';
    
    this.spinner.succeed(chalk.green(`${emoji} ${typeName} built successfully!`));
  }

  electronMessage(message: string) {
    // Stop spinner to show message cleanly
    this.spinner.stop();
    const formattedMessage = this.formatElectronMessage(message);
    console.log(formattedMessage);
    // Restart spinner on a new line
    this.spinner.start(chalk.blue(`${this.emojis.package} Packaging application for Windows...`));
  }

  buildComplete(buildType?: 'portable' | 'installer' | 'both') {
    this.spinner.stop();
    
    const isInstallerBuild = buildType === 'installer';
    const isPortableBuild = buildType === 'portable';
    const isBothBuild = buildType === 'both';
    
    const elapsedTime = this.getElapsedTime();
    
    console.log(chalk.dim('━'.repeat(65)));
    console.log(chalk.green.bold(`${this.emojis.complete} Build Complete! ${this.emojis.complete}`));
    console.log(chalk.yellow(`${this.emojis.time} Total build time: ${elapsedTime}`));
    console.log('');
    
    if (isBothBuild) {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your portable executable and installer are ready in the release folder! ${this.emojis.sparkles}`));
    } else if (isInstallerBuild) {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your installer is ready in the release folder! ${this.emojis.sparkles}`));
    } else {
      console.log(chalk.cyan(`${this.emojis.sparkles} Your portable executable is ready in the release folder! ${this.emojis.sparkles}`));
    }
    
    console.log('');
  }

  error(message: string) {
    this.spinner.fail(chalk.red(`${this.emojis.error} Error: ${message}`));
    console.log('');
  }

  cleanupStep() {
    this.spinner.start(chalk.blue(`${this.emojis.cleanup} Cleaning up before build...`));
    this.spinner.succeed();
  }
  
  log(message: string) {
    this.spinner.info(chalk.blue(`${this.emojis.info} ${message}`));
  }
}

export const buildLogger = new BuildLogger(); 