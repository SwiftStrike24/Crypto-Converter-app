import chalk from 'chalk';
import ora, { Ora } from 'ora';
import os from 'os';
import si from 'systeminformation';

class BuildLogger {
  private startTime: number = 0;
  private spinner: Ora = ora();

  private emojis = {
    start: '🚀',
    vite: '⚡',
    modules: '📦',
    electron: '🔌',
    assets: '🎨',
    config: '⚙️',
    package: '📥',
    success: '✨',
    time: '⏱️',
    build: '🛠️',
    done: '🎉',
    error: '❌',
    info: 'ℹ️',
    cpu: '💻',
    memory: '🧠',
    os: '🖥️',
    gpu: '🎮',
    cleanup: '🧹'
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
    const cpuModel = os.cpus()[0].model.replace(/\(R\)|\(TM\)|CPU|@ /g, '').trim();
    const totalMemory = this.formatBytes(os.totalmem());
    const freeMemory = this.formatBytes(os.freemem());
    const platform = os.platform();
    const release = os.release();
    const arch = os.arch();

    // Get GPU information with better error handling
    let gpuModel = 'N/A';
    let vram = 'N/A';
    try {
      const gpuInfo = await si.graphics();
      const mainGPU = gpuInfo.controllers.find(gpu => 
        gpu.vendor && 
        (gpu.vendor.toLowerCase().includes('nvidia') || 
         gpu.vendor.toLowerCase().includes('amd') ||
         gpu.vendor.toLowerCase().includes('intel'))
      );
      
      if (mainGPU) {
        gpuModel = mainGPU.model
          .replace(/\(R\)|\(TM\)|GPU/g, '')
          .replace(/NVIDIA|AMD|Intel/i, '')
          .trim();
        vram = mainGPU.vram ? `${mainGPU.vram} MB` : 'N/A';
      }
    } catch (error) {
      console.error('Failed to get GPU info:', error);
    }

    // Calculate padding for the box (increased width)
    const boxWidth = 75;
    const contentWidth = boxWidth - 8; // Account for borders and spacing
    const headerText = 'System Information';
    const headerPadding = Math.floor((boxWidth - headerText.length - 2) / 2);

    // Format each line with proper padding
    const formatLine = (label: string, value: string) => {
      const paddedValue = value.padEnd(contentWidth - label.length - 1);
      return `${chalk.blue('│')}  ${chalk.cyan(label)} ${chalk.white(paddedValue)} ${chalk.blue('│')}`;
    };

    return `
       ${chalk.blue('╭' + '─'.repeat(headerPadding) + ' ')}${chalk.cyan.bold(headerText)}${chalk.blue(' ' + '─'.repeat(boxWidth - headerPadding - headerText.length - 4) + '╮')}
       ${chalk.blue('│')}${' '.repeat(boxWidth - 2)}${chalk.blue('│')}
       ${formatLine(`${this.emojis.cpu} CPU:     `, cpuModel)}
       ${formatLine(`${this.emojis.gpu} GPU:     `, `${gpuModel}${vram !== 'N/A' ? ` (${vram})` : ''}`)}
       ${formatLine(`${this.emojis.memory} Memory:  `, `${freeMemory} free of ${totalMemory}`)}
       ${formatLine(`${this.emojis.os} System:  `, `${platform} ${release} (${arch})`)}
       ${chalk.blue('│')}${' '.repeat(boxWidth - 2)}${chalk.blue('│')}
       ${chalk.blue('╰' + '─'.repeat(boxWidth - 2) + '╯')}
    `;
  }

  private getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime;
    return (elapsed / 1000).toFixed(2);
  }

  private formatElectronMessage(message: string): string {
    if (message.includes('•')) {
      // Get text after the bullet
      const bulletIndex = message.indexOf('•');
      let content = message.substring(bulletIndex + 1).trim();

      // Clean up labels
      content = content.replace(/electron-builder\s+/i, '');
      content = content.replace(/loaded configuration/i, 'config');
      content = content.replace(/writing effective config/i, 'writing');

      // Special handling for packaging/building messages
      if (content.startsWith('packaging') || content.startsWith('building')) {
        const parts: { [key: string]: string } = {};
        const matches = content.match(/(\w+)=([^\s]+)/g) || [];
        matches.forEach(match => {
          const [key, value] = match.split('=');
          parts[key] = value;
        });

        if (content.startsWith('packaging')) {
          const line1 = chalk.dim(
            `       ${chalk.blue('•')} ${chalk.cyan('packaging'.padEnd(12))} ${chalk.dim(
              `platform=${parts.platform || ''} arch=${parts.arch || ''} electron=${parts.electron || ''}`
            )}`
          );
          const line2 = chalk.dim(
            `       ${chalk.blue('•')} ${chalk.cyan('output'.padEnd(12))} ${chalk.dim(parts.appOutDir || '')}`
          );
          return line1 + '\n' + line2;
        } else if (content.startsWith('building')) {
          return chalk.dim(
            `       ${chalk.blue('•')} ${chalk.cyan('building'.padEnd(12))} ${chalk.dim(parts.file || '')}`
          );
        }
      }

      // Default formatting for other messages
      const partsArr = content.split(/\s{2,}/);
      const key = partsArr[0] || '';
      const value = partsArr.slice(1).join(' ') || '';
      const paddedKey = key.padEnd(12, ' ');
      return chalk.dim(`       ${chalk.blue('•')} ${chalk.cyan(paddedKey)} ${chalk.dim(value)}`);
    }
    return message;
  }

  async start() {
    console.clear();
    console.log('\n');
    console.log(chalk.cyan.bold(`${this.emojis.start} Starting Crypto Converter Build Process ${this.emojis.start}`));
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

  electronMessage(message: string) {
    // Stop spinner to show message cleanly
    this.spinner.stop();
    const formattedMessage = this.formatElectronMessage(message);
    console.log(formattedMessage);
    // Restart spinner on a new line
    this.spinner.start(chalk.blue(`${this.emojis.package} Packaging application for Windows...`));
  }

  buildComplete() {
    this.spinner.stop();
    console.log(chalk.green(`${this.emojis.package} Application packaged successfully`));
    console.log('');
    console.log(chalk.dim('━'.repeat(65)));
    console.log(chalk.magenta.bold(`${this.emojis.done} Build Complete! ${this.emojis.done}`));
    console.log(chalk.magenta(`${this.emojis.time} Total build time: ${this.getElapsedTime()}s`));
    console.log('');
    console.log(chalk.green.bold(`${this.emojis.success} Your app is ready in the release folder! ${this.emojis.success}`));
    console.log('');
  }

  error(message: string) {
    this.spinner.fail(chalk.red(`${this.emojis.error} Error: ${message}`));
  }

  cleanupStep() {
    this.spinner.start(chalk.blue(`${this.emojis.cleanup} Cleaning up previous build artifacts...`));
  }
}

export const buildLogger = new BuildLogger(); 