import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { FiRefreshCw } from 'react-icons/fi';
import { newsService, NewsArticle, NewsFetchResult } from '../services/newsService';
import NewsCard from '../components/NewsCard';
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

const RefreshButton = styled.button<{ $isLoading: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: ${props => props.$isLoading 
    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.3) 100%)'
    : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)'
  };
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: ${props => props.$isLoading
    ? '0 8px 32px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
    : '0 4px 16px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
  };
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
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 50%;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    
    &:before {
      opacity: 1;
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  &:disabled {
    pointer-events: none;
  }

  svg {
    width: 18px;
    height: 18px;
    animation: ${props => props.$isLoading ? 'spin 1s linear infinite' : 'none'};
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
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

const CacheIndicator = styled.div`
  font-size: 0.75rem;
  color: #fbbf24;
  margin-top: 2px;
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

const NewsPage: React.FC = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingStaleData, setUsingStaleData] = useState(false);

  const fetchNews = async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[NEWS_PAGE] Starting news fetch...');
      const result: NewsFetchResult = await newsService.fetchNews(forceRefresh);
      
      if (result.data && result.data.length > 0) {
        setArticles(result.data);
        setLastUpdated(new Date());
        setUsingStaleData(result.fromCache && result.cacheAge ? result.cacheAge > 10 * 60 * 1000 : false);
        
        console.log(`[NEWS_PAGE] Successfully loaded ${result.data.length} articles`, {
          fromCache: result.fromCache,
          cacheAge: result.cacheAge
        });
      } else {
        console.warn('[NEWS_PAGE] No articles received');
        setError('No articles available');
      }
    } catch (err) {
      console.error('[NEWS_PAGE] Error during news fetch:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      
      // Try to get any cached data as fallback
      try {
        const fallbackResult = await newsService.fetchNews();
        if (fallbackResult.data && fallbackResult.data.length > 0) {
          setArticles(fallbackResult.data);
          setLastUpdated(new Date());
          setUsingStaleData(true);
          console.log('[NEWS_PAGE] Using cached fallback data');
        } else {
          setError('Unable to fetch news and no cached data available');
          console.error('[NEWS_PAGE] Complete failure - no API and no cache:', err);
        }
      } catch (cacheErr) {
        setError('Unable to fetch news and no cached data available');
        console.error('[NEWS_PAGE] Complete failure - no API and no cache:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    if (!isLoading) {
      fetchNews(true); // Force refresh
    }
  };

  const handleRetry = () => {
    fetchNews(false); // Normal fetch for retry
  };

  useEffect(() => {
    fetchNews(false);

    // Set up interval for automatic refresh every 10 minutes
    const interval = setInterval(() => {
      fetchNews(false);
    }, 10 * 60 * 1000);

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
          📰 Market News
        </Title>
        {lastUpdated && !isLoading && (
          <HeaderInfoContainer>
            <div>
              <StatusText $isStale={usingStaleData}>
                Last updated: <LiveTimeAgo date={lastUpdated} />
              </StatusText>
              {usingStaleData && (
                <CacheIndicator>
                  📱 Cached Data
                </CacheIndicator>
              )}
            </div>
            <RefreshButton $isLoading={isLoading} onClick={handleRefresh}>
              <FiRefreshCw />
            </RefreshButton>
          </HeaderInfoContainer>
        )}
      </Header>

      <ContentContainer>
        <ScrollContainer>
          {isLoading ? (
            <LoadingContainer>
              <WaveLoadingPlaceholder />
              <LoadingText>Loading latest crypto news...</LoadingText>
            </LoadingContainer>
          ) : error ? (
            <ErrorContainer>
              <ErrorMessage>Failed to Load News</ErrorMessage>
              <ErrorDescription>{error}</ErrorDescription>
              <RetryButton onClick={handleRetry}>
                Try Again
              </RetryButton>
            </ErrorContainer>
          ) : articles.length === 0 ? (
            <EmptyContainer>
              <EmptyMessage>📰</EmptyMessage>
              <EmptyMessage>No News Available</EmptyMessage>
              <EmptyDescription>
                No cryptocurrency news articles are currently available.
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
                {articles.map((article, index) => (
                  <NewsCard
                    key={`${article.url}-${article.publishedAt}`}
                    article={article}
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