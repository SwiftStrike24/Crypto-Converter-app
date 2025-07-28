import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
);

// New styled components for status indicators
const HeaderInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
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
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;

  &:hover {
    background: #7c3aed;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const WarningBanner = styled.div`
  padding: 10px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 8px;
  margin-bottom: 16px;
  color: #fbbf24;
  font-size: 0.9rem;
  text-align: center;
`;

const ErrorBanner = styled.div`
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  margin-bottom: 16px;
  color: #ef4444;
  font-size: 0.9rem;
  text-align: center;
`;

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
  gap: 1.5rem;
  padding: 0.5rem;
  
  /* Ensure consistent spacing and prevent layout shifts during animations */
  align-items: start;
  
  /* Performance optimizations for smooth animations */
  will-change: auto;
  transform: translateZ(0); /* Force hardware acceleration */
  
  /* Prevent any potential reflow issues */
  grid-auto-rows: min-content;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 0.25rem;
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 2rem;
  }
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

// Animation variants for smooth entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
    },
  },
};

const TrendingTokensPage: React.FC = () => {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<ITrendingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingStaleData, setUsingStaleData] = useState(false);
  const { isCoinGeckoRateLimitedGlobal } = useCrypto();

  const fetchTokens = async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      const result = await trendingService.fetchTrendingTokens();
      setTokens(result.data);
      setUsingStaleData(result.fromCache && (result.cacheAge || 0) > 5 * 60 * 1000);
      
      if (!result.fromCache) {
        setLastUpdated(new Date());
      } else if (result.cacheAge) {
        // If using cache, set last updated to when the cache was created
        setLastUpdated(new Date(Date.now() - result.cacheAge));
      }
      
      if (result.fromCache && result.cacheAge) {
        const ageMinutes = Math.round(result.cacheAge / (60 * 1000));
        console.log(`📊 [TRENDING_PAGE] Using ${result.fromCache ? 'cached' : 'fresh'} data (${ageMinutes}m old)`);
      }
      
    } catch (err) {
      // Check if we have any stale cache as last resort
      const cacheStatus = trendingService.getCacheStatus();
      if (cacheStatus.hasCache) {
        console.log('🔄 [TRENDING_PAGE] API failed, attempting to use any available cache');
        // Try one more time to get stale data
        try {
          const staleCacheKey = `cryptovertx-cache-trending-tokens`;
          const itemStr = localStorage.getItem(staleCacheKey);
          if (itemStr) {
            const cacheEntry = JSON.parse(itemStr);
            setTokens(cacheEntry.data);
            setUsingStaleData(true);
            setLastUpdated(new Date(cacheEntry.timestamp));
            setError('Using cached data - unable to fetch fresh trending tokens');
            console.log('📊 [TRENDING_PAGE] Successfully loaded stale cache as fallback');
          }
        } catch (cacheErr) {
          setError('Unable to fetch trending tokens and no cached data available');
          console.error('❌ [TRENDING_PAGE] Complete failure - no API and no cache:', err);
        }
      } else {
        setError('Unable to fetch trending tokens. Please check your connection and try again.');
        console.error('❌ [TRENDING_PAGE] API failed and no cache available:', err);
      }
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
        {lastUpdated && !isLoading && (
          <HeaderInfoContainer>
            <LiveTimeAgo date={lastUpdated} />
            {usingStaleData && (
              <CacheIndicator>
                📱 Cached Data
              </CacheIndicator>
            )}
          </HeaderInfoContainer>
        )}
      </Header>
      <ContentGrid>
        {isLoading ? (
          <LoadingContainer>
             <WaveLoadingPlaceholder width="200px" height="40px" />
          </LoadingContainer>
        ) : error && tokens.length === 0 ? (
          <ErrorMessage>
            {error}
            <RetryButton onClick={fetchTokens}>
              Try Again
            </RetryButton>
          </ErrorMessage>
        ) : (
          <>
            {error && tokens.length > 0 && (
              <WarningBanner>
                ⚠️ {error}
              </WarningBanner>
            )}
            {isCoinGeckoRateLimitedGlobal && (
              <ErrorBanner>
                🚫 API rate limit reached. Displaying cached data.
              </ErrorBanner>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={tokens.length} // Re-animate when tokens change
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                style={{ display: 'contents' }} // Don't interfere with grid layout
              >
                <TokensGrid>
                  {tokens.map((token, index) => (
                    <motion.div
                      key={token.id}
                      variants={itemVariants}
                      custom={index}
                      style={{ display: 'contents' }} // Don't interfere with grid layout
                    >
                      <TrendingTokenCard token={token} />
                    </motion.div>
                  ))}
                </TokensGrid>
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </ContentGrid>
    </PageContainer>
  );
};

export default TrendingTokensPage; 