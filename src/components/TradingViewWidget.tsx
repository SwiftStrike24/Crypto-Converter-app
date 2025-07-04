import { useEffect, useRef, memo, useState } from 'react';
import styled from 'styled-components';
import { TradingViewMarket } from '../constants/cryptoConstants';

const WidgetContainer = styled.div`
  height: 100%;
  width: 100%;
  min-height: 400px;
  background: #111111;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
  position: relative;

  .tradingview-widget-container {
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .tradingview-widget-container__widget {
    height: calc(100% - 32px);
    width: 100%;
    background: #111111;
  }

  .tradingview-widget-copyright {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 32px;
    text-align: center;
    vertical-align: middle;
    font-style: normal;
    padding: 0 8px;
    background: #111111;
    z-index: 10;
    
    a {
      color: #8b5cf6;
      text-decoration: none;
      font-size: 13px;
      
      &:hover {
        text-decoration: underline;
      }
      
      .blue-text {
        color: #8b5cf6;
      }
    }
  }
`;

const ErrorMessage = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 1rem 2rem;
  border-radius: 8px;
  color: #f7525f;
  font-size: 0.9rem;
  text-align: center;
  border: 1px solid rgba(247, 82, 95, 0.3);
  backdrop-filter: blur(4px);
  z-index: 100;
`;

interface TradingViewWidgetProps {
  cryptoId: string;
  timeframe?: string;
  market?: TradingViewMarket;
  currency?: string;
}

function TradingViewWidget({ cryptoId, timeframe = '1D', market = 'PYTH', currency = 'USD' }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgetKey = `${market}-${cryptoId}-${timeframe}-${currency}`;

  useEffect(() => {
    console.log(`[TradingViewWidget.tsx] useEffect triggered for widgetKey: ${widgetKey}`);
    const cleanupWidget = () => {
      if (container.current) {
        console.log('[TradingViewWidget.tsx] Cleaning up widget container.');
        // More aggressively clear the container
        container.current.innerHTML = ''; 
      }
      if (scriptRef.current && scriptRef.current.parentNode) {
        console.log('[TradingViewWidget.tsx] Removing old widget script.');
        scriptRef.current.parentNode.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
      setError(null);

      // Remove any existing TradingView widget containers created by the script
      // (Doing this after clearing innerHTML might be redundant but safe)
      const existingWidgets = document.querySelectorAll('.tradingview-widget-container__widget');
      existingWidgets.forEach(widget => widget.remove());
    };

    if (!container.current) {
        // If the container ref isn't ready yet, return early and let the effect re-run
        console.warn('TradingView container ref not ready yet.');
        return;
    }

    // Ensure cleanup runs FIRST
    cleanupWidget();

    // Create dedicated container for the script to target
    // This gives the script a predictable element ID to find
    const widgetTargetId = `tradingview-widget-${widgetKey}`;
    const widgetInnerContainer = document.createElement('div');
    widgetInnerContainer.id = widgetTargetId;
    widgetInnerContainer.style.height = '100%'; // Ensure it takes up space
    widgetInnerContainer.style.width = '100%';
    container.current.appendChild(widgetInnerContainer);
    console.log(`[TradingViewWidget.tsx] Created new inner container with ID: ${widgetTargetId}`);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    // Handle different market symbol formats
    let symbol;
    if (market === 'PYTH') {
      symbol = `PYTH:${cryptoId}USD|${timeframe}|${currency}`;
    } else if (market === 'CRYPTO') {
      symbol = `CRYPTO:${cryptoId}USD|${timeframe}|${currency}`;
    } else if (market === 'BYBIT') {
      symbol = `BYBIT:${cryptoId}USDT|${timeframe}|${currency}`;
    } else {
      symbol = `${market}:${cryptoId}USDT|${timeframe}|${currency}`;
    }
    
    console.log(`[TradingViewWidget] Attempting to load TradingView symbol: ${symbol}`);

    const widgetConfig = {
      "symbols": [[symbol]],
      "chartOnly": false,
      "width": "100%",
      "height": "100%",
      "locale": "en",
      "colorTheme": "dark",
      "autosize": true,
      "showVolume": false,
      "showMA": false,
      "hideDateRanges": false,
      "hideMarketStatus": false,
      "hideSymbolLogo": false,
      "scalePosition": "right",
      "scaleMode": "Normal",
      "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      "fontSize": "10",
      "noTimeScale": false,
      "valuesTracking": "2",
      "changeMode": "price-and-percent",
      "chartType": "area",
      "lineWidth": 2,
      "lineType": 0,
      "dateRanges": [
        "1d|1",
        "1w|15",
        "1m|30",
        "3m|60",
        "12m|1D",
        "60m|1W",
        "all|1M"
      ],
      "timeHoursFormat": "12-hours",
      "timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "withdateranges": true,
      "upColor": "#22ab94",
      "downColor": "#f7525f",
      "container_id": widgetTargetId // Use the generated ID
    };

    script.innerHTML = JSON.stringify(widgetConfig);
    scriptRef.current = script;
    console.log('[TradingViewWidget.tsx] Widget config created:', widgetConfig);

    // Add error detection
    const errorHandler = (event: ErrorEvent) => {
      if (event.message?.includes('invalid symbol') || 
          event.message?.includes('Cannot read properties')) {
        console.error(`❌ ${market} market failed for ${cryptoId}:`, event.message);
        setError(`${cryptoId} is not available on ${market}`);
      }
    };

    window.addEventListener('error', errorHandler);

    // Append script slightly deferred to ensure DOM is ready
    const timerId = setTimeout(() => {
        // Check if container still exists before appending
        if (widgetInnerContainer.isConnected) { 
            console.log('[TradingViewWidget.tsx] Appending script to container.');
            widgetInnerContainer.appendChild(script);
        }
    }, 0);

    script.onerror = () => {
      console.error('Failed to load TradingView widget script');
      setError('Failed to load chart data');
    };

    return () => {
      console.log(`[TradingViewWidget.tsx] Cleanup function called for widgetKey: ${widgetKey}`);
      clearTimeout(timerId); // Clear timeout on cleanup
      window.removeEventListener('error', errorHandler);
      cleanupWidget();
    };
  }, [cryptoId, timeframe, market, currency, widgetKey]);

  return (
    <WidgetContainer>
      <div className="tradingview-widget-container" ref={container}>
        <div className="tradingview-widget-copyright">
          <a href="https://www.tradingview.com/" rel="noopener noreferrer" target="_blank">
            <span className="blue-text">Powered by TradingView</span>
          </a>
        </div>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </WidgetContainer>
  );
}

export default memo(TradingViewWidget); 