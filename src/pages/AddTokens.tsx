import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import debounce from 'lodash/debounce';
import { FiCheck, FiArrowLeft, FiX, FiSearch, FiPlus, FiInfo, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const PageContainer = styled.div`
  min-height: 600px;
  width: 100%;
  max-width: 800px;
  background: rgba(18, 18, 18, 0.95);
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  overflow: auto;
  box-sizing: border-box;
  height: auto;
  max-height: 100vh;
  margin: 0 auto;
  
  @media (max-width: 768px) {
    padding: 16px;
    width: 100%;
    left: 0;
    right: 0;
    transform: none;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(10px);
  z-index: 20;
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(139, 92, 246, 0.1);
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  color: #ffffff;
  font-weight: 600;
  
  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 16px 16px 16px 48px;
  border-radius: 12px;
  border: 1px solid #333;
  background: #2a2a2a;
  color: white;
  font-size: 16px;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }

  &::placeholder {
    color: #666;
  }
`;

const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding-bottom: 100px;
  flex: 1;
  
  @media (max-width: 768px) {
    padding-bottom: 120px;
    gap: 18px;
  }
  
  @media (max-width: 480px) {
    padding-bottom: 100px;
    gap: 16px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.2rem;
  color: #888;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
`;

const TokenCount = styled.span`
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: 0.9rem;
  font-weight: 500;
`;

const ClearAllButton = styled.button`
  background: none;
  border: none;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SelectedTokensContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  min-height: 60px;
  max-height: 100px;
  overflow-y: auto;
  padding: 4px;
  
  /* Add a scrollbar indicator when there are many tokens */
  border-radius: 8px;
  
  /* Show a subtle border when scrollable */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 8px;
    
    &:hover {
      background: #444;
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    max-height: 90px;
  }
`;

const SelectedToken = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 100px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  margin-bottom: 4px;

  img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .token-symbol {
    font-weight: 500;
    color: #8b5cf6;
  }

  .remove-button {
    background: none;
    border: none;
    color: #8b5cf6;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(139, 92, 246, 0.2);
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    padding: 6px 10px;
    
    img {
      width: 20px;
      height: 20px;
    }
    
    .token-symbol {
      font-size: 0.9rem;
    }
  }
`;

const ResultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 16px;
  max-height: 180px;
  min-height: 180px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 8px;
    
    &:hover {
      background: #444;
    }
  }
  
  @media (max-width: 768px) {
    max-height: 160px;
    min-height: 160px;
  }
  
  @media (max-width: 480px) {
    max-height: 140px;
    min-height: 140px;
    padding: 12px;
    gap: 8px;
  }
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(to top, rgba(26, 26, 26, 0.9), rgba(26, 26, 26, 0));
    pointer-events: none;
    opacity: 0.8;
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
  }
`;

const ScrollIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  color: #666;
  font-size: 0.8rem;
  margin-top: 4px;
  
  svg {
    margin-left: 4px;
    animation: bounce 1.5s infinite;
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-3px);
    }
  }
  
  @media (max-width: 480px) {
    font-size: 0.75rem;
    padding: 6px 0;
  }
`;

const CryptoItem = styled(motion.div)<{ isSelected: boolean }>`
  padding: 14px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.15)' : '#2a2a2a'};
  transition: all 0.2s ease;
  border: 1px solid ${props => props.isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  
  &:hover {
    background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.2)' : '#333'};
    transform: translateY(-1px);
  }

  img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #2a2a2a;
    padding: 2px;
  }

  .crypto-info {
    flex: 1;
    
    .crypto-name {
      font-weight: 500;
      margin-bottom: 4px;
      font-size: 1rem;
      color: ${props => props.isSelected ? '#8b5cf6' : '#fff'};
    }
    
    .crypto-symbol {
      font-size: 0.85rem;
      color: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.8)' : '#888'};
      text-transform: uppercase;
    }
  }

  .check-icon {
    color: #8b5cf6;
    opacity: ${props => props.isSelected ? 1 : 0};
    transform: ${props => props.isSelected ? 'scale(1)' : 'scale(0.8)'};
    transition: all 0.2s ease;
  }
  
  @media (max-width: 480px) {
    padding: 12px 10px;
    gap: 12px;
    
    img {
      width: 36px;
      height: 36px;
    }
    
    .crypto-info {
      .crypto-name {
        font-size: 0.95rem;
      }
      
      .crypto-symbol {
        font-size: 0.8rem;
      }
    }
  }
`;

