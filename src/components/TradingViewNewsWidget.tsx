import { useEffect, useRef, useState, memo } from 'react';
import styled from 'styled-components';

const ATTRIBUTION_HEIGHT_PX = 28;

const WidgetContainer = styled.div`
  height: 100%;
  width: 100%;
  min-height: 420px;
  background: transparent;
  border-radius: 16px;
  overflow: hidden;
  position: relative;

  .tradingview-widget-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: ${ATTRIBUTION_HEIGHT_PX}px; /* leave room for attribution so content isn't covered */
    height: auto;
    width: auto;
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

const PoweredBy = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  line-height: ${ATTRIBUTION_HEIGHT_PX}px;
  text-align: center;
  background: transparent;
  font-size: 12px;

  a { color: #8b5cf6; text-decoration: none; }
`;

export type TradingViewNewsFeedMode = 'symbol' | 'market';

interface TradingViewNewsWidgetProps {
  feedMode?: TradingViewNewsFeedMode; // default 'symbol'
  tvSymbol?: string; // required when feedMode = 'symbol'
  market?: 'crypto' | 'stocks' | string; // when feedMode = 'market', default 'crypto'
  isTransparent?: boolean;
  height?: number | string;
  displayMode?: 'regular' | 'compact';
}

function TradingViewNewsWidget({
  feedMode = 'symbol',
  tvSymbol,
  market = 'crypto',
  isTransparent = true,
  height = '100%',
  displayMode = 'regular',
}: TradingViewNewsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanup = () => {
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

    if (!containerRef.current) {
      return;
    }

    cleanup();

    const inner = document.createElement('div');
    inner.style.height = typeof height === 'number' ? `${height}px` : height; // usually '100%'
    inner.style.width = '100%';
    containerRef.current.appendChild(inner);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
    script.type = 'text/javascript';
    script.async = true;
    scriptRef.current = script;

    const base: any = {
      displayMode,
      colorTheme: 'dark',
      isTransparent,
      locale: 'en',
      width: '100%',
      height: '100%'
    };

    if (feedMode === 'market') {
      base.feedMode = 'market';
      base.market = market;
    } else {
      base.feedMode = 'symbol';
      base.symbol = tvSymbol || 'CRYPTO:BTC';
    }

    script.innerHTML = JSON.stringify(base);
    script.onerror = () => setError('Failed to load TradingView news');

    timeoutRef.current = setTimeout(() => {
      if (inner.isConnected) {
        inner.appendChild(script);
      }
    }, 0);

    return cleanup;
  }, [feedMode, tvSymbol, market, isTransparent, height, displayMode]);

  const isTopStories = feedMode === 'market';
  const attributionHref = isTopStories
    ? 'https://www.tradingview.com/news-flow/?priority=top_stories'
    : 'https://www.tradingview.com/';
  const attributionText = isTopStories ? 'Top stories by TradingView' : 'Powered by TradingView';

  return (
    <WidgetContainer>
      <div className="tradingview-widget-container" ref={containerRef} />
      <PoweredBy>
        <a href={attributionHref} target="_blank" rel="noopener noreferrer nofollow">{attributionText}</a>
      </PoweredBy>
      {error && <ErrorContainer>{error}</ErrorContainer>}
    </WidgetContainer>
  );
}

export default memo(TradingViewNewsWidget);
