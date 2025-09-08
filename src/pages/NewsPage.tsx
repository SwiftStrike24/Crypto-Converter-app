import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiRefreshCw } from 'react-icons/fi';
import NewsCard from '../components/NewsCard';
import LiveTimeAgo from '../components/LiveTimeAgo';
import WaveLoadingPlaceholder from '../components/WaveLoadingPlaceholder';
import { useNews } from '../context/NewsContext';

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
`;

const ScrollContainer = styled.div`
  height: 100%;
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

const TabButton = styled.button<{ $active?: boolean }>`
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid ${p => (p.$active ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.25)')};
  background: ${p => (p.$active ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)')};
  color: #c4b5fd;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(139, 92, 246, 0.4);
  }
`;

const NewsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'market' | 'fundraising'>('market');

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


  const handleRefresh = async () => {
    const loading = activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket;
    if (!loading) {
      console.log('[NEWS_PAGE] Performing complete refresh...');
      try {
        if (activeTab === 'fundraising') {
          await refreshFundraisingNews();
        } else {
          await refreshMarketNews();
        }
        console.log('[NEWS_PAGE] Refresh completed');
      } catch (error) {
        console.error('[NEWS_PAGE] Refresh failed:', error);
      }
    }
  };

  const handleRetry = async () => {
    if (activeTab === 'fundraising') {
      await refreshFundraisingNews();
    } else {
      await refreshMarketNews();
    }
  };


  return (
    <PageContainer>
      <Header>
        <BackButton onClick={() => navigate('/')}>
          <BackIcon />
          Back to Converter
        </BackButton>
        <Title>
          📰 Market News
        </Title>
        {(activeTab === 'fundraising' ? fundraisingLastUpdated : marketLastUpdated) && !(activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket) && (
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
        <TabButton $active={activeTab === 'market'} onClick={() => setActiveTab('market')}>Market</TabButton>
        <TabButton $active={activeTab === 'fundraising'} onClick={() => setActiveTab('fundraising')}>Fundraising</TabButton>
      </Tabs>

      <ContentContainer>
        <ScrollContainer>
          {(activeTab === 'fundraising' ? isLoadingFundraising : isLoadingMarket) || isInitializing ? (
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
  );
};

export default NewsPage; 