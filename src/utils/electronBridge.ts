// Secure Electron bridge for renderer process
// This replaces direct ipcRenderer usage with secure, whitelisted channels

// Check if we're in Electron environment
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         window.electronAPI !== undefined;
};

// Safe IPC communication wrapper
export const electronBridge = {
  // Send message to main process
  send: (channel: string, data?: any) => {
    if (!isElectron()) {
      console.warn('Not in Electron environment');
      return;
    }
    window.electronAPI.send(channel, data);
  },

  // Invoke and wait for response from main process
  invoke: async (channel: string, data?: any): Promise<any> => {
    if (!isElectron()) {
      console.warn('Not in Electron environment');
      return null;
    }
    return await window.electronAPI.invoke(channel, data);
  },

  // Listen to events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!isElectron()) {
      console.warn('Not in Electron environment');
      return () => {};
    }
    return window.electronAPI.on(channel, callback);
  },

  // Remove all listeners for a channel
  removeAllListeners: (channel: string) => {
    if (!isElectron()) {
      return;
    }
    window.electronAPI.removeAllListeners(channel);
  },

  // Get app info
  getAppInfo: () => {
    if (!isElectron()) {
      return {
        version: 'dev',
        platform: 'browser' as any,
        isDev: true
      };
    }
    return window.appInfo;
  },

  // Specific methods for common operations
  async getAppVersion(): Promise<string> {
    try {
      const version = await this.invoke('get-app-version');
      return version || 'unknown';
    } catch (error) {
      console.error('Failed to get app version:', error);
      return 'unknown';
    }
  },

  async getEnvironmentVars(): Promise<any> {
    try {
      const vars = await this.invoke('get-env-vars');
      return vars || {};
    } catch (error) {
      console.error('Failed to get environment vars:', error);
      return {};
    }
  },

  quitApp(): void {
    this.send('quit-app');
  },

  requestRestart(): void {
    this.send('restart-request');
  },

  setWindowSize(width: number, height: number, isFullScreen: boolean): void {
    this.send('set-window-size', { width, height, isFullScreen });
  },

  openLinkInApp(url: string): void {
    this.send('open-link-in-app', url);
  },

  async openExternalLink(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.invoke('open-external-link', url);
      return result;
    } catch (error) {
      console.error('Failed to open external link:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};

export default electronBridge;