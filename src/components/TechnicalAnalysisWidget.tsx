import { useEffect, useRef, memo, useState } from 'react';
import styled from 'styled-components';

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
  market?: 'BINANCE' | 'MEXC' | 'PYTH';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    
    const initWidget = () => {
      if (!containerRef.current) return;

      // Clear previous content
      containerRef.current.innerHTML = '';

      // Create the exact DOM structure
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'tradingview-widget-container';

      const widgetDiv = document.createElement('div');
      widgetDiv.className = 'tradingview-widget-container__widget';
      widgetContainer.appendChild(widgetDiv);

      // Handle different market symbol formats
      let symbol;
      if (market === 'PYTH') {
        symbol = `BINANCE:${cryptoId}USDT`; // Using BINANCE for better compatibility
      } else {
        symbol = `${market}:${cryptoId}USDT`;
      }
      
      console.log(`🔄 Loading Technical Analysis for ${symbol}...`);

      try {
        // Create and load script
        script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
        script.type = 'text/javascript';
        script.async = true;

        const widgetConfig = {
          "interval": interval,
          "width": "100%",
          "isTransparent": true,
          "height": "100%",
          "symbol": symbol,
          "showIntervalTabs": true,
          "locale": "en",
          "colorTheme": "dark",
          "displayMode": "single"
        };

        script.innerHTML = JSON.stringify(widgetConfig);
        widgetContainer.appendChild(script);

        // Add error handling
        script.onerror = () => {
          setError('Failed to load technical analysis');
          console.error('Failed to load TradingView script');
        };

        // Append the complete structure to the container
        containerRef.current.appendChild(widgetContainer);

      } catch (err) {
        console.error('Error initializing widget:', err);
        setError('Failed to initialize technical analysis');
      }
    };

    // Initialize widget
    initWidget();

    // Cleanup
    return () => {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [cryptoId, market, interval, currency]);

  return (
    <WidgetContainer>
      <RefContainer ref={containerRef} />
      {error && <ErrorContainer>{error}</ErrorContainer>}
    </WidgetContainer>
  );
}

export default memo(TechnicalAnalysisWidget); 