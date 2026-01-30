/**
 * Router initialization for CryptoVertX
 * Handles navigation events from the main process via the preload API
 */

export function initRouter() {
  // Subscribe to navigation events from main process
  if (typeof window.cryptovertx?.events?.onNavigate === 'function') {
    window.cryptovertx.events.onNavigate((payload) => {
      if (payload && typeof payload.path === 'string') {
        window.location.hash = payload.path;
      }
    });
  }
}
