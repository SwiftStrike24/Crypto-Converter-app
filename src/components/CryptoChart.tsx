import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { 
  createChart, 
  ColorType,
  IChartApi,
  Time,
  DeepPartial,
  ChartOptions,
  ISeriesApi,
  AreaSeries
} from 'lightweight-charts';
import { useCrypto } from '../context/CryptoContext';
import { useCryptoCompare } from '../context/CryptoCompareContext';
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 400px;
  position: relative;
  overflow: hidden;
  animation: ${fadeIn} 0.6s ease-out;
  transition: all 0.3s ease;
  background: #111111;
  border-radius: 8px;

  .chart-content {
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    height: 100%;
    
    &.loaded {
      opacity: 1;
    }
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
  $active: boolean;
}

const TimeButton = styled.button<TimeButtonProps>`
  background: ${props => props.$active ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.$active ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$active ? '#8b5cf6' : '#9ca3af'};
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

const PriceChange = styled.span<{ $isPositive: boolean }>`
  color: ${props => props.$isPositive ? '#4caf50' : '#ff4444'};
  font-size: 0.9rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${props => props.$isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 68, 68, 0.1)'};
`;

const ErrorMessage = styled.div`
  color: #ff4444;
  text-align: center;
  padding: 1rem;
`;

const FallbackIndicator = styled.span`
  font-size: 0.8rem;
  color: #666;
  margin-left: 8px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
`;

interface ChartDataPoint {
  time: Time;
  value: number;
  price?: number;
}

type Timeframe = '1D' | '1W' | '1M' | '1Y';

const CHART_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const CHART_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CHART_RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRIES = 3;

interface ChartCache {
  data: ChartDataPoint[];
  timeframe: Timeframe;
  cryptoId: string;
  currency: string;
  timestamp: number;
}

const chartOptions: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: '#111111' },
    textColor: '#9ca3af',
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
  },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    timeVisible: true,
    secondsVisible: false,
  },
  crosshair: {
    vertLine: {
      color: 'rgba(139, 92, 246, 0.3)',
      width: 1,
      style: 1,
    },
    horzLine: {
      color: 'rgba(139, 92, 246, 0.3)',
      width: 1,
      style: 1,
    },
  },
  handleScale: {
    mouseWheel: true,
    pinch: true,
  },
  handleScroll: {
    mouseWheel: true,
    pressedMouseMove: true,
    horzTouchDrag: true,
    vertTouchDrag: true,
  },
};

const intervalColors = {
  '1D': {
    line: '#2962FF',
    top: 'rgba(41, 98, 255, 0.3)',
    bottom: 'rgba(41, 98, 255, 0.1)'
  },
  '1W': {
    line: 'rgb(225, 87, 90)',
    top: 'rgba(225, 87, 90, 0.3)',
    bottom: 'rgba(225, 87, 90, 0.1)'
  },
  '1M': {
    line: 'rgb(242, 142, 44)',
    top: 'rgba(242, 142, 44, 0.3)',
    bottom: 'rgba(242, 142, 44, 0.1)'
  },
  '1Y': {
    line: 'rgb(164, 89, 209)',
    top: 'rgba(164, 89, 209, 0.3)',
    bottom: 'rgba(164, 89, 209, 0.1)'
  }
};

interface CryptoChartProps {
  cryptoId: string;
  currency: string;
}

const ChartContentDiv = styled.div`
  width: 100%;
  height: 100%;
