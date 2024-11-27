import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import axios from 'axios';
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
import { TOKEN_IDS, COINGECKO_API_KEY } from '../config/constants';
import { usePrices } from '../hooks/usePrices';
import { useCurrency } from '../context/CurrencyContext';
import TradingViewChart from './TradingViewChart';
import MapleLeafIcon from '../assets/Maple_Leaf.svg';

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

const pulse = keyframes`
  0% {
    transform: scale(0.95);
    opacity: 0.5;
  }
  50% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(0.95);
    opacity: 0.5;
  }
`;

const ChartContainer = styled.div`
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  width: 100%;
  max-width: 1200px;
  height: 350px;
  position: relative;
  overflow: hidden;
  margin: 0 auto;
  animation: ${fadeIn} 0.6s ease-out;

  .chart-content {
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    height: 100%;
    
    &.loaded {
      opacity: 1;
    }
  }

  @media (max-width: 1400px) {
    max-width: 1000px;
  }

  @media (max-width: 1200px) {
    max-width: 800px;
  }

  @media (max-width: 992px) {
    max-width: 92%;
    height: 300px;
    padding: 0.75rem;
  }

  @media (max-width: 768px) {
    height: 300px;
    padding: 0.5rem;
  }

  @media (max-width: 480px) {
    height: 250px;
    margin-bottom: 1rem;
    padding: 0.5rem 0;
  }
`;

const LoadingOverlay = styled.div<{ tokenType: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }>`
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
  border-radius: inherit;
  overflow: hidden;
`;

const LoadingSpinner = styled.div<{ tokenType: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }>`
  width: 60px;
  height: 60px;
  border: 4px solid ${props => `${TOKEN_COLORS[props.tokenType].main}1A`}; 
  border-top: 4px solid ${props => TOKEN_COLORS[props.tokenType].main};
  border-radius: 50%;
  animation: ${spin} 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
  box-shadow: 0 0 25px ${props => `${TOKEN_COLORS[props.tokenType].main}40`}; 
`;

const LoadingText = styled.div<{ tokenType: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }>`
  margin-top: 20px;
  font-size: 16px;
  font-weight: 500;
  color: ${props => TOKEN_COLORS[props.tokenType].main};
  text-shadow: 0 0 10px ${props => `${TOKEN_COLORS[props.tokenType].main}66`}; 
  animation: ${pulse} 1.5s ease-in-out infinite;
  letter-spacing: 0.5px;
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const ChartTitle = styled.div`
  color: #888;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const PriceChange = styled.span<{ isPositive: boolean }>`
  color: ${props => props.isPositive ? '#4caf50' : '#ff4444'};
  font-size: 0.9rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${props => props.isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 68, 68, 0.1)'};
`;

const TimeframeButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

interface TimeButtonProps {
  active: boolean;
}

const TimeButton = styled.button<TimeButtonProps>`
  background: ${(props: TimeButtonProps) => props.active ? 'rgba(251, 255, 58, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${(props: TimeButtonProps) => props.active ? '#FBFF3A' : 'rgba(255, 255, 255, 0.1)'};
  color: ${(props: TimeButtonProps) => props.active ? '#FBFF3A' : '#888'};
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(251, 255, 58, 0.1);
    border-color: #FBFF3A;
    color: #FBFF3A;
  }
`;

const TokenSelectorContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  align-items: center;
  position: relative;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const TokenButtonsGroup = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const LivePrice = styled.span<{ tokenType: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }>`
  color: ${props => TOKEN_COLORS[props.tokenType].main};
  font-size: 1rem;
  font-weight: 500;

  @media (max-width: 480px) {
    font-size: 0.9rem;
  }
`;

const PriceDisplayContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const LivePriceIcon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;

  @media (max-width: 480px) {
    width: 16px;
    height: 16px;
  }
`;

const TOKEN_COLORS = {
  DBR: {
    main: '#FBFF3A',
    background: 'rgba(251, 255, 58, 0.1)',
    border: '#FBFF3A',
    hover: 'rgba(251, 255, 58, 0.15)',
    tooltip: '#FBFF3A',
    activeDot: 'rgba(251, 255, 58, 0.3)'
  },
  SOL: {
    main: '#9945FF',
    background: 'rgba(153, 69, 255, 0.1)',
    border: '#9945FF',
    hover: 'rgba(153, 69, 255, 0.15)',
    tooltip: '#9945FF',
    activeDot: 'rgba(153, 69, 255, 0.3)'
  },
  BTC: {
    main: '#F7931A',
    background: 'rgba(247, 147, 26, 0.1)',
    border: '#F7931A',
    hover: 'rgba(247, 147, 26, 0.15)',
    tooltip: '#F7931A',
    activeDot: 'rgba(247, 147, 26, 0.3)'
  },
  CADUSD: {
    main: '#DC143C',
    background: 'rgba(220, 20, 60, 0.1)',
    border: '#DC143C',
    hover: 'rgba(220, 20, 60, 0.15)',
    tooltip: '#DC143C',
    activeDot: 'rgba(220, 20, 60, 0.3)'
  }
};

