import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { ICON_CACHE_STORAGE_PREFIX, RATE_LIMIT_UI_MESSAGE } from '../constants/cryptoConstants';
import { FiBarChart, FiRefreshCw } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { ipcRenderer } from 'electron';
import WaveLoadingPlaceholder from './WaveLoadingPlaceholder';
import { FaMagnifyingGlassChart, FaFire, FaNewspaper } from 'react-icons/fa6';
import { isStablecoin, getStablecoinTargetFiat } from '../utils/stablecoinDetection';


// Constants
const FIAT_ICON_CACHE_PREFIX = 'fiat_icon_';

// Map of fiat currencies to their flag icons
const fiatIcons: Record<string, string> = {
  'USD': 'https://s2.coinmarketcap.com/static/cloud/img/fiat-flags/USD.svg',
  'EUR': 'https://s2.coinmarketcap.com/static/cloud/img/fiat-flags/EUR.svg',
  'CAD': 'https://s2.coinmarketcap.com/static/cloud/img/fiat-flags/CAD.svg',
};

const ConverterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const InputGroup = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  position: relative;
  -webkit-app-region: no-drag;
`;

const Input = styled.input`
  flex: 1;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 16px;
  -webkit-app-region: no-drag;

  &:focus {
    outline: none;
    border-color: #8b5cf6;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Label = styled.label`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const ErrorMessage = styled.div`
  color: #ff4444;
  font-size: 12px;
  margin-top: 4px;
  position: absolute;
  bottom: -20px;
  left: 0;
`;

const ResultBox = styled.div`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 4px;
  padding: 12px;
  margin-top: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    background: rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0px);
  }

  &::before {
    content: "Copied!";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(139, 92, 246, 0.9);
    padding: 4px 12px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s ease;
    pointer-events: none;
  }

  &.copied::before {
    animation: showCopied 1s ease forwards;
  }

  @keyframes showCopied {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    10% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    90% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
  }

  &::after {
    content: "Click to copy";
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover::after {
    opacity: 1;
  }
`;

// Define shimmer animation
const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

// Enhanced Select component with custom dropdown
const SelectContainer = styled.div`
  position: relative;
  min-width: 100px;
  -webkit-app-region: no-drag;
`;

const SelectButton = styled.button<{ $isOpen?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  cursor: pointer;
  width: 100%;
  -webkit-app-region: no-drag;
  transition: all 0.2s ease;
  
  &:focus, &:hover {
    outline: none;
    border-color: #8b5cf6;
    background: rgba(255, 255, 255, 0.15);
  }
  
  .token-icon, .token-fallback-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #2a2a2a;
    object-fit: cover;
  }
  
  .token-text {
    flex: 1;
    text-align: left;
    font-size: 14px;
    white-space: nowrap;
  }
  
  .loading-indicator {
    font-size: 12px;
    color: #8b5cf6;
    margin-left: 4px;
  }
  
  .dropdown-arrow {
    margin-left: 4px;
    transition: transform 0.2s ease;
    transform: ${props => props.$isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
  }
`;

const DropdownMenu = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 200px; /* Limit height to show ~4 items */
  overflow-y: auto;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  z-index: 1000; /* Ensure it's above other elements */
  display: ${props => props.$isOpen ? 'block' : 'none'};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding-bottom: 15px;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #1a1a1a;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
    
    &:hover {
      background: #444;
    }
  }
`;

const DropdownItem = styled.button<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  width: 100%;
  background: none;
  border: none;
  color: white;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s ease;
  background-color: ${props => props.$isSelected ? 'rgba(139, 92, 246, 0.2)' : 'transparent'}; 

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  
  .token-icon, .token-fallback-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #2a2a2a;
    object-fit: cover;
  }
  
  .token-text {
    flex: 1;
    font-size: 14px;
  }
  
  .loading-indicator {
    font-size: 12px;
    color: #8b5cf6;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  
  &:focus {
    outline: none;
  }
  
  &::placeholder {
    color: #666;
  }
`;

const NoResults = styled.div`
  padding: 12px;
  text-align: center;
  color: #666;
  font-size: 14px;
`;

const TokenIcon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2a2a2a;
  object-fit: cover;
  position: relative;
  
  &.loading {
    background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
    background-size: 200% 100%;
    animation: ${shimmer} 1.5s infinite;
  }
`;

const TokenFallbackIcon = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: white;
  position: relative;
`;

const Amount = styled.div`
  font-size: 20px;
  color: white;
  font-weight: 500;
`;

const VirtualScrollSpacer = styled.div<{ height: number }>`
  ${props => css`
    height: ${props.height}px;
  `}
`;

interface ConverterProps {
  onCryptoChange: (crypto: string) => void;
  onFiatChange: (fiat: string) => void;
  defaultCrypto: string;
  defaultFiat: string;
}

const Tooltip = styled.div<{ $arrowOffset?: string }>`
  position: absolute;
  bottom: calc(100% + 8px);
  padding: 10px 14px;
  background: rgb(15, 15, 25);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(139, 92, 246, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);

  border: 1px solid rgba(139, 92, 246, 0.4);
  z-index: 1001;
  line-height: 1.4;
  letter-spacing: 0.3px;

  left: 50%;
  transform: translateX(-50%) translateY(4px);

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: ${props => props.$arrowOffset || '50%'};
    transform: ${props => props.$arrowOffset ? 'translateX(0)' : 'translateX(-50%)'};
    border-width: 6px;
    border-style: solid;
    border-color: rgb(15, 15, 25) transparent transparent transparent;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }
  
  /* Enhanced gradient overlay for glass effect */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, 
      rgba(139, 92, 246, 0.15) 0%, 
      rgba(139, 92, 246, 0.05) 50%,
      rgba(255, 255, 255, 0.05) 100%
    );
    border-radius: 8px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
  }
`;

const ButtonContainer = styled.div`
  position: fixed;
  bottom: 5px;
  width: calc(100% - 40px);
  left: 20px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const ButtonWrapper = styled.div`
  position: relative;
  z-index: 10;
  transition:
    transform 0.3s ease,
    bottom 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  
  /* Reset bottom positioning from individual wrappers */
  bottom: 0;
  pointer-events: auto; /* Enable pointer events for buttons inside */

  &:has(> button:hover) {
    transform: translateY(-2px);
  }

  &:has(> button:hover) ${Tooltip} {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2);
    animation: tooltipPulse 2s infinite;
    
    &::before {
      opacity: 1;
    }
  }
  
  @keyframes tooltipPulse {
    0% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
    50% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 16px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.3); }
    100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
  }