`;

export const CryptoChart: React.FC<CryptoChartProps> = memo(({ cryptoId, currency }) => {
  console.log('🚀 CryptoChart Component Mounted:', { cryptoId, currency });

  const { error: contextError, loading: contextLoading, getCryptoId } = useCrypto();
  const cryptoCompare = useCryptoCompare();
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [usingFallbackApi, setUsingFallbackApi] = useState(false);
  const chartCache = useRef<{ [key: string]: ChartCache }>({});
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const getCacheKey = (tf: Timeframe, id: string, curr: string) => `${tf}-${id}-${curr}`;

  const getChartCache = (tf: Timeframe, id: string, curr: string): ChartDataPoint[] | null => {
    const key = getCacheKey(tf, id, curr);
    const cache = chartCache.current[key];
    if (cache && Date.now() - cache.timestamp <= CHART_CACHE_DURATION) {
      return cache.data;
    }
    return null;
  };

  const setChartCache = (tf: Timeframe, id: string, curr: string, data: ChartDataPoint[]) => {
    const key = getCacheKey(tf, id, curr);
    chartCache.current[key] = {
      data,
      timeframe: tf,
      cryptoId: id,
      currency: curr,
      timestamp: Date.now()
    };
  };

  const initChart = useCallback(() => {
    console.log('📊 Initializing Chart...', { cryptoId, currency });
    if (chartContainerRef.current) {
      try {
        console.log('🎨 Creating new chart with options:', chartOptions);
        const chart = createChart(chartContainerRef.current, {
          ...chartOptions,
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
        chartRef.current = chart;

        console.log('📈 Adding area series with colors:', {
          line: intervalColors[timeframe].line,
          top: intervalColors[timeframe].top,
          bottom: intervalColors[timeframe].bottom
        });
        const areaSeries = chart.addSeries(AreaSeries, {
          lineColor: intervalColors[timeframe].line,
          topColor: intervalColors[timeframe].top,
          bottomColor: intervalColors[timeframe].bottom,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        seriesRef.current = areaSeries;
        console.log('✅ Chart initialization complete');

        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: chartContainerRef.current.clientHeight,
            });
          }
        };

        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          if (seriesRef.current) {
            seriesRef.current = null;
          }
          if (chartRef.current) {
            try {
              chart.remove();
              chartRef.current = null;
            } catch (error) {
              console.warn('Chart already disposed');
            }
          }
        };
      } catch (error) {
        console.error('❌ Error initializing chart:', error);
      }
    } else {
      console.warn('⚠️ Chart container ref not available');
    }
  }, [timeframe]);

  const updateChartData = useCallback((data: ChartDataPoint[]) => {
    console.log('🔄 Updating chart data:', { dataPoints: data.length });
    
    if (seriesRef.current && data.length > 0) {
      try {
        const formattedData = data.map(point => ({
          time: typeof point.time === 'string' ? 
            Math.floor(new Date(point.time).getTime() / 1000) as Time : 
            point.time as Time,
          value: Number(point.value || point.price)
        }));
        console.log('📊 Formatted data sample:', formattedData[0], '...', formattedData[formattedData.length - 1]);

        seriesRef.current.setData(formattedData);
        console.log('✅ Chart data updated successfully');
        
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }

        const startPrice = formattedData[0].value;
        const endPrice = formattedData[formattedData.length - 1].value;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        setPriceChange(changePercent);

        seriesRef.current.applyOptions({
          lineColor: intervalColors[timeframe].line,
          topColor: intervalColors[timeframe].top,
          bottomColor: intervalColors[timeframe].bottom,
        });
      } catch (error) {
        console.error('❌ Error updating chart data:', error);
      }
    } else {
      console.warn('⚠️ Series ref not available or empty data');
    }
  }, [timeframe]);

  const fetchPriceHistory = useCallback(async (selectedTimeframe: Timeframe) => {
    console.log('🔍 Fetching price history:', { selectedTimeframe, cryptoId, currency });
    
    if (fetchTimeout.current) {
      console.log('🔄 Clearing existing fetch timeout');
      clearTimeout(fetchTimeout.current);
      fetchTimeout.current = null;
    }

    try {
      setLoading(true);
      setError(null);
      
      const coinGeckoId = getCryptoId(cryptoId.toUpperCase());
      console.log('🪙 Resolved CoinGecko ID:', { cryptoId, coinGeckoId });

      if (!coinGeckoId) {
        throw new Error(`Could not find CoinGecko ID for ${cryptoId}`);
      }

      const cachedData = getChartCache(selectedTimeframe, cryptoId, currency);
      if (cachedData) {
        console.log('📦 Using cached data');
        updateChartData(cachedData);
        setLoading(false);
        setChartLoaded(true);
        return;
      }

      let data;
      let usedFallbackApi = false;

      try {
        const days = selectedTimeframe === '1D' ? '1' : 
                    selectedTimeframe === '1W' ? '7' : 
                    selectedTimeframe === '1M' ? '30' : '365';
                    
        const baseUrl = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart`;
        const url = `${baseUrl}?vs_currency=${currency.toLowerCase()}&days=${days}${selectedTimeframe !== '1D' ? '&interval=daily' : ''}`;

        const response = await fetch(url, {
          headers: {
            'x-cg-demo-api-key': import.meta.env.VITE_COINGECKO_API_KEY
          }
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const jsonData = await response.json();
        data = jsonData.prices.map(([timestamp, price]: [number, number]) => ({
          time: timestamp / 1000 as Time,
          value: price,
        }));
      } catch (error) {
        console.log('CoinGecko API failed, switching to CryptoCompare');
        usedFallbackApi = true;
        data = await cryptoCompare.getHistoricalData(
          cryptoId,
          currency,
          selectedTimeframe
        );
      }

      setUsingFallbackApi(usedFallbackApi);
      setError(null);

      if (!data || !Array.isArray(data)) {
        throw new Error('No valid data received');
      }

      const formattedData = data.map(point => ({
        time: typeof point.time === 'string' ? 
          Math.floor(new Date(point.time).getTime() / 1000) as Time : 
          point.time as Time,
        value: Number(point.value || point.price)
      }));

      setChartCache(selectedTimeframe, cryptoId, currency, formattedData);
      updateChartData(formattedData);
      setRetryCount(0);
      setChartLoaded(true);

    } catch (error) {
      console.error('❌ Error in fetchPriceHistory:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch price data');

      if (retryCount < MAX_RETRIES) {
        const nextRetry = CHART_RETRY_DELAY * Math.pow(2, retryCount);
        fetchTimeout.current = setTimeout(() => {
          fetchPriceHistory(timeframe);
        }, nextRetry);
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [cryptoId, currency, getCryptoId, timeframe, cryptoCompare, updateChartData, retryCount]);

  useEffect(() => {
    console.log('🔄 Chart effect triggered:', { timeframe });
    const cleanup = initChart();
    return () => {
      if (cleanup) {
        console.log('🧹 Cleaning up chart');
        cleanup();
      }
    };
  }, [initChart]);

  useEffect(() => {
    console.log('📊 Data fetch effect triggered');
    setChartLoaded(false);
    
    if (fetchTimeout.current) {
      clearTimeout(fetchTimeout.current);
    }
    
    fetchTimeout.current = setTimeout(() => {
      fetchPriceHistory(timeframe);
    }, 300);

    const interval = setInterval(() => {
      if (retryCount === 0) {
        console.log('🔄 Running periodic data update');
        fetchPriceHistory(timeframe);
      }
    }, CHART_UPDATE_INTERVAL);

    return () => {
      console.log('🧹 Cleaning up data fetch effect');
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
      }
      clearInterval(interval);
    };
  }, [timeframe, fetchPriceHistory]);

  useEffect(() => {
    return () => {
      console.log('🧹 Component cleanup');
      if (seriesRef.current) {
        seriesRef.current = null;
      }
      if (chartRef.current) {
        try {
          chartRef.current.remove();
          chartRef.current = null;
        } catch (error) {
          console.warn('Chart already disposed during cleanup');
        }
      }
    };
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={({ error, resetErrorBoundary }) => (
        <ErrorMessage>
          <h3>Something went wrong</h3>
          <p>{error.message}</p>
          <button onClick={resetErrorBoundary}>Try again</button>
        </ErrorMessage>
      )}
      onReset={() => fetchPriceHistory(timeframe)}
    >
      <ChartContainer>
        <ChartHeader>
          <ChartTitle>
            {cryptoId.toUpperCase()}/{currency.toUpperCase()} Price
            {priceChange !== 0 && (
              <PriceChange $isPositive={priceChange > 0}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </PriceChange>
            )}
            {usingFallbackApi && (
              <FallbackIndicator>
                Fallback API
              </FallbackIndicator>
            )}
          </ChartTitle>
          <TimeframeButtons>
            {(['1D', '1W', '1M', '1Y'] as Timeframe[]).map((tf) => (
              <TimeButton
                key={tf}
                $active={timeframe === tf}
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

        <ChartContentDiv 
          ref={chartContainerRef} 
          className={`chart-content${chartLoaded ? ' loaded' : ''}`}
        />
      </ChartContainer>
    </ErrorBoundary>
  );
});