const TokenButton = styled.button<{ active: boolean; tokenType: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }>`
  background: ${props => props.active ? TOKEN_COLORS[props.tokenType].background : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.active ? TOKEN_COLORS[props.tokenType].border : 'rgba(255, 255, 255, 0.1)'};
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  overflow: hidden;

  &:hover {
    border-color: ${props => TOKEN_COLORS[props.tokenType].border};
    background: ${props => TOKEN_COLORS[props.tokenType].hover};
  }

  img {
    width: ${props => props.tokenType === 'CADUSD' ? '18px' : '24px'};
    height: ${props => props.tokenType === 'CADUSD' ? '18px' : '24px'};
    border-radius: ${props => props.tokenType === 'CADUSD' ? '0' : '50%'};
    object-fit: contain;
    filter: ${props => props.tokenType === 'CADUSD' && !props.active 
      ? 'brightness(0.7) opacity(0.8)' 
      : props.tokenType === 'CADUSD' 
        ? 'brightness(1) saturate(1.2)' 
        : 'none'};
    transition: all 0.2s ease;
  }

  &:hover img {
    filter: ${props => props.tokenType === 'CADUSD' 
      ? 'brightness(1) saturate(1.2)' 
      : 'none'};
    transform: scale(1.1);
  }

  @media (max-width: 480px) {
    width: 32px;
    height: 32px;
    
    img {
      width: ${props => props.tokenType === 'CADUSD' ? '14px' : '20px'};
      height: ${props => props.tokenType === 'CADUSD' ? '14px' : '20px'};
    }
  }
`;

const ChartWrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

interface PriceData {
  prices: [number, number][];
}

interface ChartDataPoint {
  timestamp: number;
  price: number;
  formattedDate: string;
}

type Timeframe = '24H' | '7D' | '30D';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
  }>;
  label?: string;
  currency: string;
}

const TooltipContainer = styled.div`
  background: rgba(0, 0, 0, 0.8);
  padding: 8px;
  border: 1px solid #444;
  border-radius: 4px;
`;

const TooltipText = styled.p`
  color: #fff;
  margin: 0;
`;

const TooltipPrice = styled.p<{ color: string }>`
  color: ${props => props.color};
  margin: 4px 0 0 0;
`;

const ErrorMessage = styled.div`
  color: #ff4444;
  text-align: center;
  padding: 1rem;
`;

const CustomTooltip: React.FC<CustomTooltipProps & { selectedToken: 'DBR' | 'SOL' | 'BTC' | 'CADUSD' }> = ({ 
  active, 
  payload, 
  label, 
  currency,
  selectedToken 
}) => {
  if (active && payload && payload.length) {
    const currencySymbol = currency === 'USD' ? '$' : 'C$';
    return (
      <TooltipContainer>
        <TooltipText>
          {label ? format(new Date(parseInt(label)), 'MMM d, yyyy h:mm a') : ''}
        </TooltipText>
        <TooltipPrice color={TOKEN_COLORS[selectedToken].tooltip}>
          {currencySymbol}{payload[0].value.toFixed(4)}
        </TooltipPrice>
      </TooltipContainer>
    );
  }
  return null;
};

const getTimeframeParams = (timeframe: Timeframe): { days: string; interval?: string } => {
  switch (timeframe) {
    case '24H':
      return { days: '1' };  
    case '7D':
      return { days: '7', interval: 'daily' };
    case '30D':
      return { days: '30', interval: 'daily' };
    default:
      return { days: '7', interval: 'daily' };
  }
};

const calculateDomain = (data: ChartDataPoint[]) => {
  if (!data.length) return ['auto', 'auto'];
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.1; // Add 10% padding
  return [min - padding, max + padding];
};

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

