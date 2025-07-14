import { contextBridge, ipcRenderer } from 'electron';

// Define allowed channels for IPC communication
const ALLOWED_CHANNELS = {
  send: [
    'quit-app',
    'restart-request',
    'instance-dialog-restart',
    'set-window-size',
    'open-link-in-app'
  ],
  invoke: [
    'get-app-version',
    'get-env-vars',
    'open-external-link',
    'check-for-updates',
    'download-update',
    'install-update'
  ],
  on: [
    'window-focused',
    'window-blurred',
    'navigate-to',
    'update-successful',
    'update-available',
    'update-not-available',
    'update-error',
    'download-progress',
    'update-downloaded'
  ]
};

// Expose protected methods that allow the renderer process
// to communicate with the main process using IPC
contextBridge.exposeInMainWorld('electronAPI', {
  // One-way communication to main
  send: (channel: string, data?: any) => {
    if (ALLOWED_CHANNELS.send.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.error(`Channel '${channel}' is not allowed for send`);
    }
  },
  
  // Two-way communication with main
  invoke: async (channel: string, data?: any) => {
    if (ALLOWED_CHANNELS.invoke.includes(channel)) {
      return await ipcRenderer.invoke(channel, data);
    } else {
      console.error(`Channel '${channel}' is not allowed for invoke`);
      throw new Error(`Channel '${channel}' is not allowed`);
    }
  },
  
  // Receive from main
  on: (channel: string, callback: Function) => {
    if (ALLOWED_CHANNELS.on.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return a function to remove the listener
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.error(`Channel '${channel}' is not allowed for on`);
      return () => {}; // Return no-op function
    }
  },
  
  // Remove all listeners for a channel
  removeAllListeners: (channel: string) => {
    if (ALLOWED_CHANNELS.on.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});

// Expose safe environment variables (no secrets)
contextBridge.exposeInMainWorld('appInfo', {
  version: process.env.npm_package_version || '',
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development'
});