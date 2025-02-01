import { ipcRenderer } from 'electron';

export function initRouter() {
  ipcRenderer.on('navigate-to', (_event, path) => {
    window.location.hash = path;
  });
} 