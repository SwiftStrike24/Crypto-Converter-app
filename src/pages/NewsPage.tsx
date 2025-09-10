import React, { useCallback, useEffect, useRef, useState, ErrorInfo } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiRefreshCw } from 'react-icons/fi';
import NewsCard from '../components/NewsCard';
import LiveTimeAgo from '../components/LiveTimeAgo';
import WaveLoadingPlaceholder from '../components/WaveLoadingPlaceholder';
import { useNews } from '../context/NewsContext';
import TradingViewNewsWidget from '../components/TradingViewNewsWidget';

// Enhanced Economic Calendar Widget Component with robust error handling
const EconomicCalendarWidget: React.FC<{ country: 'us' | 'ca' }> = ({ country }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const cleanup = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (scriptRef.current && scriptRef.current.parentNode) {
        try {
          scriptRef.current.parentNode.removeChild(scriptRef.current);
        } catch (e) {
          console.warn('Error removing script during cleanup:', e);
        }
        scriptRef.current = null;
      }
      if (containerRef.current && mountedRef.current) {
        try {
          containerRef.current.innerHTML = '';
        } catch (e) {
          console.warn('Error clearing container during cleanup:', e);
        }
      }
    };

    const loadWidget = async () => {
      if (!containerRef.current || !mountedRef.current) return;

      try {
        setError(null);
        setIsLoading(true);

        // Add small delay to prevent rapid successive loads
        await new Promise(resolve => setTimeout(resolve, 50));

        if (isCancelled || !mountedRef.current) return;

        cleanup();

        const inner = document.createElement('div');
        inner.style.height = '100%';
        inner.style.width = '100%';
        inner.style.position = 'relative';

        if (!containerRef.current || !mountedRef.current) return;

        containerRef.current.appendChild(inner);

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
        script.type = 'text/javascript';
        script.async = true;
        script.crossOrigin = 'anonymous';
        scriptRef.current = script;

        const config = {
          colorTheme: 'dark',
          isTransparent: false,
          locale: 'en',
          countryFilter: country,
          importanceFilter: '-1,0,1',
          width: '100%',
          height: '100%'
        };

        script.innerHTML = JSON.stringify(config);

        script.onerror = (e) => {
          if (mountedRef.current) {
            console.error(`Failed to load TradingView economic calendar for ${country}:`, e);
            setError(`Failed to load calendar for ${country === 'us' ? 'United States' : 'Canada'}`);
            setIsLoading(false);
          }
        };

        script.onload = () => {
          if (mountedRef.current) {
            setIsLoading(false);
          }
        };

        if (!isCancelled && mountedRef.current && inner.isConnected) {
          timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && inner.isConnected) {
              inner.appendChild(script);
            }
          }, 100); // Increased delay for stability
        }

      } catch (error) {
        if (mountedRef.current) {
          console.error(`Error loading economic calendar for ${country}:`, error);
          setError(`Error loading calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setIsLoading(false);
        }
      }
    };

    loadWidget();

    return () => {
      isCancelled = true;
      cleanup();
    };
  }, [country]);

  if (error) {
    return (
      <EconomicWidgetContainer>
        <EconomicErrorContainer>
          <EconomicErrorIcon>⚠️</EconomicErrorIcon>
          <EconomicErrorMessage>{error}</EconomicErrorMessage>
          <EconomicRetryButton onClick={() => window.location.reload()}>
            Retry
          </EconomicRetryButton>
        </EconomicErrorContainer>
        <EconomicAttribution>
          <a href="https://www.tradingview.com/economic-calendar/" target="_blank" rel="noopener noreferrer nofollow">
            Economic calendar by TradingView
          </a>
        </EconomicAttribution>
      </EconomicWidgetContainer>
    );
  }

  return (
    <EconomicWidgetContainer>
      {isLoading && (
        <LoadingOverlay>
          <WaveLoadingPlaceholder width="120px" height="24px" />
        </LoadingOverlay>
      )}
      <WidgetContainer
        className="tradingview-widget-container"
        ref={containerRef}
        $isLoading={isLoading}
      />
      <EconomicAttribution>
        <a href="https://www.tradingview.com/economic-calendar/" target="_blank" rel="noopener noreferrer nofollow">
          Economic calendar by TradingView
        </a>
      </EconomicAttribution>
    </EconomicWidgetContainer>
  );
};

// Memoized Economic Calendar Widget for performance optimization
const MemoizedEconomicCalendarWidget = React.memo(EconomicCalendarWidget);

const PageContainer = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at bottom, #111111 0%, #030305 100%);
  overflow: hidden;
  padding: 1rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(28, 28, 40, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
`;

const Title = styled.h1`
  color: #ffffff;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
`;

const BackButton = styled.button`
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.1));
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.75rem 1.25rem;
  border-radius: 10px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  &:hover {
    background: linear-gradient(145deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.15));
    transform: translateY(-2px);
    color: #ddd6fe;
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.08),
      0 4px 8px rgba(0, 0, 0, 0.2);
  }
`;

const BackIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
);

// Status indicators
const HeaderInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
  color: #888;
`;

const RefreshButton = styled.button<{ $isLoading: boolean; $isCompleteRefresh?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: ${props => {
    if (props.$isCompleteRefresh) {
      return 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.3) 100%)';
    }
    return props.$isLoading
      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.3) 100%)'
      : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)';
  }};
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: ${props => {
    if (props.$isCompleteRefresh) {
      return '0 8px 32px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    }
    return props.$isLoading
      ? '0 8px 32px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
      : '0 4px 16px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
  }};
  color: #fff;
  cursor: ${props => props.$isLoading ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$isLoading ? 0.7 : 1};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: ${props => {
      if (props.$isCompleteRefresh) {
        return 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.1) 100%)';
      }
      return 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)';
    }};
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 50%;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: ${props => {
      if (props.$isCompleteRefresh) {
        return '0 6px 24px rgba(34, 197, 94, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
      }
      return '0 6px 24px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    }};

    &:before {
      opacity: 1;
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: ${props => {
      if (props.$isCompleteRefresh) {
        return '0 2px 8px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
      }
      return '0 2px 8px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
    }};
  }

  &:disabled {
    pointer-events: none;
  }

  svg {
    width: 18px;
    height: 18px;
    animation: ${props => props.$isLoading ? 'spin 1s linear infinite' : 'none'};
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    color: ${props => props.$isCompleteRefresh ? '#22c55e' : '#fff'};
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const StatusText = styled.span<{ $isStale?: boolean }>`
  color: ${props => props.$isStale ? '#f59e0b' : '#888'};
  font-weight: ${props => props.$isStale ? '500' : '400'};
`;

const RetryButton = styled.button`
  margin-top: 10px;
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

const ContentContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ScrollContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  margin-right: -8px;

  /* Custom scrollbar styling to match TrendingTokensPage */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #8b5cf6, #7c3aed);
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #7c3aed, #6d28d9);
  }
`;

const NewsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 2rem;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  flex-direction: column;
  gap: 1rem;
`;

const LoadingText = styled.div`
  color: #a0a0a0;
  font-size: 0.9rem;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 1rem;
  font-weight: 500;
`;

const ErrorDescription = styled.div`
  color: #a0a0a0;
  font-size: 0.9rem;
  line-height: 1.4;
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 2rem;
  text-align: center;
`;

const EmptyMessage = styled.div`
  color: #a0a0a0;
  font-size: 1.1rem;
  font-weight: 500;
`;

const EmptyDescription = styled.div`
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.4;
`;

const Tabs = styled.div`
  display: flex;
  gap: 10px;
`;

const TabButton = styled.button<{ $active?: boolean; disabled?: boolean }>`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid ${p => (p.$active ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.25)')};
  background: ${p => (p.$active ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)')};
  color: #c4b5fd;
  font-weight: 600;
  cursor: ${p => p.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  opacity: ${p => p.disabled ? 0.5 : 1};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(139, 92, 246, 0.4);
  }

  &:disabled {
    pointer-events: none;
  }
`;

const WidgetPanel = styled.div`
  background: rgba(28, 28, 40, 0.5);
  border-radius: 16px;
  padding: 1rem;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  min-height: 520px;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

// Economic Calendar Components
const EconomicContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
`;

const CountryButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
`;

const CountryButton = styled.button<{ $active?: boolean; $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  border: 1px solid ${props => props.$active ? 'rgba(139, 92, 246, 0.6)' : 'rgba(139, 92, 246, 0.3)'};
  background: ${props => {
    if (props.$selected && props.$active) {
      return 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))';
    }
    return props.$active ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)';
  }};
  color: #c4b5fd;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: ${props => props.$active ? '0 4px 12px rgba(139, 92, 246, 0.4)' : 'none'};
  transform: ${props => props.$active ? 'translateY(-2px)' : 'translateY(0)'};

  &:hover {
    border-color: rgba(139, 92, 246, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
  }

  .flag {
    width: 24px;
    height: 18px;
    border-radius: 2px;
    object-fit: cover;
  }

  .country-name {
    font-size: 0.9rem;
  }
`;

const CalendarWrapper = styled.div`
  flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 480px;
`;

const CalendarPanel = styled.div<{ $isVisible?: boolean }>`
  flex: 1;
  background: rgba(28, 28, 40, 0.5);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow: hidden;
  opacity: ${props => props.$isVisible ? 1 : 0};
  transform: ${props => props.$isVisible ? 'scale(1)' : 'scale(0.95)'};
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  &:hover::before {
    opacity: 1;
  }
`;

const EconomicWidgetContainer = styled.div`
  height: 100%;
  width: 100%;
  position: relative;

  .tradingview-widget-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 28px; /* Leave room for attribution */
    height: auto;
    width: auto;
  }

  .tradingview-widget-container__widget {
    height: 100%;
    width: 100%;
    background: transparent;
  }
`;

const EconomicAttribution = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  line-height: 28px;
  text-align: center;
  background: transparent;
  font-size: 11px;

  a { color: #8b5cf6; text-decoration: none; }
`;

// Error display components for Economic Calendar Widget
const EconomicErrorContainer = styled.div`
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

const EconomicErrorIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const EconomicErrorMessage = styled.div`
  margin-top: 0.5rem;
`;

const EconomicRetryButton = styled.button`
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #8b5cf6;
  border: none;
  border-radius: 0.375rem;
  color: white;
  cursor: pointer;
  font-size: 0.8rem;
`;

// Loading container for Economic Calendar Widget
const LoadingOverlay = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
`;

const WidgetContainer = styled.div<{ $isLoading?: boolean }>`
  opacity: ${props => props.$isLoading ? 0.3 : 1};
  transition: opacity 0.3s ease;
`;

// Error Boundary styled components
const ErrorBoundaryContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #ef4444;
  text-align: center;
  padding: 2rem;
`;

const ErrorBoundaryIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const ErrorBoundaryTitle = styled.h2`
  color: #ffffff;
  margin-bottom: 1rem;
`;

const ErrorBoundaryDescription = styled.p`
  color: #a0a0a0;
  margin-bottom: 2rem;
  max-width: 500px;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 1rem;
`;

const ReloadButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: #8b5cf6;
  border: none;
  border-radius: 0.5rem;
  color: white;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
`;

const TryAgainButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 0.5rem;
  color: #c4b5fd;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
`;

const ErrorDetails = styled.details`
  margin-top: 2rem;
  max-width: 600px;
  text-align: left;
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(239, 68, 68, 0.3);
`;

const ErrorSummary = styled.summary`
  cursor: pointer;
  color: #ffffff;
  margin-bottom: 0.5rem;
`;

const ErrorPre = styled.pre`
  color: #ef4444;
  font-size: 0.8rem;
  white-space: pre-wrap;
  overflow: auto;
  max-height: 200px;
`;

// Error Boundary Component for crash protection
class NewsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error; errorInfo?: ErrorInfo }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean; error: Error } {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NewsPage Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <PageContainer>
          <ErrorBoundaryContainer>
            <ErrorBoundaryIcon>⚠️</ErrorBoundaryIcon>
            <ErrorBoundaryTitle>Something went wrong</ErrorBoundaryTitle>
            <ErrorBoundaryDescription>
              The news page encountered an unexpected error. This is often caused by rapid tab switching or network issues.
            </ErrorBoundaryDescription>
            <ButtonContainer>
              <ReloadButton onClick={() => window.location.reload()}>
                Reload Page
              </ReloadButton>
              <TryAgainButton onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}>
                Try Again
              </TryAgainButton>
            </ButtonContainer>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <ErrorDetails>
                <ErrorSummary>
                  Error Details (Development)
                </ErrorSummary>
                <ErrorPre>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </ErrorPre>
              </ErrorDetails>
            )}
          </ErrorBoundaryContainer>
        </PageContainer>
      );
    }

    return this.props.children;
  }
}

const NewsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'market' | 'fundraising' | 'tv' | 'stocks' | 'economic'>('market');
  const [selectedCountries, setSelectedCountries] = useState<Set<'us' | 'ca'>>(new Set(['us']));
  const [isTransitioning, setIsTransitioning] = useState(false);
  const tabSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTabSwitchRef = useRef<number>(0);

  // Use preloaded news data from context
  const {
    marketNews,
    isLoadingMarket,
    marketError,
    marketLastUpdated,
    fundraisingNews,
    isLoadingFundraising,
    fundraisingError,
    fundraisingLastUpdated,
    isInitializing,
    refreshMarketNews,
    refreshFundraisingNews,
  } = useNews();

  const handleRefresh = useCallback(async () => {
    const loading = activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket;
    if (!loading && activeTab !== 'tv' && activeTab !== 'stocks' && activeTab !== 'economic') {
      try {
        if (activeTab === 'fundraising') {
          await refreshFundraisingNews();
        } else {
          await refreshMarketNews();
        }
      } catch (error) {
        console.error('Error refreshing news:', error);
      }
    }
  }, [activeTab, isLoadingFundraising, isLoadingMarket, refreshFundraisingNews, refreshMarketNews]);

  const handleRetry = useCallback(async () => {
    if (activeTab === 'fundraising') {
      await refreshFundraisingNews();
    } else if (activeTab === 'market') {
      await refreshMarketNews();
    }
  }, [activeTab, refreshFundraisingNews, refreshMarketNews]);

  // Debounced tab switching to prevent crashes from rapid switching
  const handleTabChange = useCallback((newTab: 'market' | 'fundraising' | 'tv' | 'stocks' | 'economic') => {
    if (isTransitioning) {
      console.warn('Tab switch already in progress, ignoring rapid switch');
      return;
    }

    const now = Date.now();
    const timeSinceLastSwitch = now - lastTabSwitchRef.current;

    // Minimum 300ms between tab switches to prevent crashes
    if (timeSinceLastSwitch < 300) {
      if (tabSwitchTimeoutRef.current) {
        clearTimeout(tabSwitchTimeoutRef.current);
      }

      tabSwitchTimeoutRef.current = setTimeout(() => {
        handleTabChange(newTab);
      }, 300 - timeSinceLastSwitch);
      return;
    }

    lastTabSwitchRef.current = now;
    setIsTransitioning(true);

    // Add a small delay before actually switching to allow cleanup
    setTimeout(() => {
      try {
        setActiveTab(newTab);
        // Reset transition state after tab change is complete
        setTimeout(() => setIsTransitioning(false), 100);
      } catch (error) {
        console.error('Error during tab switch:', error);
        setIsTransitioning(false);
      }
    }, 50);
  }, [isTransitioning]);

  const handleCountryToggle = useCallback((country: 'us' | 'ca') => {
    if (isTransitioning) {
      console.warn('Country toggle ignored during tab transition');
      return;
    }

    setSelectedCountries(prev => {
      try {
        const newSet = new Set(prev);
        if (newSet.has(country)) {
          // Don't allow removing the last country
          if (newSet.size > 1) {
            newSet.delete(country);
          }
        } else {
          newSet.add(country);
        }
        return newSet;
      } catch (error) {
        console.error('Error toggling country selection:', error);
        return prev;
      }
    });
  }, [isTransitioning]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (tabSwitchTimeoutRef.current) {
        clearTimeout(tabSwitchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <NewsErrorBoundary>
      <PageContainer>
        <Header>
          <BackButton onClick={() => navigate('/')}>
            <BackIcon />
            Back to Converter
          </BackButton>
          <Title>
            📰 Market News
          </Title>
        {activeTab !== 'tv' && (activeTab === 'fundraising' ? fundraisingLastUpdated : marketLastUpdated) && !(activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket) && (
          <HeaderInfoContainer>
            <div>
              <StatusText $isStale={false}>
                Last updated: <LiveTimeAgo date={(activeTab === 'fundraising' ? fundraisingLastUpdated : marketLastUpdated)!} />
              </StatusText>
            </div>
            <RefreshButton
              $isLoading={activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket}
              $isCompleteRefresh={false}
              onClick={handleRefresh}
              title="Refresh news data"
            >
              <FiRefreshCw />
            </RefreshButton>
          </HeaderInfoContainer>
        )}
      </Header>

      {/* Tabs */}
      <Tabs>
        <TabButton
          $active={activeTab === 'market'}
          onClick={() => handleTabChange('market')}
          disabled={isTransitioning}
        >
          Market
        </TabButton>
        <TabButton
          $active={activeTab === 'fundraising'}
          onClick={() => handleTabChange('fundraising')}
          disabled={isTransitioning}
        >
          Fundraising
        </TabButton>
        <TabButton
          $active={activeTab === 'tv'}
          onClick={() => handleTabChange('tv')}
          disabled={isTransitioning}
        >
          Crypto Stories
        </TabButton>
        <TabButton
          $active={activeTab === 'stocks'}
          onClick={() => handleTabChange('stocks')}
          disabled={isTransitioning}
        >
          Stock Market
        </TabButton>
        <TabButton
          $active={activeTab === 'economic'}
          onClick={() => handleTabChange('economic')}
          disabled={isTransitioning}
        >
          Economic Calendar
        </TabButton>
      </Tabs>

      <ContentContainer>
        <ScrollContainer>
          {activeTab === 'tv' ? (
            <WidgetPanel>
              <TradingViewNewsWidget feedMode="market" market="crypto" isTransparent height="100%" displayMode="regular" />
            </WidgetPanel>
          ) : activeTab === 'stocks' ? (
            <WidgetPanel>
              <TradingViewNewsWidget feedMode="market" market="stock" isTransparent height="100%" displayMode="regular" />
            </WidgetPanel>
          ) : activeTab === 'economic' ? (
            <EconomicContainer>
              <CountryButtons>
                <CountryButton
                  $active={selectedCountries.has('us')}
                  $selected={selectedCountries.has('us')}
                  onClick={() => handleCountryToggle('us')}
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg"
                    alt="United States Flag"
                    className="flag"
                  />
                  <span className="country-name">United States</span>
                </CountryButton>
                <CountryButton
                  $active={selectedCountries.has('ca')}
                  $selected={selectedCountries.has('ca')}
                  onClick={() => handleCountryToggle('ca')}
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/c/cf/Flag_of_Canada.svg"
                    alt="Canada Flag"
                    className="flag"
                  />
                  <span className="country-name">Canada</span>
                </CountryButton>
              </CountryButtons>
              <CalendarWrapper>
                {Array.from(selectedCountries).map(country => (
                  <CalendarPanel key={country} $isVisible={true}>
                    <MemoizedEconomicCalendarWidget country={country} />
                  </CalendarPanel>
                ))}
              </CalendarWrapper>
            </EconomicContainer>
          ) : (activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket) || isInitializing ? (
            <LoadingContainer>
              <WaveLoadingPlaceholder />
              <LoadingText>
                {isInitializing
                  ? 'Initializing news data...'
                  : activeTab === 'fundraising'
                    ? 'Loading latest fundraising news...'
                    : 'Loading latest crypto news...'
                }
              </LoadingText>
            </LoadingContainer>
          ) : (activeTab === 'fundraising' ? fundraisingError : marketError) ? (
            <ErrorContainer>
              <ErrorMessage>Failed to Load News</ErrorMessage>
              <ErrorDescription>{activeTab === 'fundraising' ? fundraisingError : marketError}</ErrorDescription>
              <RetryButton onClick={handleRetry}>
                Try Again
              </RetryButton>
            </ErrorContainer>
          ) : (activeTab === 'fundraising' ? fundraisingNews.length === 0 : marketNews.length === 0) ? (
            <EmptyContainer>
              <EmptyMessage>📰</EmptyMessage>
              <EmptyMessage>No {activeTab === 'fundraising' ? 'Fundraising' : 'News'} Available</EmptyMessage>
              <EmptyDescription>
                No {activeTab === 'fundraising' ? 'fundraising' : 'cryptocurrency'} news articles are currently available.
                <br />
                Please try again later.
              </EmptyDescription>
              <RetryButton onClick={handleRetry}>
                Refresh
              </RetryButton>
            </EmptyContainer>
          ) : (
            <NewsGrid>
              <AnimatePresence>
                {(activeTab === 'fundraising' ? fundraisingNews : marketNews).map((article, index) => (
                  <NewsCard
                    key={`${article.url}-${article.publishedAt}`}
                    article={article as any}
                    index={index}
                  />
                ))}
              </AnimatePresence>
            </NewsGrid>
          )}
        </ScrollContainer>
      </ContentContainer>
    </PageContainer>
    </NewsErrorBoundary>
  );
};

// Enhanced NewsPage with React.memo for performance optimization
export default React.memo(NewsPage); 