import { useEffect, useRef, useState, memo } from 'react';
import styled from 'styled-components';

// Heatmap widget configuration types
export type HeatmapType = 'stock' | 'crypto' | 'etf';

interface HeatmapConfig {
  dataSource?: string;
  blockSize?: string;
  blockColor?: string;
  grouping?: string;
  locale?: string;
  symbolUrl?: string;
  colorTheme?: string;
  hasTopBar?: boolean;
  isDataSetEnabled?: boolean;
  isZoomEnabled?: boolean;
  hasSymbolTooltip?: boolean;
  isMonoSize?: boolean;
  width?: string;
  height?: string;
}

interface TradingViewHeatmapWidgetProps {
  type: HeatmapType;
  height?: string | number;
  isTransparent?: boolean;
}

// Configuration for each heatmap type
const HEATMAP_CONFIGS: Record<HeatmapType, { scriptSrc: string; config: HeatmapConfig }> = {
  stock: {
    scriptSrc: 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js',
    config: {
      dataSource: 'SPX500',
      blockSize: 'market_cap_basic',
      blockColor: 'change',
      grouping: 'sector',
      locale: 'en',
      symbolUrl: '',
      colorTheme: 'dark',
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: '100%',
      height: '100%'
    }
  },
  crypto: {
    scriptSrc: 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js',
    config: {
      dataSource: 'Crypto',
      blockSize: 'market_cap_calc',
      blockColor: '24h_close_change|5',
      locale: 'en',
      symbolUrl: '',
      colorTheme: 'dark',
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: '100%',
      height: '100%'
    }
  },
  etf: {
    scriptSrc: 'https://s3.tradingview.com/external-embedding/embed-widget-etf-heatmap.js',
    config: {
      dataSource: 'AllUSEtf',
      blockSize: 'volume',
      blockColor: 'change',
      grouping: 'asset_class',
      locale: 'en',
      symbolUrl: '',
      colorTheme: 'dark',
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: '100%',
      height: '100%'
    }
  }
};

// Styled components
const WidgetContainer = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
  background: transparent;
`;

const WidgetContainerInner = styled.div<{ $isLoading: boolean }>`
  width: 100%;
  height: 100%;
  opacity: ${props => props.$isLoading ? 0.3 : 1};
  transition: opacity 0.3s ease;
`;

const LoadingOverlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  display: ${props => (props.$visible ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;

const LoadingText = styled.div`
  color: #a0a0a0;
  font-size: 0.9rem;
`;


const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #ef4444;
  font-size: 0.9rem;
  text-align: center;
  padding: 1rem;
`;

const ErrorMessage = styled.div`
  margin-bottom: 1rem;
  font-weight: 500;
`;

