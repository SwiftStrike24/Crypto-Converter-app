import React, { useEffect, useState, useCallback, memo } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { useCrypto } from '../context/CryptoContext';
import { ErrorBoundary } from 'react-error-boundary';

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const spin = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 400px;
  position: relative;
  overflow: hidden;
  animation: ${fadeIn} 0.6s ease-out;
  transition: all 0.3s ease;

  .chart-content {
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    height: 100%;
    
    &.loaded {
      opacity: 1;
    }
  }

  .recharts-cartesian-grid-horizontal line,
  .recharts-cartesian-grid-vertical line {
    stroke: rgba(255, 255, 255, 0.05);
  }

  .recharts-line path {
    stroke: #8b5cf6;
    stroke-width: 2px;
  }

  .recharts-tooltip-wrapper {
    background: rgba(17, 17, 17, 0.9);
    border: 1px solid rgba(139, 92, 246, 0.3);
    backdrop-filter: blur(8px);
  }

  @media (max-width: 768px) {
    height: 350px;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  z-index: 10;
  opacity: 0;
  animation: ${fadeIn} 0.3s ease-out forwards;
`;

const LoadingSpinner = styled.div`
  width: 60px;
  height: 60px;
  border: 4px solid rgba(139, 92, 246, 0.1);
  border-top: 4px solid #8b5cf6;
  border-radius: 50%;
  animation: ${spin} 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
  box-shadow: 0 0 25px rgba(139, 92, 246, 0.4);
`;

const LoadingText = styled.div`
  margin-top: 20px;
  font-size: 16px;
  color: #8b5cf6;
  text-shadow: 0 0 10px rgba(139, 92, 246, 0.4);
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 0 0.5rem;
`;

const ChartTitle = styled.div`
  color: #9ca3af;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const TimeframeButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

interface TimeButtonProps {
  active: boolean;
}

const TimeButton = styled.button<TimeButtonProps>`
  background: ${props => props.active ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.active ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.active ? '#8b5cf6' : '#9ca3af'};
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: #8b5cf6;
    color: #8b5cf6;
  }

  &:active {
    transform: scale(0.95);
  }
`;

const PriceChange = styled.span<{ isPositive: boolean }>`
  color: ${props => props.isPositive ? '#4caf50' : '#ff4444'};
  font-size: 0.9rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${props => props.isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 68, 68, 0.1)'};
`;

const ErrorMessage = styled.div`
  color: #ff4444;
  text-align: center;
  padding: 1rem;
`;

interface ChartDataPoint {
  timestamp: number;
  price: number;
}

type Timeframe = '24H' | '7D' | '30D';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}

const TooltipContainer = styled.div`
  background: rgba(17, 17, 17, 0.95);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
`;

const TooltipText = styled.p`
  color: #fff;
  margin: 0;
  font-size: 0.9rem;
  
  & + & {
    margin-top: 6px;
    color: #9ca3af;
    font-size: 0.85rem;
  }
`;

const ErrorFallback = styled.div`
  color: #ff4444;
  text-align: center;
  padding: 2rem;
  background: rgba(255, 68, 68, 0.1);
  border-radius: 8px;
  margin: 1rem;
`;

const RetryButton = styled.button`
  background: #2196f3;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  margin-top: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #1976d2;
    transform: translateY(-1px);
  }
`;

const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY;

const ErrorFallbackComponent = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <ErrorFallback>
    <h3>Something went wrong</h3>
    <p>{error.message}</p>
    <RetryButton onClick={resetErrorBoundary}>Try again</RetryButton>
  </ErrorFallback>
);

const CustomTooltipComponent = memo(({ active, payload, label, currency }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : currency.toUpperCase();
    return (
      <TooltipContainer>
        <TooltipText>
          {format(new Date(parseInt(label!)), 'MMM d, yyyy h:mm a')}
        </TooltipText>
        <TooltipText>
          {currencySymbol}{payload[0].value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
          })}
        </TooltipText>
      </TooltipContainer>
    );
  }
  return null;
});

CustomTooltipComponent.displayName = 'CustomTooltip';

interface CryptoChartProps {
  cryptoId: string;
  currency: string;
}

