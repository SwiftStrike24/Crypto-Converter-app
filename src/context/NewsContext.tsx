import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { newsService, NewsArticle, NewsFetchResult } from '../services/newsService';
import { fundraisingService, FundraisingArticle, FundraisingFetchResult } from '../services/fundraisingService';

interface NewsContextState {
  // Market news
  marketNews: NewsArticle[];
  isLoadingMarket: boolean;
  marketError: string | null;
  marketLastUpdated: Date | null;

  // Fundraising news
  fundraisingNews: FundraisingArticle[];
  isLoadingFundraising: boolean;
  fundraisingError: string | null;
  fundraisingLastUpdated: Date | null;

  // General loading state
  isInitializing: boolean;

  // Actions
  refreshMarketNews: () => Promise<void>;
  refreshFundraisingNews: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const NewsContext = createContext<NewsContextState | undefined>(undefined);

export const useNews = (): NewsContextState => {
  const context = useContext(NewsContext);
  if (!context) {
    throw new Error('useNews must be used within a NewsProvider');
  }
  return context;
};

interface NewsProviderProps {
  children: ReactNode;
}

export const NewsProvider: React.FC<NewsProviderProps> = ({ children }) => {
  // Market news state
  const [marketNews, setMarketNews] = useState<NewsArticle[]>([]);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketLastUpdated, setMarketLastUpdated] = useState<Date | null>(null);

  // Fundraising news state
  const [fundraisingNews, setFundraisingNews] = useState<FundraisingArticle[]>([]);
  const [isLoadingFundraising, setIsLoadingFundraising] = useState(false);
  const [fundraisingError, setFundraisingError] = useState<string | null>(null);
  const [fundraisingLastUpdated, setFundraisingLastUpdated] = useState<Date | null>(null);

  // General initialization state
  const [isInitializing, setIsInitializing] = useState(true);

  // Fetch market news
  const fetchMarketNews = useCallback(async (force: boolean = false): Promise<void> => {
    try {
      setIsLoadingMarket(true);
      setMarketError(null);

      console.log('[NEWS_CONTEXT] Fetching market news...', { force });
      const result: NewsFetchResult = await newsService.fetchNews(force);

      if (result.data && result.data.length > 0) {
        setMarketNews(result.data);
        setMarketLastUpdated(new Date());
        console.log(`[NEWS_CONTEXT] Market news loaded: ${result.data.length} articles`);
      } else {
        setMarketError('No market news available');
      }
    } catch (err) {
      console.error('[NEWS_CONTEXT] Error fetching market news:', err);
      setMarketError(err instanceof Error ? err.message : 'Unknown error fetching market news');
    } finally {
      setIsLoadingMarket(false);
    }
  }, []);

  // Fetch fundraising news
  const fetchFundraisingNews = useCallback(async (force: boolean = false): Promise<void> => {
    try {
      setIsLoadingFundraising(true);
      setFundraisingError(null);

      console.log('[NEWS_CONTEXT] Fetching fundraising news...', { force });
      const result: FundraisingFetchResult = await fundraisingService.fetchFundraising(force);

      if (Array.isArray(result.data)) {
        setFundraisingNews(result.data);
        setFundraisingLastUpdated(new Date());
        console.log(`[NEWS_CONTEXT] Fundraising news loaded: ${result.data.length} articles`);
      } else {
        setFundraisingError('No fundraising news available');
      }
    } catch (err) {
      console.error('[NEWS_CONTEXT] Error fetching fundraising news:', err);
      setFundraisingError(err instanceof Error ? err.message : 'Unknown error fetching fundraising news');
    } finally {
      setIsLoadingFundraising(false);
    }
  }, []);

  // Refresh market news
  const refreshMarketNews = useCallback(async (): Promise<void> => {
    await fetchMarketNews(true);
  }, [fetchMarketNews]);

  // Refresh fundraising news
  const refreshFundraisingNews = useCallback(async (): Promise<void> => {
    await fetchFundraisingNews(true);
  }, [fetchFundraisingNews]);

  // Refresh all news
  const refreshAll = useCallback(async (): Promise<void> => {
    console.log('[NEWS_CONTEXT] Refreshing all news...');
    await Promise.allSettled([
      fetchMarketNews(true),
      fetchFundraisingNews(true)
    ]);
    console.log('[NEWS_CONTEXT] All news refreshed');
  }, [fetchMarketNews, fetchFundraisingNews]);

  // Initialize data on mount
  useEffect(() => {
    const initializeNews = async () => {
      console.log('[NEWS_CONTEXT] Initializing news data in background...');

      try {
        // Start both fetches in parallel
        const [marketResult, fundraisingResult] = await Promise.allSettled([
          fetchMarketNews(false),
          fetchFundraisingNews(false)
        ]);

        // Log results
        if (marketResult.status === 'fulfilled') {
          console.log('[NEWS_CONTEXT] Market news initialized successfully');
        } else {
          console.warn('[NEWS_CONTEXT] Market news initialization failed:', marketResult.reason);
        }

        if (fundraisingResult.status === 'fulfilled') {
          console.log('[NEWS_CONTEXT] Fundraising news initialized successfully');
        } else {
          console.warn('[NEWS_CONTEXT] Fundraising news initialization failed:', fundraisingResult.reason);
        }

      } catch (error) {
        console.error('[NEWS_CONTEXT] Critical error during initialization:', error);
      } finally {
        setIsInitializing(false);
        console.log('[NEWS_CONTEXT] News initialization complete');
      }
    };

    initializeNews();

    // Set up periodic refresh every 10 minutes
    const interval = setInterval(() => {
      console.log('[NEWS_CONTEXT] Periodic news refresh...');
      initializeNews();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchMarketNews, fetchFundraisingNews]);

  const contextValue: NewsContextState = {
    // Market news
    marketNews,
    isLoadingMarket,
    marketError,
    marketLastUpdated,

    // Fundraising news
    fundraisingNews,
    isLoadingFundraising,
    fundraisingError,
    fundraisingLastUpdated,

    // General state
    isInitializing,

    // Actions
    refreshMarketNews,
    refreshFundraisingNews,
    refreshAll,
  };

  return (
    <NewsContext.Provider value={contextValue}>
      {children}
    </NewsContext.Provider>
  );
};

