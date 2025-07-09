import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import styled from 'styled-components';
import { getTokenStats } from '../services';
import { useCrypto } from '../context/CryptoContext';

const StatsPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;

  @media (max-height: 850px) {
    gap: 0.5rem;
  }
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: rgba(139, 92, 246, 0.04);
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.08);
  transition: all 0.2s ease-in-out;

  &:hover {
    background: rgba(139, 92, 246, 0.07);
    border-color: rgba(139, 92, 246, 0.15);
    transform: scale(1.02);
  }

  @media (max-height: 850px) {
    padding: 0.5rem 0.75rem;
  }
`;

const StatLabel = styled.span`
  color: #9ca3af;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const InfoIcon = styled.span`
  cursor: help;
  color: rgba(139, 92, 246, 0.6);
  font-size: 0.75rem;
  transition: color 0.2s ease;

  &:hover {
    color: rgba(139, 92, 246, 1);
  }
`;

const StatValue = styled.span<{ $isLimited?: boolean; $isNegative?: boolean; $isPositive?: boolean }>`
  color: ${props => 
    props.$isNegative ? '#ef4444' : 
    props.$isPositive ? '#22c55e' :
    props.$isLimited ? '#9ca3af' : '#fff'};
  font-size: 0.95rem;
  font-weight: 600;
  text-align: right;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatValueWithDate = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const DateLabel = styled.span`
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 2px;
`;

const DataSourceBadge = styled.span<{ $source: 'coingecko' | 'cryptocompare' }>`
  font-size: 0.625rem;
  padding: 0.2rem 0.4rem;
  border-radius: 8px;
  background: ${props => props.$source === 'coingecko' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(234, 179, 8, 0.1)'};
  color: ${props => props.$source === 'coingecko' ? 'rgb(139, 92, 246)' : 'rgb(234, 179, 8)'};
  border: 1px solid ${props => props.$source === 'coingecko' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)'};
`;

const LimitedDataIndicator = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.5rem;
  text-align: center;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(139, 92, 246, 0.1);
`;

const LoadingText = styled.div`
  color: #9ca3af;
  text-align: center;
  padding: 1rem;
`;

const ErrorText = styled.div`
  color: #ef4444;
  text-align: center;
  padding: 1rem;
  font-size: 0.875rem;
`;

const RetryButton = styled.button`
  background: rgba(139, 92, 246, 0.1);
  color: #fff;
  border: 1px solid rgba(139, 92, 246, 0.2);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.875rem;
  margin-top: 0.5rem;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(139, 92, 246, 0.2);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const StatGroup = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  background: rgba(139, 92, 246, 0.04);
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.08);
  transition: all 0.2s ease-in-out;
  gap: 0.5rem;

  &:hover {
    background: rgba(139, 92, 246, 0.07);
    border-color: rgba(139, 92, 246, 0.15);
    transform: scale(1.02);
  }

  @media (max-height: 850px) {
    padding: 0.5rem 0.75rem;
    gap: 0.25rem;
  }
