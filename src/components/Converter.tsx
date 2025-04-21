import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { useNavigate } from 'react-router-dom';
import { FaMagnifyingGlassChart } from 'react-icons/fa6';
import { ipcRenderer } from 'electron';

// Constants
const ICON_CACHE_PREFIX = 'crypto_icon_';
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

const Tooltip = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  padding: 8px 12px;
  background: rgba(25, 25, 35, 0.95);
  color: #f0f0f0;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.15);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(139, 92, 246, 0.2);
  z-index: 1001;
  line-height: 1.4;
  letter-spacing: 0.3px;

  left: 50%;
  transform: translateX(-50%) translateY(4px);

  .right-button & {
    left: auto;
    right: 0;
    transform: translateY(4px);
    
    &::after {
      left: auto;
      right: 15px;
      transform: translateX(0);
    }
  }

  .left-button & {
    left: 0;
    right: auto;
    transform: translateY(4px);
    
    &::after {
      left: 15px;
      right: auto;
      transform: translateX(0);
    }
  }

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px;
    border-style: solid;
    border-color: rgba(25, 25, 35, 0.95) transparent transparent transparent;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
  }
  
  /* Subtle gradient and shimmer effect */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0) 60%);
    border-radius: 6px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
  }
`;

const ButtonWrapper = styled.div<{ $tooltipStyle?: React.CSSProperties }>`
  position: fixed;
  z-index: 10;
  transition: transform 0.3s ease;
  
  &:has(> button:hover) {
    transform: translateY(-2px);
  }
  
  &:has(> button:hover) ${Tooltip} {
    opacity: 1;
    visibility: visible;
    transform: ${props => props.$tooltipStyle?.transform ?? 'translateX(-50%)'} translateY(0);
    left: ${props => props.$tooltipStyle?.left ?? '50%'};
    right: ${props => props.$tooltipStyle?.right ?? 'auto'};
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
  background: rgba(25, 25, 35, 0.5);
  color: #8b5cf6;
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 50%;
  width: 44px;
  height: 44px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2), 0 0 0 rgba(139, 92, 246, 0);
  
  &:hover {
    transform: scale(1.08);
    border-color: rgba(139, 92, 246, 0.5);
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.15);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2), 0 0 12px rgba(139, 92, 246, 0.4);
    animation: buttonGlow 2s infinite;
  }

  &:active {
    transform: translateY(0) scale(0.95);
    background: rgba(139, 92, 246, 0.2);
    animation: none;
  }

  svg {
    width: 24px;
    height: 24px;
    transition: transform 0.3s ease;
    filter: drop-shadow(0 2px 4px rgba(139, 92, 246, 0.2));
  }

  &:hover svg {
    transform: scale(1.1);
    filter: drop-shadow(0 4px 8px rgba(139, 92, 246, 0.3));
  }

  @keyframes buttonGlow {
    0% { box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2), 0 0 8px rgba(139, 92, 246, 0.3); }
    50% { box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2), 0 0 16px rgba(139, 92, 246, 0.5); }
    100% { box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2), 0 0 8px rgba(139, 92, 246, 0.3); }
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

const ChartIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M18 9l-5 5-2-2-4 4" />
    <circle cx="18" cy="9" r="1" />
    <circle cx="13" cy="14" r="1" />
    <circle cx="11" cy="12" r="1" />
    <circle cx="7" cy="16" r="1" />
  </svg>
);

const AnalysisIcon = () => (
  <FaMagnifyingGlassChart />
);

