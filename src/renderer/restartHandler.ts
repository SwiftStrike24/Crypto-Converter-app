/**
 * Restart handler for CryptoVertX
 * Handles restart button in instance dialog
 * 
 * Note: This file is mostly for legacy support. The instance dialog
 * should use React components and the preload API directly.
 */

document.addEventListener('DOMContentLoaded', () => {
  const restartButton = document.getElementById('restart-btn');
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      // Use the preload API to quit (which triggers restart logic)
      if (typeof window.cryptovertx?.app?.quit === 'function') {
        window.cryptovertx.app.quit();
      }
      setTimeout(() => {
        window.close();
      }, 500);
    });
  }
});