`;

const StatGroupTitle = styled.div`
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #fff;

  @media (max-height: 850px) {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
`;

const ProgressBarBackground = styled.div`
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
`;

const ProgressBarFill = styled.div<{ $width: number }>`
  height: 100%;
  width: ${props => props.$width}%;
  background: #8b5cf6;
  border-radius: 4px;
  transition: width 0.5s ease-in-out;
`;

const ProgressLabels = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;

  @media (max-height: 850px) {
    font-size: 0.7rem;
  }
`;

const RetryOverlay = styled(LoadingText)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  color: #9ca3af;
`;

const RetryProgress = styled.div`
  width: 100%;
  max-width: 200px;
  height: 4px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 0.5rem;
`;

const RetryBar = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: #8b5cf6;
  transition: width 0.3s ease;
`;

const RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MULTIPLIER = 1.5;

interface TokenStatsProps {
  cryptoId: string;
  currency: string;
}

interface TokenStatsData {
  marketCap: string;
  volume24h: string;
  fdv: string;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  dataSource: 'coingecko' | 'cryptocompare';
  hasFullData: boolean;
  ath: string;
  athRaw: number;
  atl: string;
  atlRaw: number;
  athDate: string;
  atlDate: string;
  low24h: string;
  high24h: string;
  low7d: string;
  high7d: string;
  marketCapRank: number;
  currentPrice: number;
}

const formatNumber = (num: number | null | undefined, currency: string = 'USD'): string => {
  if (num === null || num === undefined || isNaN(num)) {
    return 'N/A';
  }

  // 1. Set formatting options, but without the 'currency' style
  const numberFormatOptions: Intl.NumberFormatOptions = {
    style: 'decimal', // We'll handle the symbol manually
    notation: 'compact',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  if (Math.abs(num) < 1000) {
    numberFormatOptions.notation = 'standard';
    if (Math.abs(num) < 1) {
      numberFormatOptions.maximumFractionDigits = 6;
    }
  }

  // 2. Always format the number using the 'en-US' locale for consistency (B, M, etc.)
  const formattedNumber = new Intl.NumberFormat('en-US', numberFormatOptions).format(num);

  // 3. Determine the correct symbol
  const upperCurrency = currency.toUpperCase();
  let symbol = '$'; // Default to USD
  if (upperCurrency === 'CAD') {
    symbol = 'CA$';
  } else if (upperCurrency === 'EUR') {
    symbol = '€';
  }

  // 4. Prepend the correct symbol to the consistently formatted number
  return `${symbol}${formattedNumber}`;
};

const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return 'N/A';
    }
}

const HorizontalProgressBar: React.FC<{
  percentage: number;
  total: number | null;
}> = ({ percentage, total }) => {
  return (
    <ProgressBarContainer>
      <ProgressBarBackground>
        <ProgressBarFill $width={percentage} />
      </ProgressBarBackground>
      <ProgressLabels>
        <span>{percentage.toFixed(0)}% Circulating</span>
        <span>Total: {total?.toLocaleString() ?? 'N/A'}</span>
      </ProgressLabels>
    </ProgressBarContainer>
  );
};

