# 2026-01-28 Full Audit Fix Plan (Security, Stability, Maintainability)

Status: Draft (implementation plan only; no code in this document)

This plan converts the Jan 28, 2026 audit into an execution-ready set of workstreams and a linear checklist. It is intentionally explicit: each task lists exact files, intent, acceptance criteria, and verification steps.

---

## A) Goal & Scope

### Goals (concrete outcomes)
1. Remove privileged renderer execution.
   - Main UI renderer runs with `nodeIntegration: false` and `contextIsolation: true`.
   - All renderer-to-main interactions go through a narrow, typed preload API (no generic IPC passthrough).
2. Eliminate shipped secrets.
   - No Cloudflare R2 secret key (or any equivalent credential) is embedded in shipped app code or exposed to renderer.
3. Harden the updater into a constrained, trustable subsystem.
   - Main process does not accept arbitrary update download URLs from renderer.
   - Update downloads are restricted to approved origins and approved object keys.
4. Fix correctness bugs flagged by audit.
   - React hook rule violation fixed.
   - Request-dedup hash bug fixed.
   - Cache "stale fallback" behavior made real (not accidentally disabled by eviction).
5. Reduce instability and resource churn.
   - Remove redundant polling/interval loops.
   - Prevent state desync from stale closures.
6. Align docs with reality.
   - README and internal docs reflect actual platform support, security posture, and configuration.

### Out of scope (explicit)
- New product features unrelated to the audit (e.g., CoinCap migration, dynamic exchange switching) except where required to remove security issues.
- Full UI redesign.
- Adding macOS/Linux packaging targets.
- Implementing a cryptographic signature verification scheme for updates (public-key signature). This plan implements strong constraints and (optionally) hash verification if the backend provides it.

---

## B) Baseline Snapshot

### Constraints that matter
- Current renderer assumes direct Electron access (`import { ipcRenderer } from 'electron'` and `window.require('electron')`). This must be removed before disabling Node integration.
- Main window currently runs privileged (`nodeIntegration: true`, `contextIsolation: false`), while the renderer embeds remote third-party scripts (TradingView widgets).
- Update flow currently allows main process to download/launch an installer based on renderer-provided URL.
- Cache helper deletes entries on expiry, but services attempt "stale fallback" from those same keys (often impossible).
- Build uses Vite + `vite-plugin-electron` with only the main-process entry configured.

### Build/package/runtime assumptions
- Windows packaging only (MSI/NSIS/portable): `package.json#build`.
- Main and renderer are built via Vite into `dist-electron/` and `dist/`: `vite.config.ts`.
- Build script mutates `package.json` and `src/services/versionManager.ts`: `scripts/build.ts`.

### Known issues from audit (actionable list)
- Privileged renderer + remote scripts (RCE risk): `src/electron/main.ts`, TradingView embeds.
- Secrets embedded/exposed: `src/services/updateService.ts`, `src/electron/main.ts`, `src/services/exchangeRatesService.ts`.
- Updater accepts arbitrary URL and launches it: `src/electron/updateHandler.ts`.
- IPC handlers duplicated: `src/electron/main.ts`.
- React hook rules violated: `src/pages/TechnicalAnalysisPage.tsx`.
- Request dedup hash collapses all `/search` requests: `src/services/crypto/cryptoApiService.ts`.
- "Stale cache fallback" is undermined by eviction: `src/services/crypto/cryptoCacheService.ts`, `src/services/newsService.ts`, `src/services/trendingService.ts`.
- Excessive overlapping timers and potential stale-closure state desync: `src/context/CryptoContext.tsx`, `src/components/Converter.tsx`.

---

## C) Workstream Breakdown (ordered)

### Workstream 1: Critical Security Boundary (Preload + Renderer De-privileging)

#### Why it matters
This is the highest-impact risk reducer. Today, a renderer compromise can execute arbitrary code. The single biggest change is moving the renderer to a locked-down environment with a narrow preload API.

#### Prereqs / dependencies
- Must migrate renderer code off `electron` imports / `window.require` before setting `nodeIntegration: false`.
- Preload build must be added to the Vite build pipeline.