const SkeletonItem = styled(motion.div)`
  padding: 16px;
  border-radius: 12px;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  gap: 16px;
  
  .skeleton-image {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  
  .skeleton-content {
    flex: 1;
    
    .skeleton-title {
      width: 70%;
      height: 16px;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
    
    .skeleton-subtitle {
      width: 40%;
      height: 12px;
      background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
  }
  
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const Message = styled.div`
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 1.1rem;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 16px;
  width: 100%;
  padding: 16px;
  position: fixed;
  bottom: 0;
  left: 0;
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(10px);
  z-index: 20;
  max-width: 800px;
  box-sizing: border-box;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  
  @media (min-width: 800px) {
    left: 50%;
    transform: translateX(-50%);
  }
  
  @media (max-width: 480px) {
    padding: 12px;
    gap: 8px;
    max-width: 100%;
    left: 0;
    transform: none;
  }
`;

const Button = styled.button<{ $primary?: boolean }>`
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.$primary ? '#8b5cf6' : '#2a2a2a'};
  color: ${props => props.$primary ? 'white' : '#888'};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    transform: translateY(-1px);
    background: ${props => props.$primary ? '#7c3aed' : '#333'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    padding: 14px 10px;
    font-size: 14px;
    gap: 4px;
  }
`;

const EmptySelection = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 60px;
  color: #666;
  font-size: 0.9rem;
  border: 1px dashed #333;
  border-radius: 12px;
`;

const InfoBanner = styled(motion.div)`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  
  .info-icon {
    color: #8b5cf6;
    flex-shrink: 0;
  }
  
  .info-text {
    font-size: 0.9rem;
    color: #bbb;
  }
`;

const ButtonSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

// Add this new component for API error display
const ApiErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 87, 87, 0.1);
  border: 1px solid rgba(255, 87, 87, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 8px;
  
  .error-icon {
    color: #ff5757;
    flex-shrink: 0;
  }
  
  .error-text {
    font-size: 0.9rem;
    color: #ff9494;
    flex: 1;
  }
  
  .retry-button {
    background: none;
    border: none;
    color: #8b5cf6;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
    
    &:hover {
      background: rgba(139, 92, 246, 0.1);
    }
  }
`;

// Add this new component for API status display
const ApiStatusIndicator = styled.div<{ $status: 'available' | 'limited' | 'unavailable' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: ${props => 
    props.$status === 'available' ? '#4ade80' : 
    props.$status === 'limited' ? '#fbbf24' : 
    '#ef4444'};
  margin-top: 8px;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${props => 
      props.$status === 'available' ? '#4ade80' : 
      props.$status === 'limited' ? '#fbbf24' : 
      '#ef4444'};
  }
`;

// Enhanced interface with additional fields for better type safety
interface CryptoResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap_rank?: number;
}

// API configuration with updated 2025 values
const API_CONFIG = {
  COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
  COINGECKO_PRO_BASE_URL: 'https://pro-api.coingecko.com/api/v3', // Pro API endpoint
  BACKUP_API_URL: 'https://api.coincap.io/v2',
  CACHE_DURATION: 10 * 60 * 1000, // 10 minutes (increased from 5)
  RETRY_ATTEMPTS: 5, // Increased from 3
  RETRY_DELAY: 1000,
  SEARCH_DEBOUNCE: 300,
  MAX_CACHE_ENTRIES: 50, // Increased from 20
  COINGECKO_RATE_LIMIT: {
    FREE_TIER: {
      MAX_CALLS_PER_MINUTE: 10, // Free tier limit as of 2025
      COOLDOWN_PERIOD: 60 * 1000, // 1 minute
    },
    PRO_TIER: {
      MAX_CALLS_PER_MINUTE: 100, // Pro tier limit (example)
      COOLDOWN_PERIOD: 60 * 1000, // 1 minute
    }
  },
  PROXY_URLS: [
    'https://api.coingecko.com/api/v3', // Direct API first
    'https://corsproxy.org/?https://api.coingecko.com/api/v3', // CORS proxy
    'https://api.allorigins.win/raw?url=https://api.coingecko.com/api/v3', // Alternative proxy
  ]
};

