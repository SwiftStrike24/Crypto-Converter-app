# Plan: Real-Time Data-Fetching Mechanism for CryptoVertX

**Objective:** Overhaul the existing data-fetching logic to ensure prices and conversions are always up-to-date, providing a truly "live" user experience. This plan will replace the current fixed-interval polling with a dynamic, event-driven system that is both more efficient and more responsive.

---

### 1. Diagnosis of the Current System

- **Problem:** The application relies on a `setInterval` within `CryptoContext.tsx` with a long duration (currently ~4 minutes, based on `PRICE_CACHE_DURATION`).
- **Symptoms:**
    1.  Data becomes stale if the app is left open, as it only refreshes every few minutes.
    2.  The app continues to poll the API at the same rate even when it's hidden via the hotkey or blurred (not in focus), leading to inefficient API usage.
    3.  There is no immediate data refresh when the user returns to the app after being away, forcing them to see potentially old data.

---

### 2. Core Principles of the New System

1.  **Event-Driven Updates:** Data should refresh automatically when key events occur, such as the user focusing the app window or the computer regaining network connectivity.
2.  **Intelligent Polling:** Instead of a fixed interval, we will use a dynamic polling mechanism. A shorter, more aggressive polling interval will be active *only when the app is visible and focused*. This interval will be paused when the app is hidden or blurred.
3.  **Stale-While-Revalidate (SWR) UX:** For user-initiated actions (like changing the selected crypto), the UI will immediately display the last known (stale) data for a fast response, while simultaneously triggering a background fetch to get the latest data. The UI will update seamlessly once the fresh data arrives.
4.  **Centralized Logic:** All of this new logic will be encapsulated within `src/context/CryptoContext.tsx` to maintain a clean and centralized state management architecture.

---

### 3. Detailed Implementation Plan for Cursor AI

#### **Step 3.1: Enhance `CryptoContext.tsx` (The Core of the Changes)**

This file will be modified to manage the application's active state and trigger data fetches based on events.

1.  **Introduce Application State Management:**
    -   Add a new state to track if the application is active and online.
        ```typescript
        const [isAppActive, setIsAppActive] = useState(true);
        ```
    -   Create a `useEffect` hook to listen for window focus/blur and online/offline events. This will control the `isAppActive` state.
        ```typescript
        useEffect(() => {
          const handleFocus = () => setIsAppActive(true);
          const handleBlur = () => setIsAppActive(false);

          // Listen for events from the Electron main process
          window.electron.ipcRenderer.on('window-focused', handleFocus);
          window.electron.ipcRenderer.on('window-blurred', handleBlur);

          // Listen for browser online/offline events
          window.addEventListener('online', handleFocus);
          window.addEventListener('offline', handleBlur);

          // Initial check
          if (!navigator.onLine) {
            handleBlur();
          }

          return () => {
            window.electron.ipcRenderer.removeAllListeners('window-focused');
            window.electron.ipcRenderer.removeAllListeners('window-blurred');
            window.removeEventListener('online', handleFocus);
            window.removeEventListener('offline', handleBlur);
          };
        }, []);
        ```

2.  **Implement Intelligent Polling:**
    -   Replace the existing `setInterval` with a new `useEffect` hook that is sensitive to the `isAppActive` state.
    -   This hook will set up a shorter, more aggressive polling interval (e.g., every 30-60 seconds) that *only* runs its update logic when `isAppActive` is `true`.

        ```typescript
        useEffect(() => {
          let intervalId: NodeJS.Timeout | null = null;

          const poll = () => {
            // Only fetch prices if the app is active and has network
            if (isAppActive && navigator.onLine) {
              console.log('[Intelligent Polling] App is active, fetching prices.');
              updatePrices(false); // Use the existing update function
            } else {
              console.log('[Intelligent Polling] App is inactive, polling skipped.');
            }
          };

          // Clear any existing interval and start a new one
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(poll, 45 * 1000); // 45-second interval

          return () => {
            if (intervalId) clearInterval(intervalId);
          };
        }, [isAppActive, updatePrices]); // Re-runs when app active state changes
        ```