#### Step-by-step tasks
1) Create a dedicated preload entry that exposes a minimal API.
   - Create: `src/electron/preload.ts`
   - Implementation decisions (must follow):
     - Use `contextBridge.exposeInMainWorld`.
     - Do NOT expose raw `ipcRenderer.invoke/send` for arbitrary channels.
     - Expose only explicit functions grouped by domain:
       - `app.quit()`
       - `app.getVersion()`
       - `window.setWindowSize(payload)`
       - `links.openInApp(url)`
       - `links.openExternal(url)`
       - `news.fetchMarket(force?)`
       - `news.fetchFundraising(filters, force?)`
       - `updates.check()`
       - `updates.download()`
       - `updates.install(filePath)`
     - Each exposed function must internally call a single dedicated IPC channel (no dynamic channel names).
     - IPC contract (must implement exactly; renderer never calls IPC directly):

       | Preload function | IPC channel | Payload (JSON) | Return |
       | --- | --- | --- | --- |
       | `cryptovertx.app.quit()` | `cryptovertx:app:quit` | none | `void` |
       | `cryptovertx.app.getVersion()` | `cryptovertx:app:getVersion` | none | `{ version: string }` |
       | `cryptovertx.window.setWindowSize(payload)` | `cryptovertx:window:setSize` | `{ width: number, height: number, isFullScreen: boolean }` | `void` |
       | `cryptovertx.links.openInApp(url)` | `cryptovertx:links:openInApp` | `{ url: string }` | `{ success: boolean, error?: string }` |
       | `cryptovertx.links.openExternal(url)` | `cryptovertx:links:openExternal` | `{ url: string }` | `{ success: boolean, error?: string }` |
       | `cryptovertx.news.fetchMarket(payload)` | `cryptovertx:news:fetchMarket` | `{ force: boolean }` | `{ success: boolean, data: unknown[], error?: string }` |
       | `cryptovertx.news.fetchFundraising(payload)` | `cryptovertx:news:fetchFundraising` | `{ force: boolean, filters: { chains?: string[] } }` | `{ success: boolean, data: unknown[], error?: string }` |
       | `cryptovertx.updates.check()` | `cryptovertx:updates:check` | none | `{ hasUpdate: boolean, currentVersion: string, latestVersion: string, downloadKey?: string, fileName?: string, fileSize?: number, sha256?: string }` |
       | `cryptovertx.updates.download(payload)` | `cryptovertx:updates:download` | `{ downloadKey: string }` | `{ filePath: string }` |
       | `cryptovertx.updates.install(payload)` | `cryptovertx:updates:install` | `{ filePath: string }` | `{ success: boolean, error?: string }` |

     - Main -> renderer event bridge (must implement; renderer never subscribes to ipcRenderer directly):

       | Preload subscription | Main event channel | Payload | Notes |
       | --- | --- | --- | --- |
       | `cryptovertx.events.onNavigate(listener)` | `cryptovertx:nav:navigate` | `{ path: string }` | Used by `src/renderer/router.ts` |
       | `cryptovertx.events.onWindowFocused(listener)` | `cryptovertx:window:focused` | none | Used for "active polling" heuristics |
       | `cryptovertx.events.onWindowBlurred(listener)` | `cryptovertx:window:blurred` | none | Used for "active polling" heuristics |
       | `cryptovertx.events.onUpdateSuccessful(listener)` | `cryptovertx:updates:successful` | none | Replaces `update-successful` |
       | `cryptovertx.events.onUpdateDownloadProgress(listener)` | `cryptovertx:updates:downloadProgress` | `{ progress: number, downloadedBytes?: number, totalBytes?: number, speed?: number, eta?: number }` | Replaces `download-progress` |

     - Naming decision: all IPC channels (invoke/handle and send/on) must be namespaced with `cryptovertx:`.
     - If any legacy IPC channels must remain temporarily, keep them private to preload and do not expose them to renderer.
     - The preload must validate inputs defensively (basic type checks) before calling IPC.

2) Add preload bundling to the build.
   - Edit: `vite.config.ts`
   - Add a second `vite-plugin-electron` entry for preload:
     - `entry: 'src/electron/preload.ts'`
     - Build output: `dist-electron/preload.js`
     - Output naming must be non-hashed and stable. Enforce:
       - `build.rollupOptions.output.entryFileNames = '[name].js'`
       - Ensure the entry name resolves to `preload` so the output is exactly `preload.js`.
   - Acceptance: `pnpm dev` launches and produces a built preload bundle in dev and in `pnpm build`.