const _TokenStats: React.FC<TokenStatsProps> = ({ cryptoId, currency }) => {
  const [stats, setStats] = useState<TokenStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryProgress, setRetryProgress] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { getCryptoId } = useCrypto();

  const clearTimeouts = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startRetryProgress = useCallback((duration: number) => {
    setRetryProgress(0);
    const startTime = Date.now();
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setRetryProgress(progress);
      
      if (progress >= 100 && progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }, 100);
  }, []);

  const fetchStats = useCallback(async () => {
    console.log(`[TokenStats.tsx] fetchStats called with props:`, { cryptoId, currency });
    try {
      setLoading(true);
      setError(null);
      clearTimeouts();
      
      const coingeckoId = getCryptoId(cryptoId);
      if (!coingeckoId) {
        throw new Error(`No CoinGecko ID found for ${cryptoId}`);
      }
      
      const statsData = await getTokenStats(coingeckoId, currency.toLowerCase());

      console.log('[TokenStats.tsx] Fetched statsData:', statsData);

      setStats({
        marketCap: formatNumber(statsData.marketCap, currency),
        volume24h: formatNumber(statsData.volume24h, currency),
        fdv: formatNumber(statsData.fdv, currency),
        circulatingSupply: statsData.circulatingSupply,
        totalSupply: statsData.totalSupply,
        maxSupply: statsData.maxSupply,
        dataSource: statsData.dataSource,
        hasFullData: statsData.hasFullData,
        ath: formatNumber(statsData.ath, currency),
        athRaw: statsData.ath,
        atl: formatNumber(statsData.atl, currency),
        atlRaw: statsData.atl,
        athDate: formatDate(statsData.athDate),
        atlDate: formatDate(statsData.atlDate),
        low24h: formatNumber(statsData.low24h, currency),
        high24h: formatNumber(statsData.high24h, currency),
        low7d: formatNumber(statsData.low7d, currency),
        high7d: formatNumber(statsData.high7d, currency),
        marketCapRank: statsData.marketCapRank,
        currentPrice: statsData.currentPrice,
      });
      setRetryCount(0);
      setRetryProgress(0);
    } catch (error) {
      console.error('Error fetching token stats:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stats';
      setError(errorMessage);

      if (retryCount < MAX_RETRIES) {
        const nextRetryDelay = RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, retryCount);
        console.log(`Retrying in ${nextRetryDelay/1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        startRetryProgress(nextRetryDelay);
        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchStats();
        }, nextRetryDelay);
      }
    } finally {
      setLoading(false);
    }
  }, [cryptoId, currency, getCryptoId, clearTimeouts, startRetryProgress, retryCount]);

  useEffect(() => {
    console.log('[TokenStats.tsx] useEffect triggered, calling fetchStats.');
    fetchStats();
    return () => clearTimeouts();
  }, [fetchStats, clearTimeouts]);

  const athDropInfo = React.useMemo(() => {
    if (stats?.athRaw == null || stats?.currentPrice == null || stats.athRaw === 0) {
      return null;
    }
    const priceDrop = stats.currentPrice - stats.athRaw; // Negative if price dropped
    const percentageDrop = (priceDrop / stats.athRaw) * 100;
    
    return {
        priceDrop,
        percentageDrop
    };
  }, [stats]);

  const atlIncreaseInfo = React.useMemo(() => {
    if (stats?.atlRaw == null || stats?.currentPrice == null || stats.atlRaw === 0) {
      return null;
    }
    const priceIncrease = stats.currentPrice - stats.atlRaw;
    const percentageIncrease = (priceIncrease / stats.atlRaw) * 100;
    
    return {
        priceIncrease,
        percentageIncrease
    };
  }, [stats]);

  const handleRetry = () => {
    setRetryCount(0);
    fetchStats();
  };

  if (loading && !stats) {
    return <LoadingText>Loading stats...</LoadingText>;
  }

  if (error) {
    return (
      <StatsPanel>
        {retryCount < MAX_RETRIES ? (
          <RetryOverlay>
            <div>{error}</div>
            <div>Retrying automatically... ({retryCount + 1}/{MAX_RETRIES})</div>
            <RetryProgress>
              <RetryBar $progress={retryProgress} />
            </RetryProgress>
          </RetryOverlay>
        ) : (
          <ErrorText>
            {error}
            <br />
            <RetryButton onClick={handleRetry}>
              Retry {retryCount > 0 ? `(${retryCount})` : ''}
            </RetryButton>
          </ErrorText>
        )}
      </StatsPanel>
    );
  }

  const calculateSupplyPercentage = () => {
    if (!stats || !stats.circulatingSupply) return 0;
    
    // Use maxSupply if available, otherwise fallback to totalSupply
    const denominator = stats.maxSupply || stats.totalSupply;
    if (!denominator) return 0;
    
    return (stats.circulatingSupply / denominator) * 100;
  };

  return (
    <StatsPanel>
      <StatGroup>
        <StatGroupTitle>
            {cryptoId.toUpperCase()} Historical Price
        </StatGroupTitle>
        <StatRow>
            <StatLabel>24h Range</StatLabel>
            <StatValue>{stats?.low24h} – {stats?.high24h}</StatValue>
        </StatRow>
        <StatRow>
            <StatLabel>7d Range</StatLabel>
            <StatValue>{stats?.low7d} – {stats?.high7d}</StatValue>
        </StatRow>
      </StatGroup>
      <StatRow>
        <StatLabel>
          Market Cap
          <InfoIcon title={`Total value of all currently circulating tokens`}>ⓘ</InfoIcon>
        </StatLabel>
        <StatValue $isLimited={!stats?.hasFullData}>
          {stats?.marketCap || 'N/A'}
        </StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>
          Volume (24h)
          <InfoIcon title="Total trading volume in the last 24 hours">ⓘ</InfoIcon>
        </StatLabel>
        <StatValue $isLimited={!stats?.hasFullData}>
          {stats?.volume24h || 'N/A'}
        </StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>
          FDV
          <InfoIcon title="Fully Diluted Valuation - Total market cap if maximum token supply was in circulation">ⓘ</InfoIcon>
        </StatLabel>
        <StatValue $isLimited={!stats?.hasFullData}>
          {stats?.fdv || 'N/A'}
        </StatValue>
      </StatRow>
      <StatGroup>
        <StatRow style={{ padding: 0, border: 'none', background: 'transparent' }}>
            <StatLabel>
                Circulating Supply
                <InfoIcon title={`Percentage of circulating supply relative to max/total supply`}>ⓘ</InfoIcon>
            </StatLabel>
            <StatValue $isLimited={!stats?.hasFullData}>
                {stats?.circulatingSupply?.toLocaleString() || 'N/A'}
            </StatValue>
        </StatRow>
        <HorizontalProgressBar 
            percentage={calculateSupplyPercentage()}
            total={stats?.maxSupply || stats?.totalSupply || null}
        />
      </StatGroup>
      <StatRow>
        <StatLabel>
          All-Time High
          <InfoIcon title={`Highest price ever reached.`}>ⓘ</InfoIcon>
        </StatLabel>
        <StatValueWithDate>
            <StatValue>{stats?.ath || 'N/A'}</StatValue>
            <DateLabel>{stats?.athDate || 'N/A'}</DateLabel>
        </StatValueWithDate>
      </StatRow>
      {athDropInfo !== null && (
        <StatRow>
          <StatLabel>
            From ATH
            <InfoIcon title="Drop from All-Time High (price and percentage)">ⓘ</InfoIcon>
          </StatLabel>
          <StatValue $isNegative={athDropInfo.priceDrop < 0}>
            {formatNumber(athDropInfo.priceDrop, currency)}
            {` (${athDropInfo.percentageDrop.toFixed(2)}%)`}
          </StatValue>
        </StatRow>
      )}
      <StatRow>
        <StatLabel>
          All-Time Low
          <InfoIcon title={`Lowest price ever reached.`}>ⓘ</InfoIcon>
        </StatLabel>
        <StatValueWithDate>
            <StatValue>{stats?.atl || 'N/A'}</StatValue>
            <DateLabel>{stats?.atlDate || 'N/A'}</DateLabel>
        </StatValueWithDate>
      </StatRow>
      {atlIncreaseInfo !== null && (
        <StatRow>
          <StatLabel>
            From ATL
            <InfoIcon title="Increase from All-Time Low (price and percentage)">ⓘ</InfoIcon>
          </StatLabel>
          <StatValue $isPositive={atlIncreaseInfo.priceIncrease > 0}>
            {formatNumber(atlIncreaseInfo.priceIncrease, currency)}
            {` (+${atlIncreaseInfo.percentageIncrease.toFixed(2)}%)`}
          </StatValue>
        </StatRow>
      )}
      <StatRow>
        <StatLabel>
          Market Rank
          <InfoIcon title={`Rank based on market capitalization`}>ⓘ</InfoIcon>
        </StatLabel>
        <StatValue $isLimited={!stats?.hasFullData}>
          {stats?.marketCapRank ? `#${stats.marketCapRank}` : 'N/A'}
        </StatValue>
      </StatRow>

      {stats && <DataSourceBadge style={{ alignSelf: 'center', marginTop: '0.5rem' }} $source={stats.dataSource}>
          Data via {stats.dataSource === 'coingecko' ? 'CoinGecko' : 'CryptoCompare'}
      </DataSourceBadge>}

      {stats && !stats.hasFullData && (
        <LimitedDataIndicator>
          Limited data available for this token.
        </LimitedDataIndicator>
      )}
    </StatsPanel>
  );
};

export const TokenStats = memo(_TokenStats); 