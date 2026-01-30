/**
 * Instance handler for CryptoVertX
 * Handles window focus/blur events and instance dialog display
 */

export function initInstanceHandler() {
  // Handle dev mode port conflicts
  if (import.meta.env.DEV) {
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

  // Subscribe to window focus/blur events via preload API
  if (typeof window.cryptovertx?.events?.onWindowFocused === 'function') {
    window.cryptovertx.events.onWindowFocused(() => {
      document.body.classList.remove('window-blur');
    });
  }

  if (typeof window.cryptovertx?.events?.onWindowBlurred === 'function') {
    window.cryptovertx.events.onWindowBlurred(() => {
      document.body.classList.add('window-blur');
    });
  }
}