3) Lock down the main UI window.
   - Edit: `src/electron/main.ts`
   - For the main UI window and instance dialog window:
     - Set `webPreferences.nodeIntegration = false`
     - Set `webPreferences.contextIsolation = true`
     - Set `webPreferences.preload = path.join(__dirname, 'preload.js')`.
       - Acceptance for path correctness: after `pnpm build`, the file `dist-electron/preload.js` exists and is packaged under `dist-electron/` next to `main.js`.
     - Set `webPreferences.sandbox = true` (preferred) OR explicitly document why it cannot be enabled.
   - Remove all `executeJavaScript`-based env/version injection into renderer.
   - Remove renderer global assumptions of `window.electron.env`, `window.__APP_VERSION__`, `window.__PACKAGE_JSON_VERSION__`.
   - Rename main-process-to-renderer event sends to the new namespaced channels:
     - Replace sends of `navigate-to` -> `cryptovertx:nav:navigate`
     - Replace sends of `window-focused` -> `cryptovertx:window:focused`
     - Replace sends of `window-blurred` -> `cryptovertx:window:blurred`
     - Replace sends of `update-successful` -> `cryptovertx:updates:successful`

4) Replace all renderer Electron usage with the preload API.
   - Edit all renderer files that import from `electron` or use `window.require('electron')`.
   - Mandatory grep-driven inventory before edits:
     - Search for `from 'electron'` and `window.require(` across `src/`.
   - Minimum known files to edit:
     - `src/App.tsx` (window sizing)
     - `src/components/Header.tsx` (quit)
     - `src/components/Converter.tsx` (open CoinGecko link)
     - `src/components/NewsCard.tsx` (open article)
     - `src/services/newsService.ts` (IPC invoke)
     - `src/services/fundraisingService.ts` (IPC invoke)
     - `src/services/updateService.ts` (move to preload-driven API; see Workstream 2)
      - `src/renderer/router.ts`
      - `src/renderer/instanceHandler.ts`
      - `src/renderer/restartHandler.ts`
      - `src/main.tsx` (if any Electron assumptions remain)
   - Explicit migration requirements:
     - `src/renderer/router.ts` must subscribe via `window.cryptovertx.events.onNavigate(...)`.
     - `src/renderer/instanceHandler.ts` must subscribe via `window.cryptovertx.events.onWindowFocused(...)` and `window.cryptovertx.events.onWindowBlurred(...)`.
     - `src/App.tsx` must listen for update success via `window.cryptovertx.events.onUpdateSuccessful(...)`.

5) Update global typings to match the new API.
   - Edit: `src/types/global.d.ts`
   - Edit: `src/env.d.ts`
   - Remove `window.electron` typing and replace with:
     - `window.cryptovertx: { app, window, links, news, updates }` (exact shape must match preload)
   - Acceptance: `pnpm typecheck` passes with no `any`-based workarounds added.

6) Ensure external content windows remain locked down.
   - Edit: `src/electron/main.ts`
   - For internal browser windows created for external content:
     - Keep `nodeIntegration: false`, `contextIsolation: true`
     - Set `sandbox: true`
     - Ensure `setWindowOpenHandler` denies by default.
   - Acceptance: opening news/CoinGecko links never spawns a privileged window.

#### File-level edit list
- Create: `src/electron/preload.ts`
- Edit: `vite.config.ts`
- Edit: `src/electron/main.ts`
- Edit: `src/types/global.d.ts`
- Edit: `src/env.d.ts`
- Edit (expected): `src/App.tsx`, `src/components/Header.tsx`, `src/components/Converter.tsx`, `src/components/NewsCard.tsx`, `src/services/newsService.ts`, `src/services/fundraisingService.ts`, `src/renderer/router.ts`, `src/renderer/instanceHandler.ts`, `src/renderer/restartHandler.ts`

#### Acceptance criteria
- Renderer has no `electron` imports.
- `window.require` is not used anywhere in renderer.
- Main UI window runs with `nodeIntegration: false` and `contextIsolation: true`.
- Renderer can still:
  - resize window by route
  - quit app
  - open external content in internal browser windows
  - fetch news/fundraising
  - check/download/install updates

#### Verification steps
- Commands:
  - `pnpm typecheck`
  - `pnpm dev` (manual smoke below)
  - `pnpm build`