const calculateYAxisDomain = (data: ChartDataPoint[]): [number, number] => {
  if (!data.length) return [0, 0];
  
  const prices = data.map(point => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.1; // Add 10% padding

  return [
    Math.max(0, min - padding), // Don't go below 0
    max + padding
  ];
};

export const CryptoChart: React.FC<CryptoChartProps> = memo(({ cryptoId, currency }) => {
  const { error: contextError, loading: contextLoading, getCryptoId } = useCrypto();
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('24H');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [displayTicks, setDisplayTicks] = useState<number[]>([]);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000;

  const getTickCount = (timeframe: Timeframe, isMobile: boolean): number => {
    if (isMobile) return 6;
    
    switch (timeframe) {
      case '24H':
        return 12;
      case '7D':
        return 8;
      case '30D':
        return 10;
      default:
        return 8;
    }
  };

  const fetchPriceHistory = useCallback(async (selectedTimeframe: Timeframe) => {
    try {
      setLoading(true);
      setError(null);
      const days = selectedTimeframe === '24H' ? '1' : selectedTimeframe === '7D' ? '7' : '30';
      
      const coinGeckoId = getCryptoId(cryptoId.toUpperCase());
      
      if (!coinGeckoId) {
        throw new Error(`Could not find CoinGecko ID for ${cryptoId}`);
      }

      const baseUrl = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart`;
      const url = `${baseUrl}?vs_currency=${currency.toLowerCase()}&days=${days}${selectedTimeframe !== '24H' ? '&interval=daily' : ''}`;

      const response = await fetch(url, {
        headers: {
          'x-cg-demo-api-key': COINGECKO_API_KEY
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait 1-2 minutes before trying again.');
        }
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.prices || !Array.isArray(data.prices)) {
        throw new Error('Invalid data format received from API');
      }
      
      const formattedData = data.prices.map(([timestamp, price]: [number, number]) => ({
        timestamp,
        price,
      }));

      const newDisplayTicks = formattedData.filter((_: ChartDataPoint, index: number) => {
        const totalPoints = formattedData.length;
        const tickCount = getTickCount(selectedTimeframe, window.innerWidth <= 480);
        const interval = Math.floor(totalPoints / (tickCount - 1));
        return index === 0 || index === totalPoints - 1 || index % interval === 0;
      });

      setDisplayTicks(newDisplayTicks.map((d: ChartDataPoint) => d.timestamp));

      if (formattedData.length >= 2) {
        const startPrice = formattedData[0].price;
        const endPrice = formattedData[formattedData.length - 1].price;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        setPriceChange(changePercent);
      }

      setChartData(formattedData);
      setRetryCount(0);
      setTimeout(() => setChartLoaded(true), 300);
    } catch (error) {
      console.error('Error fetching price data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch price data';
      setError(errorMessage);

      if (retryCount < MAX_RETRIES) {
        const nextRetry = RETRY_DELAY * Math.pow(2, retryCount);
        setTimeout(() => fetchPriceHistory(selectedTimeframe), nextRetry);
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [cryptoId, currency, getCryptoId, retryCount]);

  useEffect(() => {
    setChartLoaded(false);
    const fetchData = () => fetchPriceHistory(timeframe);
    fetchData();
    
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [timeframe, fetchPriceHistory]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallbackComponent} onReset={() => fetchPriceHistory(timeframe)}>
      <ChartContainer>
        <ChartHeader>
          <ChartTitle>
            {cryptoId.toUpperCase()}/{currency.toUpperCase()} Price
            {priceChange !== 0 && (
              <PriceChange isPositive={priceChange > 0}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </PriceChange>
            )}
          </ChartTitle>
          <TimeframeButtons>
            {(['24H', '7D', '30D'] as Timeframe[]).map((tf) => (
              <TimeButton
                key={tf}
                active={timeframe === tf}
                onClick={() => {
                  setTimeframe(tf);
                  setChartLoaded(false);
                }}
              >
                {tf}
              </TimeButton>
            ))}
          </TimeframeButtons>
        </ChartHeader>

        {(loading || contextLoading) && (
          <LoadingOverlay>
            <LoadingSpinner />
            <LoadingText>Loading chart data...</LoadingText>
          </LoadingOverlay>
        )}

        {(error || contextError) && (
          <ErrorMessage>
            {error || contextError}
            {retryCount > 0 && retryCount < MAX_RETRIES && (
              <div>Retrying... ({retryCount}/{MAX_RETRIES})</div>
            )}
          </ErrorMessage>
        )}

        <div className={`chart-content${chartLoaded ? ' loaded' : ''}`}>
          {!loading && !error && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ 
                  top: 20, 
                  right: 30, 
                  left: 10, 
                  bottom: 30 
                }}
              >
                <defs>
                  <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(timestamp) => {
                    const date = new Date(timestamp);
                    return timeframe === '24H'
                      ? format(date, 'h:mm a')
                      : format(date, 'MMM d');
                  }}
                  ticks={displayTicks}
                  tick={{ 
                    fill: '#888', 
                    fontSize: window.innerWidth <= 480 ? 11 : 12,
                    dy: 10
                  }}
                  height={50}
                  stroke="rgba(255,255,255,0.05)"
                  axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  tickLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                />
                <YAxis
                  domain={calculateYAxisDomain(chartData)}
                  tickFormatter={(value) => {
                    const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : currency.toUpperCase();
                    if (value >= 1000000) {
                      return `${currencySymbol}${(value / 1000000).toFixed(2)}M`;
                    } else if (value >= 1000) {
                      return `${currencySymbol}${(value / 1000).toFixed(1)}K`;
                    }
                    return `${currencySymbol}${value.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2
                    })}`;
                  }}
                  tick={{ 
                    fill: '#888', 
                    fontSize: window.innerWidth <= 480 ? 11 : 12 
                  }}
                  width={80}
                  stroke="rgba(255,255,255,0.05)"
                  axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  tickLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  allowDataOverflow={false}
                  scale="linear"
                  interval="preserveStartEnd"
                />
                <Tooltip 
                  content={<CustomTooltipComponent currency={currency} />}
                  animationDuration={200}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#8b5cf6"
                  fill="url(#purpleGradient)"
                  fillOpacity={1}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ 
                    r: 6, 
                    fill: '#8b5cf6',
                    stroke: 'rgba(139, 92, 246, 0.3)',
                    strokeWidth: 4
                  }}
                  animationDuration={1000}
                  animationBegin={200}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartContainer>
    </ErrorBoundary>
  );
});