3.  **Trigger Refresh on Focus:**
    -   Add another `useEffect` to specifically trigger an immediate refresh when the app becomes active.
        ```typescript
        useEffect(() => {
          if (isAppActive) {
            console.log('[Focus Refresh] App gained focus, triggering immediate price update.');
            updatePrices(true); // Force a refresh
          }
        }, [isAppActive]);
        ```

#### **Step 3.2: Modify `src/electron/main.ts` for Robust Visibility Events**

The main process already sends `focus` and `blur` events. We need to ensure it also correctly signals focus when the window is shown via the global hotkey.

1.  **Enhance `toggleWindow` function:**
    -   In the `toggleWindow` function, when the window is made visible (`mainWindow.show()`), immediately send the `window-focused` IPC event to the renderer process.

        ```typescript
        // Inside main.ts, within the toggleWindow function
        const toggleWindow = () => {
          if (!mainWindow) return;
          if (mainWindow.isVisible()) {
            mainWindow.hide();
            // Optional: Send blur event when hidden by hotkey
            mainWindow.webContents.send('window-blurred');
          } else {
            mainWindow.show();
            mainWindow.focus();
            // CRITICAL: Send focus event immediately on show
            mainWindow.webContents.send('window-focused');
          }
        };
        ```

#### **Step 3.3: Enhance UI for Better User Feedback**

To give the user a "live" feeling, we can provide subtle feedback when data is refreshed in the background.

1.  **Add a `lastRefreshedTimestamp` to `CryptoContext`:**
    -   Create a new state in `CryptoContext.tsx` that updates every time a successful API fetch occurs.
        ```typescript
        const [lastRefreshedTimestamp, setLastRefreshedTimestamp] = useState<Date | null>(null);
        ```
    -   In the `processBatchRequests` function, after successfully setting new prices, update this timestamp:
        ```typescript
        // Inside processBatchRequests, after setPrices(...)
        setLastRefreshedTimestamp(new Date());
        ```
    -   Expose `lastRefreshedTimestamp` through the context provider's value.

2.  **Update `LiveTimeAgo.tsx`:**
    -   Modify the `LiveTimeAgo` component to accept the new `lastRefreshedTimestamp`.
    -   Add a visual effect (like a brief color flash) that triggers whenever the timestamp changes, indicating that fresh data has just arrived.

        ```typescript
        // In LiveTimeAgo.tsx
        const TimeWrapper = styled.span`
          &.refreshed {
            transition: color 0.1s ease-in-out;
            color: #a78bfa; // Flash color
            animation: fadeOutColor 1.5s forwards;
          }

          @keyframes fadeOutColor {
            from { color: #a78bfa; }
            to { color: inherit; }
          }
        `;

        // Inside the component...
        const [refreshed, setRefreshed] = useState(false);

        useEffect(() => {
          // When the lastRefreshedTimestamp prop changes...
          setRefreshed(true);
          const timer = setTimeout(() => setRefreshed(false), 1500);
          return () => clearTimeout(timer);
        }, [lastRefreshedTimestamp]); // Depend on the new prop

        return <TimeWrapper className={refreshed ? 'refreshed' : ''}>{timeAgo}</TimeWrapper>;
        ```
    -   In `Header.tsx`, pass the new `lastRefreshedTimestamp` to the `<LiveTimeAgo />` component.

---

### 4. Summary for Cursor AI

This plan transitions the application from a simple, inefficient polling system to a modern, event-driven architecture. By leveraging window focus/blur events and intelligent, conditional polling, the app will provide users with up-to-date information precisely when they need it, while conserving API resources when the app is idle. The subtle UI feedback on data refresh will significantly enhance the perceived "liveness" and quality of the application. Following best coding practices, vibe coding, and keeping in mind using the free CoinGecko API. 