// Styled component for CoinGecko link
const CoinGeckoLink = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
  margin-top: 10px;
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
  
  // Refs for handling outside clicks and scrolling
  const cryptoDropdownRef = useRef<HTMLDivElement>(null);
  const fiatDropdownRef = useRef<HTMLDivElement>(null);
  const cryptoButtonRef = useRef<HTMLButtonElement>(null);
  const fiatButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cryptoInputRef = useRef<HTMLInputElement>(null);
  const fiatInputRef = useRef<HTMLInputElement>(null);
  
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
    setTokenMetadata
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
        console.log(`Found ${count} tokens with missing icons, scheduling another check`);
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
      const iconCacheKey = `${ICON_CACHE_PREFIX}${selectedCrypto.toLowerCase()}`;
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

  const getRate = (crypto: string, fiat: string): number => {
    // If the token is pending, return a placeholder rate instead of 0
    if (isPending(crypto)) {
      // Return a placeholder rate based on the token
      // This is just an estimate until the real rate is fetched
      return 1; // Default placeholder (will be improved with estimated values)
    }
    
    // Access the price data object
    const priceData = prices[crypto]?.[fiat.toLowerCase()];

    // Return the price if it exists, otherwise return 0 or handle error
    if (!priceData?.price) {
      return 0; // Or handle appropriately, e.g., throw an error or return null/undefined
    }
    
    return priceData.price; // <-- Return only the price number
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
      return;
    }

    const convertedAmount = (numericValue * rate).toString();
    setFiatAmount(convertedAmount);
    setError('');
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
      return;
    }

    const convertedAmount = (numericValue / rate).toString();
    setCryptoAmount(convertedAmount);
    setError('');
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
      }
    }
  };

  // Handle crypto selection change
  const handleCryptoChange = (crypto: string) => {
    setSelectedCrypto(crypto);
    onCryptoChange(crypto);
    setCryptoDropdownOpen(false);
    setCryptoSearchTerm('');
    
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
    setSelectedFiat(fiat);
    onFiatChange(fiat);
    setFiatDropdownOpen(false);
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
    const iconCacheKey = `${ICON_CACHE_PREFIX}${normalizedSymbol.toLowerCase()}`;
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

  // State for tooltip styles
  const [chartTooltipStyle, setChartTooltipStyle] = useState<React.CSSProperties>({});
  const [analysisTooltipStyle, setAnalysisTooltipStyle] = useState<React.CSSProperties>({});

  // Refs for tooltips and buttons
  const chartButtonRef = useRef<HTMLButtonElement>(null);
  const analysisButtonRef = useRef<HTMLButtonElement>(null);
  const chartTooltipRef = useRef<HTMLDivElement>(null);
  const analysisTooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculateTooltipStyle = (buttonRef: React.RefObject<HTMLButtonElement>, tooltipRef: React.RefObject<HTMLDivElement>): React.CSSProperties => {
    if (!buttonRef.current || !tooltipRef.current) return {};

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current.offsetWidth; // Use offsetWidth after rendering
    const appContainer = document.querySelector('#root > div'); // Assuming AppContainer is the main div in root
    const containerRect = appContainer?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
    const buffer = 15;

    let finalStyle: React.CSSProperties = {
        left: '50%',
        right: 'auto',
        transform: 'translateX(-50%)' // Default center
    };

    const buttonCenter = buttonRect.left + buttonRect.width / 2;
    let tooltipLeftEdge = buttonCenter - tooltipWidth / 2;
    let tooltipRightEdge = buttonCenter + tooltipWidth / 2;

    // Check container boundaries
    if (tooltipLeftEdge < containerRect.left + buffer) {
        finalStyle.left = `${buffer - buttonRect.left}px`; // Position relative to button
        finalStyle.right = 'auto';
        finalStyle.transform = 'translateX(0)';
    } else if (tooltipRightEdge > containerRect.right - buffer) {
        finalStyle.left = 'auto';
        finalStyle.right = `${buffer}px`;
        finalStyle.transform = 'translateX(0)';
    }

    // Add the initial vertical offset for the hidden state
    finalStyle.transform = `${finalStyle.transform || ''} translateY(4px)`;

    return finalStyle;
  };

  // Debounced style calculation on hover
  const handleButtonHover = (type: 'chart' | 'analysis') => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    hoverTimeoutRef.current = setTimeout(() => {
      let style: React.CSSProperties = {};
      if (type === 'chart' && chartButtonRef.current && chartTooltipRef.current) {
          // Temporarily show tooltip to measure
          chartTooltipRef.current.style.visibility = 'visible';
          chartTooltipRef.current.style.opacity = '0';
          style = calculateTooltipStyle(chartButtonRef, chartTooltipRef);
          // Hide tooltip again
          chartTooltipRef.current.style.visibility = '';
          chartTooltipRef.current.style.opacity = '';
          setChartTooltipStyle(style);
      } else if (type === 'analysis' && analysisButtonRef.current && analysisTooltipRef.current) {
          // Temporarily show tooltip to measure
          analysisTooltipRef.current.style.visibility = 'visible';
          analysisTooltipRef.current.style.opacity = '0';
          style = calculateTooltipStyle(analysisButtonRef, analysisTooltipRef);
           // Hide tooltip again
          analysisTooltipRef.current.style.visibility = '';
          analysisTooltipRef.current.style.opacity = '';
          setAnalysisTooltipStyle(style);
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
          <Amount>
            {lastEditedField === 'crypto' 
              ? `${selectedFiat} ${formatNumber(fiatAmount, false)}`
              : `${selectedCrypto} ${formatNumber(cryptoAmount, true)}`}
          </Amount>
        </ResultBox>
      )}

      {/* Add CoinGecko button */}
      {getCryptoId(selectedCrypto) && (
        <CoinGeckoLink onClick={handleOpenCoinGecko}>
          View {selectedCrypto} on CoinGecko
        </CoinGeckoLink>
      )}

      <ButtonWrapper
        $tooltipStyle={chartTooltipStyle}
        className="right-button"
        style={{ bottom: '20px', right: '20px' }}
        onMouseEnter={() => handleButtonHover('chart')}
        onMouseLeave={handleButtonLeave}
      >
        <ChartButton ref={chartButtonRef} onClick={() => navigate('/chart', {
          state: {
            cryptoId: selectedCrypto,
            currency: selectedFiat
          }
        })}>
          <ChartIcon />
        </ChartButton>
        <Tooltip ref={chartTooltipRef}>View Price Chart</Tooltip>
      </ButtonWrapper>

      <ButtonWrapper
        $tooltipStyle={analysisTooltipStyle}
        className="left-button"
        style={{ bottom: '20px', left: '20px' }}
        onMouseEnter={() => handleButtonHover('analysis')}
        onMouseLeave={handleButtonLeave}
      >
        <AnalysisButton ref={analysisButtonRef} onClick={() => navigate('/analysis', {
          state: {
            cryptoId: selectedCrypto,
            currency: selectedFiat
          }
        })}>
          <AnalysisIcon />
        </AnalysisButton>
        <Tooltip ref={analysisTooltipRef}>Technical Analysis</Tooltip>
      </ButtonWrapper>
    </ConverterContainer>
  );
};

export default Converter;