const RetryButton = styled.button`
  padding: 8px 16px;
  background: #8b5cf6;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: #7c3aed;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

function TradingViewHeatmapWidget({
  type,
  height = '100%',
  isTransparent = true
}: TradingViewHeatmapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const error = useRef<string | null>(null);
  const isLoading = useRef<boolean>(true);
  const [, forceRender] = useState(0);
  const observerRef = useRef<MutationObserver | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);
  const hasMarkedLoadedRef = useRef<boolean>(false);

  const config = HEATMAP_CONFIGS[type];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    hasMarkedLoadedRef.current = false;

    const cleanup = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (scriptRef.current && scriptRef.current.parentNode) {
        try {
          scriptRef.current.parentNode.removeChild(scriptRef.current);
        } catch (e) {
          console.warn('[HeatmapWidget] Error removing script during cleanup:', e);
        }
        scriptRef.current = null;
      }
      if (containerRef.current && mountedRef.current) {
        try {
          containerRef.current.innerHTML = '';
        } catch (e) {
          console.warn('[HeatmapWidget] Error clearing container during cleanup:', e);
        }
      }
      try {
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
      } catch {}
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (safetyTimeoutRef.current) {
        window.clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };

    const markLoadedOnce = () => {
      if (!mountedRef.current) return;
      if (hasMarkedLoadedRef.current) return;
      hasMarkedLoadedRef.current = true;
      error.current = null;
      isLoading.current = false;
      forceRender(n => n + 1);
    };

    const loadWidget = async () => {
      if (!containerRef.current || !mountedRef.current) return;

      try {
        error.current = null;
        isLoading.current = true;
        forceRender(n => n + 1);

        // Add small delay to prevent rapid successive loads
        await new Promise(resolve => setTimeout(resolve, 50));

        if (isCancelled || !mountedRef.current) return;

        cleanup();

        const inner = document.createElement('div');
        inner.style.height = typeof height === 'number' ? `${height}px` : height;
        inner.style.width = '100%';
        inner.style.position = 'relative';

        if (!containerRef.current || !mountedRef.current) return;

        containerRef.current.appendChild(inner);

        // Observe DOM changes to detect when TradingView injects the widget
        try {
          observerRef.current?.disconnect();
        } catch {}
        observerRef.current = new MutationObserver(() => {
          const hasWidget = inner.querySelector('iframe, .tradingview-widget-container__widget');
          if (hasWidget) {
            observerRef.current?.disconnect();
            observerRef.current = null;
            markLoadedOnce();
          }
        });
        observerRef.current.observe(inner, { childList: true, subtree: true });

        // Polling fallback in case MutationObserver misses the injection
        if (pollIntervalRef.current) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        pollIntervalRef.current = window.setInterval(() => {
          const hasWidget = inner.querySelector('iframe, .tradingview-widget-container__widget');
          if (hasWidget) {
            if (pollIntervalRef.current) {
              window.clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            markLoadedOnce();
          }
        }, 500);

        // Safety timeout to avoid lingering loading overlay even if detection fails
        if (safetyTimeoutRef.current) {
          window.clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
        safetyTimeoutRef.current = window.setTimeout(() => {
          markLoadedOnce();
        }, 6000);

        const script = document.createElement('script');
        script.src = config.scriptSrc;
        script.type = 'text/javascript';
        script.async = true;
        script.crossOrigin = 'anonymous';
        scriptRef.current = script;

        // Create widget configuration with optional transparency
        const widgetConfig = {
          ...config.config,
          ...(isTransparent && { colorTheme: 'dark' })
        };

        script.innerHTML = JSON.stringify(widgetConfig);

        script.onerror = (e) => {
          if (mountedRef.current) {
            console.error(`[HeatmapWidget] Failed to load ${type} heatmap:`, e);
            error.current = `Failed to load ${type} heatmap`;
            isLoading.current = false;
            // Force a re-render to update loading state
            forceRender((n) => n + 1);
          }
        };

        script.onload = () => {
          if (mountedRef.current) {
            isLoading.current = false;
            console.log(`[HeatmapWidget] Successfully loaded ${type} heatmap`);
            // Force UI to update so LoadingOverlay hides even if embed doesn't trigger further DOM changes
            forceRender((n) => n + 1);
          }
        };

        if (!isCancelled && mountedRef.current && inner.isConnected) {
          timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && inner.isConnected) {
              inner.appendChild(script);
            }
          }, 100); // Increased delay for stability
        }

      } catch (loadError) {
        if (mountedRef.current) {
          console.error(`[HeatmapWidget] Error loading ${type} heatmap:`, loadError);
          error.current = `Error loading ${type} heatmap: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`;
          isLoading.current = false;
          forceRender(n => n + 1);
        }
      }
    };

    loadWidget();

    return () => {
      isCancelled = true;
      cleanup();
    };
  }, [type, height, isTransparent]);

  if (error.current) {
    return (
      <WidgetContainer>
        <ErrorContainer>
          <ErrorMessage>⚠️ {error.current}</ErrorMessage>
          <RetryButton onClick={() => window.location.reload()}>
            Retry
          </RetryButton>
        </ErrorContainer>
      </WidgetContainer>
    );
  }

  return (
    <WidgetContainer>
      <LoadingOverlay $visible={isLoading.current}>
        <LoadingText>Loading {type} heatmap...</LoadingText>
      </LoadingOverlay>
      <WidgetContainerInner
        className="tradingview-widget-container"
        ref={containerRef}
        $isLoading={isLoading.current}
      />
    </WidgetContainer>
  );
}

export default memo(TradingViewHeatmapWidget);
