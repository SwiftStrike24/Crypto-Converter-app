export interface ElectronAPI {
  send: (channel: string, data?: any) => void;
  invoke: (channel: string, data?: any) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  removeAllListeners: (channel: string) => void;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    appInfo: AppInfo;
  }
}