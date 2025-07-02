import { useEffect, useRef, memo, useState } from 'react';
import styled from 'styled-components';
import { TradingViewMarket } from '../constants/cryptoConstants';

const WidgetContainer = styled.div`
  height: 100%;
  width: 100%;
  min-height: 450px;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  position: relative;

  .tradingview-widget-container {
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .tradingview-widget-container__widget {
    height: 100%;
    width: 100%;
    background: transparent;
  }
`;

const ErrorContainer = styled.div`
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

const RefContainer = styled.div`
  height: 100%;
  width: 100%;
`;

interface TechnicalAnalysisWidgetProps {
  cryptoId: string;
  market?: TradingViewMarket;
  interval?: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1D' | '1W' | '1M';
  currency?: string;
}

function TechnicalAnalysisWidget({ 
  cryptoId, 
  market = 'MEXC', 
  interval = '1h',
  currency = 'USD'
}: TechnicalAnalysisWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null); // Ref for script cleanup
  const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for timeout cleanup
  const [error, setError] = useState<string | null>(null);
  const widgetKey = `${market}-${cryptoId}-${interval}-${currency}`; // Unique key

  useEffect(() => {
    const cleanupWidget = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (scriptRef.current && scriptRef.current.parentNode) {
        scriptRef.current.parentNode.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      setError(null);
    };

    // Ensure ref is available
    if (!containerRef.current) {
        console.warn('TechnicalAnalysisWidget container ref not ready yet.');
        return;
    }

    // Run cleanup first
    cleanupWidget();

    // Create unique target container
    const widgetTargetId = `technalysis-widget-${widgetKey}`;
    const widgetInnerContainer = document.createElement('div');
    widgetInnerContainer.id = widgetTargetId;
    widgetInnerContainer.style.height = '100%';
    widgetInnerContainer.style.width = '100%';
    containerRef.current.appendChild(widgetInnerContainer);

    // Handle different market symbol formats
    let symbol;
    if (market === 'PYTH') {
      symbol = `BINANCE:${cryptoId}USDT`; // Using BINANCE for better compatibility
    } else if (market === 'CRYPTO') {
      symbol = `CRYPTO:${cryptoId}${currency}`;
    } else if (market === 'BYBIT') {
      symbol = `BYBIT:${cryptoId}USDT`;
    } else {
      symbol = `${market}:${cryptoId}USDT`;
    }
    
    console.log(`[TechnicalAnalysisWidget] Attempting to load TradingView symbol: ${symbol}`);

    try {
      // Create script element
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
      script.type = 'text/javascript';
      script.async = true;
      scriptRef.current = script; // Store ref for cleanup

      const widgetConfig = {
        "interval": interval,
        "width": "100%",
        "isTransparent": true,
        "height": "100%",
        "symbol": symbol,
        "showIntervalTabs": true,
        "locale": "en",
        "colorTheme": "dark",
        "displayMode": "single",
        "container_id": widgetTargetId // Target the unique container
      };

      script.innerHTML = JSON.stringify(widgetConfig);

      // Add error handling
      script.onerror = () => {
        setError('Failed to load technical analysis script');
        console.error('Failed to load TradingView script for technical analysis');
      };

      // Defer appending script
      timeoutRef.current = setTimeout(() => {
        if (widgetInnerContainer.isConnected) {
          widgetInnerContainer.appendChild(script);
        }
      }, 0);

    } catch (err) {
      console.error('Error initializing technical analysis widget:', err);
      setError('Failed to initialize technical analysis');
    }

    // Cleanup function for useEffect
    return cleanupWidget;

  }, [cryptoId, market, interval, currency, widgetKey]);

  return (
    <WidgetContainer>
      <RefContainer ref={containerRef} />
      {error && <ErrorContainer>{error}</ErrorContainer>}
    </WidgetContainer>
  );
}

export default memo(TechnicalAnalysisWidget); 