- Manual smoke (dev):
  1. Launch app, confirm converter loads.
  2. Click news button, open an article, confirm it opens in an internal window.
  3. Click update check, confirm it runs and UI responds.
  4. Open devtools and confirm `window.require` is `undefined` and `window.cryptovertx` exists.

---

### Workstream 2: Update System Hardening + Secret Removal

#### Why it matters
The updater is a privileged downloader/launcher. It must be constrained so that even if the renderer is compromised, it cannot turn into arbitrary code execution. Also, no secret keys should ship.

#### Prereqs / dependencies
- Workstream 1 preload must exist so the renderer does not directly drive sensitive IPC.

#### Step-by-step tasks
1) Remove hardcoded Cloudflare R2 credentials and stop exposing them.
   - Edit: `src/electron/main.ts`
     - Delete `ENV_VARS.R2_SECRET_ACCESS_KEY` fallback value.
     - Delete IPC handler `get-env-vars` entirely OR ensure it never returns secrets and is dev-only.
     - Remove any renderer injection that includes secrets.
   - Edit: `src/services/updateService.ts`
     - Delete `FALLBACK_CREDENTIALS` (and all secret-bearing fields).
     - Remove AWS SDK presigning/listing path from renderer.
     - Decision: update checks/listing must come from backend API only (`https://cryptovertx.com/api/files?prefix=latest/`).

2) Move update orchestration behind a dedicated IPC API.
   - Edit: `src/electron/updateHandler.ts`
   - Create (optional, recommended): `src/electron/updateService.ts` (main-only helper)
   - Replace the current renderer-driven URL download with a key-driven download:
     - New IPC: `cryptovertx:updates:check` returns `{hasUpdate,currentVersion,latestVersion,downloadKey,fileName,fileSize}`.
     - New IPC: `cryptovertx:updates:download` takes `{downloadKey}` (NOT a URL) and returns `{filePath}`.
     - New IPC: `cryptovertx:updates:install` takes `{filePath}` and installs.
   - Main process must construct the download URL internally using a fixed base:
     - `API_BASE_URL = 'https://cryptovertx.com/api'` (configurable via env only in dev)
     - Download URL format: `${API_BASE_URL}/download?key=${encodeURIComponent(downloadKey)}`
   - Progress events:
     - Replace any renderer-facing progress event name with `cryptovertx:updates:downloadProgress`.
     - Preload must bridge it via `cryptovertx.events.onUpdateDownloadProgress(listener)`.

3) Enforce strict validation in main process before downloading.
   - Edit: `src/electron/updateHandler.ts`
   - Validation rules (must implement exactly):
     - `downloadKey` must be a string.
     - `downloadKey` must start with `latest/`.
     - `downloadKey` must not contain `..`, backslashes, or control characters.
     - `downloadKey` filename must match one of:
       - `CryptoVertX-MSI-Installer-vX.Y.Z.msi`
       - `CryptoVertX-Setup-vX.Y.Z.exe`
     - Download URL must be HTTPS and host must be exactly `cryptovertx.com`.
   - Installation rules:
     - Only allow launching `.msi` or `.exe` in the temp directory created by the updater.

4) Rewire UI to call preload updates API.
   - Edit: `src/components/Header.tsx`
   - Edit: `src/components/UpdateDialog.tsx`
   - Replace imports from `src/services/updateService.ts` with calls to `window.cryptovertx.updates.*`.

5) Optional (if backend can provide hashes): add SHA-256 verification.
   - First, inspect the live JSON returned by `GET https://cryptovertx.com/api/files?prefix=latest/`.
     - If each file entry includes `sha256` (or a top-level `manifest.sha256` for the selected file), implement this step.
     - If there is no hash field, do not guess; explicitly skip hash verification.
   - If and only if a SHA-256 is available from the API:
     - Extend `cryptovertx:updates:check` to return `sha256`.
     - In `src/electron/updateHandler.ts`, compute sha256 of downloaded file and compare before `shell.openPath`.
   - If backend cannot provide hash: explicitly skip this step and document in docs.

#### File-level edit list
- Edit: `src/electron/main.ts`
- Edit: `src/electron/updateHandler.ts`
- Create (optional): `src/electron/updateService.ts`
- Edit: `src/components/Header.tsx`
- Edit: `src/components/UpdateDialog.tsx`
- Edit or delete (post-migration): `src/services/updateService.ts`
- Edit: `package.json` (remove AWS SDK deps if no longer used)

