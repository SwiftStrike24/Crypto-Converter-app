import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useCrypto } from '../context/CryptoContext';
import { trendingService, ITrendingToken } from '../services/trendingService';
import TrendingTokenCard from '../components/TrendingTokenCard';
import LiveTimeAgo from '../components/LiveTimeAgo';
import WaveLoadingPlaceholder from '../components/WaveLoadingPlaceholder';

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: '18px', height: '18px'}}>
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
);

const ContentGrid = styled.main`
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 8px;
    
    &:hover {
      background: #444;
    }
  }
`;

const TokensGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const ErrorMessage = styled.div`
    color: #ff4444;
    text-align: center;
`;

const TrendingTokensPage: React.FC = () => {
  const [tokens, setTokens] = useState<ITrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { isCoinGeckoRateLimitedGlobal } = useCrypto();
  const navigate = useNavigate();

  const fetchTokens = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const trendingTokens = await trendingService.fetchTrendingTokens();
      setTokens(trendingTokens);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to fetch trending tokens. Please try again later.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 5 * 60 * 1000); // Auto-refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={() => navigate('/')}>
          <BackIcon />
          Back to Converter
        </BackButton>
        <Title>
          🔥 Trending Tokens
        </Title>
        {lastUpdated && !isLoading && <LiveTimeAgo date={lastUpdated} />}
      </Header>
      <ContentGrid>
        {isLoading ? (
          <LoadingContainer>
             <WaveLoadingPlaceholder width="200px" height="40px" />
          </LoadingContainer>
        ) : error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : isCoinGeckoRateLimitedGlobal ? (
          <ErrorMessage>API rate limit reached. Displaying cached data if available.</ErrorMessage>
        ) : (
          <TokensGrid>
            {tokens.map(token => (
              <TrendingTokenCard key={token.id} token={token} />
            ))}
          </TokensGrid>
        )}
      </ContentGrid>
    </PageContainer>
  );
};

export default TrendingTokensPage; 