`;

const ChartButton = styled.button`
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  /* Liquid Glass Foundation */
  background: linear-gradient(145deg, rgba(45, 45, 55, 0.7), rgba(25, 25, 35, 0.8));
  border: 1px solid rgba(139, 92, 246, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #a78bfa; /* Slightly brighter base color */

  /* Depth and Edge Highlights */
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.1), /* Inner highlight */
    0 2px 5px rgba(0, 0, 0, 0.3); /* Outer shadow for depth */

  /* Smooth transitions for all properties */
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  /* Hover State: Lift and Glow */
  &:hover {
    transform: scale(1.1);
    border-color: rgba(139, 92, 246, 0.6);
    color: #c4b5fd; /* Brighter icon on hover */
    background: linear-gradient(145deg, rgba(55, 55, 65, 0.8), rgba(35, 35, 45, 0.9));
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.15),
      0 4px 12px rgba(0, 0, 0, 0.3), /* Deeper outer shadow */
      0 0 15px rgba(139, 92, 246, 0.4); /* Enhanced purple glow */
  }

  /* Active State: Press-in effect */
  &:active {
    transform: scale(1.0);
    background: linear-gradient(145deg, rgba(35, 35, 45, 0.7), rgba(15, 15, 25, 0.8));
    box-shadow: 
      inset 0 2px 3px rgba(0, 0, 0, 0.4), /* Darker inner shadow */
      0 1px 2px rgba(0, 0, 0, 0.2);
  }

  svg {
    width: 24px;
    height: 24px;
    transition: all 0.3s ease;
    filter: drop-shadow(0 1px 2px rgba(139, 92, 246, 0.3));
  }

  &:hover svg {
    transform: scale(1.05) rotate(-5deg); /* More interactive icon movement */
    filter: drop-shadow(0 2px 4px rgba(139, 92, 246, 0.5));
  }

  @media (max-width: 768px) {
    width: 42px;
    height: 42px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const AnalysisButton = styled(ChartButton)``;
const TrendingButton = styled(ChartButton)``; // New button for trending
const NewsButton = styled(ChartButton)``; // New button for news

const ChartIcon = () => (
  <FiBarChart />
);

const AnalysisIcon = () => (
  <FaMagnifyingGlassChart />
);

const TrendingIcon = () => (
  <FaFire style={{ color: '#ff6b6b' }} />
);

const NewsIcon = () => (
  <FaNewspaper style={{ color: '#60a5fa' }} />
);

// Styled component for CoinGecko link
const CoinGeckoLink = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
  margin-top: 52px;
  padding: 4px;
  align-self: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 1;

  &:hover {
    color: #a78bfa;
    text-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
  }
  
  &:active {
    transform: scale(0.97);
  }
`;

// Add rate limit indicator styling
const RateLimitIndicator = styled.div`
  margin-top: 10px;
  padding: 6px 10px;
  background: rgba(255, 59, 48, 0.1);
  color: #ff453a;
  border-radius: 4px;
  font-size: 0.8rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 2s infinite ease-in-out;
  
  @keyframes pulse {
    0% { opacity: 0.7; }
    50% { opacity: 1; }
    100% { opacity: 0.7; }
  }
`;

const Converter: React.FC<ConverterProps> = ({ 
  onCryptoChange, 
  onFiatChange,
  defaultCrypto,
  defaultFiat
}) => {
  // State for the converter
  const [selectedCrypto, setSelectedCrypto] = useState(defaultCrypto);
  const [selectedFiat, setSelectedFiat] = useState(defaultFiat);
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [fiatAmount, setFiatAmount] = useState('');
  const [error, setError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [lastEditedField, setLastEditedField] = useState<'crypto' | 'fiat'>('crypto');
  const [cryptoDropdownOpen, setCryptoDropdownOpen] = useState(false);
  const [fiatDropdownOpen, setFiatDropdownOpen] = useState(false);
  const [cryptoSearchTerm, setCryptoSearchTerm] = useState('');
  const [preloadedIcons, setPreloadedIcons] = useState<Set<string>>(new Set());
  const [cryptoDropdownStyle, setCryptoDropdownStyle] = useState<CSSProperties>({});
  const [fiatDropdownStyle, setFiatDropdownStyle] = useState<CSSProperties>({});
  const [showWaveInResultBox, setShowWaveInResultBox] = useState(false);
  const [userManuallySetFiat, setUserManuallySetFiat] = useState(false);
  
  // Refs for handling outside clicks and scrolling
  const cryptoDropdownRef = useRef<HTMLDivElement>(null);
  const fiatDropdownRef = useRef<HTMLDivElement>(null);
  const cryptoButtonRef = useRef<HTMLButtonElement>(null);
  const fiatButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cryptoInputRef = useRef<HTMLInputElement>(null);
  const fiatInputRef = useRef<HTMLInputElement>(null);
  const converterWaveStartTimeRef = useRef<number | null>(null); // Ref for start time
  
  // Track icon fetch attempts to avoid repeated requests
  const iconFetchAttempts = useRef<Record<string, number>>({});
  
  // Add a ref to track icon update intervals
  const iconUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const lastIconCheck = useRef<number>(0);
  const missingIconsCount = useRef<number>(0);
  const iconUpdateAttempts = useRef<Record<string, number>>({});
  
  const { 
    prices, 
    availableCryptos, 
    isPending, 
    tokenMetadata, 
    getCryptoId, 
    updatePrices,
    checkAndUpdateMissingIcons,
    setTokenMetadata,
    isCoinGeckoRateLimitedGlobal,
    getCoinGeckoRetryAfterSeconds,
    getCoinDetails
  } = useCrypto();
  const navigate = useNavigate();
  
  const fiats = ['USD','CAD', 'EUR'];
  
  // Filter cryptos based on search term
  const filteredCryptos = cryptoSearchTerm 
    ? availableCryptos.filter(crypto => 
        crypto.toLowerCase().includes(cryptoSearchTerm.toLowerCase()) ||
        (tokenMetadata[getCryptoId(crypto) || '']?.name || '').toLowerCase().includes(cryptoSearchTerm.toLowerCase())
      )
    : availableCryptos;
    
  // Virtual list implementation - only render visible items
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const itemHeight = 40; // Approximate height of each dropdown item in pixels
  const bufferItems = 5; // Number of items to render above and below visible area
  const visibleItems = 10; // Approximate number of items visible in the dropdown
  
  // Handle dropdown scroll to update visible items
  const handleDropdownScroll = () => {
    if (dropdownRef.current) {
      const scrollTop = dropdownRef.current.scrollTop;
      const newStartIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferItems);
      setVisibleStartIndex(newStartIndex);
    }
  };
  
  // Calculate visible items range
  const endIndex = Math.min(
    visibleStartIndex + visibleItems + 2 * bufferItems,
    filteredCryptos.length
  );
  
  // Visible items to render
  const visibleCryptos = filteredCryptos.slice(visibleStartIndex, endIndex);
  
  // Create spacer elements for virtual scrolling
  const topSpacerHeight = visibleStartIndex * itemHeight;
  const bottomSpacerHeight = Math.max(
    0,
    (filteredCryptos.length - endIndex) * itemHeight
  );
  
  // Enhanced function to check for missing icons
  const checkMissingIcons = async () => {
    try {
      // Don't check too frequently
      const now = Date.now();
      if (now - lastIconCheck.current < 30000) { // 30 seconds minimum between checks
        return;
      }
      
      lastIconCheck.current = now;
      
      // Check for missing icons
      const count = await checkAndUpdateMissingIcons();
      missingIconsCount.current = count;
      
      // If we found missing icons, schedule another check soon
      if (count > 0) {
        console.log(`📉 Found ${count} tokens with missing icons, scheduling another check`);
        // Schedule another check in 10 seconds
        setTimeout(checkMissingIcons, 10000);
      }
    } catch (error) {
      console.error('Error checking for missing icons:', error);
    }
  };
  
  // Enhanced useEffect for icon checking
  useEffect(() => {
    // Initial check for missing icons
    checkMissingIcons();
    
    // Set up periodic checks for missing icons
    iconUpdateInterval.current = setInterval(() => {
      checkMissingIcons();
    }, 2 * 60 * 1000); // Check every 2 minutes
    
    return () => {
      // Clean up interval on unmount
      if (iconUpdateInterval.current) {
        clearInterval(iconUpdateInterval.current);
      }
    };
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cryptoDropdownRef.current && !cryptoDropdownRef.current.contains(event.target as Node)) {
        setCryptoDropdownOpen(false);
      }
      if (fiatDropdownRef.current && !fiatDropdownRef.current.contains(event.target as Node)) {
        setFiatDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Ensure metadata is loaded for default tokens when the component mounts
  useEffect(() => {
    // Trigger an update to ensure metadata is loaded for default tokens
    updatePrices(false);
  }, [updatePrices]);

  // Ensure token icons are refreshed when component mounts or selected crypto changes
  useEffect(() => {
    // Check if we have the icon for the current crypto
    const id = getCryptoId(selectedCrypto);
    if (id && !tokenMetadata[id]?.image) {
      // Try to get from localStorage first
      const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${selectedCrypto.toLowerCase()}`;
      const cachedIcon = localStorage.getItem(iconCacheKey);
      
      if (!cachedIcon) {
        // If not in localStorage, trigger a metadata update
        updatePrices(true);
      }
    }
  }, [selectedCrypto, getCryptoId, tokenMetadata, updatePrices]);
  
  // Reset state when crypto selection changes
  useEffect(() => {
    const resetState = () => {
      setCryptoAmount('');
      setFiatAmount('');
      setError('');
    };

    // Reset state when crypto selection changes
    resetState();
    
    // Update selected crypto if it's no longer available
    if (!availableCryptos.includes(selectedCrypto)) {
      setSelectedCrypto(availableCryptos[0]);
      onCryptoChange(availableCryptos[0]);
    }
  }, [selectedCrypto, selectedFiat, availableCryptos]);

  // Listen for token update events to immediately refresh dropdown
  useEffect(() => {
    const handleTokensUpdated = (e: CustomEvent) => {
      console.log('Token update event received:', e.detail);
      // Force a refresh of the dropdown contents
      setCryptoDropdownOpen(false);
      
      // Reset dropdown position
      if (dropdownRef.current) {
        dropdownRef.current.scrollTop = 0;
      }
      
      // Force a re-render of the dropdown items
      setVisibleStartIndex(0);
      
      // Pre-load icons for new tokens
      if (e.detail?.tokens && Array.isArray(e.detail.tokens)) {
        e.detail.tokens.forEach((symbol: string) => {
          // Add to preloaded set to trigger background loading
          setPreloadedIcons(prev => new Set([...prev, symbol]));
        });
      }
    };
    
    const handleMetadataUpdated = () => {
      // Force a refresh of token metadata in the dropdown
      setPreloadedIcons(prev => new Set([...prev]));
    };

    // Add event listeners for token updates
    window.addEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
    window.addEventListener('cryptoMetadataUpdated', handleMetadataUpdated);
    
    return () => {
      window.removeEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
      window.removeEventListener('cryptoMetadataUpdated', handleMetadataUpdated);
    };
  }, []);

  // Check for missing icons when component mounts and when available cryptos change
  useEffect(() => {
    // Check for missing icons on mount and when available cryptos change
    const checkMissingIcons = async () => {
      // Only run if we have cryptos available
      if (availableCryptos.length > 0) {
        await checkAndUpdateMissingIcons();
      }
    };
    
    // Run the check
    checkMissingIcons();
    
    // Set up a periodic check for missing icons (every 10 minutes)
    const iconCheckInterval = setInterval(() => {
      checkMissingIcons();
    }, 10 * 60 * 1000);
    
    // Ensure dropdown reflects latest options when available cryptos change
    if (selectedCrypto && !availableCryptos.includes(selectedCrypto)) {
      setSelectedCrypto(availableCryptos[0]);
      onCryptoChange(availableCryptos[0]);
    }
    
    return () => {
      clearInterval(iconCheckInterval);
    };
  }, [availableCryptos, checkAndUpdateMissingIcons, onCryptoChange, selectedCrypto]);

  // Show loading states when rate limited
  useEffect(() => {
    // When we hit the rate limit, make sure we're showing the wave for the current selection
    if (isCoinGeckoRateLimitedGlobal && !showWaveInResultBox) {
      console.log(`[CONVERTER_WAVE] API rate limited. Setting showWaveInResultBox = true for ${selectedCrypto}/${selectedFiat}.`);
      setShowWaveInResultBox(true);
      // Start time tracking for debug purposes
      converterWaveStartTimeRef.current = Date.now();
    }
  }, [isCoinGeckoRateLimitedGlobal, selectedCrypto, selectedFiat, showWaveInResultBox]);

  // Stablecoin detection and auto-switch to CAD
  useEffect(() => {
    const checkStablecoinAndSwitch = async () => {
      // Only auto-switch if user hasn't manually set fiat
      if (userManuallySetFiat) {
        return;
      }

      const cryptoId = getCryptoId(selectedCrypto);
      if (!cryptoId) {
        return;
      }

      try {
        // Get detailed metadata for stablecoin detection
        const coinDetails = await getCoinDetails(cryptoId);
        const priceInUsd = prices[selectedCrypto]?.usd?.price;
        
        // Check if it's a stablecoin
        const isStablecoinToken = isStablecoin(coinDetails, selectedCrypto, priceInUsd);
        
        if (isStablecoinToken) {
          // Get the appropriate target fiat for this stablecoin
          const targetFiat = getStablecoinTargetFiat(coinDetails, selectedCrypto);
          
          if (selectedFiat !== targetFiat) {
            console.log(`🪙 [STABLECOIN_AUTO_SWITCH] Detected stablecoin ${selectedCrypto}, switching fiat from ${selectedFiat} to ${targetFiat}`);
            setSelectedFiat(targetFiat);
            onFiatChange(targetFiat);
            
            // Show a brief notification (optional - could add toast here)
            console.log(`💱 Auto-switched to ${targetFiat} for stablecoin ${selectedCrypto}`);
          }
        }
      } catch (error) {
        console.error(`🔴 [STABLECOIN_CHECK] Error checking stablecoin status for ${selectedCrypto}:`, error);
        
        // Fallback: use symbol-based detection
        const priceInUsd = prices[selectedCrypto]?.usd?.price;
        const isStablecoinBySymbol = isStablecoin(null, selectedCrypto, priceInUsd);
        if (isStablecoinBySymbol && selectedFiat !== 'CAD' && !userManuallySetFiat) {
          console.log(`🪙 [STABLECOIN_FALLBACK] Using symbol-based detection for ${selectedCrypto}, switching to CAD`);
          setSelectedFiat('CAD');
          onFiatChange('CAD');
        }
      }
    };

    checkStablecoinAndSwitch();
  }, [selectedCrypto, getCryptoId, getCoinDetails, selectedFiat, userManuallySetFiat, onFiatChange]);
  
  const getRate = (crypto: string, fiat: string): number => {
    try {
      if (isPending(crypto) || isCoinGeckoRateLimitedGlobal) {
        if (!showWaveInResultBox) {
          const ratePendingReason = isCoinGeckoRateLimitedGlobal 
            ? "API rate limit reached" 
            : "Rate pending (loading)";
          console.log(`[CONVERTER_WAVE] Rate pending for: ${crypto}/${fiat}. Reason: ${ratePendingReason}. Showing wave. Current showWaveInResultBox: ${showWaveInResultBox}`); // Logging
          converterWaveStartTimeRef.current = Date.now();
          setShowWaveInResultBox(true); // Show wave when rate is pending
        }
        return 0; // Return 0 to signal that rate is not available
      }
      
      if (showWaveInResultBox) {
        const waveStartTime = converterWaveStartTimeRef.current;
        const waveDuration = waveStartTime ? Date.now() - waveStartTime : 0;
        // The showWaveInResultBox state should correspond to an active timer.
        if (waveStartTime) {
          console.log(`[CONVERTER_WAVE] Rate loaded for ${crypto}/${fiat} after ${waveDuration}ms. Hiding wave.`);
          converterWaveStartTimeRef.current = null;
        }
        setShowWaveInResultBox(false); // Hide wave once rate is loaded
      }

      const cryptoPrice = prices[crypto]?.[fiat.toLowerCase()];
      if (!cryptoPrice || cryptoPrice.price === null) {
        throw new Error(`Price not found for ${crypto}/${fiat}`);
      }
      return cryptoPrice.price;
    } catch (err) {
      console.error(`Error in getRate for ${crypto}/${fiat}:`, err);
      setError(`Could not get rate for ${crypto}/${fiat}`);
      return 0;
    }
  };

  const formatNumber = (value: string, isCrypto: boolean): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    
    // For crypto amounts, use more decimals
    if (isCrypto) {
      if (num < 0.000001) return num.toFixed(8);
      if (num < 0.0001) return num.toFixed(6);
      if (num < 0.01) return num.toFixed(4);
      return num.toFixed(2);
    }
    
    // For fiat amounts
    if (num >= 1000000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (num >= 1) return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 0.01) return num.toFixed(2);
    return num.toFixed(4);
  };

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    setLastEditedField('crypto');
    
    // Remove all non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    setCryptoAmount(value);
    if (value === '') {
      setFiatAmount('');
      return;
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      setError('Please enter a valid number');
      return;
    }

    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate === 0) {
      setError('Price data unavailable');
      if (showWaveInResultBox) { // End timer if it was active due to error
        const waveTimerLabel = `converter_wave_${selectedCrypto}_${selectedFiat}`;
        console.timeEnd(waveTimerLabel);
        if (converterWaveStartTimeRef.current) {
          const duration = performance.now() - converterWaveStartTimeRef.current;
          console.log(`⏱️ ${waveTimerLabel} (in seconds): ${(duration / 1000).toFixed(3)} s`);
          converterWaveStartTimeRef.current = null;
        }
      }
      return;
    }

    console.log('[Converter] handleCryptoAmountChange - value:', value, 'rate:', rate); // Log

    const convertedAmount = (numericValue * rate).toString();
    setFiatAmount(convertedAmount);
    setError('');
    // setShowWaveInResultBox(false) is handled by getRate if not pending
  };

  const handleFiatAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    setLastEditedField('fiat');
    
    // Remove all non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    setFiatAmount(value);
    if (value === '') {
      setCryptoAmount('');
      return;
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      setError('Please enter a valid number');
      return;
    }

    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate === 0) {
      setError('Price data unavailable');
      if (showWaveInResultBox) { // End timer if it was active due to error
        const waveTimerLabel = `converter_wave_${selectedCrypto}_${selectedFiat}`;
        console.timeEnd(waveTimerLabel);
        if (converterWaveStartTimeRef.current) {
          const duration = performance.now() - converterWaveStartTimeRef.current;
          console.log(`⏱️ ${waveTimerLabel} (in seconds): ${(duration / 1000).toFixed(3)} s`);
          converterWaveStartTimeRef.current = null;
        }
      }
      return;
    }

    console.log('[Converter] handleFiatAmountChange - value:', value, 'rate:', rate); // Log

    const convertedAmount = (numericValue / rate).toString();
    setCryptoAmount(convertedAmount);
    setError('');
    // setShowWaveInResultBox(false) is handled by getRate if not pending
  };

  // Add paste event handlers for both inputs
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, isCrypto: boolean) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Remove all non-numeric characters except decimal point
    const cleanedValue = pastedText.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = cleanedValue.split('.');
    const value = parts[0] + (parts.length > 1 ? '.' + parts[1] : '');
    
    if (isCrypto) {
      setLastEditedField('crypto');
      setCryptoAmount(value);
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        const rate = getRate(selectedCrypto, selectedFiat);
        const convertedAmount = (numericValue * rate).toString();
        setFiatAmount(convertedAmount);
        setError('');
        // setShowWaveInResultBox(false) is handled by getRate if not pending
      }
    } else {
      setLastEditedField('fiat');
      setFiatAmount(value);
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        const rate = getRate(selectedCrypto, selectedFiat);
        const convertedAmount = (numericValue / rate).toString();
        setCryptoAmount(convertedAmount);
        setError('');
        // setShowWaveInResultBox(false) is handled by getRate if not pending
      }
    }
  };

  // Handle crypto selection change
  const handleCryptoChange = (crypto: string) => {
    const oldCrypto = selectedCrypto;
    const oldFiat = selectedFiat;

    setSelectedCrypto(crypto);
    onCryptoChange(crypto);
    setCryptoDropdownOpen(false);
    setCryptoSearchTerm('');
    
    // Reset manual fiat flag when crypto changes to allow auto-switching
    setUserManuallySetFiat(false);
    
    // End timer for the OLD crypto if it was active
    if (showWaveInResultBox) {
      const oldWaveTimerLabel = `converter_wave_${oldCrypto}_${oldFiat}`;
      console.log(`[CONVERTER_WAVE] Crypto changed from ${oldCrypto} to ${crypto}. Ending wave for ${oldWaveTimerLabel} if active.`); // Logging
      console.timeEnd(oldWaveTimerLabel);
      if (converterWaveStartTimeRef.current) {
        const duration = performance.now() - converterWaveStartTimeRef.current;
        console.log(`⏱️ ${oldWaveTimerLabel} (in seconds - ended on crypto change): ${(duration / 1000).toFixed(3)} s`);
        converterWaveStartTimeRef.current = null;
      }
      //setShowWaveInResultBox(false); // Will be set based on new crypto
    }

    if (isPending(crypto)) {
      const newWaveTimerLabel = `converter_wave_${crypto}_${selectedFiat}`;
      console.time(newWaveTimerLabel); // Log Start Wave for new crypto
      console.log(`🌊 [Converter] handleCryptoChange: Starting wave for ${crypto} / ${selectedFiat}`);
      console.log(`[CONVERTER_WAVE] Setting showWaveInResultBox = true in handleCryptoChange for: ${crypto}/${selectedFiat} because selectedCrypto isPending.`); // Logging
      converterWaveStartTimeRef.current = Date.now(); // Capture start time
      setShowWaveInResultBox(true);
    } else {
      console.log(`[CONVERTER_WAVE] Setting showWaveInResultBox = false in handleCryptoChange for: ${crypto}/${selectedFiat} because selectedCrypto is NOT pending.`); // Logging
      setShowWaveInResultBox(false); // Ensure wave is off if new crypto is not pending
    }
    
    // Force immediate price update for the new selection
    updatePrices(true);
    
    // Try to fetch cached data if available
    const id = getCryptoId(crypto);
    if (id) {
      // Check if we already have price data in localStorage
      const priceCacheKey = `crypto_price_${crypto.toLowerCase()}`;
      const cachedPrice = localStorage.getItem(priceCacheKey);
      if (cachedPrice) {
        try {
          const priceData = JSON.parse(cachedPrice);
          // Use cached price data immediately while waiting for fresh data
          if (priceData && priceData.timestamp && Date.now() - priceData.timestamp < 5 * 60 * 1000) {
            // Only use cache if less than 5 minutes old
            // This provides immediate feedback while waiting for the API
          }
        } catch (e) {
          // Ignore cache parse errors, will fetch fresh data
        }
      }
    }
  };

  // Handle fiat selection change
  const handleFiatChange = (fiat: string) => {
    const oldFiat = selectedFiat;
    setSelectedFiat(fiat);
    onFiatChange(fiat);
    setFiatDropdownOpen(false);
    
    // Mark that user manually set the fiat
    setUserManuallySetFiat(true);

    // If a wave was active for the old fiat with the current crypto, end it.
    if (showWaveInResultBox && isPending(selectedCrypto)) {
      const oldWaveTimerLabel = `converter_wave_${selectedCrypto}_${oldFiat}`;
      console.log(`[CONVERTER_WAVE] Fiat changed from ${oldFiat} to ${fiat}. Current crypto ${selectedCrypto} isPending: ${isPending(selectedCrypto)}. Ending wave for ${oldWaveTimerLabel} if active.`); // Logging
      console.timeEnd(oldWaveTimerLabel);
      if (converterWaveStartTimeRef.current) {
        const duration = performance.now() - converterWaveStartTimeRef.current;
        console.log(`⏱️ ${oldWaveTimerLabel} (in seconds - ended on fiat change): ${(duration / 1000).toFixed(3)} s`);
        converterWaveStartTimeRef.current = null;
      }
      //setShowWaveInResultBox(false); // Will be set based on new state
    }

    // Re-evaluate wave display based on current crypto and new fiat
    if (isPending(selectedCrypto)) {
      const newWaveTimerLabel = `converter_wave_${selectedCrypto}_${fiat}`;
      console.time(newWaveTimerLabel); // Log Start Wave for new fiat
      console.log(`🌊 [Converter] handleFiatChange: Starting wave for ${selectedCrypto} / ${fiat}`);
      console.log(`[CONVERTER_WAVE] Setting showWaveInResultBox = true in handleFiatChange for: ${selectedCrypto}/${fiat} because selectedCrypto isPending.`); // Logging
      converterWaveStartTimeRef.current = Date.now(); // Capture start time
      setShowWaveInResultBox(true);
    } else {
      console.log(`[CONVERTER_WAVE] Setting showWaveInResultBox = false in handleFiatChange for: ${selectedCrypto}/${fiat} because selectedCrypto is NOT pending.`); // Logging
      setShowWaveInResultBox(false); // Ensure wave is off if crypto is not pending
    }
  };

  // Get fiat currency icon with caching
  const getFiatIcon = (currency: string): string | null => {
    if (!currency) return null;
    
    const normalizedCurrency = currency.toUpperCase();
    
    // Check if we have an icon for this currency
    if (fiatIcons[normalizedCurrency]) {
      // Use local storage cache if available
      const iconCacheKey = `${FIAT_ICON_CACHE_PREFIX}${normalizedCurrency.toLowerCase()}`;
      const cachedIcon = localStorage.getItem(iconCacheKey);
      
      if (cachedIcon) {
        return cachedIcon;
      }
      
      // If not cached but we have the icon URL, cache it for future use
      try {
        localStorage.setItem(iconCacheKey, fiatIcons[normalizedCurrency]);
      } catch (error) {
        console.error('Error caching fiat icon:', error);
      }
      
      return fiatIcons[normalizedCurrency];
    }
    
    return null;
  };

  // Handle fiat icon loading errors
  const handleFiatImageError = (e: React.SyntheticEvent<HTMLImageElement>, currency?: string) => {
    const img = e.currentTarget;
    img.onerror = null; // Prevent infinite error loops
    
    if (!currency) return;
    
    // Set a default placeholder
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzZlNzZlNCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0cHgiPnt7c3ltYm9sfX08L3RleHQ+PC9zdmc+';
    
    // Try to replace the placeholder with the first letter of the currency
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#6e76e4'; // Different color than crypto to distinguish
        ctx.beginPath();
        ctx.arc(16, 16, 16, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currency.charAt(0).toUpperCase(), 16, 16);
        
        img.src = canvas.toDataURL();
      }
    } catch (error) {
      console.error('Error creating fallback fiat icon:', error);
    }
  };

  // Enhanced getTokenIcon function with better error handling and fallbacks
  const getTokenIcon = (symbol: string): string | null => {
    if (!symbol) return null;
    
    const normalizedSymbol = symbol.toUpperCase();
    
    // Check if we already have the icon in metadata
    const id = getCryptoId(normalizedSymbol);
    if (id && tokenMetadata[id]?.image) {
      return tokenMetadata[id].image;
    }
    
    // Use a local icon cache to prevent repeated requests
    const iconCacheKey = `${ICON_CACHE_STORAGE_PREFIX}${normalizedSymbol.toLowerCase()}`;
    const cachedIcon = localStorage.getItem(iconCacheKey);
    if (cachedIcon) {
      // If we have a cached icon but no metadata, update the metadata
      if (id && !tokenMetadata[id]?.image) {
        // This will trigger a metadata update in the background without loading indicators
        setTimeout(() => {
          // Update the metadata with the cached icon
          setTokenMetadata((prev: Record<string, any>) => ({
            ...prev,
            [id]: {
              ...(prev[id] || {}),
              image: cachedIcon,
              symbol: normalizedSymbol
            }
          }));
        }, 0);
      }
      return cachedIcon;
    }
    
    // If we don't have an icon but we have an ID, trigger an immediate background fetch
    if (id) {
      // Debounce the fetch to avoid multiple requests for the same token
      const now = Date.now();
      const lastFetchAttempt = iconFetchAttempts.current[normalizedSymbol] || 0;
      
      // Only attempt to fetch if we haven't tried in the last minute (reduced from 2 minutes for more responsiveness)
      if (now - lastFetchAttempt > 60 * 1000) {
        iconFetchAttempts.current[normalizedSymbol] = now;
        iconUpdateAttempts.current[normalizedSymbol] = (iconUpdateAttempts.current[normalizedSymbol] || 0) + 1;
        
        // Trigger an immediate background fetch for this token's metadata
        setTimeout(() => {
          // Use the checkAndUpdateMissingIcons function from context
          checkMissingIcons();
        }, 10); // Reduced from 100ms to 10ms for faster updates
      }
    }
    
    return null;
  };

  // Enhanced handleImageError with better fallback and recovery
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, symbol?: string) => {
    const img = e.currentTarget;
    img.onerror = null; // Prevent infinite error loops
    
    if (!symbol) return;
    
    // Set a default placeholder
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzYyNjJGRiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0cHgiPnt7c3ltYm9sfX08L3RleHQ+PC9zdmc+';
    
    // Try to replace the placeholder with the first letter of the symbol
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#6262FF';
        ctx.beginPath();
        ctx.arc(16, 16, 16, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol.charAt(0).toUpperCase(), 16, 16);
        
        img.src = canvas.toDataURL();
      }
    } catch (error) {
      console.error('Error creating fallback icon:', error);
    }
    
    // Trigger a background fetch for this token's icon
    const normalizedSymbol = symbol.toUpperCase();
    const now = Date.now();
    const lastFetchAttempt = iconFetchAttempts.current[normalizedSymbol] || 0;
    
    // Only attempt to fetch if we haven't tried in the last minute
    if (now - lastFetchAttempt > 60 * 1000) {
      iconFetchAttempts.current[normalizedSymbol] = now;
      
      // Schedule an immediate check for missing icons
      setTimeout(checkMissingIcons, 100);
    }
  };

  const handleCopy = async () => {
    if (cryptoAmount && fiatAmount) {
      let textToCopy = '';
      textToCopy = lastEditedField === 'crypto' 
        ? formatNumber(fiatAmount, false)
        : formatNumber(cryptoAmount, true);
      
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleOpenCoinGecko = () => {
    const id = getCryptoId(selectedCrypto);
    if (id) {
      const url = `https://www.coingecko.com/en/coins/${id}`;
      console.log('Opening CoinGecko link in-app:', url);
      ipcRenderer.send('open-link-in-app', url);
    } else {
      console.warn('Cannot open CoinGecko link: Could not find ID for', selectedCrypto);
    }
  };

  // State for tooltip styles and arrow positioning
  const [chartTooltipData, setChartTooltipData] = useState<{ style: React.CSSProperties; arrowOffset?: string }>({ style: {} });
  const [analysisTooltipData, setAnalysisTooltipData] = useState<{ style: React.CSSProperties; arrowOffset?: string }>({ style: {} });
  const [trendingTooltipData, setTrendingTooltipData] = useState<{ style: React.CSSProperties; arrowOffset?: string }>({ style: {} });
  const [newsTooltipData, setNewsTooltipData] = useState<{ style: React.CSSProperties; arrowOffset?: string }>({ style: {} });

  // Refs for tooltips and buttons
  const chartButtonRef = useRef<HTMLButtonElement>(null);
  const analysisButtonRef = useRef<HTMLButtonElement>(null);
  const trendingButtonRef = useRef<HTMLButtonElement>(null);
  const newsButtonRef = useRef<HTMLButtonElement>(null);
  const chartTooltipRef = useRef<HTMLDivElement>(null);
  const analysisTooltipRef = useRef<HTMLDivElement>(null);
  const trendingTooltipRef = useRef<HTMLDivElement>(null);
  const newsTooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const calculateTooltipStyle = (buttonRef: React.RefObject<HTMLButtonElement>, tooltipRef: React.RefObject<HTMLDivElement>): { tooltipStyle: React.CSSProperties; arrowOffset?: string } => {
    if (!buttonRef.current || !tooltipRef.current) return { tooltipStyle: {} };

    const tooltipWidth = tooltipRef.current.offsetWidth;
    const viewportWidth = window.innerWidth;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const buttonCenter = buttonRect.left + buttonRect.width / 2;
    const buffer = 15;

    let tooltipStyle: React.CSSProperties = {
      left: '50%',
      transform: 'translateX(-50%) translateY(4px)'
    };
    
    let arrowOffset: string | undefined;

    // Check if tooltip would overflow on the left
    const wouldOverflowLeft = buttonCenter - (tooltipWidth / 2) < buffer;
    // Check if tooltip would overflow on the right  
    const wouldOverflowRight = buttonCenter + (tooltipWidth / 2) > viewportWidth - buffer;

    if (wouldOverflowLeft) {
      // Position tooltip to the right, align left edge with buffer
      tooltipStyle = {
        left: `${buffer - buttonRect.left}px`,
        transform: 'translateY(4px)'
      };
      // Calculate arrow position to point to button center
      const arrowLeftPosition = buttonCenter - buffer - 5; // 5px is half arrow width
      arrowOffset = `${Math.max(15, arrowLeftPosition)}px`;
    } else if (wouldOverflowRight) {
      // Position tooltip so its right edge is at viewport edge minus buffer
      const tooltipLeftPosition = viewportWidth - buffer - tooltipWidth;
      const relativeToButton = tooltipLeftPosition - buttonRect.left;
      
      tooltipStyle = {
        left: `${relativeToButton}px`,
        transform: 'translateY(4px)'
      };
      
      // Calculate arrow position to point to button center
      const arrowFromLeft = buttonCenter - tooltipLeftPosition - 5; // 5px is half arrow width
      arrowOffset = `${Math.max(15, Math.min(arrowFromLeft, tooltipWidth - 15))}px`;
    }

    return { tooltipStyle, arrowOffset };
  };

  // Debounced style calculation on hover
  const handleButtonHover = (type: 'chart' | 'analysis' | 'trending' | 'news') => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    hoverTimeoutRef.current = setTimeout(() => {
      if (type === 'chart' && chartButtonRef.current && chartTooltipRef.current) {
          // Temporarily show tooltip to measure
          chartTooltipRef.current.style.visibility = 'visible';
          chartTooltipRef.current.style.opacity = '0';
          const { tooltipStyle, arrowOffset } = calculateTooltipStyle(chartButtonRef, chartTooltipRef);
          // Hide tooltip again
          chartTooltipRef.current.style.visibility = '';
          chartTooltipRef.current.style.opacity = '';
          setChartTooltipData({ style: tooltipStyle, arrowOffset });
      } else if (type === 'analysis' && analysisButtonRef.current && analysisTooltipRef.current) {
          // Temporarily show tooltip to measure
          analysisTooltipRef.current.style.visibility = 'visible';
          analysisTooltipRef.current.style.opacity = '0';
          const { tooltipStyle, arrowOffset } = calculateTooltipStyle(analysisButtonRef, analysisTooltipRef);
           // Hide tooltip again
          analysisTooltipRef.current.style.visibility = '';
          analysisTooltipRef.current.style.opacity = '';
          setAnalysisTooltipData({ style: tooltipStyle, arrowOffset });
      } else if (type === 'trending' && trendingButtonRef.current && trendingTooltipRef.current) {
          // Temporarily show tooltip to measure
          trendingTooltipRef.current.style.visibility = 'visible';
          trendingTooltipRef.current.style.opacity = '0';
          const { tooltipStyle, arrowOffset } = calculateTooltipStyle(trendingButtonRef, trendingTooltipRef);
           // Hide tooltip again
          trendingTooltipRef.current.style.visibility = '';
          trendingTooltipRef.current.style.opacity = '';
          setTrendingTooltipData({ style: tooltipStyle, arrowOffset });
      } else if (type === 'news' && newsButtonRef.current && newsTooltipRef.current) {
          // Temporarily show tooltip to measure
          newsTooltipRef.current.style.visibility = 'visible';
          newsTooltipRef.current.style.opacity = '0';
          const { tooltipStyle, arrowOffset } = calculateTooltipStyle(newsButtonRef, newsTooltipRef);
           // Hide tooltip again
          newsTooltipRef.current.style.visibility = '';
          newsTooltipRef.current.style.opacity = '';
          setNewsTooltipData({ style: tooltipStyle, arrowOffset });
      }
    }, 50); // Debounce slightly
  };

  const handleButtonLeave = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      // Optionally reset styles on leave, or let them persist until next hover
      // setChartTooltipStyle({});
      // setAnalysisTooltipStyle({});
  };

  // Dynamically calculate dropdown position
  useEffect(() => {
    const calculatePosition = (buttonRef: React.RefObject<HTMLButtonElement>, dropdownRef: React.RefObject<HTMLDivElement>, setStyle: React.Dispatch<React.SetStateAction<CSSProperties>>) => {
      if (buttonRef.current && dropdownRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        const dropdownHeight = dropdownRef.current.offsetHeight || 200; // Use actual height or estimate
        const spaceBelow = window.innerHeight - buttonRect.bottom;
        const spaceAbove = buttonRect.top;
        const buffer = 15; // Increased buffer

        if (spaceBelow < dropdownHeight + buffer && spaceAbove > dropdownHeight) {
          // Open upwards if not enough space below, but enough space above
          setStyle({ bottom: 'calc(100% + 4px)', top: 'auto' });
        } else {
          // Default: open downwards
          setStyle({ top: 'calc(100% + 4px)', bottom: 'auto' });
        }
      } else {
        // Reset if refs aren't ready
        setStyle({});
      }
    };

    if (cryptoDropdownOpen) {
      // Use a timeout to allow the dropdown to render and get its height
      const timer = setTimeout(() => {
        calculatePosition(cryptoButtonRef, dropdownRef, setCryptoDropdownStyle);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      setCryptoDropdownStyle({}); // Reset when closed
    }
  }, [cryptoDropdownOpen]);

  useEffect(() => {
    const calculatePosition = (buttonRef: React.RefObject<HTMLButtonElement>, dropdownRef: React.RefObject<HTMLDivElement>, setStyle: React.Dispatch<React.SetStateAction<CSSProperties>>) => {
      if (buttonRef.current && dropdownRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        // Use a fixed estimate for fiat dropdown as it's not virtualized and has fewer items
        const dropdownHeight = 150; 
        const spaceBelow = window.innerHeight - buttonRect.bottom;
        const spaceAbove = buttonRect.top;
        const buffer = 15; // Increased buffer

        if (spaceBelow < dropdownHeight + buffer && spaceAbove > dropdownHeight) {
          setStyle({ bottom: 'calc(100% + 4px)', top: 'auto' });
        } else {
          setStyle({ top: 'calc(100% + 4px)', bottom: 'auto' });
        }
      } else {
        setStyle({});
      }
    };

    if (fiatDropdownOpen) {
      // Use a timeout for consistency, though height is estimated
       const timer = setTimeout(() => {
         calculatePosition(fiatButtonRef, fiatDropdownRef, setFiatDropdownStyle);
       }, 0);
       return () => clearTimeout(timer);
    } else {
      setFiatDropdownStyle({}); // Reset when closed
    }
  }, [fiatDropdownOpen]);



  return (
    <ConverterContainer>
      <InputGroup>
        <Label htmlFor="cryptoAmount">Crypto Amount</Label>
        <Input
          id="cryptoAmount"
          type="text"
          value={cryptoAmount}
          onChange={handleCryptoAmountChange}
          onPaste={(e) => handlePaste(e, true)}
          placeholder="0.00"
          ref={cryptoInputRef}
        />
        <SelectContainer ref={cryptoDropdownRef}>
          <SelectButton 
            ref={cryptoButtonRef}
            onClick={() => setCryptoDropdownOpen(!cryptoDropdownOpen)}
            aria-label="Select cryptocurrency"
            aria-expanded={cryptoDropdownOpen}
            $isOpen={cryptoDropdownOpen}
          >
            {getTokenIcon(selectedCrypto) ? (
              <>
                <TokenIcon 
                  src={getTokenIcon(selectedCrypto) || ''} 
                  alt={selectedCrypto}
                  className="token-icon"
                  onError={(e) => handleImageError(e, selectedCrypto)}
                  loading="lazy"
                  onLoad={() => {
                    // Mark as successfully loaded
                    setPreloadedIcons(prev => new Set([...prev, selectedCrypto]));
                  }}
                />
                <TokenFallbackIcon 
                  className="token-fallback-icon" 
                  style={{ display: 'none' }}
                >
                  {selectedCrypto.charAt(0)}
                </TokenFallbackIcon>
              </>
            ) : (
              <>
                <TokenFallbackIcon className="token-fallback-icon">
                  {selectedCrypto.charAt(0)}
                </TokenFallbackIcon>
                {(() => {
                  const id = getCryptoId(selectedCrypto);
                  if (id && !preloadedIcons.has(selectedCrypto)) {
                    // Schedule an immediate check for this token's icon
                    setTimeout(() => {
                      // Mark as attempted
                      setPreloadedIcons(prev => new Set([...prev, selectedCrypto]));
                      // Try to fetch the icon with high priority
                      checkMissingIcons();
                    }, 10); // Reduced from 100ms to 10ms for faster updates
                  }
                  return null;
                })()}
              </>
            )}
            <span className="token-text">{selectedCrypto}</span>
          </SelectButton>
          <DropdownMenu 
            $isOpen={cryptoDropdownOpen} 
            ref={dropdownRef as React.RefObject<HTMLDivElement>}
            onScroll={handleDropdownScroll}
            style={cryptoDropdownStyle}
          >
            <SearchInput 
              type="text" 
              placeholder="Search" 
              value={cryptoSearchTerm}
              onChange={(e) => setCryptoSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {filteredCryptos.length > 0 ? (
              <>
                {/* Top spacer for virtual scrolling */}
                {topSpacerHeight > 0 && <VirtualScrollSpacer height={topSpacerHeight} />}
                
                {/* Only render visible items */}
                {visibleCryptos.map((crypto) => (
                  <DropdownItem
                    key={crypto}
                    onClick={() => handleCryptoChange(crypto)}
                    $isSelected={crypto === selectedCrypto}
                  >
                    {getTokenIcon(crypto) ? (
                      <>
                        <TokenIcon 
                          src={getTokenIcon(crypto) || ''} 
                          alt={crypto}
                          className="token-icon"
                          onError={(e) => handleImageError(e, crypto)}
                          loading="lazy"
                          onLoad={() => {
                            // Mark as successfully loaded
                            setPreloadedIcons(prev => new Set([...prev, crypto]));
                          }}
                        />
                        <TokenFallbackIcon 
                          className="token-fallback-icon" 
                          style={{ display: 'none' }}
                        >
                          {crypto.charAt(0)}
                        </TokenFallbackIcon>
                      </>
                    ) : (
                      <>
                        <TokenFallbackIcon className="token-fallback-icon">
                          {crypto.charAt(0)}
                        </TokenFallbackIcon>
                        {(() => {
                          // Check if we've already tried to load this icon
                          const hasAttempted = preloadedIcons.has(crypto);
                          const id = getCryptoId(crypto);
                          
                          // If we haven't tried or it's been a while since our last attempt
                          if (id && (!hasAttempted || 
                              (iconUpdateAttempts.current[crypto] || 0) < 3)) {
                            
                            // Increment attempt counter
                            iconUpdateAttempts.current[crypto] = 
                              (iconUpdateAttempts.current[crypto] || 0) + 1;
                            
                            // Mark as attempted
                            setPreloadedIcons(prev => new Set([...prev, crypto]));
                            
                            // Schedule an immediate check for this token's icon
                            setTimeout(() => {
                              // Try to fetch the icon with higher priority
                              checkMissingIcons();
                            }, 10); // Reduced from 100ms to 10ms for faster updates
                          }
                          return null;
                        })()}
                      </>
                    )}
                    <span>{crypto}</span>
                  </DropdownItem>
                ))}
                
                {/* Bottom spacer for virtual scrolling */}
                {bottomSpacerHeight > 0 && <VirtualScrollSpacer height={bottomSpacerHeight} />}
              </>
            ) : (
              <NoResults>No tokens found</NoResults>
            )}
          </DropdownMenu>
        </SelectContainer>
      </InputGroup>

      <InputGroup>
        <Label htmlFor="fiatAmount">Fiat Amount</Label>
        <Input
          id="fiatAmount"
          type="text"
          value={fiatAmount}
          onChange={handleFiatAmountChange}
          onPaste={(e) => handlePaste(e, false)}
          placeholder="0.00"
          ref={fiatInputRef}
        />
        <SelectContainer ref={fiatDropdownRef}>
          <SelectButton 
            ref={fiatButtonRef}
            onClick={() => setFiatDropdownOpen(!fiatDropdownOpen)}
            aria-label="Select fiat currency"
            aria-expanded={fiatDropdownOpen}
            $isOpen={fiatDropdownOpen}
          >
            {getFiatIcon(selectedFiat) ? (
              <>
                <TokenIcon 
                  src={getFiatIcon(selectedFiat) || ''} 
                  alt={selectedFiat}
                  className="token-icon"
                  onError={(e) => handleFiatImageError(e, selectedFiat)}
                  loading="lazy"
                />
                <TokenFallbackIcon 
                  className="token-fallback-icon" 
                  style={{ display: 'none' }}
                >
                  {selectedFiat.charAt(0)}
                </TokenFallbackIcon>
              </>
            ) : (
              <TokenFallbackIcon className="token-fallback-icon">
                {selectedFiat.charAt(0)}
              </TokenFallbackIcon>
            )}
            <span className="token-text">{selectedFiat}</span>
            <svg 
              className="dropdown-arrow" 
              width="12" 
              height="6" 
              viewBox="0 0 12 6" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M1 1L6 5L11 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </SelectButton>
          <DropdownMenu 
            $isOpen={fiatDropdownOpen}
            style={fiatDropdownStyle}
            ref={fiatDropdownRef as React.RefObject<HTMLDivElement>}
          >
            {fiats.map((fiat) => (
              <DropdownItem
                key={fiat}
                onClick={() => handleFiatChange(fiat)}
                $isSelected={fiat === selectedFiat}
              >
                {getFiatIcon(fiat) ? (
                  <>
                    <TokenIcon 
                      src={getFiatIcon(fiat) || ''} 
                      alt={fiat}
                      className="token-icon"
                      onError={(e) => handleFiatImageError(e, fiat)}
                      loading="lazy"
                    />
                    <TokenFallbackIcon 
                      className="token-fallback-icon" 
                      style={{ display: 'none' }}
                    >
                      {fiat.charAt(0)}
                    </TokenFallbackIcon>
                  </>
                ) : (
                  <TokenFallbackIcon className="token-fallback-icon">
                    {fiat.charAt(0)}
                  </TokenFallbackIcon>
                )}
                <span className="token-text">{fiat}</span>
              </DropdownItem>
            ))}
          </DropdownMenu>
        </SelectContainer>
      </InputGroup>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      
      {(cryptoAmount || fiatAmount) && !error && (
        <ResultBox 
          onClick={handleCopy} 
          className={copyFeedback ? 'copied' : ''}
        >
          <Label>{lastEditedField === 'crypto' ? 'Converted to Fiat' : 'Converted to Crypto'}</Label>
          {showWaveInResultBox && (!error || cryptoAmount || fiatAmount) ? (
            <WaveLoadingPlaceholder width="120px" height="24px" />
          ) : (
            <Amount>
              {lastEditedField === 'crypto' 
                ? `${selectedFiat} ${formatNumber(fiatAmount, false)}`
                : `${selectedCrypto} ${formatNumber(cryptoAmount, true)}`}
            </Amount>
          )}
        </ResultBox>
      )}

      {/* Add CoinGecko button */}
      {getCryptoId(selectedCrypto) && (
        <CoinGeckoLink onClick={handleOpenCoinGecko}>
          View {selectedCrypto} on CoinGecko
        </CoinGeckoLink>
      )}

      <ButtonContainer>
        <ButtonGroup>
          <ButtonWrapper
            onMouseEnter={() => handleButtonHover('analysis')}
            onMouseLeave={handleButtonLeave}
          >
            <AnalysisButton
              ref={analysisButtonRef}
              onClick={() =>
                navigate('/analysis', {
                  state: {
                    cryptoId: selectedCrypto,
                    currency: selectedFiat,
                  },
                })
              }
            >
              <AnalysisIcon />
            </AnalysisButton>
            <Tooltip 
              ref={analysisTooltipRef}
              style={analysisTooltipData.style}
              $arrowOffset={analysisTooltipData.arrowOffset}
            >
              View Technical Analysis
            </Tooltip>
          </ButtonWrapper>

          <ButtonWrapper
            onMouseEnter={() => handleButtonHover('news')}
            onMouseLeave={handleButtonLeave}
          >
            <NewsButton
              ref={newsButtonRef}
              onClick={() => navigate('/news')}
            >
              <NewsIcon />
            </NewsButton>
            <Tooltip 
              ref={newsTooltipRef}
              style={newsTooltipData.style}
              $arrowOffset={newsTooltipData.arrowOffset}
            >
              View Market News
            </Tooltip>
          </ButtonWrapper>
        </ButtonGroup>
        
        <ButtonGroup>
            <ButtonWrapper
              onMouseEnter={() => handleButtonHover('chart')}
              onMouseLeave={handleButtonLeave}
            >
              <ChartButton
                ref={chartButtonRef}
                onClick={() =>
                  navigate('/chart', {
                    state: {
                      cryptoId: selectedCrypto,
                      currency: selectedFiat,
                    },
                  })
                }
              >
                <ChartIcon />
              </ChartButton>
              <Tooltip 
                ref={chartTooltipRef}
                style={chartTooltipData.style}
                $arrowOffset={chartTooltipData.arrowOffset}
              >
                View Price Chart
              </Tooltip>
            </ButtonWrapper>

            <ButtonWrapper
              onMouseEnter={() => handleButtonHover('trending')}
              onMouseLeave={handleButtonLeave}
            >
              <TrendingButton
                ref={trendingButtonRef}
                onClick={() => navigate('/trending')}
              >
                <TrendingIcon />
              </TrendingButton>
              <Tooltip 
                ref={trendingTooltipRef}
                style={trendingTooltipData.style}
                $arrowOffset={trendingTooltipData.arrowOffset}
              >
                View Trending Tokens
              </Tooltip>
            </ButtonWrapper>
        </ButtonGroup>
      </ButtonContainer>

      {/* Add the rate limit indicator */}
      {isCoinGeckoRateLimitedGlobal && (
        <RateLimitIndicator>
          <FiRefreshCw 
            style={{ marginRight: '6px', cursor: 'pointer' }} 
            size={14}
            onClick={() => updatePrices(false)} 
            title="Try using cached data"
          />
          {getCoinGeckoRetryAfterSeconds() > 0 
            ? `${RATE_LIMIT_UI_MESSAGE} Retry in ${getCoinGeckoRetryAfterSeconds()}s.`
            : RATE_LIMIT_UI_MESSAGE
          }
        </RateLimitIndicator>
      )}
    </ConverterContainer>
  );
};

export default Converter;