#### Acceptance criteria
- No R2 secret access key exists in repo code (search must return 0 matches for `R2_SECRET_ACCESS_KEY` literals).
- Renderer cannot initiate downloads from arbitrary URLs.
- Update download/install still works end-to-end using backend API.

#### Verification steps
- Grep checks:
  - Search for hardcoded keys: `R2_SECRET_ACCESS_KEY`, `R2_ACCESS_KEY_ID`, `CLOUDFLARE_ACCOUNT_ID` in `src/`.
  - Search for update IPC accepting raw URL payload.
- Manual:
  - Trigger update check and verify dialog works.
  - Attempt to call download with a non-`latest/` key (devtools) and verify main rejects.

---

### Workstream 3: Critical Bug Fixes (Correctness / Edge Cases)

#### Why it matters
These are deterministic correctness bugs that can crash or silently corrupt behavior.

#### Prereqs / dependencies
- None, but should be done early because they are small, high leverage.

#### Step-by-step tasks
1) Fix React hook rules violation in TechnicalAnalysisPage.
   - Edit: `src/pages/TechnicalAnalysisPage.tsx`
   - Remove conditional `React.useEffect` call.
   - Implement one of:
     - Always call `useEffect` at top-level and gate logic inside it.
     - Or compute `hasState` and render a fallback without calling hooks conditionally.
   - Acceptance: navigating to `/analysis` without `location.state` does not crash and does not violate hook rules.

2) Fix request dedup hash to include all request-defining inputs.
   - Edit: `src/services/crypto/cryptoApiService.ts`
   - Replace `generateRequestHash(ids, endpoint)` with a function that hashes:
     - URL
     - HTTP method
     - Stable-serialized `config.params` (sorted keys)
   - Acceptance: concurrent `/search?query=a` and `/search?query=b` produce different hashes and do not share a promise.

3) Fix NewsCard image placeholder cleanup.
   - Edit: `src/components/NewsCard.tsx`
   - Remove DOM mutation relying on `document.currentScript`.
   - Implement placeholder with React state (`useState(hasImageError)`) instead of imperative DOM insertion.
   - Acceptance: broken image URLs show placeholder reliably; successful load never leaves orphan placeholders.

4) Remove duplicated IPC handler registration.
   - Edit: `src/electron/main.ts`
   - Ensure `setupIpcHandlers()` is called exactly once.
   - Acceptance: no runtime error about duplicate `ipcMain.handle` registrations; no unexpected double events.

#### File-level edit list
- Edit: `src/pages/TechnicalAnalysisPage.tsx`
- Edit: `src/services/crypto/cryptoApiService.ts`
- Edit: `src/components/NewsCard.tsx`
- Edit: `src/electron/main.ts`

#### Verification steps
- `pnpm typecheck`
- Manual:
  - Navigate directly to `#/analysis` with no state (e.g., edit URL hash) and confirm app remains stable.
  - Rapidly type in AddCrypto search and confirm results track the query.

---

### Workstream 4: High-Risk Stability Fixes (Polling, Timers, State Desync)

#### Why it matters
Current behavior uses multiple overlapping intervals and event loops (prices, icons, news refresh). This increases CPU/network churn and can create subtle state desync.

#### Prereqs / dependencies
- Workstream 1 (preload) may alter how focus/blur events are delivered.

#### Step-by-step tasks
1) Consolidate icon-checking into a single scheduler.
   - Edit: `src/context/CryptoContext.tsx`
   - Edit: `src/components/Converter.tsx`
   - Remove duplicate periodic icon checks in `Converter`.
   - Keep one periodic icon check in `CryptoContext` with:
     - a minimum interval (e.g., 10-30 minutes)
     - a faster retry only when missing icons are detected (bounded)
   - Acceptance: there is exactly one repeating timer responsible for icon repair.

2) Replace the 2s API status polling with event-driven updates.
   - Edit: `src/services/crypto/cryptoApiService.ts`
   - Edit: `src/context/CryptoContext.tsx`
   - Decision: expose a small event emitter in the service (or callbacks) to notify status changes (rate-limited / fallback mode toggles).
   - Remove `setInterval(syncApiStatus, 2000)`.
   - Acceptance: rate-limit UI still updates, without constant polling.

