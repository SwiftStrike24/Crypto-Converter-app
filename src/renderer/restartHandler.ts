import { ipcRenderer } from 'electron';

// For main window - handle restart requests
ipcRenderer.on('request-hard-restart', () => {
  ipcRenderer.send('perform-hard-restart');
});

// For dialog window - handle restart button click
const restartButton = document.getElementById('restart-btn');
restartButton?.addEventListener('click', () => {
  ipcRenderer.send('instance-dialog-restart');
}); 