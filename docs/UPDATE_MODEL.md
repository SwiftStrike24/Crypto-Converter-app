# CryptoVertX Update Model

This document describes how CryptoVertX checks, downloads, and installs updates.

## Goals

- The renderer must not be able to make the main process download arbitrary URLs.
- Update downloads must be constrained to trusted origins and validated object keys.
- The installer launched by the app must be restricted to a temp directory location.

## Architecture

- The renderer calls the preload API (`window.cryptovertx.updates.*`).
- The main process owns:
  - update availability check
  - download URL construction
  - download and progress events
  - installer launch

## Check

- IPC: `cryptovertx:updates:check`
- Main process calls:
  - `GET https://cryptovertx.com/api/files?prefix=latest/`
- The response is normalized to a list of candidate installers.
- The newest version is selected and compared to `app.getVersion()`.

## Download

- IPC: `cryptovertx:updates:download` with `{ downloadKey }`
- Validation rules:
  - `downloadKey` must start with `latest/`
  - no `..`, no backslashes, no control characters
  - filename must match one of:
    - `CryptoVertX-MSI-Installer-vX.Y.Z.msi`
    - `CryptoVertX-Setup-vX.Y.Z.exe`
- Main constructs the URL internally:
  - `https://cryptovertx.com/api/download?key=${encodeURIComponent(downloadKey)}`
- The file is downloaded to the OS temp directory and progress is emitted to the renderer:
  - event: `cryptovertx:updates:downloadProgress`

## Install

- IPC: `cryptovertx:updates:install` with `{ filePath }`
- Validation rules:
  - path must be inside `app.getPath('temp')`
  - extension must be `.msi` or `.exe`
  - filename must match expected installer patterns
- On install start:
  - main writes `update.flag` into `app.getPath('userData')`
  - main launches the installer via `shell.openPath(filePath)`
  - main quits shortly after to allow the installer to proceed

## Integrity Verification

The backend currently does not provide SHA-256 hashes for installer objects. Because of that, the app does not attempt to verify hashes (it does not guess using ETags).