3) Fix stale-closure hazards in CryptoContext.
   - Edit: `src/context/CryptoContext.tsx`
   - Ensure any callback that reads `tokenMetadata`, `prices`, or `cryptoIds` uses either:
     - correct dependency arrays, OR
     - functional state updates (preferred) to avoid overwriting newer state.
   - Acceptance: no function writes older snapshots over newer state (verified by targeted tests or manual stress: add tokens while polling).

4) Add explicit timeouts for main-process RSS fetch.
   - Edit: `src/electron/main.ts`
   - Wrap RSS `fetch()` calls with `AbortController` and a fixed timeout (e.g., 8-10 seconds).
   - Acceptance: a hung RSS source does not stall the whole news refresh.

#### Verification steps
- Manual stress:
  - Add 10+ tokens quickly, switch between tokens, confirm UI does not freeze.
  - Leave app running 10 minutes and confirm CPU usage is stable and logs are not spamming.

---

### Workstream 5: Cache Correctness + Offline/Degraded Mode

#### Why it matters
The current cache utility removes expired entries, defeating the "stale fallback" logic. This reduces resilience during outages.

#### Prereqs / dependencies
- None.

#### Step-by-step tasks
1) Extend cache service to support stale reads without deleting entries.
   - Edit: `src/services/crypto/cryptoCacheService.ts`
   - Replace current behavior with:
     - `getCachedDataFresh(key)` (only returns if not expired)
     - `getCachedDataAllowStale(key)` (returns even if expired)
       - Return shape must include: `{ data, timestamp, expiry, ageMs, isStale }`.
     - `pruneCacheKey(key, maxAgeMs)` (optional)
   - Do not remove localStorage items automatically on expiry; prune explicitly.

2) Update news and trending services to use the new stale reads.
   - Edit: `src/services/newsService.ts`
   - Edit: `src/services/trendingService.ts`
   - Remove manual `localStorage.getItem('cryptovertx-cache-...')` parsing.
   - Implement consistent policy:
     - Fresh window: use fresh cache
     - If API fails: use stale cache up to a max stale age (news: 1h, trending: 30m)

3) Add unit tests for cache semantics.
   - Create: `src/services/crypto/cryptoCacheService.test.ts`
   - Use Vitest with a mocked `localStorage`.
   - Acceptance: tests cover fresh hit, stale hit, and prune.

#### Verification steps
- Manual:
  - Simulate offline mode and confirm trending/news show last cached data with "cached" indicator.

---

### Workstream 6: Performance Improvements (Bundle + Runtime)

#### Why it matters
Performance issues amplify correctness issues and increase crash probability in Electron.

#### Prereqs / dependencies
- Workstream 2 to remove AWS SDK from renderer.

#### Step-by-step tasks
1) Remove AWS SDK from renderer bundle.
   - Edit: `src/services/updateService.ts` (or delete it if replaced by preload API)
   - Edit: `package.json` (remove `@aws-sdk/*` deps if unused)
   - Acceptance: update check still functions via backend API; renderer bundle size decreases.

2) Reduce excessive logging in production.
   - Edit: `src/context/CryptoContext.tsx`, `src/services/crypto/cryptoApiService.ts`, `src/electron/main.ts`
   - Decision: gate noisy logs behind a single debug flag (e.g., `?debug=true`) and never log secrets.
   - Acceptance: normal usage produces minimal logs.

---

### Workstream 7: Architecture Refactors (Maintainability / Integrity)

#### Why it matters
`CryptoContext` is a god object. Splitting responsibilities reduces regression risk and makes future changes tractable.

#### Prereqs / dependencies
- Complete Workstreams 1-5 first; refactors should not be performed while security posture is in flux.

#### Step-by-step tasks
1) Extract a price update queue module.
   - Create: `src/state/crypto/priceQueue.ts`
   - Edit: `src/context/CryptoContext.tsx` to delegate queueing/batching logic.
   - Acceptance: CryptoContext becomes thinner; price queue unit-testable.

2) Extract metadata/icon management module.
   - Create: `src/state/crypto/metadata.ts`
   - Edit: `src/context/CryptoContext.tsx`
   - Acceptance: icon caching and metadata fetching are isolated.

