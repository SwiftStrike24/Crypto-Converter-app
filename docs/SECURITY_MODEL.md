# CryptoVertX Security Model

This document describes the security boundaries and trust assumptions of the CryptoVertX Electron app.

## Renderer Isolation

- The main UI renderer runs without Node.js integration:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
- The renderer cannot import Electron APIs or use `window.require`.

## Preload API Surface

The only supported renderer-to-main interface is the typed preload API exposed as `window.cryptovertx`.

Allowed domains are implemented as explicit IPC channels (no generic IPC passthrough).

### IPC (Renderer -> Main)

- `cryptovertx:app:quit`
- `cryptovertx:app:getVersion`
- `cryptovertx:window:setSize`
- `cryptovertx:links:openInApp`
- `cryptovertx:links:openExternal`
- `cryptovertx:news:fetchMarket`
- `cryptovertx:news:fetchFundraising`
- `cryptovertx:updates:check`
- `cryptovertx:updates:download`
- `cryptovertx:updates:install`

### Events (Main -> Renderer)

- `cryptovertx:nav:navigate`
- `cryptovertx:window:focused`
- `cryptovertx:window:blurred`
- `cryptovertx:updates:successful`
- `cryptovertx:updates:downloadProgress`

## External Content

- External web content is opened in isolated `BrowserWindow` instances with:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
- External windows do not receive a preload script.

## Secrets

- No Cloudflare R2 credentials are embedded in renderer code.
- Updates are fetched via the backend API and executed by the main process.

## CSP Notes

The app sets a CSP via `index.html`. Development builds may include relaxed directives.
Production builds should keep CSP as strict as practical while still supporting required third-party widgets.