export const PriceChart: React.FC = () => {
  const { prices } = usePrices();
  const { currency } = useCurrency();
  const [selectedToken, setSelectedToken] = useState<'DBR' | 'SOL' | 'BTC' | 'CADUSD'>('DBR');
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('24H');
  const [error, setError] = useState<string | null>(null);
  const [displayTicks, setDisplayTicks] = useState<number[]>([]);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [tradingViewLoading, setTradingViewLoading] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [tradingViewKey, setTradingViewKey] = useState(0);

  const dbrLogo = prices?.['debridge']?.['image'];
  const solLogo = prices?.['solana']?.['image']
  const btcLogo = prices?.['bitcoin']?.['image']

  const fetchPriceHistory = async (selectedTimeframe: Timeframe) => {
    try {
      setLoading(true);
      setError(null);
      const params = getTimeframeParams(selectedTimeframe);
      
      console.log('Fetching with params:', params);
      
      if (selectedToken === 'CADUSD') {
        // Handle CAD/USD differently or return mock data
        // This is just a placeholder - implement actual CAD/USD fetching logic
        return;
      }

      const response = await axios.get<PriceData>(
        `https://api.coingecko.com/api/v3/coins/${TOKEN_IDS[selectedToken as keyof typeof TOKEN_IDS]}/market_chart`,
        {
          params: {
            vs_currency: currency.toLowerCase(),
            days: params.days,
            ...(params.interval && { interval: params.interval })
          },
          headers: {
            'x-cg-demo-api-key': COINGECKO_API_KEY
          }
        }
      );

      if (!response.data.prices || response.data.prices.length === 0) {
        throw new Error('No price data available');
      }

      const formatString = selectedTimeframe === '24H' ? 'HH:mm' : 'MMM d';
      let formattedData = response.data.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
        formattedDate: format(new Date(timestamp), formatString),
      }));

      // Calculate price change percentage
      if (formattedData.length >= 2) {
        const startPrice = formattedData[0].price;
        const endPrice = formattedData[formattedData.length - 1].price;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        setPriceChange(changePercent);
      }

      const displayTicks = formattedData.filter((_, index) => {
        const totalPoints = formattedData.length;
        const tickCount = getTickCount(selectedTimeframe, window.innerWidth <= 480);
        const interval = Math.floor(totalPoints / (tickCount - 1));
        return index === 0 || index === totalPoints - 1 || index % interval === 0;
      });

      setDisplayTicks(displayTicks.map(d => d.timestamp));
      setChartData(formattedData);
    } catch (error: any) {
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setError(error.response?.data?.error || 'Failed to fetch price data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleTokenChange = (token: 'DBR' | 'SOL' | 'BTC' | 'CADUSD') => {
    if (token === 'CADUSD' && selectedToken === 'CADUSD') {
      setTradingViewLoading(true);
      setChartLoaded(false);
      setTradingViewKey(prev => prev + 1);
    } else {
      setSelectedToken(token);
      setChartLoaded(false);
      if (token === 'CADUSD') {
        setTradingViewLoading(true);
      } else {
        setTradingViewLoading(false);
        fetchPriceHistory('24H');
      }
    }
  };

  useEffect(() => {
    if (chartData.length > 0 && !loading) {
      setTimeout(() => {
        setChartLoaded(true);
      }, 500);
    }
  }, [chartData, loading]);

  useEffect(() => {
    fetchPriceHistory(timeframe);
    const interval = setInterval(() => fetchPriceHistory(timeframe), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [timeframe, selectedToken, currency]);

  const handleTimeframeChange = (newTimeframe: Timeframe) => {
    setTimeframe(newTimeframe);
  };

  return (
    <ChartWrapper>
      <TokenSelectorContainer>
        <TokenButtonsGroup>
          <TokenButton
            active={selectedToken === 'DBR'}
            onClick={() => handleTokenChange('DBR')}
            title="Switch to DBR/USDC"
            tokenType="DBR"
          >
            {dbrLogo && <img src={dbrLogo} alt="DBR" />}
          </TokenButton>
          <TokenButton
            active={selectedToken === 'SOL'}
            onClick={() => handleTokenChange('SOL')}
            title="Switch to SOL/USDC"
            tokenType="SOL"
          >
            {solLogo && <img src={solLogo} alt="SOL" />}
          </TokenButton>
          <TokenButton
            active={selectedToken === 'BTC'}
            onClick={() => handleTokenChange('BTC')}
            title="Switch to BTC/USDC"
            tokenType="BTC"
          >
            {btcLogo && <img src={btcLogo} alt="BTC" />}
          </TokenButton>
          <TokenButton
            active={selectedToken === 'CADUSD'}
            onClick={() => handleTokenChange('CADUSD')}
            title="Switch to CAD/USD"
            tokenType="CADUSD"
          >
            <img 
              src={MapleLeafIcon}
              alt="CAD/USD"
            />
          </TokenButton>
        </TokenButtonsGroup>
        
        {selectedToken !== 'CADUSD' && (
          <PriceDisplayContainer>
            {selectedToken === 'DBR' && dbrLogo && (
              <LivePriceIcon src={dbrLogo} alt="DBR" />
            )}
            {selectedToken === 'SOL' && solLogo && (
              <LivePriceIcon src={solLogo} alt="SOL" />
            )}
            {selectedToken === 'BTC' && btcLogo && (
              <LivePriceIcon src={btcLogo} alt="BTC" />
            )}
            <LivePrice tokenType={selectedToken}>
              {currency === 'USD' ? '$' : 'C$'}
              {selectedToken === 'BTC' 
                ? prices?.[TOKEN_IDS[selectedToken]]?.['usd']?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                : selectedToken === 'SOL'
                  ? prices?.[TOKEN_IDS[selectedToken]]?.['usd']?.toFixed(2)
                  : prices?.[TOKEN_IDS[selectedToken]]?.['usd']?.toFixed(6)
              }
            </LivePrice>
          </PriceDisplayContainer>
        )}
      </TokenSelectorContainer>
      <ChartContainer>
        {selectedToken === 'CADUSD' ? (
          <>
            {tradingViewLoading && (
              <LoadingOverlay tokenType="CADUSD">
                <LoadingSpinner tokenType="CADUSD" />
                <LoadingText tokenType="CADUSD">Loading CADUSD Chart...</LoadingText>
              </LoadingOverlay>
            )}
            <TradingViewChart 
              key={tradingViewKey} 
              onLoadingChange={setTradingViewLoading} 
            />
          </>
        ) : (
          <>
            <ChartHeader>
              <ChartTitle>
                {selectedToken}/{currency} Price
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
                    onClick={() => handleTimeframeChange(tf)}
                  >
                    {tf}
                  </TimeButton>
                ))}
              </TimeframeButtons>
            </ChartHeader>
            {(loading || !chartLoaded) && (
              <LoadingOverlay tokenType={selectedToken}>
                <LoadingSpinner tokenType={selectedToken} />
                <LoadingText tokenType={selectedToken}>Loading {selectedToken} Chart...</LoadingText>
              </LoadingOverlay>
            )}
            <div className={`chart-content${chartLoaded ? ' loaded' : ''}`}>
              {error && <ErrorMessage>{error}</ErrorMessage>}
              {!loading && !error && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={window.innerWidth <= 480 ? 200 : 300}>
                  <LineChart 
                    data={chartData} 
                    margin={{ 
                      top: 10, 
                      right: window.innerWidth <= 480 ? 15 : 25, 
                      left: window.innerWidth <= 480 ? 0 : 0, 
                      bottom: window.innerWidth <= 480 ? 10 : 5 
                    }}
                  >
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="rgba(255,255,255,0.1)" 
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(timestamp) => {
                        const date = new Date(timestamp);
                        if (timeframe === '24H') {
                          return format(date, 'h:mm a');
                        } else if (timeframe === '7D') {
                          return format(date, 'MMM d');
                        } else {
                          return format(date, 'MMM d');
                        }
                      }}
                      ticks={displayTicks}
                      tick={{ 
                        fill: '#fff', 
                        fontSize: window.innerWidth <= 480 ? 10 : 12,
                        dy: window.innerWidth <= 480 ? 5 : 0
                      }}
                      height={window.innerWidth <= 480 ? 40 : 30}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <YAxis 
                      domain={calculateDomain(chartData)}
                      tick={{ 
                        fill: '#fff', 
                        fontSize: window.innerWidth <= 480 ? 10 : 12 
                      }}
                      tickFormatter={(value) => {
                        const currencyPrefix = currency === 'USD' ? '$' : 'C$';
                        // Format BTC with whole numbers, others with decimals
                        if (selectedToken === 'BTC') {
                          return `${currencyPrefix}${Math.round(value).toLocaleString()}`;
                        }
                        const roundedValue = selectedToken === 'SOL' ? 
                          Math.round(value) : 
                          Number(value).toFixed(3);
                        return `${currencyPrefix}${roundedValue}`;
                      }}
                      width={window.innerWidth <= 480 ? 60 : 70}
                      tickCount={5}
                      allowDecimals={true}
                      scale="linear"
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <Tooltip 
                      content={<CustomTooltip currency={currency} selectedToken={selectedToken} />}
                      animationDuration={200}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={TOKEN_COLORS[selectedToken].main}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ 
                        r: 6, 
                        fill: TOKEN_COLORS[selectedToken].main,
                        stroke: TOKEN_COLORS[selectedToken].activeDot,
                        strokeWidth: 4
                      }}
                      animationDuration={1500}
                      animationBegin={300}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </ChartContainer>
    </ChartWrapper>
  );
};
