import React, { useEffect, useState, useCallback, memo, useRef, useMemo } from 'react';
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
import { ErrorBoundary } from 'react-error-boundary';
import { getHistoricalPriceData } from '../services';

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
  min-height: 350px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  animation: ${fadeIn} 0.6s ease-out;
  transition: transform 0.3s ease, opacity 0.3s ease;
  background: #111111;
  border-radius: 16px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
  will-change: transform, opacity;
  transform: translateZ(0);
  @media (max-width: 768px) {
    min-height: 300px;
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

interface ChartDataPoint {
  time: Time;
  value: number;
  price?: number;
}

type Timeframe = '1D' | '1W' | '1M' | '1Y';

const CHART_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const CHART_RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRIES = 3;

interface CryptoChartProps {
  cryptoId: string;
  currency: string;
  timeframe: Timeframe;
}

const ChartContentDiv = styled.div`
  flex: 1;
  opacity: 0;
  will-change: opacity;
  transform: translateZ(0);
  transition: opacity 0.3s ease-in-out;
  &.loaded {
    opacity: 1;
  }
`;

const PURPLE_COLORS = {
  line: '#8B5CF6',
  top: 'rgba(139, 92, 246, 0.3)',
  bottom: 'rgba(139, 92, 246, 0.1)'
};

const CryptoChart: React.FC<CryptoChartProps> = memo(({ cryptoId, currency, timeframe }) => {
  console.log('🚀 CryptoChart Component Mounted:', { cryptoId, currency });

  const { error: contextError, loading: contextLoading } = useCrypto();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const baseVisibleRangeRef = useRef<{ from: Time; to: Time } | null>(null);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const chartOptions = useMemo<DeepPartial<ChartOptions>>(() => ({
    layout: {
      background: { type: ColorType.Solid, color: '#111111' },
      textColor: '#9ca3af',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      timeVisible: true,
      secondsVisible: timeframe === '1D',
      fixLeftEdge: true,
      fixRightEdge: true,
      tickMarkFormatter: (time: number) => {
        const date = new Date(time * 1000);
        const format = (n: number) => n.toString().padStart(2, '0');
        switch (timeframe) {
          case '1D':
            return `${format(date.getHours())}:${format(date.getMinutes())}`;
          case '1W':
          case '1M':
            return `${format(date.getDate())}/${format(date.getMonth() + 1)}`;
          case '1Y':
            return `${format(date.getMonth() + 1)}/${date.getFullYear()}`;
          default:
            return '';
        }
      },
    },
    crosshair: {
      vertLine: {
        color: 'rgba(139, 92, 246, 0.3)',
        width: 1,
        style: 1,
        labelBackgroundColor: '#8b5cf6',
      },
      horzLine: {
        color: 'rgba(139, 92, 246, 0.3)',
        width: 1,
        style: 1,
        labelBackgroundColor: '#8b5cf6',
      },
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: {
        time: true,
        price: true,
      },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
      autoScale: true,
      alignLabels: true,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      ticksVisible: true,
    },
  }), [timeframe]);

  const resetBaseVisibleRange = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
      const currentRange = chartRef.current.timeScale().getVisibleRange();
      if (currentRange) {
        const buffer = (Number(currentRange.to) - Number(currentRange.from)) * 0.02;
        baseVisibleRangeRef.current = {
          from: (Number(currentRange.from) - buffer) as Time,
          to: (Number(currentRange.to) + buffer) as Time
        };
        console.log('🔄 Reset base visible range with buffer:', baseVisibleRangeRef.current);
      }
    }
  }, []);

  const initChart = useCallback(() => {
    console.log('📊 Initializing Chart...', { cryptoId, currency });
    if (chartContainerRef.current) {
      let resizeObserver: ResizeObserver | null = null;
      try {
        console.log('🎨 Creating new chart with options:', chartOptions);
        const chart = createChart(chartContainerRef.current, {
          ...chartOptions,
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
          handleScale: {
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: {
              time: true,
              price: false
            }
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false
          },
        });
        chartRef.current = chart;

        console.log('📈 Adding area series with purple colors');
        const areaSeries = chart.addSeries(AreaSeries, {
          lineColor: PURPLE_COLORS.line,
          topColor: PURPLE_COLORS.top,
          bottomColor: PURPLE_COLORS.bottom,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        });
        seriesRef.current = areaSeries;
        console.log('✅ Chart initialization complete');

        let resizeFrameId: number | undefined;
        resizeObserver = new ResizeObserver(() => {
          if (resizeFrameId !== undefined) return;
          resizeFrameId = requestAnimationFrame(() => {
            if (chartContainerRef.current && chartRef.current) {
              chartRef.current.applyOptions({
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight,
              });
            }
            resizeFrameId = undefined;
          });
        });
        resizeObserver.observe(chartContainerRef.current);

        const throttledTimeScaleChange = (() => {
          let rafId: number | null = null;
          return (newRange: any) => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
              if (newRange && baseVisibleRangeRef.current) {
                const baseFrom = Number(baseVisibleRangeRef.current.from);
                const baseTo = Number(baseVisibleRangeRef.current.to);
                const newFrom = Number(newRange.from);
                const newTo = Number(newRange.to);
                const rangeWidth = newTo - newFrom;
                const baseWidth = baseTo - baseFrom;
                if (rangeWidth > baseWidth || newFrom < baseFrom || newTo > baseTo) {
                  chart.timeScale().setVisibleRange(baseVisibleRangeRef.current);
                }
              }
              rafId = null;
            });
          };
        })();
        chart.timeScale().subscribeVisibleTimeRangeChange(throttledTimeScaleChange);

        return () => {
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          if (seriesRef.current) {
            seriesRef.current = null;
          }
          if (chartRef.current) {
            try {
              chartRef.current.remove();
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
  }, [chartOptions, cryptoId, currency]);

  const updateChartData = useCallback((data: ChartDataPoint[]) => {
    console.log('🔄 Updating chart data:', { dataPoints: data.length });
    if (seriesRef.current && data.length > 0) {
      try {
        const formattedData = data.map(point => ({
          time: typeof point.time === 'string' ? Math.floor(new Date(point.time).getTime() / 1000) as Time : point.time as Time,
          value: Number(point.value || point.price)
        }));
        console.log('📊 Formatted data sample:', formattedData[0], '...', formattedData[formattedData.length - 1]);

        seriesRef.current.setData(formattedData);
        console.log('✅ Chart data updated successfully');

        if (chartRef.current) {
          chartRef.current.applyOptions({
            timeScale: {
              timeVisible: true,
              secondsVisible: timeframe === '1D',
              tickMarkFormatter: (time: number) => {
                const date = new Date(time * 1000);
                const format = (n: number) => n.toString().padStart(2, '0');
                switch (timeframe) {
                  case '1D':
                    return `${format(date.getHours())}:${format(date.getMinutes())}`;
                  case '1W':
                    return `${format(date.getDate())}/${format(date.getMonth() + 1)}`;
                  case '1M':
                    return `${format(date.getDate())}/${format(date.getMonth() + 1)}`;
                  case '1Y':
                    return `${format(date.getMonth() + 1)}/${date.getFullYear()}`;
                  default:
                    return '';
                }
              },
            },
          });

          chartRef.current.timeScale().fitContent();
          const currentRange = chartRef.current.timeScale().getVisibleRange();
          if (currentRange) {
            const timeBuffer = {
              '1D': 0.02,
              '1W': 0.03,
              '1M': 0.04,
              '1Y': 0.05
            }[timeframe] || 0.02;

            const buffer = (Number(currentRange.to) - Number(currentRange.from)) * timeBuffer;
            baseVisibleRangeRef.current = {
              from: (Number(currentRange.from) - buffer) as Time,
              to: (Number(currentRange.to) + buffer) as Time
            };
          }
        }

        const startPrice = formattedData[0].value;
        const endPrice = formattedData[formattedData.length - 1].value;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        setPriceChange(changePercent);

        seriesRef.current.applyOptions({
          lineColor: PURPLE_COLORS.line,
          topColor: PURPLE_COLORS.top,
          bottomColor: PURPLE_COLORS.bottom,
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
      
      const data = await getHistoricalPriceData(cryptoId, currency, selectedTimeframe);
      
      updateChartData(data);
      setRetryCount(0);
      setChartLoaded(true);
    } catch (error) {
      console.error('❌ Error in fetchPriceHistory:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch price data');

      if (retryCount < MAX_RETRIES) {
        const nextRetry = CHART_RETRY_DELAY * Math.pow(2, retryCount);
        fetchTimeout.current = setTimeout(() => {
          fetchPriceHistory(selectedTimeframe);
        }, nextRetry);
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [cryptoId, currency, updateChartData, retryCount]);

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
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        lineColor: PURPLE_COLORS.line,
        topColor: PURPLE_COLORS.top,
        bottomColor: PURPLE_COLORS.bottom,
      });
      resetBaseVisibleRange();
    }
  }, [timeframe, resetBaseVisibleRange]);

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
          </ChartTitle>
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

export default CryptoChart;