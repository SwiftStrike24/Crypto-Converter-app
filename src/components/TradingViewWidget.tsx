import { useEffect, useRef, memo, useState } from 'react';
import styled from 'styled-components';

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
  market?: 'BINANCE' | 'MEXC' | 'PYTH';
  currency?: string;
}

function TradingViewWidget({ cryptoId, timeframe = '1D', market = 'BINANCE', currency = 'USD' }: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgetKey = `${market}-${cryptoId}-${timeframe}-${currency}`;

  useEffect(() => {
    const cleanupWidget = () => {
      if (container.current) {
        // Remove all child elements
        while (container.current.firstChild) {
          container.current.removeChild(container.current.firstChild);
        }
      }
      if (scriptRef.current && scriptRef.current.parentNode) {
        scriptRef.current.parentNode.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
      setError(null);

      // Remove any existing TradingView widgets
      const existingWidgets = document.querySelectorAll('.tradingview-widget-container__widget');
      existingWidgets.forEach(widget => widget.remove());
    };

    if (!container.current) return cleanupWidget;

    cleanupWidget();

    // Create widget container elements
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    container.current.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    // Handle different market symbol formats
    let symbol;
    if (market === 'PYTH') {
      symbol = `PYTH:${cryptoId}USD|${timeframe}|${currency}`;
    } else {
      symbol = `${market}:${cryptoId}USDT|${timeframe}|${currency}`;
    }
    
    console.log(`🔄 Loading ${symbol} chart...`);

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
      "container_id": `tv-${widgetKey}`
    };

    script.innerHTML = JSON.stringify(widgetConfig);
    scriptRef.current = script;

    // Add error detection
    const errorHandler = (event: ErrorEvent) => {
      if (event.message?.includes('invalid symbol') || 
          event.message?.includes('Cannot read properties')) {
        console.error(`❌ ${market} market failed for ${cryptoId}:`, event.message);
        setError(`${cryptoId} is not available on ${market}`);
      }
    };

    window.addEventListener('error', errorHandler);
    container.current.appendChild(script);

    script.onerror = () => {
      console.error('Failed to load TradingView widget script');
      setError('Failed to load chart data');
    };

    return () => {
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