### Plan: Dynamic Exchange Switching for TradingView Widget

**Objective:** Implement an automated system that detects when a cryptocurrency is not supported on the selected TradingView exchange and dynamically cycles through a list of other exchanges until a working one is found.

---

#### 1. The Problem

The `TradingViewWidget` currently displays an "Invalid symbol" error when a selected token is not available on the chosen exchange (e.g., trying to view a token on 'MEXC' that is only listed on 'BINANCE'). The user has to manually switch exchanges. This plan automates that process.

#### 2. Core Strategy

The implementation will be a closed-loop system within the `ChartPage`:

1.  **State Management:** `ChartPage.tsx` will manage the list of available exchanges and the index of the currently attempted exchange.
2.  **Error Detection:** `TradingViewWidget.tsx` will be enhanced to reliably detect the "Invalid symbol" state from the widget. Instead of relying on global error listeners, it will use a `MutationObserver` to watch for the specific error message appearing in the DOM.
3.  **Callback Mechanism:** When the error is detected, `TradingViewWidget.tsx` will invoke a new `onSymbolError` callback prop.
4.  **Automatic Cycling:** `ChartPage.tsx` will receive the callback, increment its exchange index, and re-render the widget with the next exchange in the list. This cycle continues until a valid exchange is found or all exchanges have been tried.

---

#### 3. Detailed Implementation Steps for Cursor AI

##### Step 3.1: Enhance `TradingViewWidget.tsx` for Robust Error Detection

The goal is to reliably detect when the widget fails to load a symbol and communicate this back to the parent component.

1.  **Add `onSymbolError` Prop:**
    -   Add a new optional prop to the `TradingViewWidgetProps` interface:
        ```typescript
        interface TradingViewWidgetProps {
          // ... existing props
          onSymbolError?: () => void;
        }
        ```
    -   Destructure it in the component function: `({ ..., onSymbolError })`.

2.  **Implement `MutationObserver`:**
    -   Inside the main `useEffect`, after the widget script is created and appended, set up a `MutationObserver` to watch the `container.current` element for changes.
    -   The observer's callback will check if any added nodes contain the text "Invalid symbol" or if the widget's internal error message container appears.

    ```typescript
    // Inside the useEffect in TradingViewWidget.tsx

    // ... after script is configured ...

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          let invalidSymbolFound = false;
          mutation.addedNodes.forEach((node) => {
            // The widget might render the error in various ways. Check for text content.
            if (node.textContent && node.textContent.includes('Invalid symbol')) {
              invalidSymbolFound = true;
            }
            // Also check for specific classes TradingView might use for errors.
            // This requires inspecting the DOM when the error occurs. A plausible class name:
            if (node.nodeType === 1 && (node as HTMLElement).querySelector('.tv-widget-error-message')) {
               invalidSymbolFound = true;
            }
          });

          if (invalidSymbolFound) {
            console.log(`[TradingViewWidget] Detected 'Invalid symbol' for ${cryptoId} on ${market}. Firing onSymbolError.`);
            onSymbolError?.();
            observer.disconnect(); // Stop observing once the error is found.
            break;
          }
        }
      }
    });

    // Start observing the container for child node changes.
    if (container.current) {
      observer.observe(container.current, { childList: true, subtree: true });
    }

    // In the useEffect cleanup function, ensure the observer is disconnected.
    return () => {
      observer.disconnect();
      // ... existing cleanup ...
    };
    ```

##### Step 3.2: Update `ChartPage.tsx` to Manage the Switching Logic

This component will now orchestrate the exchange cycling.

1.  **Add State for Exchange Cycling:**
    -   Create state to track the current exchange being tried and the list of exchanges.
        ```typescript
        // At the top of ChartPage component
        const [currentMarketIndex, setCurrentMarketIndex] = useState(0);
        const [lastAttemptedCryptoId, setLastAttemptedCryptoId] = useState<string | null>(null);
        const [finalError, setFinalError] = useState<string | null>(null);

        const currentMarket = SUPPORTED_TRADING_VIEW_MARKETS[currentMarketIndex];
        ```

2.  **Reset Logic:**
    -   Use a `useEffect` to reset the `currentMarketIndex` to `0` whenever the user selects a new `cryptoId`. This ensures the search for a valid exchange starts from the beginning for each new token.

    ```typescript
    // In ChartPage.tsx
    useEffect(() => {
      // If the cryptoId changes, reset the search process.
      if (cryptoId !== lastAttemptedCryptoId) {
        console.log(`New cryptoId '${cryptoId}'. Resetting exchange search.`);
        setCurrentMarketIndex(0);
        setFinalError(null);
        setLastAttemptedCryptoId(cryptoId);
      }
    }, [cryptoId, lastAttemptedCryptoId]);
    ```

3.  **Implement the `onSymbolError` Callback:**
    -   Define the function that will be passed to `TradingViewWidget`. This function will contain the core switching logic.

    ```typescript
    // In ChartPage.tsx
    const handleSymbolError = useCallback(() => {
      console.log(`Symbol error on exchange index ${currentMarketIndex} (${SUPPORTED_TRADING_VIEW_MARKETS[currentMarketIndex]}). Trying next.`);
      
      if (currentMarketIndex < SUPPORTED_TRADING_VIEW_MARKETS.length - 1) {
        // There are more exchanges to try.
        setCurrentMarketIndex(prevIndex => prevIndex + 1);
      } else {
        // We've tried all exchanges and none worked.
        console.error(`'${cryptoId}' is not supported on any of the available exchanges.`);
        setFinalError(`'${cryptoId}' is not available on any supported exchange.`);
      }
    }, [currentMarketIndex, cryptoId]);
    ```

4.  **Update the `TradingViewWidget` Component Usage:**
    -   Pass the new state and the callback to the `TradingViewWidget`.

    ```jsx
    // In ChartPage.tsx's return statement

    {finalError ? (
      <ErrorMessage>{finalError}</ErrorMessage>
    ) : (
      <TradingViewWidget
        key={`${cryptoId}-${currentMarket}`} // Add key to force re-mount on exchange change
        cryptoId={cryptoId}
        market={currentMarket}
        currency={currency}
        onSymbolError={handleSymbolError}
      />
    )}
    ```

##### Step 3.3: (Optional but Recommended) Apply to `TechnicalAnalysisPage.tsx`

The same logic should be applied to `TechnicalAnalysisPage.tsx` and its use of `TechnicalAnalysisWidget.tsx` to ensure consistent behavior across the application.

1.  Add `onSymbolError` prop to `TechnicalAnalysisWidget.tsx` and implement the `MutationObserver` logic, just like in `TradingViewWidget.tsx`.
2.  Add the state management (`currentMarketIndex`, etc.) and the `handleSymbolError` callback to `TechnicalAnalysisPage.tsx`.
3.  Update the `TechnicalAnalysisWidget` component usage in `TechnicalAnalysisPage.tsx` to include the `key` and `onSymbolError` prop.
