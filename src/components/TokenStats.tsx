import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getTokenStats } from '../services';

const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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

interface TokenStatsProps {
  cryptoId: string;
  currency: string;
}

interface TokenStatsData {
  marketCap: string;
  volume24h: string;
}

const formatNumber = (num: number): string => {
  if (num >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  }
  return `$${num.toLocaleString()}`;
};

export const TokenStats: React.FC<TokenStatsProps> = ({ cryptoId, currency }) => {
  const [stats, setStats] = useState<TokenStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getTokenStats(cryptoId, currency);
        setStats({
          marketCap: formatNumber(data.marketCap),
          volume24h: formatNumber(data.volume24h)
        });
      } catch (error) {
        console.error('Error fetching token stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [cryptoId, currency]);

  if (loading) {
    return <LoadingText>Loading stats...</LoadingText>;
  }

  return (
    <StatsContainer>
      <StatCard>
        <StatLabel>Market Cap</StatLabel>
        <StatValue>{stats?.marketCap || 'N/A'}</StatValue>
      </StatCard>
      <StatCard>
        <StatLabel>24h Volume</StatLabel>
        <StatValue>{stats?.volume24h || 'N/A'}</StatValue>
      </StatCard>
    </StatsContainer>
  );
}; 