// Cache interface
interface SearchCache {
  query: string;
  results: CryptoResult[];
  timestamp: number;
}

const AddTokens: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCryptos, setSelectedCryptos] = useState<Map<string, CryptoResult>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallbackApi, setUsingFallbackApi] = useState(false);
  const [currentProxyIndex, setCurrentProxyIndex] = useState(0);
  const [apiStatus, setApiStatus] = useState<'available' | 'limited' | 'unavailable'>('available');
  const [hasPaidPlan, setHasPaidPlan] = useState<boolean>(false);
  
  const { addCryptos, checkAndUpdateMissingIcons } = useCrypto();
  const navigate = useNavigate();
  
  // Refs for caching and API state
  const searchCache = useRef<Map<string, SearchCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCount = useRef<number>(0);
  const lastApiCall = useRef<number>(0);
  const apiCallsThisMinute = useRef<number>(0);
  const apiRateLimitResetTime = useRef<number>(0);
  const apiKeyRef = useRef<string | null>(null);
  const coinGeckoRecoveryTimer = useRef<NodeJS.Timeout | null>(null);
  const lastFallbackTime = useRef<number>(0);

  // Try to load API key from environment variables if available
  useEffect(() => {
    // In a real app, this would be loaded from environment variables
    // For this example, we'll check if there's a key in localStorage
    const savedApiKey = localStorage.getItem('coingecko_api_key');
    if (savedApiKey) {
      apiKeyRef.current = savedApiKey;
      
      // Check if this is a valid Pro API key
      const checkApiKey = async () => {
        try {
          const response = await axios.get(`${API_CONFIG.COINGECKO_PRO_BASE_URL}/ping`, {
            headers: {
              'x-cg-pro-api-key': savedApiKey
            },
            timeout: 5000
          });
          
          if (response.status === 200) {
            console.log('Valid CoinGecko Pro API key detected');
            setHasPaidPlan(true);
          }
        } catch (error) {
          console.log('Using free tier CoinGecko API');
          setHasPaidPlan(false);
        }
      };
      
      checkApiKey();
    }
    
    // Reset API call counter every minute
    const resetInterval = setInterval(() => {
      apiCallsThisMinute.current = 0;
    }, hasPaidPlan 
      ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.COOLDOWN_PERIOD 
      : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.COOLDOWN_PERIOD);
    
    // Set up recovery check - periodically try CoinGecko again if we're using fallback
    const recoveryInterval = setInterval(() => {
      if (usingFallbackApi && Date.now() - lastFallbackTime.current > 5 * 60 * 1000) {
        console.log('Attempting to recover CoinGecko API connection...');
        setUsingFallbackApi(false);
        // Will try CoinGecko on next search
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    return () => {
      clearInterval(resetInterval);
      clearInterval(recoveryInterval);
      if (coinGeckoRecoveryTimer.current) {
        clearTimeout(coinGeckoRecoveryTimer.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [usingFallbackApi, hasPaidPlan]);

  // Check cache for existing results with improved validation
  const getCachedResults = (query: string): CryptoResult[] | null => {
    if (!query.trim()) return null;
    
    const cached = searchCache.current.get(query.toLowerCase());
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > API_CONFIG.CACHE_DURATION) {
      searchCache.current.delete(query.toLowerCase());
      return null;
    }
    
    // Validate cached results to ensure they have all required fields
    const validResults = cached.results.filter(result => 
      result && result.id && result.symbol && result.name
    );
    
    return validResults.length > 0 ? validResults : null;
  };

  // Cache search results with improved management
  const cacheResults = (query: string, results: CryptoResult[]) => {
    if (!query.trim()) return;
    
    // Only cache valid results
    const validResults = results.filter(result => 
      result && result.id && result.symbol && result.name
    );
    
    if (validResults.length === 0) return;
    
    searchCache.current.set(query.toLowerCase(), {
      query: query.toLowerCase(),
      results: validResults,
      timestamp: Date.now()
    });
    
    // Limit cache size to prevent memory issues
    if (searchCache.current.size > API_CONFIG.MAX_CACHE_ENTRIES) {
      // Remove oldest entries first
      const entries = Array.from(searchCache.current.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const entriesToRemove = entries.slice(0, Math.floor(API_CONFIG.MAX_CACHE_ENTRIES * 0.2));
      entriesToRemove.forEach(([key]) => {
        searchCache.current.delete(key);
      });
    }
  };

  // Convert CoinCap API results to our format with improved error handling
  const convertCoinCapResults = (data: any[]): CryptoResult[] => {
    if (!Array.isArray(data)) return [];
    
    return data.slice(0, 10).map(asset => {
      // Ensure we have valid data
      if (!asset || !asset.id || !asset.symbol) {
        return null;
      }
      
      return {
        id: asset.id,
        symbol: asset.symbol.toUpperCase(),
        name: asset.name || asset.id,
        image: `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`,
        market_cap_rank: parseInt(asset.rank) || 9999
      };
    }).filter(Boolean) as CryptoResult[];
  };

  // Check if we're rate limited
  const isRateLimited = (): boolean => {
    const now = Date.now();
    
    // If we're in a cooldown period, check if it's expired
    if (apiRateLimitResetTime.current > 0) {
      if (now < apiRateLimitResetTime.current) {
        return true;
      }
      // Reset if cooldown period is over
      apiRateLimitResetTime.current = 0;
      apiCallsThisMinute.current = 0;
      return false;
    }
    
    // Check if we've exceeded rate limits based on tier
    const maxCalls = hasPaidPlan 
      ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.MAX_CALLS_PER_MINUTE
      : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.MAX_CALLS_PER_MINUTE;
      
    return apiCallsThisMinute.current >= maxCalls;
  };

  // Track API call and handle rate limiting
  const trackApiCall = (resetAfter?: number): void => {
    apiCallsThisMinute.current++;
    lastApiCall.current = Date.now();
    
    // Get the appropriate rate limit based on tier
    const maxCalls = hasPaidPlan 
      ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.MAX_CALLS_PER_MINUTE
      : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.MAX_CALLS_PER_MINUTE;
    
    const cooldownPeriod = hasPaidPlan
      ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.COOLDOWN_PERIOD
      : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.COOLDOWN_PERIOD;
    
    // If we've hit the rate limit, set a cooldown period
    if (apiCallsThisMinute.current >= maxCalls) {
      const cooldownTime = resetAfter || cooldownPeriod;
      apiRateLimitResetTime.current = Date.now() + cooldownTime;
      console.log(`Rate limit reached, cooling down until ${new Date(apiRateLimitResetTime.current).toLocaleTimeString()}`);
    }
  };

  // Search using CoinGecko API with proxy support
  const searchWithCoinGeckoApi = async (query: string): Promise<CryptoResult[]> => {
    if (isRateLimited()) {
      throw new Error('Rate limit exceeded. Using fallback API.');
    }
    
    // If we have a Pro API key, use the Pro API directly
    if (hasPaidPlan && apiKeyRef.current) {
      try {
        const response = await axios.get(`${API_CONFIG.COINGECKO_PRO_BASE_URL}/search`, {
          params: { query },
          headers: {
            'x-cg-pro-api-key': apiKeyRef.current
          },
          signal: abortControllerRef.current?.signal,
          timeout: 5000
        });
        
        // Track this API call for rate limiting
        trackApiCall();
        
        if (response.status === 200 && response.data && response.data.coins) {
          return response.data.coins.slice(0, 10).map((coin: any) => ({
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            image: coin.thumb || coin.large,
            market_cap_rank: coin.market_cap_rank || 9999
          }));
        } else {
          throw new Error('Invalid response from CoinGecko Pro API');
        }
      } catch (error: any) {
        console.warn('CoinGecko Pro API failed:', error.message);
        // Fall through to free tier with proxies
      }
    }
    
    // Try each proxy URL in sequence if needed (free tier or Pro API failed)
    let proxyIndex = currentProxyIndex;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < API_CONFIG.PROXY_URLS.length; attempt++) {
      try {
        const proxyUrl = API_CONFIG.PROXY_URLS[proxyIndex];
        
        // Construct the final URL based on whether it's a direct call or proxy
        const isDirectApi = proxyUrl === API_CONFIG.COINGECKO_BASE_URL;
        const finalUrl = isDirectApi 
          ? `${proxyUrl}/search?query=${encodeURIComponent(query)}`
          : `${proxyUrl}/search?query=${encodeURIComponent(query)}`;
        
        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/json'
        };
        
        // Add demo API key if available (for free tier authenticated requests)
        if (apiKeyRef.current && isDirectApi) {
          headers['x-cg-demo-api-key'] = apiKeyRef.current;
        }
        
        const response = await axios.get(finalUrl, {
          headers,
          signal: abortControllerRef.current?.signal,
          timeout: 5000 // 5 second timeout
        });
        
        // Track this API call for rate limiting
        trackApiCall();
        
        // Update the current proxy index for next time
        setCurrentProxyIndex((proxyIndex + 1) % API_CONFIG.PROXY_URLS.length);
        
        if (response.status === 200 && response.data && response.data.coins) {
          return response.data.coins.slice(0, 10).map((coin: any) => ({
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            image: coin.thumb || coin.large,
            market_cap_rank: coin.market_cap_rank || 9999
          }));
        } else {
          throw new Error('Invalid response from CoinGecko');
        }
      } catch (error: any) {
        console.warn(`CoinGecko API attempt ${attempt + 1} failed:`, error.message);
        lastError = error;
        
        // Check for rate limiting
        if (error.response?.status === 429) {
          // Get retry-after header if available
          const retryAfter = error.response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 
            hasPaidPlan 
              ? API_CONFIG.COINGECKO_RATE_LIMIT.PRO_TIER.COOLDOWN_PERIOD
              : API_CONFIG.COINGECKO_RATE_LIMIT.FREE_TIER.COOLDOWN_PERIOD;
          
          // Track rate limiting
          trackApiCall(waitTime);
          
          // No need to try other proxies if we're rate limited
          throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)} seconds.`);
        }
        
        // Try next proxy
        proxyIndex = (proxyIndex + 1) % API_CONFIG.PROXY_URLS.length;
      }
    }
    
    // If all proxies failed, throw the last error
    throw lastError || new Error('All CoinGecko API attempts failed');
  };

  // Search using fallback API (CoinCap) with improved error handling
  const searchWithFallbackApi = async (query: string): Promise<CryptoResult[]> => {
    try {
      const response = await axios.get(`${API_CONFIG.BACKUP_API_URL}/assets`, {
        params: { search: query, limit: 10 },
        signal: abortControllerRef.current?.signal,
        timeout: 8000 // Increased timeout for fallback
      });
      
      if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
        throw new Error('Invalid response from fallback API');
      }
      
      return convertCoinCapResults(response.data.data);
    } catch (error: any) {
      console.error('Fallback API error:', error.message);
      throw new Error('Both primary and fallback APIs failed');
    }
  };

  // Enhanced search function with retries, caching, and fallback
  const searchCryptos = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    // Check cache first
    const cachedResults = getCachedResults(query);
    if (cachedResults) {
      setResults(cachedResults);
      setLoading(false);
      setIsSearching(false);
      setError(null);
      return;
    }

    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setIsSearching(true);
      setError(null);
      
      // Rate limiting check
      const now = Date.now();
      const timeSinceLastCall = now - lastApiCall.current;
      if (timeSinceLastCall < 1000) { // Ensure at least 1 second between calls
        await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastCall));
      }
      
      lastApiCall.current = Date.now();
      
      let results: CryptoResult[] = [];
      
      try {
        // Try CoinGecko first if not using fallback API
        if (!usingFallbackApi) {
          setApiStatus('available');
          results = await searchWithCoinGeckoApi(query);
          
          // Reset retry count on success
          retryCount.current = 0;
          setUsingFallbackApi(false);
        } else {
          // Use fallback API directly if we know CoinGecko is having issues
          setApiStatus('unavailable');
          results = await searchWithFallbackApi(query);
          lastFallbackTime.current = Date.now();
        }
      } catch (error: any) {
        // If CoinGecko fails, try fallback API
        if (!usingFallbackApi) {
          console.warn('CoinGecko API failed, using fallback:', error.message);
          setUsingFallbackApi(true);
          setApiStatus('unavailable');
          lastFallbackTime.current = Date.now();
          
          // Schedule recovery attempt after some time
          if (coinGeckoRecoveryTimer.current) {
            clearTimeout(coinGeckoRecoveryTimer.current);
          }
          
          coinGeckoRecoveryTimer.current = setTimeout(() => {
            console.log('Attempting to recover CoinGecko API connection...');
            setUsingFallbackApi(false);
          }, 10 * 60 * 1000); // Try again in 10 minutes
          
          results = await searchWithFallbackApi(query);
        } else {
          // Both APIs failed
          throw error;
        }
      }
      
      // Cache and set results
      cacheResults(query, results);
      setResults(results);
      setError(null);
      
    } catch (error: any) {
      console.error('Search error:', error);
      
      // Handle specific error cases
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          setError('Rate limit exceeded. Please try again in a minute.');
          setApiStatus('limited');
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          setError('Connection timeout. Check your internet connection.');
        } else if (error.response?.status === 403 || error.response?.status === 401) {
          setError('API access denied. Using alternative data source.');
        } else {
          setError('Failed to fetch tokens. Please try again.');
        }
      } else if (error.name === 'AbortError') {
        // Request was aborted, no need to show error
        return;
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      
      // Retry logic with exponential backoff
      if (retryCount.current < API_CONFIG.RETRY_ATTEMPTS) {
        retryCount.current++;
        const delay = API_CONFIG.RETRY_DELAY * Math.pow(2, retryCount.current - 1);
        
        setTimeout(() => {
          searchCryptos(query);
        }, delay);
      } else {
        // After max retries, show cached results if available
        const cachedResults = getCachedResults(query);
        if (cachedResults && cachedResults.length > 0) {
          setResults(cachedResults);
          setError('Showing cached results due to API issues.');
        } else {
          setResults([]);
        }
      }
    } finally {
      setLoading(false);
      setTimeout(() => {
        setIsSearching(false);
      }, 300);
    }
  };

  const debouncedSearch = useCallback(
    debounce((term: string) => searchCryptos(term), API_CONFIG.SEARCH_DEBOUNCE),
    []
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    if (value.trim()) {
      setIsSearching(true);
    }
    
    debouncedSearch(value);
  };

  const retrySearch = () => {
    retryCount.current = 0;
    setUsingFallbackApi(false);
    setError(null);
    searchCryptos(searchTerm);
  };

  // Enhanced token selection with icon caching
  const toggleCryptoSelection = (crypto: CryptoResult) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      
      if (newMap.has(crypto.id)) {
        newMap.delete(crypto.id);
      } else {
        newMap.set(crypto.id, crypto);
        
        // Pre-cache the token icon in localStorage for immediate use
        if (crypto.image) {
          try {
            const iconCacheKey = `token-icon-${crypto.symbol.toLowerCase()}`;
            localStorage.setItem(iconCacheKey, crypto.image);
            
            // Also cache with ID for redundancy
            const idIconCacheKey = `token-icon-id-${crypto.id.toLowerCase()}`;
            localStorage.setItem(idIconCacheKey, crypto.image);
          } catch (error) {
            console.error('Error caching token icon during selection:', error);
          }
        }
      }
      
      return newMap;
    });
  };

  const removeSelectedCrypto = (id: string) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };

  const handleBack = () => {
    navigate('/');
  };

  // Enhanced token addition with better error handling and icon management
  const handleAddTokens = async () => {
    try {
      // Create an array of all tokens to add
      const tokensToAdd = Array.from(selectedCryptos.values()).map(crypto => ({
        symbol: crypto.symbol,
        id: crypto.id
      }));

      if (tokensToAdd.length === 0) return;

      // Add loading state
      setLoading(true);
      
      // First, dispatch a pre-add event to notify components of upcoming tokens
      // This helps the UI prepare for the new tokens before they're actually added
      window.dispatchEvent(new CustomEvent('cryptoTokensPreAdd', {
        detail: {
          tokens: tokensToAdd.map(t => t.symbol.toUpperCase())
        }
      }));
      
      // Optimize the icon caching process for instant display
      const iconCachingPromises = Array.from(selectedCryptos.values()).map(async crypto => {
        if (crypto.image) {
          try {
            // Use the correct cache key format to match what CryptoContext expects
            const iconCacheKey = `crypto_icon_${crypto.symbol.toLowerCase()}`;
            localStorage.setItem(iconCacheKey, crypto.image);
            
            // Also cache with ID for redundancy
            const idIconCacheKey = `crypto_icon_id-${crypto.id.toLowerCase()}`;
            localStorage.setItem(idIconCacheKey, crypto.image);
            
            // Generate and cache a canvas fallback immediately
            try {
              // Create canvas fallback for faster initial display even when image URL is available
              const canvas = document.createElement('canvas');
              canvas.width = 32;
              canvas.height = 32;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Only create if we don't have a valid image yet
                if (!localStorage.getItem(iconCacheKey)) {
                  ctx.fillStyle = '#8b5cf6';
                  ctx.beginPath();
                  ctx.arc(16, 16, 16, 0, Math.PI * 2);
                  ctx.fill();
                  
                  ctx.fillStyle = 'white';
                  ctx.font = 'bold 14px Arial';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(crypto.symbol.charAt(0).toUpperCase(), 16, 16);
                  
                  const placeholderIcon = canvas.toDataURL();
                  localStorage.setItem(iconCacheKey, placeholderIcon);
                }
              }
            } catch (canvasError) {
              console.error('Error creating canvas fallback:', canvasError);
            }
            
            // Preload the image to ensure it's in browser cache
            return new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue even if image fails to load
              img.src = crypto.image;
              
              // Set a timeout to resolve anyway after 1 second (reduced from 2 seconds)
              setTimeout(resolve, 500);
            });
          } catch (error) {
            console.error('Error caching token icon before adding:', error);
          }
        } else {
          // For tokens without images, create a canvas placeholder immediately
          const symbol = crypto.symbol.toUpperCase();
          const iconCacheKey = `crypto_icon_${symbol.toLowerCase()}`;
          
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#8b5cf6';
              ctx.beginPath();
              ctx.arc(16, 16, 16, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.fillStyle = 'white';
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(symbol.charAt(0), 16, 16);
              
              const placeholderIcon = canvas.toDataURL();
              localStorage.setItem(iconCacheKey, placeholderIcon);
            }
          } catch (canvasError) {
            console.error('Error creating canvas fallback for token without image:', canvasError);
          }
        }
        return Promise.resolve();
      });
      
      // Wait for all icons to be cached with a maximum timeout
      const cachePromise = Promise.all(iconCachingPromises);
      const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 500));
      
      // Use Promise.race to continue after all icons are cached or timeout is reached
      await Promise.race([cachePromise, timeoutPromise]);

      // Add all tokens at once
      await addCryptos(tokensToAdd);
      
      // Force an immediate check for missing icons to ensure all are displayed
      try {
        // Schedule a check after a short delay to allow the tokens to be added
        setTimeout(async () => {
          await checkAndUpdateMissingIcons();
          
          // Dispatch a token update completed event
          window.dispatchEvent(new CustomEvent('cryptoTokensAddComplete', {
            detail: {
              tokens: tokensToAdd.map(t => t.symbol.toUpperCase())
            }
          }));
          
          // Schedule another check after a shorter delay to catch any stragglers
          setTimeout(checkAndUpdateMissingIcons, 2000);
        }, 500);
      } catch (error) {
        console.error('Error scheduling icon check:', error);
      }

      // Navigate back to main page after a short delay to allow updates to propagate
      navigate('/');
    } catch (error) {
      console.error('Failed to add tokens:', error);
      setError('Failed to add tokens. Please try again.');
      
      // Auto-dismiss error after 3 seconds
      setTimeout(() => {
        setError(null);
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const clearAllTokens = () => {
    setSelectedCryptos(new Map());
  };

  // Clear search results when no search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
    }
  }, [searchTerm]);

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack} aria-label="Go back">
          <FiArrowLeft size={24} />
        </BackButton>
        <Title>Add Tokens</Title>
      </Header>
      
      <ContentContainer>
        <AnimatePresence>
          {selectedCryptos.size > 0 && (
            <InfoBanner
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <FiInfo className="info-icon" size={20} />
              <span className="info-text">
                You've selected {selectedCryptos.size} token{selectedCryptos.size !== 1 ? 's' : ''}. Click "Add Tokens" when you're ready.
              </span>
            </InfoBanner>
          )}
        </AnimatePresence>
        
        <SectionHeader>
          <SectionTitle>
            Selected Tokens <TokenCount>{selectedCryptos.size}</TokenCount>
          </SectionTitle>
          {selectedCryptos.size > 0 && (
            <ClearAllButton 
              onClick={clearAllTokens}
              title="Clear all selected tokens"
              aria-label="Clear all selected tokens"
            >
              Clear All
            </ClearAllButton>
          )}
        </SectionHeader>
        
        <SelectedTokensContainer>
          <AnimatePresence>
            {selectedCryptos.size > 0 ? (
              Array.from(selectedCryptos.values()).map(crypto => (
                <SelectedToken
                  key={crypto.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                >
                  <img src={crypto.image} alt={crypto.name} />
                  <span className="token-symbol">{crypto.symbol}</span>
                  <button 
                    className="remove-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSelectedCrypto(crypto.id);
                    }}
                    title={`Remove ${crypto.symbol}`}
                    aria-label={`Remove ${crypto.symbol}`}
                  >
                    <FiX size={16} />
                  </button>
                </SelectedToken>
              ))
            ) : (
              <EmptySelection>
                No tokens selected yet
              </EmptySelection>
            )}
          </AnimatePresence>
        </SelectedTokensContainer>
        
        <SearchContainer>
          <SearchIcon>
            <FiSearch size={20} />
          </SearchIcon>
          <SearchInput
            type="text"
            placeholder="Search for tokens..."
            value={searchTerm}
            onChange={handleSearch}
            autoFocus
            aria-label="Search for tokens"
          />
          <ApiStatusIndicator $status={apiStatus}>
            <div className="status-dot"></div>
            <span>
              {apiStatus === 'available' 
                ? `CoinGecko API${hasPaidPlan ? ' Pro' : ''}` 
                : apiStatus === 'limited' 
                  ? 'API Rate Limited' 
                  : 'Using Fallback API'}
            </span>
          </ApiStatusIndicator>
        </SearchContainer>

        {error && (
          <ApiErrorMessage>
            <FiAlertTriangle className="error-icon" size={20} />
            <span className="error-text">{error}</span>
            <button 
              className="retry-button"
              onClick={retrySearch}
              title="Retry search"
              aria-label="Retry search"
            >
              <FiRefreshCw size={16} />
            </button>
          </ApiErrorMessage>
        )}

        {usingFallbackApi && !error && (
          <InfoBanner
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FiInfo className="info-icon" size={20} />
            <span className="info-text">
              Using alternative data source. Some tokens may not be available.
            </span>
          </InfoBanner>
        )}

        <ResultsContainer>
          {loading ? (
            <>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.05 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.1 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
            </>
          ) : results.length > 0 ? (
            <AnimatePresence>
              {results.map((crypto, index) => (
                <CryptoItem
                  key={crypto.id}
                  isSelected={selectedCryptos.has(crypto.id)}
                  onClick={() => toggleCryptoSelection(crypto)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: index * 0.05 }
                  }}
                  exit={{ opacity: 0, y: -20 }}
                  layout
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <img 
                    src={crypto.image} 
                    alt={crypto.name}
                    onError={(e) => {
                      // Fallback image if token image fails to load
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/40/404040/8b5cf6?text=${crypto.symbol.charAt(0)}`;
                    }}
                  />
                  <div className="crypto-info">
                    <div className="crypto-name">{crypto.name}</div>
                    <div className="crypto-symbol">{crypto.symbol}</div>
                  </div>
                  {selectedCryptos.has(crypto.id) ? (
                    <FiCheck className="check-icon" size={24} />
                  ) : (
                    <FiPlus className="check-icon" size={24} />
                  )}
                </CryptoItem>
              ))}
            </AnimatePresence>
          ) : isSearching ? (
            <>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.05 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.1 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
            </>
          ) : searchTerm ? (
            <Message>No tokens found</Message>
          ) : (
            <Message>Start typing to search for tokens</Message>
          )}
        </ResultsContainer>
        
        {results.length > 2 && (
          <ScrollIndicator>
            Scroll for more tokens
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 7L12 17" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 12L12 17L7 12" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </ScrollIndicator>
        )}
      </ContentContainer>

      <ButtonContainer>
        <Button onClick={handleBack} aria-label="Cancel and go back">
          Cancel
        </Button>
        <Button 
          $primary 
          onClick={handleAddTokens}
          disabled={selectedCryptos.size === 0 || loading}
          aria-label={`Add ${selectedCryptos.size} tokens`}
        >
          {loading ? (
            <>
              <ButtonSpinner />
              Adding...
            </>
          ) : (
            <>
              Add Token{selectedCryptos.size !== 1 ? 's' : ''} ({selectedCryptos.size})
            </>
          )}
        </Button>
      </ButtonContainer>
    </PageContainer>
  );
};

export default AddTokens;