3) Convert CryptoContext state writes to a reducer.
   - Create: `src/state/crypto/reducer.ts`
   - Edit: `src/context/CryptoContext.tsx`
   - Acceptance: complex updates are consolidated; no stale snapshot overwrites.

---

### Workstream 8: UX/DX + Docs Alignment

#### Why it matters
Users must trust what the app is doing; developers must trust docs.

#### Step-by-step tasks
1) Update README to match reality.
   - Edit: `README.md`
   - Must include:
     - Windows-only packaging
     - Accurate dependency versions
     - Accurate security posture description (post-fix)
     - Remove claims of "no hardcoded credentials" unless verified true.

2) Add a SECURITY and UPDATE model doc.
   - Create: `docs/SECURITY_MODEL.md`
   - Create: `docs/UPDATE_MODEL.md`
   - Must include:
     - Renderer isolation model
     - IPC surface (allowed calls)
     - Update trust constraints (origins, key validation)

3) Align `implementation.md`/`progress.md` with actual behavior.
   - Edit: `implementation.md`
   - Edit: `progress.md`

---

## D) Implementation Checklist (Linear Order)

Each item should be completable in ~30-90 minutes.

1. Add preload entry file skeleton: `src/electron/preload.ts`.
2. Add `window.cryptovertx` typings: update `src/types/global.d.ts` and `src/env.d.ts`.
3. Update `vite.config.ts` to build preload output.
4. Switch main UI window to `preload`, `contextIsolation: true`, `nodeIntegration: false` (keep feature parity temporarily): `src/electron/main.ts`.
5. Remove renderer `window.require('electron')` usage in `src/App.tsx` by calling `window.cryptovertx.window.setWindowSize(...)`.
6. Replace renderer quit call: `src/components/Header.tsx` uses preload `app.quit()`.
7. Replace open-link behavior: `src/components/Converter.tsx` uses preload `links.openInApp(url)`.
8. Replace news open-link behavior: `src/components/NewsCard.tsx` uses preload `links.openInApp(url)`.
9. Replace IPC-based routing: `src/renderer/router.ts` uses preload event subscription.
10. Replace instance handler IPC: `src/renderer/instanceHandler.ts` via preload.
11. Replace restart handler IPC: `src/renderer/restartHandler.ts` via preload.
12. Fix hook rule violation: `src/pages/TechnicalAnalysisPage.tsx`.
13. Fix request dedup hash bug: `src/services/crypto/cryptoApiService.ts`.
14. Replace NewsCard image placeholder implementation with React state: `src/components/NewsCard.tsx`.
15. Ensure `setupIpcHandlers()` is called once: `src/electron/main.ts`.
16. Remove `get-env-vars` IPC or strip secrets + dev-gate it: `src/electron/main.ts`.
17. Remove executeJavaScript env/version injection: `src/electron/main.ts`.
18. Implement preload-driven news fetch wrappers: `src/electron/main.ts` IPC + `src/electron/preload.ts` bridging.
19. Rewire `src/services/newsService.ts` to call preload API (or delete service and call preload directly from context).
20. Rewire `src/services/fundraisingService.ts` to call preload API.
21. Implement updater IPC API in main (check/download/install): `src/electron/updateHandler.ts` (and optional `src/electron/updateService.ts`).
22. Rewire update UI components to use preload updates API: `src/components/Header.tsx`, `src/components/UpdateDialog.tsx`.
23. Remove AWS SDK usage from renderer update flow: `src/services/updateService.ts`.
24. Remove hardcoded R2 credentials from codebase: `src/services/updateService.ts`, `src/electron/main.ts`.
25. Add strict key validation and host pinning for update downloads: `src/electron/updateHandler.ts`.
26. Add RSS fetch timeouts: `src/electron/main.ts`.
27. Refactor cache service to support stale reads: `src/services/crypto/cryptoCacheService.ts`.
28. Update trending/news services to use stale cache API consistently: `src/services/trendingService.ts`, `src/services/newsService.ts`.
29. Consolidate icon checking loops: remove duplicates in `src/components/Converter.tsx`, keep one scheduler in `src/context/CryptoContext.tsx`.
30. Remove API status polling interval and replace with event-driven updates: `src/services/crypto/cryptoApiService.ts`, `src/context/CryptoContext.tsx`.
31. Add unit tests for cache + dedup hashing (introduce Vitest if not present): `package.json`, `vitest.config.ts`, `src/services/crypto/*.test.ts`.
32. Add docs updates: `README.md`, `docs/SECURITY_MODEL.md`, `docs/UPDATE_MODEL.md`, `implementation.md`, `progress.md`.
33. Final full smoke + packaging build validation.

