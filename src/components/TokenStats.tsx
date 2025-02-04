import React, { useEffect, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { getTokenStats } from '../services';
import { useCrypto } from '../context/CryptoContext';

const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  padding: 1rem;
  background: rgba(26, 26, 26, 0.5);
  border-radius: 16px;
  margin-top: 1rem;
  border: 1px solid rgba(139, 92, 246, 0.1);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
`;

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: rgba(139, 92, 246, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  transition: all 0.3s ease;

  &:hover {
    background: rgba(139, 92, 246, 0.08);
    transform: translateY(-2px);
  }
`;

const StatLabel = styled.span`
  color: #9ca3af;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
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

const StatValue = styled.span`
  color: #fff;
  font-size: 1.25rem;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
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

const CircleContainer = styled.div`
  position: relative;
  width: 40px;
  height: 40px;
  margin-left: auto;
`;

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const CircleBackground = styled.circle`
  fill: none;
  stroke: rgba(139, 92, 246, 0.1);
`;

const CircleProgress = styled.circle<{ progress: number }>`
  fill: none;
  stroke: rgb(139, 92, 246);
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  transition: stroke-dashoffset 0.8s ease-in-out;
`;

const PercentageText = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.625rem;
  font-weight: 600;
  color: rgb(139, 92, 246);
`;

const StatCardWithProgress = styled(StatCard)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const StatContent = styled.div`
  display: flex;
  flex-direction: column;
`;

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
}

const formatNumber = (num: number): string => {
  // For very large numbers (billions)
  if (num >= 1e9) {
    return `$${(num / 1e9).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}B`;
  }
  
  // For millions
  if (num >= 1e6) {
    return `$${(num / 1e6).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}M`;
  }
  
  // For thousands
  if (num >= 1e3) {
    return `$${(num / 1e3).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}K`;
  }
  
  // For numbers less than 1000
  return `$${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const CircularProgressIndicator: React.FC<{ percentage: number }> = ({ percentage }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <CircleContainer>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <CircleBackground
          cx="20"
          cy="20"
          r={radius}
          strokeWidth="4"
        />
        <CircleProgress
          cx="20"
          cy="20"
          r={radius}
          strokeWidth="4"
          progress={progress}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset
          }}
        />
      </svg>
      <PercentageText>{Math.round(progress)}%</PercentageText>
    </CircleContainer>
  );
};

export const TokenStats: React.FC<TokenStatsProps> = ({ cryptoId, currency }) => {
  const [stats, setStats] = useState<TokenStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { getCryptoId } = useCrypto();

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const coingeckoId = getCryptoId(cryptoId);
      if (!coingeckoId) {
        throw new Error(`No CoinGecko ID found for ${cryptoId}`);
      }

      const data = await getTokenStats(coingeckoId, currency.toLowerCase());
      setStats({
        marketCap: formatNumber(data.marketCap),
        volume24h: formatNumber(data.volume24h),
        fdv: formatNumber(data.fdv),
        circulatingSupply: data.circulatingSupply,
        totalSupply: data.totalSupply,
        maxSupply: data.maxSupply
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stats';
      setError(errorMessage);
      console.error('Error fetching token stats:', error);
    } finally {
      setLoading(false);
    }
  }, [cryptoId, currency, getCryptoId]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchStats();
  };

  if (loading && !stats) {
    return <LoadingText>Loading stats...</LoadingText>;
  }

  if (error) {
    return (
      <StatsContainer>
        <ErrorText>
          {error}
          <br />
          <RetryButton onClick={handleRetry}>
            Retry {retryCount > 0 ? `(${retryCount})` : ''}
          </RetryButton>
        </ErrorText>
      </StatsContainer>
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
    <StatsContainer>
      <StatCardWithProgress>
        <StatContent>
          <StatLabel>
            Market Cap
            <InfoIcon title={`Total value of all currently circulating tokens (${stats?.circulatingSupply?.toLocaleString()} / ${(stats?.maxSupply || stats?.totalSupply)?.toLocaleString()})`}>ⓘ</InfoIcon>
          </StatLabel>
          <StatValue>{stats?.marketCap || 'N/A'}</StatValue>
        </StatContent>
        <CircularProgressIndicator percentage={calculateSupplyPercentage()} />
      </StatCardWithProgress>
      <StatCard>
        <StatLabel>
          24h Volume
          <InfoIcon title="Total trading volume in the last 24 hours">ⓘ</InfoIcon>
        </StatLabel>
        <StatValue>{stats?.volume24h || 'N/A'}</StatValue>
      </StatCard>
      <StatCard>
        <StatLabel>
          FDV
          <InfoIcon title="Fully Diluted Valuation - Total market cap if maximum token supply was in circulation">ⓘ</InfoIcon>
        </StatLabel>
        <StatValue>{stats?.fdv || 'N/A'}</StatValue>
      </StatCard>
    </StatsContainer>
  );
}; 