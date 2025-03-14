// Global type declarations
interface Window {
  electron?: {
    env?: Record<string, string>;
    ipcRenderer?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => void;
      removeListener: (channel: string, listener: (...args: any[]) => void) => void;
    };
  };
  
  // App version globals
  __APP_VERSION__: string;
  __PACKAGE_JSON_VERSION__: string;
}