---

## E) Testing Strategy

### Automated
1) Unit tests (must add if absent)
- Framework decision: Vitest.
- Add scripts:
  - `pnpm test` (unit)
  - `pnpm test:watch` (optional)
- Minimum unit coverage:
  - Request dedup hashing correctness: `src/services/crypto/cryptoApiService.test.ts`
  - Cache stale/fresh semantics: `src/services/crypto/cryptoCacheService.test.ts`
  - Update key validation helpers (if extracted): `src/electron/updateService.test.ts` (or pure function module under `src/electron/`).

2) Integration tests (recommended)
- Preload API contract test: a small test that ensures `window.cryptovertx` exists and required functions are present when running in Electron dev.
- If automated Electron integration is too heavy, treat this as a manual script with acceptance criteria.

### Manual QA scripts (explicit click-paths)
1) Converter smoke
   - Launch app -> select BTC/USD -> enter amount -> verify conversion updates.
   - Switch token rapidly 10 times -> verify no crash.
2) Token management
   - Add token from search -> verify appears in dropdown -> verify price eventually resolves.
   - Delete token in manage page -> verify removed.
3) Trending
   - Open Trending -> click a token -> verify Chart loads -> back navigation works.
4) News
   - Open News -> Market tab -> open an article -> verify internal browser opens.
   - Switch tabs rapidly (market/tv/stocks/economic/heatmap) -> verify no crash.
5) Updates
   - Click update check -> verify no error.
   - (If update available) download -> see progress -> install triggers installer.
6) Security checks
   - Open devtools -> confirm `window.require` is undefined.
   - Confirm `process` is undefined in renderer.
   - Confirm there is no global `window.electron.env` with secrets.

### Regression checklist
- No renderer import from `electron` remains.
- No IPC handlers accept raw arbitrary URLs.
- All previously working pages still load.
- News fetching still works via main-process IPC.

### Performance checks
- Startup time: measure time from process start to first render (use logs in main).
- CPU baseline: idle CPU after 2 minutes should be stable (no 2s polling loops).
- Renderer bundle size: confirm AWS SDK removed from renderer build output.

---

## F) Rollout / Risk Management

### Risk matrix (impact x likelihood)
- Privileged renderer + remote scripts: Critical x High
- Updater arbitrary URL download/launch: Critical x Medium/High
- Shipped secrets: High x High
- Cache fallback broken: Medium x High
- Stale-closure state overwrites: Medium x Medium

### Safe sequencing
1) Do small deterministic bug fixes early (hook rule, dedup hash) to reduce noise while refactoring.
2) Introduce preload API and migrate renderer calls incrementally.
3) Flip `nodeIntegration/contextIsolation` only after renderer call migration compiles and runs.
4) Harden updater and remove secrets before publishing any release.
5) Only then do maintainability refactors.

### Rollback strategy
- Keep a short-lived feature flag during migration:
  - If needed, temporarily keep legacy IPC channels while new preload API is added.
  - Roll back by reverting:
    - `src/electron/main.ts` webPreferences changes
    - preload wiring in `vite.config.ts`
    - renderer replacements
- Never ship a build that reintroduces secrets.

---

## G) Definition of Done

Non-negotiable completion criteria:
1) Security
   - Main renderer: `nodeIntegration: false`, `contextIsolation: true`.
   - Renderer has no direct Electron imports and no `window.require` usage.
   - No embedded secret keys in shipped code (grep confirms).
2) Updater
   - Main process does not accept arbitrary URLs from renderer for update download.
   - Update download restricted to `cryptovertx.com` and validated `latest/` keys.
3) Correctness
   - Hook rule violation fixed.
   - Request dedup hash fixed and covered by unit tests.
   - Cache stale fallback works and covered by unit tests.
4) Verification
   - Commands pass:
     - `pnpm typecheck`
     - `pnpm build`
     - `pnpm lint` (if enabled)
   - Manual QA scripts completed without crashes.
5) Docs
   - README and security/update model docs reflect the post-fix reality.
