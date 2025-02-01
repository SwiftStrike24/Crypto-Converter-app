import { ipcRenderer } from 'electron';

// For main window - handle restart requests
ipcRenderer.on('request-hard-restart', () => {
  ipcRenderer.send('restart-request');
});

// Handle instance dialog restart
ipcRenderer.on('instance-dialog-restart', () => {
  ipcRenderer.send('instance-dialog-restart');
});

document.addEventListener('DOMContentLoaded', () => {
  const restartButton = document.getElementById('restart-btn');
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      // Send restart request and wait briefly before closing
      ipcRenderer.send('instance-dialog-restart');
      setTimeout(() => {
        window.close();
      }, 500);
    });
  }
});
