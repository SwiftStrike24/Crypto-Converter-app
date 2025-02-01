import { ipcRenderer } from 'electron';

export function initInstanceHandler() {
  // Handle dev mode port conflicts
  if (process.env.NODE_ENV === 'development') {
    console.log('Checking for dev server port conflicts...');
    const checkPort = setInterval(() => {
      fetch('http://localhost:5173')
        .then(() => {
          console.log('Dev server port available');
          clearInterval(checkPort);
        })
        .catch((error) => {
          console.log('Dev server port conflict detected:', error);
          window.location.hash = '/instance-dialog';
          clearInterval(checkPort);
        });
    }, 1000);
  }

  // Handle instance dialog display
  ipcRenderer.on('show-instance-dialog', () => {
    console.log('Showing instance dialog...');
    window.location.hash = '/instance-dialog';
  });

  // Handle restart requests
  ipcRenderer.on('request-hard-restart', () => {
    console.log('Handling restart request...');
    ipcRenderer.send('restart-request');
  });

  // Handle window focus events
  ipcRenderer.on('window-focused', () => {
    document.body.classList.remove('window-blur');
  });

  ipcRenderer.on('window-blurred', () => {
    document.body.classList.add('window-blur');
  });
}
